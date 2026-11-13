import * as XLSX from 'xlsx';
import { getAsistentesPorReunion, getOradores } from './supabaseService.js';
import { getSolicitudesPorReunion, clasificarUbicacion, TEMATICAS_PAPELETA } from './solicitudesService.js';
import { classifyTopicHeuristic } from './topicClassificationService.js';

/**
 * Exportación unificada de Fichas y Reclamos (global para TODAS las reuniones).
 *
 * Encabezado estricto de 14 columnas para carga en BA Colaborativa:
 *  1. Fecha
 *  2. Tipo de Reunión
 *  3. Reunión
 *  4. DNI
 *  5. Nombre
 *  6. Apellido
 *  7. Teléfono
 *  8. E-mail
 *  9. Barrio
 * 10. Comuna
 * 11. Tipo (Preocupacion/Solicitud)
 * 12. Concatenado de tematicas (Arbolado / ETC)
 * 13. Dirección exacta de la consulta
 * 14. Concatenado de temas (Tema de Inscripción + Tema de Papeleta Digital + Tema de Oratoria)
 */

const cleanKey = (v) => String(v ?? '').replace(/\D/g, '') || String(v ?? '').trim();

const ESTADOS_ORADOR = {
  en_espera: 'En espera',
  hablando: 'Hablando',
  hablo: 'Habló',
  se_bajo: 'Se bajó',
  no_hablo: 'No habló'
};

// Normalizar etiquetas de categorías para temáticas duras
function extraerCategoriasTexto(texto) {
  if (!texto || typeof texto !== 'string' || !texto.trim()) return [];
  const categorias = new Set();
  const lower = texto.toLowerCase();

  // 1. Coincidencias con temáticas oficiales de la papeleta
  TEMATICAS_PAPELETA.forEach((t) => {
    if (t.id !== 'Otros' && lower.includes(t.label.toLowerCase())) {
      categorias.add(t.label);
    }
  });

  // 2. Coincidencia heurística de palabras clave
  try {
    const heur = classifyTopicHeuristic(texto);
    if (heur && heur.confidence !== 'low' && Array.isArray(heur.badges)) {
      heur.badges.forEach((b) => {
        if (!b?.label) return;
        const bLabel = b.label;
        if (bLabel.includes('Arbolado')) categorias.add('Arbolado');
        else if (bLabel.includes('Veredas')) categorias.add('Veredas');
        else if (bLabel.includes('Higiene')) categorias.add('Higiene / Limpieza');
        else if (bLabel.includes('Luminaria') || bLabel.includes('Alumbrado')) categorias.add('Alumbrado');
        else if (bLabel.includes('Seguridad')) categorias.add('Seguridad');
        else if (bLabel.includes('Tránsito')) categorias.add('Tránsito');
        else if (bLabel.includes('Pluviales')) categorias.add('Pluviales');
        else if (bLabel.includes('Calzadas') || bLabel.includes('Bacheo')) categorias.add('Calzadas');
        else if (bLabel.includes('Parques') || bLabel.includes('Paisaje')) categorias.add('Espacios verdes');
        else if (bLabel.includes('Educación')) categorias.add('Educación');
        else if (bLabel.includes('Salud')) categorias.add('Salud');
        else if (!bLabel.includes('Espacio Público')) categorias.add(bLabel);
      });
    }
  } catch (e) {
    // Silencioso ante errores heurísticos
  }

  // 3. Si el texto original es corto y puntual (ej. "Arbolado", "Limpieza", "Poda", "Veredas")
  if (categorias.size === 0 && texto.trim().length <= 30) {
    categorias.add(texto.trim());
  }

  return Array.from(categorias);
}

