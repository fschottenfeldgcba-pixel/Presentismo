/**
 * Servicio de Generación de Brief Ejecutivo para WhatsApp con Inteligencia Artificial (Gemini).
 * Gestiona:
 * 1. WhatsApp Ficha Previa de Planificación y Cobertura
 * 2. Brief Original (Mensaje 1: Territorio, Fuentes, Recurrencia, Asistencia Esperada, Clima, Problemáticas, Focos y Lectura Rápida)
 * 3. Milagros Operativos (Mensaje 2: 3 a 5 casos estratégicos con respuestas sugeridas y resumen de mesa)
 */

import { supabase } from '../lib/supabaseClient';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

export const SEPARADOR_BRIEF = '===SEPARADOR_PARTE_2===';

const DEFAULT_EQUIPO_CERCANIA = [
  { id: '1', nombre_completo: 'Agustín Fox', telefono: '1134709141' },
  { id: '2', nombre_completo: 'Bruno Caputo', telefono: '1154084224' },
  { id: '3', nombre_completo: 'Ezequiel Borra', telefono: '1133333333' },
  { id: '4', nombre_completo: 'Francisco Schottenfeld', telefono: '1169001644' },
  { id: '5', nombre_completo: 'Gonzalo Carou', telefono: '1122222222' },
  { id: '6', nombre_completo: 'Guadalupe Monje', telefono: '1144444444' },
  { id: '7', nombre_completo: 'Lucía Bonzon', telefono: '1155555555' },
  { id: '8', nombre_completo: 'Melisa Morales', telefono: '1166666666' },
  { id: '9', nombre_completo: 'Pilar Chavero', telefono: '1177777777' },
  { id: '10', nombre_completo: 'Tadeo Ristori', telefono: '1188888888' },
  { id: '11', nombre_completo: 'Valentín Stagnaro', telefono: '1199999999' }
];

const formatArrayOrString = (val, fallback = 'Sin especificar') => {
  if (!val) return fallback;
  if (Array.isArray(val)) {
    return val.filter(Boolean).length > 0 ? val.filter(Boolean).join(', ') : fallback;
  }
  return String(val).trim() || fallback;
};

const calculateEndTimeStr = (startStr, minutesToAdd = 90) => {
  if (!startStr) return '18:30';
  const parts = startStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return '18:30';
  const totalMins = h * 60 + m + minutesToAdd;
  const newH = Math.floor(totalMins / 60) % 24;
  const newM = totalMins % 60;
  return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
};

/**
 * Genera el texto para el WhatsApp de Planificación y Cobertura previa.
 */
export function generateWhatsAppPlanificacion(r, inscriptosCount = 0) {
  if (!r) return '';
  const displayFecha = r.fecha ? r.fecha.split('-').reverse().join('/') : '';
  const horaIni = r.hora_inicio_real || '17:00';
  const horaFin = (r.hora_fin_real && r.hora_fin_real !== r.hora_inicio_real && r.hora_fin_real !== '19:00')
    ? r.hora_fin_real
    : calculateEndTimeStr(horaIni, 90);

  const comunaStr = r.comuna || 'Sin especificar';
  const barrioStr = r.barrio || 'Convocatoria Comunal';
  const lugarStr = r.lugar ? r.lugar.trim() : 'Sin especificar';
  
  const encabezaStr = r.funcionario || 'Sin especificar';
  const acompanantesStr = formatArrayOrString(r.funcionarios_acompanantes, 'Sin acompañantes especificados');
  
  let responsableStr = 'Sin responsable asignado';
  if (r.equipo_cercania) {
    responsableStr = `${r.equipo_cercania.nombre_completo}${r.equipo_cercania.telefono ? ` (${r.equipo_cercania.telefono})` : ''}`;
  } else if (r.responsable_cercania_id) {
    const match = DEFAULT_EQUIPO_CERCANIA.find(x => x.id === r.responsable_cercania_id);
    if (match) responsableStr = match.nombre_completo;
  }
  
  const integrantesStr = formatArrayOrString(r.integrantes_asignados, 'Sin integrantes asignados');
  const obsStr = r.observaciones_preparacion || 'Sin especificación';

  return `📋 *Planificación Semanal de Reuniones y Cobertura*
📌 *${r.nombre || 'Reunión'}*
📅 ${displayFecha}, de ${horaIni} a ${horaFin} hs
Comuna convocada: ${comunaStr}
Barrio convocado: ${barrioStr}
📍 Dirección del encuentro: ${lugarStr}

1️⃣ *Inscriptos Confirmados:* ${inscriptosCount}
2️⃣ *Encabeza:* ${encabezaStr}
3️⃣ *Funcionarios Invitados:* ${acompanantesStr}
4️⃣ *Responsable del Equipo:* ${responsableStr}
5️⃣ *Integrantes Asignados:* ${integrantesStr}
6️⃣ *Tareas a Realizar de los Integrantes Asignados:*
Las tareas se designan en territorio por parte del moderador. Las tareas a realizar por los agentes incluyen:
• Acreditación / Toma de Asistencia
• Recepción y Anfitrión de las reuniones. Entrega, recepción y escaneo de fichas de reclamo: Asesoramiento a los vecinos para completar.
• Chequeo de fichas completadas vs oradores
• Toma de minuta de oradores
• Fotografía de los 4 ángulos al inicio de la reunión

7️⃣ *Cierre del formulario de inscripción:*
${obsStr}`;
}

