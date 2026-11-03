import { supabase } from '../lib/supabaseClient.js';
import { normalizarDireccionUsig } from './georrefService.js';

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
      .select('id, nombre, fecha, lugar, comuna, barrio, funcionario, hora_inicio_real, hora_fin_real')
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
 * Determina si una reunión ya finalizó (plazo límite: 2 horas y 30 minutos desde el horario de inicio programado).
 * Devuelve { finalizada: boolean, horaInicio: string, horaCierre: string, mensaje: string }
 */
export function checkReunionFinalizada(reunion) {
  if (!reunion || !reunion.fecha) return { finalizada: false, horaInicio: '', horaCierre: '' };

  // 1. Extraer horario de inicio (Prioridad: hora_inicio_real -> nombre con '18hs'/'18:30' -> fallback '17:00')
  let horaStr = (reunion.hora_inicio_real || '').trim();
  if (!horaStr && reunion.nombre && reunion.nombre.includes('-')) {
    const parts = reunion.nombre.split('-');
    const lastPart = parts[parts.length - 1].trim();
    const match = lastPart.match(/(\d{1,2})(:(\d{2}))?\s*(hs|h)?/i);
    if (match) {
      const h = match[1].padStart(2, '0');
      const m = match[3] || '00';
      horaStr = `${h}:${m}`;
    }
  }

  if (!horaStr || !/^\d{1,2}:\d{2}$/.test(horaStr)) {
    horaStr = '17:00';
  }

  try {
    // 2. Parsear fecha (YYYY-MM-DD) y hora (HH:mm)
    const [year, month, day] = reunion.fecha.split('-').map(Number);
    const [hour, minute] = horaStr.split(':').map(Number);

    const inicioDate = new Date(year, month - 1, day, hour, minute, 0);

    // 2.30 hs después del horario seteado (150 minutos = 2.5 * 3600 * 1000 ms)
    const limiteDate = new Date(inicioDate.getTime() + (2.5 * 60 * 60 * 1000));
    const ahora = new Date();

    const finalizada = ahora > limiteDate;
    const horaCierre = limiteDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    return {
      finalizada,
      horaInicio: horaStr,
      horaCierre,
      limiteDate,
      mensaje: finalizada 
        ? `El período para cargar solicitudes digitales para este encuentro ha finalizado (cerró a las ${horaCierre} hs, 2:30 hs posteriores al inicio de la reunión).`
        : ''
    };
  } catch (err) {
    console.warn('Error calculando horario límite de reunión:', err);
    return { finalizada: false, horaInicio: horaStr, horaCierre: '' };
  }
}

/**
 * Valida si un vecino está registrado en la reunión y ya figura presente (asistio === true).
 * Requisito estricto: Solo pueden cargar reclamos quienes estén inscriptos y acreditados en el encuentro.
 */