export function construirFilasFichas({ reunion, asistentes = [], oradores = [], solicitudes = [] }) {
  const personas = new Map();

  const getPersona = (dniRaw) => {
    const key = cleanKey(dniRaw);
    if (!key) return null;
    if (!personas.has(key)) {
      personas.set(key, {
        dni: String(dniRaw ?? '').trim(),
        nombre: '',
        apellido: '',
        telefono: '',
        email: '',
        barrio: '',
        comuna: '',
        asistio: false,
        inscripto: false,
        temaInscripcion: '',
        papeletas: [],
        oratorias: []
      });
    }
    return personas.get(key);
  };

  // 1. Inscriptos y asistentes del encuentro
  asistentes.forEach((a) => {
    const p = getPersona(a.vecino?.dni || a.vecino_id);
    if (!p) return;
    p.inscripto = true;
    p.asistio = p.asistio || Boolean(a.asistio);
    p.nombre = a.vecino?.nombre || p.nombre;
    p.apellido = a.vecino?.apellido || p.apellido;
    p.telefono = a.vecino?.celular || p.telefono;
    p.email = a.vecino?.email || p.email;
    p.barrio = a.vecino?.barrio || p.barrio;
    p.comuna = a.vecino?.comuna || p.comuna;
    const tInsc = (a.tema_previo || '').trim();
    if (tInsc) p.temaInscripcion = tInsc;
  });

  // 2. Oradores registrados en la sala
  oradores.forEach((o) => {
    const p = getPersona(o.vecino?.dni || o.vecino_id);
    if (!p) return;
    if (!p.nombre) p.nombre = o.vecino?.nombre || '';
    if (!p.apellido) p.apellido = o.vecino?.apellido || '';
    if (!p.telefono) p.telefono = o.vecino?.celular || '';
    if (!p.email) p.email = o.vecino?.email || '';
    if (!p.barrio) p.barrio = o.vecino?.barrio || '';
    if (!p.comuna) p.comuna = o.vecino?.comuna || '';
    const tema = (o.tema_efectivo || o.tema_original || '').trim();
    if (tema) {
      p.oratorias.push({ tema, estado: ESTADOS_ORADOR[o.estado] || o.estado || '' });
    }
  });

  // 3. Fichas digitales completadas in situ
  solicitudes.forEach((s) => {
    const p = getPersona(s.dni || s.vecino_id);
    if (!p) return;
    if (!p.nombre && !p.apellido && s.nombre_apellido) p.nombre = s.nombre_apellido;
    if (!p.telefono) p.telefono = s.telefono || '';
    if (!p.email) p.email = s.email || '';
    if (!p.barrio) p.barrio = s.barrio || '';
    p.papeletas.push(s);
  });

  const fechaReunion = reunion?.fecha || new Date().toISOString().split('T')[0];
  const tipoReunion = reunion?.tipo_reunion || '';
  const nombreReunion = reunion?.nombre || '';

  const filas = Array.from(personas.values())
    // Fallback: incluir a TODOS los asistentes, más quienes hayan completado ficha o hablado
    .filter((p) => p.asistio || p.papeletas.length > 0 || p.oratorias.length > 0)
    .map((p) => {
      // --- Columna 11: Tipo (Preocupacion/Solicitud) ---
      // Evalúa si alguna de las solicitudes del vecino tiene una ubicación puntual con altura, cruce o lugar
      let esSolicitudPuntual = false;
      const direccionesUnicas = [];

      p.papeletas.forEach((s) => {
        const dir = (s.direccion || '').trim();
        if (dir) {
          if (!direccionesUnicas.includes(dir)) {
            direccionesUnicas.push(dir);
          }
          const clasif = clasificarUbicacion(dir, {
            autocompletado: s.autocompletado,
            altura: s.altura,
            cruce: s.cruce,
            tipo: s.tipo_ubicacion,
            lat: s.lat,
            lng: s.lng
          });
          if (clasif.esPuntual || s.tipo_registro === 'solicitud') {
            esSolicitudPuntual = true;
          }
        }
      });

      const tipoRegistroFinal = esSolicitudPuntual ? 'Solicitud' : 'Preocupacion';

      // --- Columna 12: Concatenado de temáticas (Arbolado / ETC) ---
      const catsInscripcion = extraerCategoriasTexto(p.temaInscripcion);
      const catsPapeletaSet = new Set();
      p.papeletas.forEach((s) => {
        if (s.tematica) {
          const tClean = s.tematica.startsWith('Otros:') ? s.tematica.replace(/^Otros:\s*/i, '') : s.tematica;
          if (tClean.trim()) catsPapeletaSet.add(tClean.trim());
        }
      });
      const catsPapeleta = Array.from(catsPapeletaSet);

      const partesTematicas = [];
      if (catsInscripcion.length > 0) {
        partesTematicas.push(`[Inscripción]: ${catsInscripcion.join(', ')}`);
      }
      if (catsPapeleta.length > 0) {
        partesTematicas.push(`[Papeleta]: ${catsPapeleta.join(', ')}`);
      }
      const concatenadoTematicas = partesTematicas.join(' | ');

      // --- Columna 13: Dirección exacta de la consulta ---
      const direccionExacta = direccionesUnicas.join(' | ');

      // --- Columna 14: Concatenado de temas (Inscripción + Papeleta + Oratoria) ---
      const textoPapeletasDesc = p.papeletas
        .map((s) => (s.descripcion || '').trim())
        .filter(Boolean)
        .join(' // ');

      const textoOratoriasTema = p.oratorias
        .map((o) => (o.tema || '').trim())
        .filter(Boolean)
        .join(' // ');

      const partesTemas = [];
      if (p.temaInscripcion) {
        partesTemas.push(`[Inscripción]: ${p.temaInscripcion}`);
      }
      if (textoPapeletasDesc) {
        partesTemas.push(`[Papeleta]: ${textoPapeletasDesc}`);
      }
      if (textoOratoriasTema) {
        partesTemas.push(`[Oratoria]: ${textoOratoriasTema}`);
      }
      const concatenadoTemas = partesTemas.join(' | ');

      // Estructura ESTRICTA de 14 columnas
      return {
        'Fecha': fechaReunion,
        'Tipo de Reunión': tipoReunion,
        'Reunión': nombreReunion,
        'DNI': p.dni,
        'Nombre': p.nombre,
        'Apellido': p.apellido,
        'Teléfono': p.telefono,
        'E-mail': p.email,
        'Barrio': p.barrio,
        'Comuna': p.comuna,
        'Tipo (Preocupacion/Solicitud)': tipoRegistroFinal,
        'Concatenado de tematicas (Arbolado / ETC)': concatenadoTematicas,
        'Dirección exacta de la consulta': direccionExacta,
        'Concatenado de temas (Tema de Inscripción + Tema de Papeleta Digital + Tema de Oratoria)': concatenadoTemas
      };
    })
    .sort((a, b) => `${a.Apellido} ${a.Nombre}`.localeCompare(`${b.Apellido} ${b.Nombre}`, 'es'));

  return filas;
}