/**
 * Consulta el factor de conversión histórico real de un funcionario en la base de datos.
 */
export async function getFuncionarioConversionFactor(funcionarioName) {
  if (!funcionarioName) return { factor: 0.45, pct: 45, isEstimate: true };

  try {
    const primaryName = funcionarioName.split('/')[0].split('-')[0].trim();
    const { data: reuniones } = await supabase
      .from('reuniones')
      .select('id, fecha')
      .ilike('funcionario', `%${primaryName}%`)
      .lt('fecha', new Date().toISOString().split('T')[0]);

    if (!reuniones || reuniones.length === 0) {
      return { factor: 0.45, pct: 45, isEstimate: true };
    }

    const rIds = reuniones.map(r => r.id);
    const { data: asistencias } = await supabase
      .from('inscripciones_asistencias')
      .select('asistio')
      .in('reunion_id', rIds);

    if (!asistencias || asistencias.length === 0) {
      return { factor: 0.45, pct: 45, isEstimate: true };
    }

    const totalInsc = asistencias.length;
    const totalPres = asistencias.filter(a => a.asistio).length;
    if (totalInsc === 0) return { factor: 0.45, pct: 45, isEstimate: true };

    const rate = totalPres / totalInsc;
    const factor = Math.max(0.1, Math.min(0.9, rate));
    return {
      factor,
      pct: Math.round(factor * 100),
      isEstimate: false,
      totalHistoricoInsc: totalInsc,
      totalHistoricoPres: totalPres
    };
  } catch (err) {
    console.warn('Error calculando factor de conversión del funcionario:', err);
    return { factor: 0.45, pct: 45, isEstimate: true };
  }
}

/**
 * Divide el texto generado en Parte 1 (Brief Original) y Parte 2 (Milagros Operativos).
 */
export function splitBriefParts(fullText = '') {
  if (!fullText) return { parte1: '', parte2: '', full: '' };

  if (fullText.includes(SEPARADOR_BRIEF)) {
    const [p1, p2] = fullText.split(SEPARADOR_BRIEF);
    return {
      parte1: p1.trim(),
      parte2: p2.trim(),
      full: fullText
    };
  }

  // Fallback si Gemini omitió el marcador exacto pero incluyó el encabezado
  const altMarker = 'PARTE 2 — CASOS DE ALTO IMPACTO';
  if (fullText.includes(altMarker)) {
    const idx = fullText.indexOf(altMarker);
    const p1 = fullText.substring(0, idx).replace(/={3,}/g, '').trim();
    const p2 = fullText.substring(idx).trim();
    return {
      parte1: p1,
      parte2: p2,
      full: fullText
    };
  }

  return {
    parte1: fullText.trim(),
    parte2: '',
    full: fullText.trim()
  };
}

/**
 * Consulta el historial de inscripciones y asistencias previas de los vecinos en toda la base de datos de Supabase.
 */