export async function validarVecinoPresenteEnReunion(dni, reunionId, options = {}) {
  if (!dni || !reunionId) {
    return {
      valido: false,
      motivo: 'faltan_datos',
      mensaje: 'Por favor ingresá tu número de DNI para validar tu asistencia a la reunión.'
    };
  }

  const cleanDni = String(dni).trim();

  try {
    const { data, error } = await supabase
      .from('inscripciones_asistencias')
      .select('reunion_id, vecino_id, asistio, tema_previo, vecinos(nombre, apellido, celular, barrio, email)')
      .eq('reunion_id', reunionId)
      .eq('vecino_id', cleanDni)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return {
        valido: false,
        motivo: 'no_registrado',
        mensaje: `El DNI ${cleanDni} no figura inscripto para esta reunión. Solo pueden cargar reclamos quienes estén inscriptos y acreditados en el encuentro.`
      };
    }

    if (!data.asistio && !options.permitirInscripto) {
      const nom = data.vecinos ? `${data.vecinos.nombre || ''} ${data.vecinos.apellido || ''}`.trim() : '';
      return {
        valido: false,
        motivo: 'no_presente',
        nombreVecino: nom,
        mensaje: `Hola ${nom ? nom + ', ' : ''}figurás inscripto/a pero aún no registraste tu presencia en la acreditación. Por favor acercate a la mesa de entrada para validar tu asistencia antes de cargar tu reclamo.`
      };
    }

    return {
      valido: true,
      vecino: data.vecinos || {},
      tema_previo: data.tema_previo || '',
      asistio: data.asistio
    };
  } catch (err) {
    console.warn('Error validando asistencia del vecino en Supabase:', err);
    return {
      valido: false,
      motivo: 'error_red',
      mensaje: 'No pudimos verificar tu acreditación en este momento. Por favor revisá tu conexión e intentá nuevamente.'
    };
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

export const BARRIOS_CABA_LIST = [
  "agronomia", "almagro", "balvanera", "barracas", "belgrano", "boedo", "caballito", 
  "chacarita", "coghlan", "colegiales", "constitucion", "flores", "floresta", "la boca", 
  "la paternal", "paternal", "liniers", "mataderos", "monte castro", "monserrat", 
  "montserrat", "nueva pompeya", "pompeya", "nuñez", "nunez", "palermo", 
  "parque avellaneda", "parque chacabuco", "parque chas", "parque patricios", 
  "puerto madero", "recoleta", "retiro", "saavedra", "san cristobal", "san nicolas", 
  "san telmo", "velez sarsfield", "versalles", "villa crespo", "villa del parque", 
  "villa devoto", "villa general mitre", "villa lugano", "villa luro", "villa ortuzar", 
  "villa pueyrredon", "villa real", "villa riachuelo", "villa santa rita", 
  "villa soldati", "villa urquiza"
];

export const LUGARES_FISICOS_KEYWORDS = [
  "colegio", "escuela", "instituto", "jardin", "jardín", "universidad", "universitaria", "facultad", "campus", "fadu", "exactas", "cbc", "medicina", "derecho",
  "hospital", "cesac", "sanatorio", "clinica", "clínica", "dispensario", "centro de salud", "maternidad", "vacunatorio",
  "plaza", "parque", "plazoleta", "boulevard", "paseo", "patio",
  "polideportivo", "club", "centro cultural", "teatro", "museo", "biblioteca", "estadio", "cancha", "cenard",
  "estacion", "estación", "terminal", "subte", "metrobus", "parada", "aeroparque",
  "iglesia", "parroquia", "templo", "catedral", "sinagoga", "basilica", "basílica",
  "comisaria", "comisaría", "sede comunal", "subsede", "comuna sede", "cementerio", "ecoparque", "planetario", "botanico", "botánico",
  "ciudad universitaria"
];

/**
 * Evalúa si una dirección o texto ingresado califica como "Solicitud Puntual" (lugar exacto con altura,
 * intersección o lugar físico identificable) o como "Preocupación General" (toda la ciudad, comuna,
 * barrio o calle completa sin altura/esquina).
 */
export function clasificarUbicacion(direccionRaw, meta = {}) {
  const raw = (direccionRaw || '').trim();
  const norm = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (!norm || norm.length < 3) {
    return {
      tipo: 'preocupacion',
      esPuntual: false,
      motivo: 'Sin ubicación puntual especificada',
      mensaje: 'Al no contar con una ubicación puntual, se registrará como Preocupación general para el equipo de gestión.'
    };
  }

  // 1. Frases de "Toda la ciudad", CABA, etc. SIEMPRE son Preocupación
  const regexCiudad = /^(en\s+)?(toda\s+la\s+ciudad(\s+de\s+buenos\s+aires)?|toda\s+caba|toda\s+la\s+capital|caba|capital\s+federal|ciudad\s+de\s+buenos\s+aires|buenos\s+aires|general|en\s+general|toda\s+la\s+zona|todos\s+lados|por\s+todos\s+lados)$/i;
  if (regexCiudad.test(norm) || norm.includes('toda la ciudad') || norm.includes('toda la capital') || norm.includes('por toda la ciudad') || norm.includes('en toda la ciudad')) {
    return {
      tipo: 'preocupacion',
      esPuntual: false,
      motivo: 'Área general (Toda la Ciudad)',
      mensaje: 'Al referirse a toda la Ciudad sin un punto exacto, se registrará como Preocupación.'
    };
  }

  // 2. EXCEPCIÓN SEDE COMUNAL / EDIFICIOS ADMINISTRATIVOS:
  // "Sede Comunal 7", "Subsede Comunal", etc. son lugares físicos específicos con administración propia -> Solicitud Puntual
  const esSedeComunal = /(sede|subsede|edificio)\s+comunal(\s+\d{1,2})?/i.test(norm) ||
    /comuna\s+\d{1,2}\s+(sede|subsede)/i.test(norm) ||
    (meta.tipo === 'lugar' && /(sede|subsede)/i.test(norm));
  if (esSedeComunal) {
    return {
      tipo: 'solicitud',
      esPuntual: true,
      motivo: 'Sede Comunal / Dependencia física',
      mensaje: 'Sede Comunal o dependencia identificada. Se registrará como Solicitud puntual para gestión operativa.'
    };
  }

  // 3. Comunas generales: "Comuna 7", "toda la comuna 7", "en la comuna" (sin sede)
  const regexComuna = /^(en\s+la\s+|toda\s+la\s+|por\s+la\s+)?comuna(\s+\d{1,2}(\s+norte|\s+sur)?)?$/i;
  if (regexComuna.test(norm) || /^comuna\s+\d{1,2}$/i.test(norm)) {
    return {
      tipo: 'preocupacion',
      esPuntual: false,
      motivo: 'Área general (Comuna completa)',
      mensaje: 'Al abarcar una Comuna completa sin un punto específico, se registrará como Preocupación.'
    };
  }

  // 4. Si explícitamente se indica "Barrio X", "en el barrio de X", "todo el barrio X":
  if (/^(en\s+el\s+|todo\s+el\s+|toda\s+la\s+|en\s+)?barrio\s+/i.test(norm) && !/\d{1,5}/.test(norm) && !/\s(y|esq|esquina|entre|e\/)\s/.test(norm)) {
    return {
      tipo: 'preocupacion',
      esPuntual: false,
      motivo: 'Área general (Barrio completo)',
      mensaje: 'Al referirse a un barrio completo sin una dirección puntual, se registrará como Preocupación.'
    };
  }

  // 5. Barrios puros sin lugar físico ni altura (ej: "Flores", "Caballito", "Palermo", "Monte Castro")
  const matchBarrioPuro = BARRIOS_CABA_LIST.find(b => {
    // Si el nombre del barrio comienza con "parque " (ej: parque chacabuco), solo es barrio si dice "barrio parque chacabuco"
    if (b.startsWith('parque ') || b.startsWith('plaza ') || b.startsWith('villa del parque')) return false;
    return norm === b || norm === `en ${b}` || norm === `todo ${b}` || norm === `toda ${b}`;
  });

  if (matchBarrioPuro) {
    return {
      tipo: 'preocupacion',
      esPuntual: false,
      motivo: 'Área general (Barrio completo)',
      mensaje: 'Al referirse al barrio en general sin una dirección exacta, se registrará como Preocupación.'
    };
  }

  // 6. DETECCIÓN DE CALLE COMPLETA (sin altura ni intersección):
  // Si es una calle o avenida (ej: "Av. Monroe", "Monroe", "Av Monroe", "Av. Rivadavia", "Corrientes", "Av Santa Fe")
  // sin altura numérica y sin cruce/esquina, y no es un lugar físico reconocible:
  // SIEMPRE ES PREOCUPACIÓN GENERAL (no califica como Solicitud Puntual).
  const tieneAltura = Boolean(
    (meta.altura && String(meta.altura).trim()) ||
    /\b(\d{1,5}|al\s+\d{1,5})\b/.test(norm)
  );

  const tieneCruce = Boolean(
    (meta.cruce && String(meta.cruce).trim()) ||
    /[\s(](?:y|e\/|entre|esq\.?|esquina|cruce|con)[\s)]/i.test(norm) ||
    /\b(?:esquina|esq\.?|cruce)\b/i.test(norm) ||
    /\([^)]+\)/i.test(norm) ||
    /\s+y\s+/i.test(norm)
  );

  const esLugarFisico = Boolean(
    meta.tipo === 'lugar' || meta.esLugar || meta.fuente?.includes('Lugares') ||
    esSedeComunal ||
    /^(ciudad\s+universitaria|fadu|exactas|cbc|cenard|ecoparque|planetario|aeroparque)/i.test(norm) ||
    /\b(ciudad\s+universitaria)\b/i.test(norm) ||
    /\b(cesac|ce\.?s\.?a\.?c\.?|centro\s+de\s+salud)\b/i.test(norm) ||
    /\b(hospital|sanatorio|clinica|clínica|dispensario|maternidad)\b/i.test(norm) ||
    /\b(escuela|colegio|jardin|jardín|liceo|instituto)\b/i.test(norm) ||
    /\b(facultad|universidad|universitaria)\b/i.test(norm) ||
    /\b(plaza|parque|plazoleta|boulevard|paseo)\b/i.test(norm) ||
    /\b(polideportivo|club|estadio|cancha)\b/i.test(norm) ||
    /\b(estacion|estación|terminal|aeroparque)\b/i.test(norm) ||
    /\b(comisaria|comisaría)\b/i.test(norm) ||
    /\b(teatro|museo|biblioteca|centro\s+cultural)\b/i.test(norm) ||
    /\b(parroquia|iglesia|templo|catedral|basilica|basílica)\b/i.test(norm) ||
    LUGARES_FISICOS_KEYWORDS.some(kw => {
      const cleanKw = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const regex = new RegExp(`\\b${cleanKw}\\b`, 'i');
      return regex.test(norm);
    })
  );

  // Si no tiene altura, no tiene cruce y no es lugar físico:
  // Es una calle completa o texto genérico -> SIEMPRE PREOCUPACIÓN GENERAL
  if (!tieneAltura && !tieneCruce && !esLugarFisico) {
    return {
      tipo: 'preocupacion',
      esPuntual: false,
      motivo: 'Calle o avenida completa sin altura ni esquina',
      mensaje: 'Al referirse a una calle completa sin número exacto ni esquina, se registrará como Preocupación general. Si querés registrar una Solicitud puntual con seguimiento, agregá la altura (ej: Monroe 2500) o la esquina (ej: Monroe y Cabildo).'
    };
  }

  // 7. Si fue autocompletado en el Callejero Oficial (y cuenta con altura, cruce o lugar físico):
  if (meta.autocompletado === true) {
    return {
      tipo: 'solicitud',
      esPuntual: true,
      motivo: esLugarFisico ? 'Lugar físico o espacio público identificado' : (tieneCruce ? 'Intersección o esquina validada' : 'Dirección con altura validada'),
      mensaje: 'Ubicación puntual validada en el Callejero Oficial. Se registrará como Solicitud puntual para gestión operativa.'
    };
  }

  // 8. Para registros preexistentes o ingresados manualmente:
  if (esLugarFisico) {
    return {
      tipo: 'solicitud',
      esPuntual: true,
      motivo: 'Lugar físico o espacio público identificado',
      mensaje: 'Lugar físico identificado. Se registrará como Solicitud puntual para gestión operativa.'
    };
  }

  if (tieneCruce) {
    return {
      tipo: 'solicitud',
      esPuntual: true,
      motivo: 'Intersección o esquina exacta',
      mensaje: 'Esquina identificada. Se registrará como Solicitud puntual para gestión operativa.'
    };
  }

  if (tieneAltura) {
    return {
      tipo: 'solicitud',
      esPuntual: true,
      motivo: 'Dirección puntual con altura',
      mensaje: 'Dirección exacta con altura. Se registrará como Solicitud puntual con seguimiento.'
    };
  }

  // Fallback seguro: Preocupación
  return {
    tipo: 'preocupacion',
    esPuntual: false,
    motivo: 'Sin validación puntual de callejero',
    mensaje: 'Al no contar con una ubicación puntual, se registrará como Preocupación general.'
  };
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

  const rowsToInsert = await Promise.all(
    solicitudes
      .filter(s => s.tematica && (s.descripcion?.trim() || s.direccion?.trim()))
      .map(async (s, idx) => {
        let latVal = s.lat || null;
        let lngVal = s.lng || null;

        // Si la dirección no vino geolocalizada (ej. el vecino no eligió del desplegable),
        // intentar resolverla en el momento para que quede guardada con lat/lng en Supabase
        if ((!latVal || !lngVal) && s.direccion && s.direccion.trim().length >= 3) {
          try {
            const geo = await normalizarDireccionUsig(s.direccion);
            if (geo && geo.lat && geo.lng) {
              latVal = geo.lat;
              lngVal = geo.lng;
            }
          } catch (e) {}
        }

        const clasif = clasificarUbicacion(s.direccion, {
          autocompletado: s.autocompletado || Boolean(latVal && lngVal),
          tipo: s.tipo_ubicacion || s.tipo,
          lat: latVal,
          lng: lngVal,
          altura: s.altura,
          cruce: s.cruce
        });
        const tipoRegistro = clasif.tipo; // 'solicitud' | 'preocupacion'
        const stableId = s.id || `pap_${cleanDni}_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;

        return {
          id: stableId,
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
          tipo_registro: tipoRegistro, // 'solicitud' | 'preocupacion'
          lat: clasif.esPuntual ? latVal : null,
          lng: clasif.esPuntual ? lngVal : null,
          estado: 'pendiente',
          ticket_suaci: '',
          notas_operador: ''
        };
      })
  );

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
                  parsed.items.forEach((it, idx) => {
                    // ID determinístico y permanente: NUNCA usar Math.random() para evitar refrescos y pérdida de foco
                    const descHash = String(it.descripcion || '').slice(0, 15).replace(/[^a-zA-Z0-9]/g, '');
                    const stableId = it.id || `insc_${a.vecino_id || it.dni || 'v'}_${idx}_${descHash}`;

                    // Evitar duplicados si ya vino de la tabla
                    if (!listaSolicitudes.some(s => s.id === stableId || (s.dni === it.dni && s.descripcion === it.descripcion))) {
                      listaSolicitudes.push({
                        ...it,
                        id: stableId
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
 * Sincroniza modificaciones o eliminaciones en el fallback de `inscripciones_asistencias`
 */
async function sincronizarFallbackAsistencias(reunionId, solicitudId, updates = null, isDelete = false) {
  if (!reunionId || !solicitudId) return;
  try {
    const { data: asistencias } = await supabase
      .from('inscripciones_asistencias')
      .select('id, vecino_id, pregunta_puerta')
      .eq('reunion_id', reunionId)
      .not('pregunta_puerta', 'is', null);

    if (asistencias && asistencias.length > 0) {
      for (const a of asistencias) {
        if (a.pregunta_puerta && a.pregunta_puerta.includes('PAPELETA_DIGITAL')) {
          let modificado = false;
          const lines = a.pregunta_puerta.split('\n');
          const newLines = lines.map(line => {
            if (line.startsWith('{') && line.includes('PAPELETA_DIGITAL')) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.items && Array.isArray(parsed.items)) {
                  let filteredItems;
                  if (isDelete) {
                    filteredItems = parsed.items.filter((it, idx) => {
                      const descHash = String(it.descripcion || '').slice(0, 15).replace(/[^a-zA-Z0-9]/g, '');
                      const stableId = it.id || `insc_${a.vecino_id || it.dni || 'v'}_${idx}_${descHash}`;
                      if (it.id === solicitudId || stableId === solicitudId) {
                        modificado = true;
                        return false;
                      }
                      return true;
                    });
                  } else {
                    filteredItems = parsed.items.map((it, idx) => {
                      const descHash = String(it.descripcion || '').slice(0, 15).replace(/[^a-zA-Z0-9]/g, '');
                      const stableId = it.id || `insc_${a.vecino_id || it.dni || 'v'}_${idx}_${descHash}`;
                      if (it.id === solicitudId || stableId === solicitudId) {
                        modificado = true;
                        return { ...it, ...updates, id: stableId };
                      }
                      return it;
                    });
                  }
                  if (modificado) {
                    return JSON.stringify({ ...parsed, items: filteredItems });
                  }
                }
              } catch (e) {}
            }
            return line;
          });

          if (modificado) {
            await supabase
              .from('inscripciones_asistencias')
              .update({ pregunta_puerta: newLines.join('\n') })
              .eq('id', a.id);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Aviso sincronizando fallback asistencias:', err);
  }
}

/**
 * Actualiza el estado, nro de ticket SUACI o notas de una solicitud
 */
export async function updateEstadoSolicitud(solicitudId, updates = {}, reunionId = null) {
  try {
    const { data, error } = await supabase
      .from('solicitudes_papeleta')
      .update(updates)
      .eq('id', solicitudId)
      .select();

    if (!error && data && data.length > 0) {
      actualizarSolicitudEnCacheLocal(solicitudId, updates, reunionId);
      return { data, error: null };
    }
  } catch (err) {
    console.warn('Error al actualizar solicitud en Supabase:', err);
  }

  // Sincronizar también con el fallback de inscripciones_asistencias
  if (reunionId) {
    await sincronizarFallbackAsistencias(reunionId, solicitudId, updates, false);
  }

  // Actualizar también en caché local
  actualizarSolicitudEnCacheLocal(solicitudId, updates, reunionId);
  return { data: updates, error: null };
}

/**
 * Actualiza los datos de un reclamo cargado por un vecino (temática, dirección, descripción, etc.)
 */
export async function actualizarDetalleSolicitud(solicitudId, updates = {}, reunionId = null) {
  try {
    const payload = { ...updates };
    // Si la dirección fue editada, recalcular clasificación y geocodificar si faltan coords
    if (updates.direccion !== undefined) {
      if ((!payload.lat || !payload.lng) && updates.direccion && updates.direccion.trim().length >= 3) {
        try {
          const geo = await normalizarDireccionUsig(updates.direccion);
          if (geo && geo.lat && geo.lng) {
            payload.lat = geo.lat;
            payload.lng = geo.lng;
            payload.tipo_registro = 'solicitud';
          }
        } catch (e) {}
      }

      const clasif = clasificarUbicacion(updates.direccion, { ...updates.meta, lat: payload.lat, lng: payload.lng });
      payload.tipo_registro = clasif.tipo;
      if (!clasif.esPuntual && !payload.lat) {
        payload.lat = null;
        payload.lng = null;
      }
    }

    const { data, error } = await supabase
      .from('solicitudes_papeleta')
      .update(payload)
      .eq('id', solicitudId)
      .select();

    if (!error && data && data.length > 0) {
      // Sincronizar en asistencias y caché local
      if (reunionId) {
        await sincronizarFallbackAsistencias(reunionId, solicitudId, payload, false);
      }
      actualizarSolicitudEnCacheLocal(solicitudId, payload, reunionId);
      return { success: true, data, error: null };
    }
  } catch (err) {
    console.warn('Error al actualizar reclamo en Supabase:', err);
  }

  // Sincronizar en asistencias
  if (reunionId) {
    await sincronizarFallbackAsistencias(reunionId, solicitudId, updates, false);
  }

  // Fallback a caché local si falló o no existe la tabla
  actualizarSolicitudEnCacheLocal(solicitudId, updates, reunionId);
  return { success: true, data: updates, error: null };
}

/**
 * Elimina una solicitud / reclamo por su ID tanto de Supabase como de cachés y fallbacks
 */
export async function eliminarSolicitudPapeleta(solicitudId, reunionId = null) {
  try {
    const { error } = await supabase
      .from('solicitudes_papeleta')
      .delete()
      .eq('id', solicitudId);

    if (error) {
      console.warn('Aviso al eliminar de solicitudes_papeleta en Supabase:', error.message);
    }
  } catch (err) {
    console.warn('Error al eliminar en Supabase:', err);
  }

  // Sincronizar eliminación en asistencias
  if (reunionId) {
    await sincronizarFallbackAsistencias(reunionId, solicitudId, null, true);
  }

  // Eliminar de caché local
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('papeletas_reunion_')) {
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        const filtered = list.filter(item => item.id !== solicitudId);
        localStorage.setItem(key, JSON.stringify(filtered));
      }
    }
  } catch (e) {}

  return { success: true };
}

function actualizarSolicitudEnCacheLocal(solicitudId, updates, reunionId) {
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
}

/**
 * Normaliza cualquier número de teléfono de Argentina al formato internacional oficial de WhatsApp (+54 9 ...).
 * WhatsApp exige para líneas celulares de Argentina: código de país 54 + prefijo móvil 9 + código de área + número.
 * Corrige casos comunes como:
 * - "1166153911" -> "5491166153911"
 * - "1534892412" -> "5491134892412"
 * - "011 15 6615 3911" -> "5491166153911"
 * - "011 6615 3911" -> "5491166153911"
 * - "+54 11 6615 3911" -> "5491166153911"
 * - "+54 9 11 6615 3911" -> "5491166153911"
 * - "66153911" (8 dígitos) -> "5491166153911"
 */
export function formatWhatsAppArgentina(phone) {
  if (!phone) return '';
  const trimmed = String(phone).trim();
  const startsWithPlus = trimmed.startsWith('+');
  let clean = trimmed.replace(/\D/g, '');
  if (!clean) return '';

  // Si fue ingresado explícitamente con '+' y NO es de Argentina (+54)
  if (startsWithPlus && !clean.startsWith('54')) {
    return clean;
  }

  // Quitar prefijos de salida internacional duplicados
  if (clean.startsWith('0054')) clean = clean.slice(4);
  else if (clean.startsWith('054')) clean = clean.slice(3);

  // Si ya empieza con 54
  if (clean.startsWith('54')) {
    let rest = clean.slice(2);
    if (rest.startsWith('0')) rest = rest.replace(/^0+/, '');
    
    // Si ya tiene el 9 móvil de Argentina (549...)
    if (rest.startsWith('9')) {
      let restAfter9 = rest.slice(1);
      if (restAfter9.startsWith('0')) restAfter9 = restAfter9.replace(/^0+/, '');
      // Si pusieron el 15 después del código de área 11 (ej: 54 9 11 15 xxxxxxxx)
      if (restAfter9.startsWith('1115') && restAfter9.length === 12) {
        restAfter9 = '11' + restAfter9.slice(4);
      }
      return '549' + restAfter9;
    } else {
      // Tiene 54 pero le falta el 9 móvil (ej: 54 11 6615 3911)
      if (rest.startsWith('1115') && rest.length === 12) {
        rest = '11' + rest.slice(4);
      }
      return '549' + rest;
    }
  }

  // Quitar ceros a la izquierda (ej: 011...)
  if (clean.startsWith('0')) {
    clean = clean.replace(/^0+/, '');
  }

  // Si empieza con 15 y tiene 10 dígitos (ej: 15 3489 2412 -> CABA 11 3489 2412)
  if (clean.startsWith('15') && clean.length === 10) {
    clean = '11' + clean.slice(2);
  }

  // Si tiene '1115' (ej: 11 15 6615 3911 -> 12 dígitos)
  if (clean.startsWith('1115') && clean.length === 12) {
    clean = '11' + clean.slice(4);
  }

  // Si tiene 8 dígitos (ej: 66153911, sin código de área CABA)
  if (clean.length === 8) {
    clean = '11' + clean;
  }

  // Asegurar 549 al inicio para números de Argentina
  if (!clean.startsWith('549')) {
    clean = '549' + clean;
  }

  return clean;
}

/**
 * Genera el enlace directo wa.me para enviar la Papeleta Digital a un vecino
 */
export function getUrlWhatsAppPapeleta({ celular, nombre, reunionId, dni }) {
  const phoneClean = formatWhatsAppArgentina(celular);
  if (!phoneClean) return null;

  const origin = window.location.origin;
  const pathname = window.location.pathname;
  const linkPapeleta = `${origin}${pathname}?view=papeleta&reunion_id=${reunionId || ''}&dni=${dni || ''}`;
  
  const saludo = nombre && nombre.trim() ? `Hola ${nombre.trim()}! ` : '¡Hola! ';
  const mensaje = `${saludo}Te compartimos el enlace para ingresar tus reclamos o solicitudes en la reunión de hoy de BA Participación Ciudadana:\n${linkPapeleta}`;

  return `https://wa.me/${phoneClean}?text=${encodeURIComponent(mensaje)}`;
}