export async function descargarFichasYReclamos(reunion) {
  if (!reunion?.id) throw new Error('Reunión no válida.');

  const [asistRes, oradRes, solRes] = await Promise.all([
    getAsistentesPorReunion(reunion.id),
    getOradores(reunion.id).catch(() => ({ data: [] })),
    getSolicitudesPorReunion(reunion.id).catch(() => ({ data: [] }))
  ]);

  if (asistRes?.error) throw asistRes.error;

  const filas = construirFilasFichas({
    reunion,
    asistentes: asistRes?.data || [],
    oradores: oradRes?.data || [],
    solicitudes: solRes?.data || []
  });

  if (filas.length === 0) {
    return { count: 0 };
  }

  const worksheet = XLSX.utils.json_to_sheet(filas);
  worksheet['!cols'] = [
    { wch: 12 }, // 1. Fecha
    { wch: 22 }, // 2. Tipo de Reunión
    { wch: 30 }, // 3. Reunión
    { wch: 12 }, // 4. DNI
    { wch: 18 }, // 5. Nombre
    { wch: 18 }, // 6. Apellido
    { wch: 16 }, // 7. Teléfono
    { wch: 26 }, // 8. E-mail
    { wch: 18 }, // 9. Barrio
    { wch: 10 }, // 10. Comuna
    { wch: 28 }, // 11. Tipo (Preocupacion/Solicitud)
    { wch: 36 }, // 12. Concatenado de tematicas (Arbolado / ETC)
    { wch: 32 }, // 13. Dirección exacta de la consulta
    { wch: 65 }  // 14. Concatenado de temas
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Fichas_y_Reclamos');

  const cleanName = (reunion.nombre || 'Reunion').replace(/[/\\?%*:|"<>]/g, '_');
  const fechaStr = reunion.fecha || new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `Fichas_y_Reclamos_${fechaStr}_${cleanName}.xlsx`);

  return { count: filas.length };
}

// Exportar también como exportarPapeletas para compatibilidad directa
export const exportarPapeletas = descargarFichasYReclamos;