export async function getVecinosHistorialInscripciones(dnis = [], currentReunionId = null) {
  if (!dnis || dnis.length === 0) return {};
  
  const statsMap = {};
  const cleanDnis = dnis.map(d => String(d).trim()).filter(Boolean);
  cleanDnis.forEach(dni => {
    statsMap[dni] = { inscripcionesPrevias: 0, asistenciasPrevias: 0 };
  });

  const chunkSize = 100;
  for (let i = 0; i < cleanDnis.length; i += chunkSize) {
    const chunk = cleanDnis.slice(i, i + chunkSize);
    try {
      let query = supabase
        .from('inscripciones_asistencias')
        .select('vecino_id, asistio, reunion_id')
        .in('vecino_id', chunk);

      if (currentReunionId) {
        query = query.neq('reunion_id', currentReunionId);
      }

      const { data, error } = await query;
      if (!error && data && Array.isArray(data)) {
        data.forEach(row => {
          const cleanDni = String(row.vecino_id).trim();
          if (statsMap[cleanDni]) {
            statsMap[cleanDni].inscripcionesPrevias += 1;
            if (row.asistio) {
              statsMap[cleanDni].asistenciasPrevias += 1;
            }
          }
        });
      }
    } catch (err) {
      console.warn('Error al consultar historial de inscriptos:', err);
    }
  }

  return statsMap;
}

/**
 * Calcula estadísticas determinísticas duras de inscriptos con agrupación de barrios, recurrencia y asistencia esperada.
 */
