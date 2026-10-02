import { supabase } from '../lib/supabaseClient';

/**
 * Servicio para gestión de Formularios de Solicitudes / Papeletas Digitales.
 */

// Categorías oficiales según la papeleta física de GCBA
export const TEMATICAS_PAPELETA = [
  { id: 'Arbolado', label: 'Arbolado', icon: '🌳', color: '#15803d' },
  { id: 'Educación', label: 'Educación', icon: '🎓', color: '#2563eb' },
  { id: 'Higiene', label: 'Higiene', icon: '🗑️', color: '#0d9488' },
  { id: 'Seguridad', label: 'Seguridad', icon: '👮', color: '#1e40af' },
  { id: 'Espacios verdes', label: 'Espacios verdes', icon: '⛲', color: '#059669' },
  { id: 'Veredas', label: 'Veredas', icon: '🚶', color: '#d97706' },
  { id: 'Tránsito', label: 'Tránsito', icon: '🚦', color: '#ea580c' },
  { id: 'Alumbrado', label: 'Alumbrado', icon: '💡', color: '#ca8a04' },
  { id: 'Otros', label: 'Otros', icon: '📝', color: '#64748b' }
];

export const ESTADOS_SOLICITUD = [
  { id: 'pendiente', label: 'Pendiente', color: '#EAB308', bg: '#FEF9C3', icon: '⏳' },
  { id: 'en_gestion', label: 'En Gestión (SUACI/BAC)', color: '#3B82F6', bg: '#DBEAFE', icon: '🔄' },
  { id: 'cargado_suaci', label: 'Cargado en SUACI', color: '#8B5CF6', bg: '#EDE9FE', icon: '🏷️' },
  { id: 'resuelto', label: 'Resuelto', color: '#10B981', bg: '#DCFCE7', icon: '✅' },
  { id: 'desestimado', label: 'Desestimado', color: '#64748B', bg: '#F1F5F9', icon: '✖️' }
];

/**
 * Carga información de una reunión para la papeleta digital
 */
