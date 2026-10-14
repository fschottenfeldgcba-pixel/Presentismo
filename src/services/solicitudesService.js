import { supabase } from '../lib/supabaseClient.js';

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
  "colegio", "escuela", "instituto", "jardin", "jardín", "universidad", "facultad",
  "hospital", "cesac", "sanatorio", "clinica", "clínica", "dispensario",
  "plaza", "parque", "plazoleta", "boulevard",
  "polideportivo", "club", "centro cultural", "teatro", "museo", "biblioteca",
  "estacion", "estación", "terminal", "subte", "metrobus", "parada",
  "iglesia", "parroquia", "templo", "catedral", "sinagoga", "basilica", "basílica",
  "comisaria", "comisaría", "sede comunal", "comuna sede", "cementerio", "paseo"
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

  // 6. CRITERIO DE AUTOCOMPLETADO EN EL CALLEJERO OFICIAL:
  // Si en el formulario interactivo NO se autocompletó/seleccionó desde el callejero:
  if (meta.autocompletado === false) {
    return {
      tipo: 'preocupacion',
      esPuntual: false,
      motivo: 'Sin autocompletar en el Callejero Oficial',
      mensaje: 'Al no seleccionar una opción del callejero oficial, se registrará como Preocupación general (sugerencia de mejora al área). Para seguimiento puntual, seleccioná la sugerencia oficial del buscador.'
    };
  }

  // 7. Si fue autocompletado en el Callejero Oficial (meta.autocompletado === true):
  // Al no ser Comuna, Barrio ni Toda la Ciudad (ya descartados arriba), califica como Solicitud Puntual!
  if (meta.autocompletado === true) {
    const esLugar = meta.tipo === 'lugar' || meta.esLugar || meta.fuente?.includes('Lugares');
    return {
      tipo: 'solicitud',
      esPuntual: true,
      motivo: esLugar ? 'Lugar físico o espacio público identificado' : 'Dirección validada en el Callejero Oficial',
      mensaje: 'Ubicación validada en el Callejero Oficial de la Ciudad. Se registrará como Solicitud puntual para gestión operativa.'
    };
  }

  // 8. Para registros preexistentes o cuando meta.autocompletado no fue provisto (ej. lectura desde BD):
  // a) Lugares físicos reconocibles de la lista oficial (ej: "Parque Chacabuco", "Plaza Irlanda", "Hospital Fernández", "Colegio Niñas de Ayohuma")
  for (const kw of LUGARES_FISICOS_KEYWORDS) {
    if (norm.startsWith(kw + ' ') || norm.includes(' ' + kw + ' ') || norm === kw + ' chacabuco' || norm === kw + ' patricios' || norm === kw + ' avellaneda' || norm === kw + ' centenario' || norm === kw + ' rivadavia' || norm === kw + ' lezama' || norm === kw + ' saavedra' || norm === kw + ' irlanda' || norm === kw + ' almagro' || norm === kw + ' flores') {
      const palabras = norm.split(/\s+/).filter(Boolean);
      if (palabras.length >= 2 && !/^(la|el|las|los|un|una|en\s+la|en\s+el)\s+(plaza|parque|escuela|hospital|colegio|comisaria)$/i.test(norm)) {
        return {
          tipo: 'solicitud',
          esPuntual: true,
          motivo: 'Lugar físico o espacio público identificado',
          mensaje: 'Lugar físico identificado. Se registrará como Solicitud puntual para gestión operativa.'
        };
      }
    }
  }

  // b) Intersección o Esquina (ej: "Callao y Corrientes", "Rivadavia esq. Nazca", "Directorio entre Cachimayo y Riglos")
  const regexEsquina = /\s+(y|e\/|entre|esq\.?|esquina)\s+/i;
  if (regexEsquina.test(norm) || (meta.cruce && String(meta.cruce).trim())) {
    return {
      tipo: 'solicitud',
      esPuntual: true,
      motivo: 'Intersección o esquina exacta',
      mensaje: 'Esquina identificada. Se registrará como Solicitud puntual para gestión operativa.'
    };
  }

  // c) Dirección con altura numérica (ej: "Av. San Juan 2500", "Cachimayo 733", "Rivadavia al 1500")
  const regexAltura = /\b(\d{1,5}|al\s+\d{1,5})\b/;
  if (regexAltura.test(norm) || (meta.altura && String(meta.altura).trim())) {
    return {
      tipo: 'solicitud',
      esPuntual: true,
      motivo: 'Dirección puntual con altura',
      mensaje: 'Dirección exacta con altura. Se registrará como Solicitud puntual con seguimiento.'
    };
  }

  // d) Si tiene coordenadas ya resueltas
  if (meta.lat && meta.lng) {
    return {
      tipo: 'solicitud',
      esPuntual: true,
      motivo: 'Ubicación geolocalizada',
      mensaje: 'Ubicación geolocalizada. Se registrará como Solicitud puntual para gestión operativa.'
    };
  }

  // e) Texto libre no validado -> Preocupación
  return {
    tipo: 'preocupacion',
    esPuntual: false,
    motivo: 'Sin validación puntual de callejero',
    mensaje: 'Al no seleccionar una dirección exacta del callejero oficial, se registrará como Preocupación general.'
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

  const rowsToInsert = solicitudes
    .filter(s => s.tematica && (s.descripcion?.trim() || s.direccion?.trim()))
    .map(s => {
      const clasif = clasificarUbicacion(s.direccion, {
        autocompletado: s.autocompletado,
        tipo: s.tipo_ubicacion || s.tipo,
        lat: s.lat,
        lng: s.lng,
        altura: s.altura,
        cruce: s.cruce
      });
      const tipoRegistro = clasif.tipo; // 'solicitud' | 'preocupacion'

      return {
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
        lat: clasif.esPuntual ? s.lat || null : null,
        lng: clasif.esPuntual ? s.lng || null : null,
        estado: 'pendiente',
        ticket_suaci: '',
        notas_operador: ''
      };
    });

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