export function calculateInscriptosStats(inscriptos = [], conversionFactor = { factor: 0.45, pct: 45 }) {
  const total = inscriptos.length;
  if (total === 0) {
    return {
      total: 0,
      barriosSorted: [],
      barriosDisplay: [],
      fuentesSorted: [],
      topBarriosText: '',
      primeraVezCount: 0,
      recurrentesCount: 0,
      primeraVezPct: 0,
      recurrentesPct: 0,
      factorPct: conversionFactor.pct || 45,
      asistenciaEsperada: 0,
      preguntas: [],
      inscriptosDetallados: []
    };
  }

  // 1. Conteo por Barrio
  const barrioCounts = {};
  inscriptos.forEach(item => {
    const b = (item.vecino?.barrio || item.barrio || 'Sin especificar').trim();
    barrioCounts[b] = (barrioCounts[b] || 0) + 1;
  });

  const barriosSorted = Object.entries(barrioCounts)
    .map(([barrio, count]) => ({
      barrio,
      count,
      pct: Math.round((count / total) * 100)
    }))
    .sort((a, b) => b.count - a.count);

  // Agrupación de barrios menores en "Otros" para evitar mensajes interminables en WhatsApp
  let barriosDisplay = [];
  if (barriosSorted.length > 5) {
    const topBarrios = barriosSorted.slice(0, 4);
    const otrosBarrios = barriosSorted.slice(4);
    const otrosCount = otrosBarrios.reduce((sum, b) => sum + b.count, 0);
    const otrosPct = Math.round((otrosCount / total) * 100);

    barriosDisplay = [
      ...topBarrios,
      {
        barrio: `Otros barrios (${otrosBarrios.length})`,
        count: otrosCount,
        pct: otrosPct
      }
    ];
  } else {
    barriosDisplay = barriosSorted;
  }

  // Principales barrios (Lectura breve)
  let topBarriosText = '';
  if (barriosSorted.length > 0) {
    if (barriosSorted.length === 1) {
      topBarriosText = `${barriosSorted[0].pct}% de los inscriptos provienen de ${barriosSorted[0].barrio}.`;
    } else {
      const top2Pct = Math.round(((barriosSorted[0].count + barriosSorted[1].count) / total) * 100);
      topBarriosText = `${top2Pct}% de los inscriptos provienen de ${barriosSorted[0].barrio} y ${barriosSorted[1].barrio}.`;
    }
  }

  // 2. Conteo por Fuente de Convocatoria
  const fuenteCounts = {};
  inscriptos.forEach(item => {
    const f = (item.como_se_entero || item.vecino?.como_se_entero || 'No especificado').trim();
    fuenteCounts[f] = (fuenteCounts[f] || 0) + 1;
  });

  const fuentesSorted = Object.entries(fuenteCounts)
    .map(([fuente, count]) => ({
      fuente,
      count,
      pct: Math.round((count / total) * 100)
    }))
    .sort((a, b) => b.count - a.count);

  // 3. Recurrencia de Inscriptos (1ª vez vs Recurrentes cruzando todas las reuniones)
  let primeraVezCount = 0;
  let recurrentesCount = 0;

  inscriptos.forEach(item => {
    const inscPrev = item.inscripciones_previas || 0;
    const asistPrev = item.asistencias_previas || item.asistencias_anteriores || 0;
    const isRecurrente = (inscPrev > 0 || asistPrev > 0);
    if (isRecurrente) {
      recurrentesCount++;
    } else {
      primeraVezCount++;
    }
  });

  const primeraVezPct = Math.round((primeraVezCount / total) * 100);
  const recurrentesPct = Math.round((recurrentesCount / total) * 100);

  // 4. Asistencia Esperada
  const factorPct = conversionFactor.pct || 45;
  const factorDecimal = factorPct / 100;
  const asistenciaEsperada = Math.round(total * factorDecimal);

  // 5. Extraer preguntas / respuestas abiertas y perfiles para Milagros Operativos
  const preguntas = [];
  const inscriptosDetallados = [];

  inscriptos.forEach((item, idx) => {
    const nombre = (item.vecino?.nombre || item.nombre || '').trim();
    const apellido = (item.vecino?.apellido || item.apellido || '').trim();
    const dni = (item.vecino?.dni || item.dni || item.vecino_id || '').trim();
    const celular = (item.vecino?.celular || item.celular || item.telefono || '').trim();
    const barrio = (item.vecino?.barrio || item.barrio || 'Sin especificar').trim();
    const comoSeEntero = (item.como_se_entero || item.vecino?.como_se_entero || '').trim();
    const inscPrev = item.inscripciones_previas || 0;
    const asistPrev = item.asistencias_previas || item.asistencias_anteriores || 0;
    const rawReclamo = item.tema_previo || item.pregunta_puerta || item.observaciones || item.vecino?.tema || '';
    const cleanReclamo = String(rawReclamo).trim();

    const isMeaningful = cleanReclamo && 
      cleanReclamo !== '-' && 
      cleanReclamo !== '--' && 
      cleanReclamo !== '---' && 
      cleanReclamo.toLowerCase() !== 'ninguno' && 
      cleanReclamo.toLowerCase() !== 'no' && 
      cleanReclamo.toLowerCase() !== 'no se' && 
      cleanReclamo.toLowerCase() !== 'no sé' && 
      cleanReclamo.toLowerCase() !== 'ninguna' && 
      cleanReclamo.toLowerCase() !== 'nada';

    if (isMeaningful) {
      preguntas.push({
        id: idx + 1,
        barrio,
        texto: cleanReclamo
      });

      inscriptosDetallados.push({
        id: idx + 1,
        nombreCompleto: `${nombre} ${apellido}`.trim() || `Vecino #${idx + 1}`,
        dni: dni || 'S/D',
        celular: celular || 'S/D',
        barrio,
        comoSeEntero,
        inscripcionesPrevias: inscPrev,
        asistenciasPrevias: asistPrev,
        reclamo: cleanReclamo
      });
    }
  });

  return {
    total,
    barriosSorted,
    barriosDisplay,
    fuentesSorted,
    topBarriosText,
    primeraVezCount,
    recurrentesCount,
    primeraVezPct,
    recurrentesPct,
    factorPct,
    asistenciaEsperada,
    preguntas,
    inscriptosDetallados
  };
}

/**
 * Genera el Brief Ejecutivo de WhatsApp usando Google Gemini.
 */