export async function getReunionParaPapeleta(reunionId) {
  if (!reunionId) return null;
  try {
    const { data, error } = await supabase
      .from('reuniones')
      .select('id, nombre, fecha, lugar, comuna, barrio, funcionario')
      .eq('id', reunionId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Error al cargar datos de reunión para papeleta:', err);
    return null;
  }
}

/**
 * Carga los datos de un vecino para pre-llenar la papeleta
 */
export async function getVecinoParaPapeleta(dni, reunionId = null) {
  if (!dni) return null;
  try {
    const cleanDni = String(dni).trim();
    const { data: vecino, error: errVecino } = await supabase
      .from('vecinos')
      .select('*')
      .eq('dni', cleanDni)
      .maybeSingle();

    if (errVecino) throw errVecino;

    let temaInscripcion = '';
    if (reunionId && vecino) {
      const { data: insc } = await supabase
        .from('inscripciones_asistencias')
        .select('tema_previo, pregunta_puerta')
        .eq('reunion_id', reunionId)
        .eq('vecino_id', cleanDni)
        .maybeSingle();

      if (insc) {
        temaInscripcion = insc.tema_previo || '';
      }
    }

    return {
      ...(vecino || {}),
      tema_previo: temaInscripcion
    };
  } catch (err) {
    console.warn('Error al cargar datos del vecino para papeleta:', err);
    return null;
  }
}

/**
 * Guarda una lista de solicitudes cargadas por un vecino en la papeleta digital
 */
export async function guardarSolicitudesPapeleta({
  reunion_id,
  vecino_id,
  nombre_apellido,
  dni,
  telefono,
  barrio,
  email,
  fecha,
  solicitudes = []
}) {
  if (!solicitudes || solicitudes.length === 0) {
    return { success: false, error: 'No hay solicitudes para guardar.' };
  }

  const cleanDni = String(dni || vecino_id || '').trim();
  const fechaStr = fecha || new Date().toISOString().split('T')[0];

  const rowsToInsert = solicitudes
    .filter(s => s.tematica && (s.descripcion?.trim() || s.direccion?.trim()))
    .map(s => ({
      reunion_id: reunion_id || null,
      vecino_id: cleanDni || null,
      nombre_apellido: nombre_apellido?.trim() || '',
      dni: cleanDni,
      telefono: telefono?.trim() || '',
      barrio: barrio?.trim() || '',
      email: email?.trim() || '',
      fecha: fechaStr,
      tematica: s.tematica === 'Otros' && s.tematica_otro?.trim() ? `Otros: ${s.tematica_otro.trim()}` : s.tematica,
      direccion: s.direccion?.trim() || '',
      descripcion: s.descripcion?.trim() || '',
      estado: 'pendiente',
      ticket_suaci: '',
      notas_operador: ''
    }));

  if (rowsToInsert.length === 0) {
    return { success: false, error: 'Por favor completá al menos la temática y descripción de una solicitud.' };
  }

  // 1. Intentar guardar en la tabla especializada `solicitudes_papeleta`
  try {
    const { data, error } = await supabase
      .from('solicitudes_papeleta')
      .insert(rowsToInsert)
      .select();

    if (!error) {
      return { success: true, count: rowsToInsert.length, data };
    }
    console.warn('Fallback a almacenamiento complementario para solicitudes:', error.message);
  } catch (err) {
    console.warn('Tabla solicitudes_papeleta no disponible en Supabase:', err);
  }

  // 2. Fallback de resguardo: Guardar en `inscripciones_asistencias` o localStorage
  try {
    if (reunion_id && cleanDni) {
      const { data: existingInsc } = await supabase
        .from('inscripciones_asistencias')
        .select('*')
        .eq('reunion_id', reunion_id)
        .eq('vecino_id', cleanDni)
        .maybeSingle();

      const newPapeletaPayload = JSON.stringify({
        tipo: 'PAPELETA_DIGITAL',
        fecha: fechaStr,
        items: rowsToInsert
      });

      if (existingInsc) {
        await supabase
          .from('inscripciones_asistencias')
          .update({
            pregunta_puerta: existingInsc.pregunta_puerta 
              ? `${existingInsc.pregunta_puerta}\n${newPapeletaPayload}` 
              : newPapeletaPayload
          })
          .eq('id', existingInsc.id);
      }
    }
  } catch (fallbackErr) {
    console.warn('Error en fallback de inscripciones_asistencias:', fallbackErr);
  }

  // También persistir en almacenamiento local de la sesión para recuperación inmediata
  try {
    const cacheKey = `papeletas_reunion_${reunion_id || 'general'}`;
    const prev = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    const withIds = rowsToInsert.map(r => ({ ...r, id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`, created_at: new Date().toISOString() }));
    localStorage.setItem(cacheKey, JSON.stringify([...withIds, ...prev]));
  } catch (e) {}

  return { success: true, count: rowsToInsert.length };
}

/**
 * Obtiene todas las solicitudes recibidas para una reunión específica
 */
export async function getSolicitudesPorReunion(reunionId) {
  if (!reunionId) return { data: [], error: null };

  let listaSolicitudes = [];

  // 1. Consultar tabla `solicitudes_papeleta`
  try {
    const { data, error } = await supabase
      .from('solicitudes_papeleta')
      .select('*')
      .eq('reunion_id', reunionId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      listaSolicitudes = data;
    }
  } catch (err) {
    console.warn('Error al consultar solicitudes_papeleta:', err);
  }

  // 2. Extraer posibles solicitudes guardadas en fallback de `inscripciones_asistencias`
  try {
    const { data: asistencias } = await supabase
      .from('inscripciones_asistencias')
      .select('vecino_id, pregunta_puerta, vecinos(nombre, apellido, dni, celular, barrio)')
      .eq('reunion_id', reunionId)
      .not('pregunta_puerta', 'is', null);

    if (asistencias) {
      asistencias.forEach(a => {
        if (a.pregunta_puerta && a.pregunta_puerta.includes('PAPELETA_DIGITAL')) {
          const lines = a.pregunta_puerta.split('\n');
          lines.forEach(l => {
            try {
              if (l.startsWith('{') && l.includes('PAPELETA_DIGITAL')) {
                const parsed = JSON.parse(l);
                if (parsed.items && Array.isArray(parsed.items)) {
                  parsed.items.forEach(it => {
                    // Evitar duplicados si ya vino de la tabla
                    if (!listaSolicitudes.some(s => s.dni === it.dni && s.descripcion === it.descripcion)) {
                      listaSolicitudes.push({
                        ...it,
                        id: it.id || `insc_${it.dni}_${Math.random()}`
                      });
                    }
                  });
                }
              }
            } catch (e) {}
          });
        }
      });
    }
  } catch (e) {}

  // 3. Unir con caché local si existiera
  try {
    const cacheKey = `papeletas_reunion_${reunionId}`;
    const local = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    local.forEach(lItem => {
      if (!listaSolicitudes.some(s => s.id === lItem.id || (s.dni === lItem.dni && s.descripcion === lItem.descripcion))) {
        listaSolicitudes.push(lItem);
      }
    });
  } catch (e) {}

  return { data: listaSolicitudes, error: null };
}

/**
 * Actualiza el estado, nro de ticket SUACI o notas de una solicitud
 */
export async function updateEstadoSolicitud(solicitudId, updates = {}) {
  try {
    const { data, error } = await supabase
      .from('solicitudes_papeleta')
      .update(updates)
      .eq('id', solicitudId)
      .select();

    if (!error) return { data, error: null };
  } catch (err) {
    console.warn('Error al actualizar solicitud en Supabase:', err);
  }

  // Actualizar también en caché local
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('papeletas_reunion_')) {
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        const updated = list.map(item => item.id === solicitudId ? { ...item, ...updates } : item);
        localStorage.setItem(key, JSON.stringify(updated));
      }
    }
  } catch (e) {}

  return { data: updates, error: null };
}