export async function generateMeetingBrief({ reunion, inscriptos }) {
  const apiKey = GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('No se encontró la API Key de Gemini (VITE_GEMINI_API_KEY). Verificá tu archivo .env o la configuración de Netlify.');
  }

  const reunionNombre = reunion.nombre || 'Reunión Vecinal';
  const reunionComuna = reunion.comuna || 'CABA';
  const reunionFuncionario = reunion.funcionario || '';
  const reunionFecha = reunion.fecha || '';

  // 1. Obtener historial previo de inscripciones y asistencias de los vecinos
  const dnis = inscriptos.map(i => i.vecino?.dni || i.vecino_id || i.dni).filter(Boolean);
  const historialMap = await getVecinosHistorialInscripciones(dnis, reunion.id);

  // 2. Enriquecer los inscriptos con su historial real de todas las reuniones anteriores
  const enrichedInscriptos = inscriptos.map(item => {
    const dni = String(item.vecino?.dni || item.vecino_id || item.dni || '').trim();
    const hist = historialMap[dni] || { inscripcionesPrevias: 0, asistenciasPrevias: 0 };
    return {
      ...item,
      inscripciones_previas: (item.inscripciones_previas || 0) + hist.inscripcionesPrevias,
      asistencias_previas: (item.asistencias_previas || 0) + hist.asistenciasPrevias,
      asistencias_anteriores: (item.asistencias_anteriores || 0) + hist.asistenciasPrevias
    };
  });

  // Obtener factor de conversión histórico del funcionario
  const convFactor = await getFuncionarioConversionFactor(reunionFuncionario);
  const stats = calculateInscriptosStats(enrichedInscriptos, convFactor);

  if (stats.total === 0) {
    throw new Error('La reunión no tiene inscriptos registrados para generar el Brief.');
  }

  // Estructura de barrios compacta y agrupada
  const barriosText = stats.barriosDisplay
    .map(b => `${b.barrio}: *${b.count} (${b.pct}%)*`)
    .join('\n');

  // Estructura de fuentes
  const fuentesText = stats.fuentesSorted
    .map(f => `_${f.fuente}:_ *${f.count} (${f.pct}%)*`)
    .join('\n');

  // Listado detallado de inscriptos con reclamos para análisis temático y Milagros Operativos
  const inscriptosParaAnalisis = stats.inscriptosDetallados.map(p => 
    `ID: ${p.id} | Vecino: ${p.nombreCompleto} | DNI: ${p.dni} | Tel: ${p.celular} | Barrio: ${p.barrio} | Canal: ${p.comoSeEntero || 'S/D'} | Asistencias Anteriores: ${p.asistenciasPrevias} | Reclamo: "${p.reclamo}"`
  ).join('\n');

  const prompt = `
Actúa como un analista senior de territorio y asuntos públicos del Gobierno de la Ciudad de Buenos Aires.

Tu tarea es procesar el siguiente listado de inscriptos a una reunión de cercanía vecinal con funcionarios y generar un BRIEF EJECUTIVO DIVIDIDO EN 2 MENSAJES DE WHATSAPP separados por el marcador exacto:
${SEPARADOR_BRIEF}

INFORMACIÓN DE LA REUNIÓN:
- Nombre: ${reunionNombre}
- Comuna: ${reunionComuna}
- Funcionario: ${reunionFuncionario || 'A confirmar'}
- Fecha: ${reunionFecha}
- Cantidad total de inscriptos: ${stats.total}

DATOS CUANTITATIVOS EXACTOS (USAR EXACTAMENTE ESTOS NÚMEROS COMPACTOS):
BARRIOS DE PROCEDENCIA:
${barriosText}
Lectura territorial: 👉 *${stats.topBarriosText}*

FUENTE DE CONVOCATORIA:
${fuentesText}

RECURRENCIA DE INSCRIPTOS:
_1ª vez:_ *${stats.primeraVezCount} (${stats.primeraVezPct}%)*
_Recurrentes:_ *${stats.recurrentesCount} (${stats.recurrentesPct}%)*

ASISTENCIA ESPERADA:
*≈ ${stats.asistenciaEsperada} vecinos* (Factor de conversión: *${stats.factorPct}%*)

BASE DE INSCRIPTOS CON RECLAMOS DETALLADOS (${stats.inscriptosDetallados.length} vecinos con contenido):
${inscriptosParaAnalisis}

REGLAS CRÍTICAS:
- Formato 100% optimizado para WhatsApp: *negritas*, _cursivas_, emojis, sin markdown de bloques de código.
- NO inventes datos ni nombres ni números ni teléfonos ni expedientes.
- La Parte 1 (Brief Original) debe ser EJECUTIVA, ÁGIL Y FÁCIL DE LEER en celular.
- Usar OBLIGATORIAMENTE el separador ${SEPARADOR_BRIEF} entre el Mensaje 1 y el Mensaje 2.

ESTRUCTURA OBLIGATORIA A GENERAR:

📍 *Brief – Reunión ${reunionComuna}${reunionFuncionario ? ` – ${reunionFuncionario}` : ''}*

Cantidad de inscriptos: *${stats.total}*

📌 *Perfil territorial*
_Barrio de procedencia_
${barriosText}

👉 *${stats.topBarriosText}*

📣 *Fuente de convocatoria*
${fuentesText}
[Conclusión breve de 1 línea sobre el principal canal]

👥 *Recurrencia de inscriptos*
_1ª vez:_ *${stats.primeraVezCount} (${stats.primeraVezPct}%)*
_Recurrentes:_ *${stats.recurrentesCount} (${stats.recurrentesPct}%)*

🎯 *Asistencia esperada*
*≈ ${stats.asistenciaEsperada} vecinos* (Factor de conversión: *${stats.factorPct}%*)

🔥 *Clima esperable*
[🟢 VERDE / 🟡 AMARILLO / 🟠 NARANJA / 🔴 ROJO]
[UNA frase ejecutiva explicando el porqué]

🧭 *Problemáticas planteadas*
[Listado de 4 a 7 categorías temáticas clave con emojis, cantidad estimada "≈ *XX (XX%)*". Si se registran reclamos vinculados a consorcios, administraciones, RPA, Defensa del Consumidor, expensas, préstamos a consorcios o filtraciones edilicias, agruparlos expresamente bajo la categoría 🏢 *Consorcios y Administraciones*]

🎯 *Focos principales*
[Seleccionar los 2 o 3 temas más relevantes y desarrollarlos con *[Subtema]:* explicación breve]

📍 *Temas específicos de la comuna*
[Identificar calles, esquinas, plazas, escuelas, clubes o predios agrupados por *📍 [Barrio]*:
• *[Lugar / dirección]:* problema planteado]

📌 *Lectura rápida*
[Síntesis política-operativa de 2 párrafos ejecutivos con lo que debe tener preparado el funcionario]

${SEPARADOR_BRIEF}

🎯 *Casos de Alto Impacto — "Milagros Operativos"*
(Oportunidades de respuesta personalizada y visible durante la reunión)

[Seleccionar entre 3 y 5 vecinos reales con el formato exacto y limpio:]

*1. [Nombre y Apellido]* — *([Concepto o arquetipo del caso])*
• *Contacto:* DNI: [DNI] | Tel: [Teléfono] | [1ª vez / X asistencias previas]
• *Barrio:* [Barrio]
• *Reclamo:* [COPIAR TEXTUAL Y EXACTO LO QUE ESCRIBIÓ EL VECINO EN SU FORMULARIO, SIN RESUMIR NI EDITAR]

*2. [Nombre y Apellido]* — *([Concepto o arquetipo del caso])*
• *Contacto:* DNI: [DNI] | Tel: [Teléfono] | [1ª vez / X asistencias previas]
• *Barrio:* [Barrio]
• *Reclamo:* [COPIAR TEXTUAL Y EXACTO LO QUE ESCRIBIÓ EL VECINO EN SU FORMULARIO, SIN RESUMIR NI EDITAR]

[Repetir hasta 5 casos si hay suficientes vecinos con contenido]

⚡ *Resumen de Mesa (Lectura en 30 seg)*
*1. [Nombre] — [Síntesis breve del problema]*
*2. [Nombre] — [Síntesis breve del problema]*
*3. [Nombre] — [Síntesis breve del problema]*
*4. [Nombre] — [Síntesis breve del problema]*
*5. [Nombre] — [Síntesis breve del problema]*
`;

  // Modelos Gemini optimizados por velocidad y disponibilidad
  const modelsToTry = [
    'models/gemini-3.5-flash-lite',
    'models/gemini-flash-lite-latest',
    'models/gemini-3.6-flash',
    'models/gemini-3.7-flash'
  ];

  let lastError = null;

  for (const model of modelsToTry) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 18000); // 18s timeout

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192
          }
        })
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text.trim();
      } else {
        lastError = data.error?.message || 'Respuesta inválida de Gemini';
      }
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err.name === 'AbortError' ? 'Tiempo de respuesta agotado' : err.message;
    }
  }

  throw new Error(`Error al comunicarse con la IA de Gemini: ${lastError}`);
}
