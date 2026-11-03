import { supabase } from '../lib/supabaseClient.js';
import { bulkUpsertVecinos, bulkGuardarAsistencias, getAsistentesPorReunion, normalizeComuna, normalizeCanalDifusion } from './supabaseService.js';
import * as XLSX from 'xlsx';

/**
 * ============================================================================
 * MÓDULO ESPECIAL: LA NOCHE DE LOS MUSEOS (LNDLM 2026)
 * Gestión y Asignación Geográfica de Voluntarios a Espacios Culturales en CABA
 * ============================================================================
 */

// 1. DICCIONARIO ESTÁTICO DE ADYACENCIA ENTRE LAS 15 COMUNAS DE CABA
export const COMUNAS_LIMITROFES = {
  1: [2, 3, 4],
  2: [1, 3, 5, 14],
  3: [1, 2, 4, 5],
  4: [1, 3, 5, 7, 8],
  5: [2, 3, 4, 6, 7, 14, 15],
  6: [5, 7, 11, 15],
  7: [4, 5, 6, 8, 9, 10, 11],
  8: [4, 7, 9],
  9: [7, 8, 10],
  10: [7, 9, 11],
  11: [6, 7, 10, 12, 15],
  12: [11, 13, 15],
  13: [12, 14, 15],
  14: [2, 5, 13, 15],
  15: [5, 6, 11, 12, 13, 14]
};

// Centroides aproximados por Comuna (fallback cuando no se especifica barrio exacto)
export const COMUNAS_CENTROIDS = {
  1: { lat: -34.6065, lng: -58.3715 },
  2: { lat: -34.5885, lng: -58.3935 },
  3: { lat: -34.6140, lng: -58.4025 },
  4: { lat: -34.6420, lng: -58.3890 },
  5: { lat: -34.6175, lng: -58.4205 },
  6: { lat: -34.6165, lng: -58.4435 },
  7: { lat: -34.6335, lng: -58.4540 },
  8: { lat: -34.6745, lng: -58.4620 },
  9: { lat: -34.6515, lng: -58.5005 },
  10: { lat: -34.6275, lng: -58.4970 },
  11: { lat: -34.6065, lng: -58.4970 },
  12: { lat: -34.5660, lng: -58.4870 },
  13: { lat: -34.5585, lng: -58.4565 },
  14: { lat: -34.5785, lng: -58.4255 },
  15: { lat: -34.5920, lng: -58.4625 }
};

// 2. CATÁLOGO OFICIAL DE LOS 48 BARRIOS PORTEÑOS:
// Incluye Comuna oficial, coordenadas de centroide (WGS84) y barrios limítrofes directos
export const BARRIOS_CABA_DATA = {
  'RETIRO': {
    key: 'RETIRO', display: 'Retiro', comuna: 1, lat: -34.5914, lng: -58.3746,
    limitrofes: ['RECOLETA', 'SAN NICOLAS', 'PUERTO MADERO']
  },
  'SAN NICOLAS': {
    key: 'SAN NICOLAS', display: 'San Nicolás', comuna: 1, lat: -34.6037, lng: -58.3816,
    limitrofes: ['RETIRO', 'RECOLETA', 'BALVANERA', 'MONSERRAT', 'PUERTO MADERO']
  },
  'PUERTO MADERO': {
    key: 'PUERTO MADERO', display: 'Puerto Madero', comuna: 1, lat: -34.6118, lng: -58.3627,
    limitrofes: ['RETIRO', 'SAN NICOLAS', 'MONSERRAT', 'SAN TELMO', 'LA BOCA']
  },
  'SAN TELMO': {
    key: 'SAN TELMO', display: 'San Telmo', comuna: 1, lat: -34.6212, lng: -58.3731,
    limitrofes: ['PUERTO MADERO', 'MONSERRAT', 'CONSTITUCION', 'BARRACAS', 'LA BOCA']
  },
  'MONSERRAT': {
    key: 'MONSERRAT', display: 'Monserrat', comuna: 1, lat: -34.6128, lng: -58.3795,
    limitrofes: ['SAN NICOLAS', 'PUERTO MADERO', 'SAN TELMO', 'CONSTITUCION', 'SAN CRISTOBAL', 'BALVANERA']
  },
  'CONSTITUCION': {
    key: 'CONSTITUCION', display: 'Constitución', comuna: 1, lat: -34.6254, lng: -58.3849,
    limitrofes: ['MONSERRAT', 'SAN TELMO', 'BARRACAS', 'PARQUE PATRICIOS', 'SAN CRISTOBAL']
  },
  'RECOLETA': {
    key: 'RECOLETA', display: 'Recoleta', comuna: 2, lat: -34.5875, lng: -58.3974,
    limitrofes: ['RETIRO', 'SAN NICOLAS', 'BALVANERA', 'ALMAGRO', 'PALERMO']
  },
  'BALVANERA': {
    key: 'BALVANERA', display: 'Balvanera', comuna: 3, lat: -34.6096, lng: -58.4036,
    limitrofes: ['SAN NICOLAS', 'RECOLETA', 'ALMAGRO', 'SAN CRISTOBAL', 'MONSERRAT']
  },
  'SAN CRISTOBAL': {
    key: 'SAN CRISTOBAL', display: 'San Cristóbal', comuna: 3, lat: -34.6236, lng: -58.4026,
    limitrofes: ['BALVANERA', 'MONSERRAT', 'CONSTITUCION', 'PARQUE PATRICIOS', 'BOEDO', 'ALMAGRO']
  },
  'LA BOCA': {
    key: 'LA BOCA', display: 'La Boca', comuna: 4, lat: -34.6345, lng: -58.3631,
    limitrofes: ['PUERTO MADERO', 'SAN TELMO', 'BARRACAS']
  },
  'BARRACAS': {
    key: 'BARRACAS', display: 'Barracas', comuna: 4, lat: -34.6442, lng: -58.3827,
    limitrofes: ['LA BOCA', 'SAN TELMO', 'CONSTITUCION', 'PARQUE PATRICIOS', 'NUEVA POMPEYA']
  },
  'PARQUE PATRICIOS': {
    key: 'PARQUE PATRICIOS', display: 'Parque Patricios', comuna: 4, lat: -34.6373, lng: -58.4009,
    limitrofes: ['CONSTITUCION', 'SAN CRISTOBAL', 'BOEDO', 'NUEVA POMPEYA', 'BARRACAS']
  },
  'NUEVA POMPEYA': {
    key: 'NUEVA POMPEYA', display: 'Nueva Pompeya', comuna: 4, lat: -34.6502, lng: -58.4168,
    limitrofes: ['BARRACAS', 'PARQUE PATRICIOS', 'BOEDO', 'PARQUE CHACABUCO', 'FLORES', 'VILLA SOLDATI']
  },
  'ALMAGRO': {
    key: 'ALMAGRO', display: 'Almagro', comuna: 5, lat: -34.6090, lng: -58.4216,
    limitrofes: ['RECOLETA', 'BALVANERA', 'SAN CRISTOBAL', 'BOEDO', 'CABALLITO', 'VILLA CRESPO', 'PALERMO']
  },
  'BOEDO': {
    key: 'BOEDO', display: 'Boedo', comuna: 5, lat: -34.6269, lng: -58.4177,
    limitrofes: ['ALMAGRO', 'SAN CRISTOBAL', 'PARQUE PATRICIOS', 'NUEVA POMPEYA', 'PARQUE CHACABUCO', 'CABALLITO']
  },
  'CABALLITO': {
    key: 'CABALLITO', display: 'Caballito', comuna: 6, lat: -34.6166, lng: -58.4426,
    limitrofes: ['VILLA CRESPO', 'ALMAGRO', 'BOEDO', 'PARQUE CHACABUCO', 'FLORES', 'VILLA GENERAL MITRE', 'PATERNAL']
  },
  'FLORES': {
    key: 'FLORES', display: 'Flores', comuna: 7, lat: -34.6327, lng: -58.4631,
    limitrofes: ['CABALLITO', 'PARQUE CHACABUCO', 'NUEVA POMPEYA', 'VILLA SOLDATI', 'PARQUE AVELLANEDA', 'FLORESTA', 'VILLA SANTA RITA', 'VILLA GENERAL MITRE']
  },
  'PARQUE CHACABUCO': {
    key: 'PARQUE CHACABUCO', display: 'Parque Chacabuco', comuna: 7, lat: -34.6352, lng: -58.4414,
    limitrofes: ['CABALLITO', 'BOEDO', 'NUEVA POMPEYA', 'FLORES']
  },
  'VILLA SOLDATI': {
    key: 'VILLA SOLDATI', display: 'Villa Soldati', comuna: 8, lat: -34.6626, lng: -58.4452,
    limitrofes: ['NUEVA POMPEYA', 'FLORES', 'PARQUE AVELLANEDA', 'VILLA LUGANO', 'VILLA RIACHUELO']
  },
  'VILLA RIACHUELO': {
    key: 'VILLA RIACHUELO', display: 'Villa Riachuelo', comuna: 8, lat: -34.6914, lng: -58.4722,
    limitrofes: ['VILLA SOLDATI', 'VILLA LUGANO']
  },
  'VILLA LUGANO': {
    key: 'VILLA LUGANO', display: 'Villa Lugano', comuna: 8, lat: -34.6758, lng: -58.4765,
    limitrofes: ['VILLA SOLDATI', 'VILLA RIACHUELO', 'MATADEROS', 'PARQUE AVELLANEDA']
  },
  'LINIERS': {
    key: 'LINIERS', display: 'Liniers', comuna: 9, lat: -34.6447, lng: -58.5205,
    limitrofes: ['VERSALLES', 'VILLA LURO', 'MATADEROS']
  },
  'MATADEROS': {
    key: 'MATADEROS', display: 'Mataderos', comuna: 9, lat: -34.6584, lng: -58.5034,
    limitrofes: ['LINIERS', 'VILLA LURO', 'PARQUE AVELLANEDA', 'VILLA LUGANO']
  },
  'PARQUE AVELLANEDA': {
    key: 'PARQUE AVELLANEDA', display: 'Parque Avellaneda', comuna: 9, lat: -34.6468, lng: -58.4793,
    limitrofes: ['VILLA LURO', 'VELEZ SARSFIELD', 'FLORESTA', 'FLORES', 'VILLA SOLDATI', 'VILLA LUGANO', 'MATADEROS']
  },
  'VILLA REAL': {
    key: 'VILLA REAL', display: 'Villa Real', comuna: 10, lat: -34.6194, lng: -58.5256,
    limitrofes: ['VILLA DEVOTO', 'MONTE CASTRO', 'VERSALLES']
  },
  'MONTE CASTRO': {
    key: 'MONTE CASTRO', display: 'Monte Castro', comuna: 10, lat: -34.6191, lng: -58.5050,
    limitrofes: ['VILLA REAL', 'VILLA DEVOTO', 'VILLA DEL PARQUE', 'VILLA SANTA RITA', 'FLORESTA', 'VELEZ SARSFIELD', 'VILLA LURO', 'VERSALLES']
  },
  'VERSALLES': {
    key: 'VERSALLES', display: 'Versalles', comuna: 10, lat: -34.6295, lng: -58.5227,
    limitrofes: ['VILLA REAL', 'MONTE CASTRO', 'VILLA LURO', 'LINIERS']
  },
  'FLORESTA': {
    key: 'FLORESTA', display: 'Floresta', comuna: 10, lat: -34.6285, lng: -58.4828,
    limitrofes: ['MONTE CASTRO', 'VILLA SANTA RITA', 'FLORES', 'PARQUE AVELLANEDA', 'VELEZ SARSFIELD']
  },
  'VELEZ SARSFIELD': {
    key: 'VELEZ SARSFIELD', display: 'Vélez Sarsfield', comuna: 10, lat: -34.6316, lng: -58.4945,
    limitrofes: ['MONTE CASTRO', 'FLORESTA', 'PARQUE AVELLANEDA', 'VILLA LURO']
  },
  'VILLA LURO': {
    key: 'VILLA LURO', display: 'Villa Luro', comuna: 10, lat: -34.6372, lng: -58.5061,
    limitrofes: ['VERSALLES', 'MONTE CASTRO', 'VELEZ SARSFIELD', 'PARQUE AVELLANEDA', 'MATADEROS', 'LINIERS']
  },
  'VILLA GENERAL MITRE': {
    key: 'VILLA GENERAL MITRE', display: 'Villa General Mitre', comuna: 11, lat: -34.6105, lng: -58.4685,
    limitrofes: ['PATERNAL', 'CABALLITO', 'FLORES', 'VILLA SANTA RITA', 'VILLA DEL PARQUE']
  },
  'VILLA DEVOTO': {
    key: 'VILLA DEVOTO', display: 'Villa Devoto', comuna: 11, lat: -34.6001, lng: -58.5126,
    limitrofes: ['VILLA PUEYRREDON', 'AGRONOMIA', 'VILLA DEL PARQUE', 'MONTE CASTRO', 'VILLA REAL']
  },
  'VILLA DEL PARQUE': {
    key: 'VILLA DEL PARQUE', display: 'Villa del Parque', comuna: 11, lat: -34.6046, lng: -58.4910,
    limitrofes: ['AGRONOMIA', 'PATERNAL', 'VILLA GENERAL MITRE', 'VILLA SANTA RITA', 'MONTE CASTRO', 'VILLA DEVOTO']
  },
  'VILLA SANTA RITA': {
    key: 'VILLA SANTA RITA', display: 'Villa Santa Rita', comuna: 11, lat: -34.6164, lng: -58.4828,
    limitrofes: ['VILLA DEL PARQUE', 'VILLA GENERAL MITRE', 'FLORES', 'FLORESTA', 'MONTE CASTRO']
  },
  'COGHLAN': {
    key: 'COGHLAN', display: 'Coghlan', comuna: 12, lat: -34.5601, lng: -58.4749,
    limitrofes: ['SAAVEDRA', 'NUNEZ', 'BELGRANO', 'VILLA URQUIZA']
  },
  'SAAVEDRA': {
    key: 'SAAVEDRA', display: 'Saavedra', comuna: 12, lat: -34.5527, lng: -58.4878,
    limitrofes: ['NUNEZ', 'COGHLAN', 'VILLA URQUIZA']
  },
  'VILLA URQUIZA': {
    key: 'VILLA URQUIZA', display: 'Villa Urquiza', comuna: 12, lat: -34.5732, lng: -58.4869,
    limitrofes: ['SAAVEDRA', 'COGHLAN', 'BELGRANO', 'VILLA ORTUZAR', 'PARQUE CHAS', 'AGRONOMIA', 'VILLA PUEYRREDON']
  },
  'VILLA PUEYRREDON': {
    key: 'VILLA PUEYRREDON', display: 'Villa Pueyrredón', comuna: 12, lat: -34.5835, lng: -58.5030,
    limitrofes: ['VILLA URQUIZA', 'AGRONOMIA', 'VILLA DEVOTO']
  },
  'BELGRANO': {
    key: 'BELGRANO', display: 'Belgrano', comuna: 13, lat: -34.5613, lng: -58.4566,
    limitrofes: ['NUNEZ', 'COGHLAN', 'VILLA URQUIZA', 'VILLA ORTUZAR', 'COLEGIALES', 'PALERMO']
  },
  'NUNEZ': {
    key: 'NUNEZ', display: 'Núñez', comuna: 13, lat: -34.5453, lng: -58.4642,
    limitrofes: ['SAAVEDRA', 'COGHLAN', 'BELGRANO']
  },
  'COLEGIALES': {
    key: 'COLEGIALES', display: 'Colegiales', comuna: 13, lat: -34.5754, lng: -58.4494,
    limitrofes: ['BELGRANO', 'PALERMO', 'CHACARITA', 'VILLA ORTUZAR']
  },
  'PALERMO': {
    key: 'PALERMO', display: 'Palermo', comuna: 14, lat: -34.5815, lng: -58.4253,
    limitrofes: ['BELGRANO', 'COLEGIALES', 'CHACARITA', 'VILLA CRESPO', 'ALMAGRO', 'RECOLETA']
  },
  'CHACARITA': {
    key: 'CHACARITA', display: 'Chacarita', comuna: 15, lat: -34.5883, lng: -58.4541,
    limitrofes: ['COLEGIALES', 'PALERMO', 'VILLA CRESPO', 'PATERNAL', 'VILLA ORTUZAR']
  },
  'VILLA CRESPO': {
    key: 'VILLA CRESPO', display: 'Villa Crespo', comuna: 15, lat: -34.5986, lng: -58.4426,
    limitrofes: ['PALERMO', 'ALMAGRO', 'CABALLITO', 'PATERNAL', 'CHACARITA']
  },
  'PATERNAL': {
    key: 'PATERNAL', display: 'Paternal', comuna: 15, lat: -34.6012, lng: -58.4682,
    limitrofes: ['VILLA ORTUZAR', 'CHACARITA', 'VILLA CRESPO', 'CABALLITO', 'VILLA GENERAL MITRE', 'VILLA DEL PARQUE', 'AGRONOMIA', 'PARQUE CHAS']
  },
  'VILLA ORTUZAR': {
    key: 'VILLA ORTUZAR', display: 'Villa Ortúzar', comuna: 15, lat: -34.5818, lng: -58.4683,
    limitrofes: ['VILLA URQUIZA', 'BELGRANO', 'COLEGIALES', 'CHACARITA', 'PATERNAL', 'PARQUE CHAS']
  },
  'AGRONOMIA': {
    key: 'AGRONOMIA', display: 'Agronomía', comuna: 15, lat: -34.5936, lng: -58.4894,
    limitrofes: ['VILLA PUEYRREDON', 'VILLA URQUIZA', 'PARQUE CHAS', 'PATERNAL', 'VILLA DEL PARQUE', 'VILLA DEVOTO']
  },
  'PARQUE CHAS': {
    key: 'PARQUE CHAS', display: 'Parque Chas', comuna: 15, lat: -34.5858, lng: -58.4793,
    limitrofes: ['VILLA URQUIZA', 'VILLA ORTUZAR', 'PATERNAL', 'AGRONOMIA']
  }
};

// Diccionario de alias coloquiales o variantes ortográficas hacia el barrio oficial normalizado
const NEIGHBORHOOD_ALIASES = {
  'MONTSERRAT': 'MONSERRAT',
  'LA PATERNAL': 'PATERNAL',
  'BOCA': 'LA BOCA',
  'POMPEYA': 'NUEVA POMPEYA',
  'NVA POMPEYA': 'NUEVA POMPEYA',
  'NVA. POMPEYA': 'NUEVA POMPEYA',
  'MICROCENTRO': 'SAN NICOLAS',
  'CENTRO': 'SAN NICOLAS',
  'TRIBUNALES': 'SAN NICOLAS',
  'CONGRESO': 'BALVANERA',
  'ONCE': 'BALVANERA',
  'ABASTO': 'ALMAGRO',
  'BARRIO NORTE': 'RECOLETA',
  'LAS CANITAS': 'PALERMO',
  'PALERMO SOHO': 'PALERMO',
  'PALERMO HOLLYWOOD': 'PALERMO',
  'PALERMO CHICO': 'PALERMO',
  'BOTANICO': 'PALERMO',
  'BELGRANO R': 'BELGRANO',
  'BELGRANO C': 'BELGRANO',
  'BAJO BELGRANO': 'BELGRANO',
  'CIUDAD UNIVERSITARIA': 'BELGRANO',
  'BARRIO CHINO': 'BELGRANO',
  'NUÑEZ': 'NUNEZ',
  'VILLA GRAL MITRE': 'VILLA GENERAL MITRE',
  'VILLA GRAL. MITRE': 'VILLA GENERAL MITRE',
  'V. GRAL. MITRE': 'VILLA GENERAL MITRE',
  'V GRAL MITRE': 'VILLA GENERAL MITRE',
  'VELEZ': 'VELEZ SARSFIELD',
  'VELEZ SARFIELD': 'VELEZ SARSFIELD',
  'LUGANO': 'VILLA LUGANO',
  'SOLDATI': 'VILLA SOLDATI',
  'RIACHUELO': 'VILLA RIACHUELO',
  'DEVOTO': 'VILLA DEVOTO',
  'URQUIZA': 'VILLA URQUIZA',
  'V URQUIZA': 'VILLA URQUIZA',
  'V. URQUIZA': 'VILLA URQUIZA',
  'PUEYRREDON': 'VILLA PUEYRREDON',
  'V PUEYRREDON': 'VILLA PUEYRREDON',
  'V. PUEYRREDON': 'VILLA PUEYRREDON',
  'V DEL PARQUE': 'VILLA DEL PARQUE',
  'V. DEL PARQUE': 'VILLA DEL PARQUE',
  'V CRESPO': 'VILLA CRESPO',
  'V. CRESPO': 'VILLA CRESPO',
  'V LURO': 'VILLA LURO',
  'V. LURO': 'VILLA LURO',
  'V ORTUZAR': 'VILLA ORTUZAR',
  'V. ORTUZAR': 'VILLA ORTUZAR',
  'ORTUZAR': 'VILLA ORTUZAR',
  'V REAL': 'VILLA REAL',
  'V. REAL': 'VILLA REAL',
  'V SANTA RITA': 'VILLA SANTA RITA',
  'V. SANTA RITA': 'VILLA SANTA RITA',
  'SANTA RITA': 'VILLA SANTA RITA',
  'PQUE PATRICIOS': 'PARQUE PATRICIOS',
  'PQUE. PATRICIOS': 'PARQUE PATRICIOS',
  'PQUE CHACABUCO': 'PARQUE CHACABUCO',
  'PQUE. CHACABUCO': 'PARQUE CHACABUCO',
  'PQUE AVELLANEDA': 'PARQUE AVELLANEDA',
  'PQUE. AVELLANEDA': 'PARQUE AVELLANEDA',
  'PQUE CHAS': 'PARQUE CHAS',
  'PQUE. CHAS': 'PARQUE CHAS',
  'PTO MADERO': 'PUERTO MADERO',
  'PTO. MADERO': 'PUERTO MADERO'
};

/**
 * Normaliza el nombre de un barrio porteño en MAYÚSCULAS y sin tildes para matcheo limpio.
 * Ej: "San Nicolás" -> "SAN NICOLAS", "La Paternal" -> "PATERNAL", "Montserrat" -> "MONSERRAT"
 */
export function normalizeNeighborhoodCABA(raw) {
  if (!raw) return '';
  let clean = String(raw)
    .trim()
    .toUpperCase()
    .replace(/Ñ/g, 'N')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean || clean === 'CONVOCATORIA COMUNAL' || clean === 'SIN BARRIO' || clean === 'NO ESPECIFICADO') {
    return '';
  }

  // Quitar prefijo "BARRIO " o "COMUNA X " si vino concatenado
  clean = clean.replace(/^COMUNA\s*\d+\s*[-/]?\s*/i, '').replace(/^BARRIO\s+/i, '').trim();

  if (BARRIOS_CABA_DATA[clean]) return clean;
  if (NEIGHBORHOOD_ALIASES[clean]) return NEIGHBORHOOD_ALIASES[clean];

  // Búsqueda parcial sobre los 48 barrios oficiales
  for (const key of Object.keys(BARRIOS_CABA_DATA)) {
    if (clean === key || clean.includes(key) || key.includes(clean)) {
      return key;
    }
  }
  for (const [alias, target] of Object.entries(NEIGHBORHOOD_ALIASES)) {
    if (clean.includes(alias)) return target;
  }

  return clean;
}

/**
 * Devuelve el nombre formateado para mostrar de un barrio (ej. "SAN NICOLAS" -> "San Nicolás")
 */
export function getDisplayNeighborhoodCABA(rawOrNormalized) {
  const norm = normalizeNeighborhoodCABA(rawOrNormalized);
  if (norm && BARRIOS_CABA_DATA[norm]) {
    return BARRIOS_CABA_DATA[norm].display;
  }
  return rawOrNormalized ? String(rawOrNormalized).trim() : 'Sin especificar';
}

/**
 * Extrae el número entero de Comuna (1 al 15) a partir de un texto ("Comuna 1", "C14", 14)
 * o lo infiere automáticamente a partir del barrio normalizado si no vino informado.
 */
export function extractComunaNumber(rawComuna, fallbackNeighborhood = '') {
  if (rawComuna !== null && rawComuna !== undefined && String(rawComuna).trim() !== '') {
    const match = String(rawComuna).match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num >= 1 && num <= 15) return num;
    }
  }
  const normBarrio = normalizeNeighborhoodCABA(fallbackNeighborhood);
  if (normBarrio && BARRIOS_CABA_DATA[normBarrio]) {
    return BARRIOS_CABA_DATA[normBarrio].comuna;
  }
  return null;
}

/**
 * Detecta si una reunión corresponde al evento especial "La Noche de los Museos (LNDLM)" / Voluntarios.
 * Cumple el Requisito 1: Mostrar el botón condicional ÚNICAMENTE en esta reunión puntual.
 */
export function isLndlmMeeting(reunion) {
  if (!reunion) return false;
  if (reunion.is_lndlm_event === true) return true;

  try {
    const cfg = typeof reunion.config_uno_a_uno === 'string'
      ? JSON.parse(reunion.config_uno_a_uno)
      : reunion.config_uno_a_uno;
    if (cfg && cfg.is_lndlm_event === true) return true;
  } catch (e) {}

  const combinedText = [
    reunion.nombre || '',
    reunion.tipo_reunion || '',
    reunion.tema || ''
  ]
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return (
    combinedText.includes('noche de los museos') ||
    combinedText.includes('lndlm') ||
    combinedText.includes('ndlm') ||
    combinedText.includes('museo') ||
    combinedText.includes('museos') ||
    (combinedText.includes('capacitacion') && combinedText.includes('voluntari')) ||
    combinedText.includes('voluntario')
  );
}

/**
 * Calcula la distancia lineal Haversine en kilómetros entre dos coordenadas WGS84
 */
export function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 99.9;
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Obtiene las coordenadas (lat, lng) representativas de un voluntario o espacio cultural
 * utilizando las coordenadas explícitas o el centroide de su barrio / comuna.
 */
export function resolveCoordinates(entity) {
  if (!entity) return { lat: -34.6037, lng: -58.3816 };
  if (entity.lat && entity.lng && !isNaN(entity.lat) && !isNaN(entity.lng)) {
    return { lat: Number(entity.lat), lng: Number(entity.lng) };
  }
  const normBarrio = normalizeNeighborhoodCABA(entity.neighborhood || entity.barrio);
  if (normBarrio && BARRIOS_CABA_DATA[normBarrio]) {
    return { lat: BARRIOS_CABA_DATA[normBarrio].lat, lng: BARRIOS_CABA_DATA[normBarrio].lng };
  }
  const comunaNum = extractComunaNumber(entity.comuna, normBarrio);
  if (comunaNum && COMUNAS_CENTROIDS[comunaNum]) {
    return { lat: COMUNAS_CENTROIDS[comunaNum].lat, lng: COMUNAS_CENTROIDS[comunaNum].lng };
  }
  return { lat: -34.6083, lng: -58.4200 }; // Centro geográfico CABA fallback
}

/**
 * Evalúa el nivel de cercanía geográfica entre un voluntario y un espacio cultural:
 * - 100 pts ('MISMO_BARRIO'): Mismo Barrio normalizado
 * - 80 pts ('MISMA_COMUNA'): Misma Comuna
 * - 60 pts ('COMUNA_LIMITROFE'): Barrio Limítrofe o Comuna Limítrofe
 * - 40 pts ('RESTO_CABA'): Resto de CABA (ordenado por menor distancia lineal en km)
 */
export function evaluateProximityAffinity(volunteer, space) {
  const volBarrio = normalizeNeighborhoodCABA(volunteer.neighborhood || volunteer.barrio);
  const spaceBarrio = normalizeNeighborhoodCABA(space.neighborhood || space.barrio);

  const volComuna = extractComunaNumber(volunteer.comuna, volBarrio);
  const spaceComuna = extractComunaNumber(space.comuna, spaceBarrio);

  const volCoords = resolveCoordinates({ ...volunteer, neighborhood: volBarrio, comuna: volComuna });
  const spaceCoords = resolveCoordinates({ ...space, neighborhood: spaceBarrio, comuna: spaceComuna });
  const distanceKm = haversineDistanceKm(volCoords.lat, volCoords.lng, spaceCoords.lat, spaceCoords.lng);

  // Pasada 1: Mismo Barrio
  if (volBarrio && spaceBarrio && volBarrio === spaceBarrio) {
    return {
      proximity_tier: 'MISMO_BARRIO',
      assignment_score: 100,
      distance_km: distanceKm,
      isAdjacentNeighborhood: true
    };
  }

  // Pasada 2: Misma Comuna
  if (volComuna && spaceComuna && volComuna === spaceComuna) {
    const isAdjBarrio = Boolean(
      volBarrio &&
      spaceBarrio &&
      BARRIOS_CABA_DATA[spaceBarrio]?.limitrofes?.includes(volBarrio)
    );
    return {
      proximity_tier: 'MISMA_COMUNA',
      assignment_score: 80,
      distance_km: distanceKm,
      isAdjacentNeighborhood: isAdjBarrio
    };
  }

  // Pasada 3: Barrio Limítrofe o Comuna Limítrofe
  const isAdjBarrio = Boolean(
    volBarrio &&
    spaceBarrio &&
    BARRIOS_CABA_DATA[spaceBarrio]?.limitrofes?.includes(volBarrio)
  );
  const isAdjComuna = Boolean(
    volComuna &&
    spaceComuna &&
    COMUNAS_LIMITROFES[spaceComuna]?.includes(volComuna)
  );

  if (isAdjBarrio || isAdjComuna) {
    return {
      proximity_tier: 'COMUNA_LIMITROFE',
      assignment_score: 60,
      distance_km: distanceKm,
      isAdjacentNeighborhood: isAdjBarrio
    };
  }

  // Pasada 4: Resto CABA
  return {
    proximity_tier: 'RESTO_CABA',
    assignment_score: 40,
    distance_km: distanceKm,
    isAdjacentNeighborhood: false
  };
}

export const PROXIMITY_TIER_META = {
  MISMO_BARRIO: {
    tier: 'MISMO_BARRIO',
    score: 100,
    label: 'Mismo Barrio',
    shortLabel: 'Mismo Barrio (100)',
    color: '#065F46',
    bgColor: '#D1FAE5',
    borderColor: '#6EE7B7',
    icon: '🟢'
  },
  MISMA_COMUNA: {
    tier: 'MISMA_COMUNA',
    score: 80,
    label: 'Misma Comuna',
    shortLabel: 'Misma Comuna (80)',
    color: '#1E40AF',
    bgColor: '#DBEAFE',
    borderColor: '#93C5FD',
    icon: '🔵'
  },
  COMUNA_LIMITROFE: {
    tier: 'COMUNA_LIMITROFE',
    score: 60,
    label: 'Comuna Limítrofe',
    shortLabel: 'Limítrofe (60)',
    color: '#6D28D9',
    bgColor: '#EDE9FE',
    borderColor: '#C4B5FD',
    icon: '🟣'
  },
  RESTO_CABA: {
    tier: 'RESTO_CABA',
    score: 40,
    label: 'Resto CABA',
    shortLabel: 'Resto CABA (40)',
    color: '#9A3412',
    bgColor: '#FFEDD5',
    borderColor: '#FDBA74',
    icon: '🟠'
  },
  // Asignación a dedo (excepción operativa): neutro, no cuenta en las métricas de efectividad del motor
  MANUAL: {
    tier: 'MANUAL',
    score: null,
    label: 'Manual / Excepción',
    shortLabel: 'Manual / Excepción',
    color: '#475569',
    bgColor: '#E2E8F0',
    borderColor: '#94A3B8',
    icon: '✋'
  }
};

/**
 * ============================================================================
 * 3. MOTOR DE ASIGNACIÓN POR CERCANÍA (`assignVolunteersByProximity`)
 * ============================================================================
 * Ejecuta la asignación en 4 pasadas sucesivas (Greedy / Min-Cost Matching):
 *  - Filtra exclusivamente voluntarios con `attended_training === true` (y que no estén de `BAJA`).
 *  - Ordena y cubre los espacios culturales en rondas (round-robin por vacante) priorizando
 *    las sedes con menor cobertura y menor oferta local de voluntarios, garantizando que todas
 *    las sedes reciban su dotación base de manera equitativa.
 *  - Pasada 1: Mismo Barrio (Score 100 - 'MISMO_BARRIO')
 *  - Pasada 2: Misma Comuna (Score 80 - 'MISMA_COMUNA')
 *  - Pasada 3: Comunas / Barrios Limítrofes (Score 60 - 'COMUNA_LIMITROFE')
 *  - Pasada 4: Cobertura General por menor distancia entre centroides (Score 40 - 'RESTO_CABA')
 *  - Voluntarios presentes sobrantes quedan marcados como 'SUPLENTE' ordenados por Comuna y Barrio.
 */
export function assignVolunteersByProximity(volunteers = [], culturalSpaces = [], options = {}) {
  const { preserveManualAssignments = false } = options;

  // Normalizar espacios culturales
  const normalizedSpaces = (culturalSpaces || []).map(s => {
    const normBarrio = normalizeNeighborhoodCABA(s.neighborhood || s.barrio);
    const comunaNum = extractComunaNumber(s.comuna, normBarrio) || 1;
    const coords = resolveCoordinates({ ...s, neighborhood: normBarrio, comuna: comunaNum });
    return {
      ...s,
      neighborhood: normBarrio,
      comuna: comunaNum,
      quota_required: Math.max(0, parseInt(s.quota_required ?? 2, 10) || 0),
      lat: s.lat ?? coords.lat,
      lng: s.lng ?? coords.lng
    };
  });

  // Mapa de asignados por sede: { [spaceId]: Array<assignmentObj> }
  const spaceAssignedMap = {};
  normalizedSpaces.forEach(s => {
    spaceAssignedMap[s.id] = [];
  });

  // Normalizar voluntarios y separar presentes disponibles
  const normalizedVolunteers = (volunteers || []).map(v => {
    const normBarrio = normalizeNeighborhoodCABA(v.neighborhood || v.barrio);
    const comunaNum = extractComunaNumber(v.comuna, normBarrio);
    const coords = resolveCoordinates({ ...v, neighborhood: normBarrio, comuna: comunaNum });
    const attended = Boolean(v.attended_training || v.asistio);
    return {
      ...v,
      dni: String(v.dni || v.vecino_id || '').trim(),
      neighborhood: normBarrio,
      comuna: comunaNum,
      attended_training: attended,
      lat: v.lat ?? coords.lat,
      lng: v.lng ?? coords.lng
    };
  });

  const assignedVolunteerDnis = new Set();
  const volunteerAssignmentResult = {}; // { [dni]: { assigned_space_id, assignment_score, proximity_tier, distance_km, status } }

  // BLOQUEO ANTI-SOBRESCRITURA: las asignaciones a dedo (is_manual_override = true) NUNCA se tocan.
  // Se conservan aun si exceden el cupo de la sede (el excedente es una decisión del operador).
  const manualKeptDnis = new Set();
  normalizedVolunteers.forEach(v => {
    if (!v.is_manual_override || !v.attended_training || v.status === 'BAJA') return;
    if (v.status !== 'ASIGNADO' || !v.assigned_space_id || !spaceAssignedMap[v.assigned_space_id]) return;
    manualKeptDnis.add(v.dni);
    assignedVolunteerDnis.add(v.dni);
    spaceAssignedMap[v.assigned_space_id].push({ dni: v.dni, manual: true });
    volunteerAssignmentResult[v.dni] = {
      assigned_space_id: v.assigned_space_id,
      assignment_score: v.assignment_score ?? null,
      proximity_tier: v.proximity_tier || 'MANUAL',
      distance_km: v.distance_km ?? null,
      status: 'ASIGNADO'
    };
  });

  // Si se solicita preservar asignaciones actuales válidas
  if (preserveManualAssignments) {
    normalizedVolunteers.forEach(v => {
      if (assignedVolunteerDnis.has(v.dni)) return;
      if (v.status === 'BAJA') {
        volunteerAssignmentResult[v.dni] = {
          assigned_space_id: null,
          assignment_score: null,
          proximity_tier: null,
          distance_km: null,
          status: 'BAJA'
        };
        return;
      }
      if (v.attended_training && v.status === 'ASIGNADO' && v.assigned_space_id && spaceAssignedMap[v.assigned_space_id]) {
        const targetSpace = normalizedSpaces.find(s => s.id === v.assigned_space_id);
        if (targetSpace && spaceAssignedMap[targetSpace.id].length < targetSpace.quota_required) {
          const aff = evaluateProximityAffinity(v, targetSpace);
          assignedVolunteerDnis.add(v.dni);
          spaceAssignedMap[targetSpace.id].push({
            dni: v.dni,
            ...aff
          });
          volunteerAssignmentResult[v.dni] = {
            assigned_space_id: targetSpace.id,
            assignment_score: aff.assignment_score,
            proximity_tier: aff.proximity_tier,
            distance_km: aff.distance_km,
            status: 'ASIGNADO'
          };
        }
      }
    });
  }

  // Filtrar voluntarios elegibles (attended_training === true y status !== 'BAJA')
  const getAvailableVolunteers = () =>
    normalizedVolunteers.filter(
      v => v.attended_training && v.status !== 'BAJA' && !assignedVolunteerDnis.has(v.dni)
    );

  // Máximo cupo requerido entre todas las sedes para iterar en rondas equitativas (round-robin)
  const maxQuota = normalizedSpaces.reduce((max, s) => Math.max(max, s.quota_required), 0);

  /**
   * Ejecuta una pasada de asignación para un tier específico ('MISMO_BARRIO', 'MISMA_COMUNA', 'COMUNA_LIMITROFE', 'RESTO_CABA')
   * asignando ronda por ronda (primero el cupo #1 de todas las sedes posibles, luego el #2, etc.)
   * y priorizando las sedes con menor cantidad de candidatos compatibles (Most Constrained First).
   */
  const runPass = (targetTier) => {
    for (let slotRound = 0; slotRound < maxQuota; slotRound++) {
      // Sedes que en esta ronda aún necesitan cubrir el slot `slotRound`
      let openSpaces = normalizedSpaces.filter(
        s => s.quota_required > slotRound && spaceAssignedMap[s.id].length <= slotRound
      );

      if (openSpaces.length === 0) continue;

      // Mientras haya sedes pendientes en esta ronda y voluntarios disponibles
      while (openSpaces.length > 0) {
        const availableVols = getAvailableVolunteers();
        if (availableVols.length === 0) return;

        // Para cada sede abierta en esta ronda, buscar su mejor voluntario compatible con `targetTier`
        const spaceCandidates = [];

        for (const space of openSpaces) {
          let bestVol = null;
          let bestAffinity = null;
          let candidateCount = 0;

          for (const vol of availableVols) {
            const aff = evaluateProximityAffinity(vol, space);
            if (aff.proximity_tier !== targetTier) continue;
            candidateCount++;

            if (!bestVol) {
              bestVol = vol;
              bestAffinity = aff;
            } else {
              // Priorizar barrio limítrofe directo en pasada 3, luego menor distancia lineal en km
              const currentBetterAdj = aff.isAdjacentNeighborhood && !bestAffinity.isAdjacentNeighborhood;
              const sameAdj = aff.isAdjacentNeighborhood === bestAffinity.isAdjacentNeighborhood;
              if (currentBetterAdj || (sameAdj && aff.distance_km < bestAffinity.distance_km)) {
                bestVol = vol;
                bestAffinity = aff;
              }
            }
          }

          if (bestVol && bestAffinity) {
            spaceCandidates.push({
              space,
              bestVol,
              bestAffinity,
              candidateCount
            });
          }
        }

        if (spaceCandidates.length === 0) break;

        // Ordenar sedes candidatas:
        // 1. Menor ratio de cobertura actual (sedes vacías primero)
        // 2. Menor cantidad de candidatos disponibles (Most Constrained Variable first)
        // 3. Menor distancia en km del mejor candidato
        spaceCandidates.sort((a, b) => {
          const fillA = spaceAssignedMap[a.space.id].length / Math.max(1, a.space.quota_required);
          const fillB = spaceAssignedMap[b.space.id].length / Math.max(1, b.space.quota_required);
          if (fillA !== fillB) return fillA - fillB;
          if (a.candidateCount !== b.candidateCount) return a.candidateCount - b.candidateCount;
          return a.bestAffinity.distance_km - b.bestAffinity.distance_km;
        });

        // Asignar el mejor par (space, volunteer)
        const chosen = spaceCandidates[0];
        assignedVolunteerDnis.add(chosen.bestVol.dni);
        spaceAssignedMap[chosen.space.id].push({
          dni: chosen.bestVol.dni,
          ...chosen.bestAffinity
        });
        volunteerAssignmentResult[chosen.bestVol.dni] = {
          assigned_space_id: chosen.space.id,
          assignment_score: chosen.bestAffinity.assignment_score,
          proximity_tier: chosen.bestAffinity.proximity_tier,
          distance_km: chosen.bestAffinity.distance_km,
          status: 'ASIGNADO'
        };

        // Quitar esta sede de la ronda actual si ya cubrió el slotRound
        openSpaces = openSpaces.filter(
          s => s.id !== chosen.space.id || spaceAssignedMap[s.id].length <= slotRound
        );
      }
    }
  };

  // Ejecutar las 4 pasadas sucesivas de prioridad geográfica
  runPass('MISMO_BARRIO');      // Pasada 1: Score 100
  runPass('MISMA_COMUNA');      // Pasada 2: Score 80
  runPass('COMUNA_LIMITROFE');  // Pasada 3: Score 60
  runPass('RESTO_CABA');        // Pasada 4: Score 40

  // Procesar estado final de todos los voluntarios (Asignados, Suplentes, Bajas e Inscriptos ausentes)
  const updatedVolunteers = normalizedVolunteers.map(v => {
    if (v.status === 'BAJA') {
      return {
        ...v,
        assigned_space_id: null,
        assignment_score: null,
        proximity_tier: null,
        distance_km: null,
        status: 'BAJA'
      };
    }

    const assigned = volunteerAssignmentResult[v.dni];
    if (assigned) {
      return {
        ...v,
        ...assigned
      };
    }

    if (v.attended_training) {
      // Voluntario presente que excedió el cupo total requerido -> Banco de SUPLENTES
      return {
        ...v,
        assigned_space_id: null,
        assignment_score: null,
        proximity_tier: null,
        distance_km: null,
        status: 'SUPLENTE'
      };
    }

    return {
      ...v,
      assigned_space_id: null,
      assignment_score: null,
      proximity_tier: null,
      distance_km: null,
      status: 'INSCRIPTO'
    };
  }).map(v => ({ ...v, is_manual_override: manualKeptDnis.has(v.dni) }));

  // Ordenar suplentes por Comuna y Barrio para reemplazos rápidos
  const substitutesList = updatedVolunteers
    .filter(v => v.status === 'SUPLENTE')
    .sort((a, b) => {
      const cA = a.comuna || 99;
      const cB = b.comuna || 99;
      if (cA !== cB) return cA - cB;
      return (a.neighborhood || '').localeCompare(b.neighborhood || '');
    });

  // Construir registros de la tabla `lndlm_assignments`
  const assignmentsRecords = updatedVolunteers
    .filter(v => v.attended_training || v.status === 'BAJA')
    .map(v => ({
      attendee_id: v.dni,
      space_id: v.assigned_space_id || null,
      proximity_tier: v.proximity_tier || null,
      assignment_score: v.assignment_score || null,
      distance_km: v.distance_km ?? null,
      status: v.status === 'BAJA' ? 'BAJA' : (v.assigned_space_id ? 'ASIGNADO' : 'SUPLENTE'),
      is_manual_override: Boolean(v.is_manual_override)
    }));

  const summary = calculateLndlmSummary(updatedVolunteers, normalizedSpaces);

  return {
    updatedVolunteers,
    substitutesList,
    assignmentsRecords,
    spaceAssignedMap,
    summary,
    manualPreservedCount: manualKeptDnis.size
  };
}

/**
 * Calcula los KPIs y métricas de efectividad geográfica del tablero LNDLM
 */
export function calculateLndlmSummary(volunteers = [], culturalSpaces = []) {
  const totalInscriptos = volunteers.length;
  const totalPresentes = volunteers.filter(v => v.attended_training).length;
  const assignedVols = volunteers.filter(v => v.status === 'ASIGNADO' && v.assigned_space_id);
  const suplentesVols = volunteers.filter(v => v.attended_training && (v.status === 'SUPLENTE' || (!v.assigned_space_id && v.status !== 'BAJA')));
  const bajasVols = volunteers.filter(v => v.status === 'BAJA');

  const totalSpaces = culturalSpaces.length;
  const totalQuotaRequired = culturalSpaces.reduce((acc, s) => acc + Math.max(0, Number(s.quota_required ?? 2)), 0);

  const countBySpace = {};
  assignedVols.forEach(v => {
    countBySpace[v.assigned_space_id] = (countBySpace[v.assigned_space_id] || 0) + 1;
  });

  let spacesCoveredFull = 0;
  let spacesPartial = 0;
  let spacesEmpty = 0;

  culturalSpaces.forEach(s => {
    const req = Math.max(0, Number(s.quota_required ?? 2));
    const asig = countBySpace[s.id] || 0;
    if (req === 0 || asig >= req) {
      spacesCoveredFull++;
    } else if (asig > 0) {
      spacesPartial++;
    } else {
      spacesEmpty++;
    }
  });

  const tierCounts = {
    MISMO_BARRIO: 0,
    MISMA_COMUNA: 0,
    COMUNA_LIMITROFE: 0,
    RESTO_CABA: 0
  };

  let totalDistance = 0;
  let distanceCount = 0;
  let manualCount = 0;

  assignedVols.forEach(v => {
    // Las asignaciones manuales no alteran las métricas de efectividad del algoritmo original
    if (v.is_manual_override || v.proximity_tier === 'MANUAL') {
      manualCount++;
      return;
    }
    const tier = v.proximity_tier || 'RESTO_CABA';
    if (tierCounts[tier] !== undefined) {
      tierCounts[tier]++;
    }
    if (v.distance_km != null && !isNaN(v.distance_km)) {
      totalDistance += Number(v.distance_km);
      distanceCount++;
    }
  });

  const totalAssigned = assignedVols.length;
  const autoAssigned = totalAssigned - manualCount;
  const pct = (n) => (autoAssigned > 0 ? Math.round((n / autoAssigned) * 100) : 0);

  const pctMismoBarrio = pct(tierCounts.MISMO_BARRIO);
  const pctMismaComuna = pct(tierCounts.MISMA_COMUNA);
  const pctLimitrofe = pct(tierCounts.COMUNA_LIMITROFE);
  const pctResto = pct(tierCounts.RESTO_CABA);
  const pctBarrioOComuna = pct(tierCounts.MISMO_BARRIO + tierCounts.MISMA_COMUNA);
  const avgDistanceKm = distanceCount > 0 ? Math.round((totalDistance / distanceCount) * 100) / 100 : 0;

  return {
    totalInscriptos,
    totalPresentes,
    totalAssigned,
    manualCount,
    totalSubstitutes: suplentesVols.length,
    totalBajas: bajasVols.length,
    totalSpaces,
    spacesCoveredFull,
    spacesPartial,
    spacesEmpty,
    totalQuotaRequired,
    openVacancies: Math.max(0, totalQuotaRequired - totalAssigned),
    tierCounts,
    pctMismoBarrio,
    pctMismaComuna,
    pctLimitrofe,
    pctResto,
    pctBarrioOComuna,
    avgDistanceKm
  };
}

/**
 * Devuelve la lista de suplentes disponibles ordenados por cercanía geográfica hacia una sede específica
 */
export function getSuggestedSubstitutesForSpace(space, volunteers = []) {
  if (!space) return [];
  const availablePool = (volunteers || []).filter(
    v => v.attended_training && v.status !== 'BAJA' && !v.assigned_space_id
  );

  return availablePool
    .map(v => {
      const aff = evaluateProximityAffinity(v, space);
      return {
        ...v,
        suggested_tier: aff.proximity_tier,
        suggested_score: aff.assignment_score,
        suggested_distance_km: aff.distance_km,
        isAdjacentNeighborhood: aff.isAdjacentNeighborhood
      };
    })
    .sort((a, b) => {
      if (b.suggested_score !== a.suggested_score) return b.suggested_score - a.suggested_score;
      if (a.isAdjacentNeighborhood !== b.isAdjacentNeighborhood) return a.isAdjacentNeighborhood ? -1 : 1;
      return a.suggested_distance_km - b.suggested_distance_km;
    });
}

/**
 * ============================================================================
 * 4. IMPORTADORES MASIVOS (EXCEL / CSV)
 * ============================================================================
 */

/**
 * Lee un archivo Excel (.xlsx/.xls) o CSV y devuelve una matriz 2D de filas.
 * Si `preferredSheetNames` incluye un nombre existente (ej. 'Datos1'), usa esa hoja.
 */
export async function readSpreadsheetRows(file, preferredSheetNames = ['Datos1', 'Espacios', 'Voluntarios']) {
  const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
  const buffer = await file.arrayBuffer();

  if (isExcel) {
    const data = new Uint8Array(buffer);
    const workbook = XLSX.read(data, { type: 'array' });
    let targetSheet = workbook.SheetNames[0];
    for (const pref of preferredSheetNames) {
      const found = workbook.SheetNames.find(s => s.trim().toLowerCase() === pref.toLowerCase());
      if (found) {
        targetSheet = found;
        break;
      }
    }
    const worksheet = workbook.Sheets[targetSheet];
    return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  } else {
    const text = new TextDecoder('utf-8').decode(buffer);
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length === 0) return [];
    const headerLine = lines[0];
    let sep = ',';
    if (headerLine.includes(';')) sep = ';';
    else if (headerLine.includes('\t')) sep = '\t';

    return lines.map(line => {
      const cols = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' || ch === "'") {
          inQuotes = !inQuotes;
        } else if (ch === sep && !inQuotes) {
          cols.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      cols.push(cur.trim());
      return cols;
    });
  }
}

/**
 * Parsea el archivo de Espacios Culturales (`Domicilios espacios culturales.xlsx` / hoja `Datos1`)
 */
export async function parseCulturalSpacesExcel(file) {
  const rows = await readSpreadsheetRows(file, ['Datos1', 'Espacios Culturales', 'Espacios', 'Museos', 'Sedes']);
  if (!rows || rows.length < 2) {
    throw new Error('El archivo de espacios culturales está vacío o no contiene filas válidas.');
  }

  // Encontrar la fila de encabezados (a veces en los Excel hay 1 o 2 filas de título arriba)
  let headerRowIdx = 0;
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const joined = (rows[r] || []).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (joined.includes('espacio') || joined.includes('museo') || joined.includes('nombre') || joined.includes('barrio') || joined.includes('direccion') || joined.includes('domicilio')) {
      headerRowIdx = r;
      break;
    }
  }

  const headers = (rows[headerRowIdx] || []).map(h =>
    String(h || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

  const findCol = (keywords) =>
    headers.findIndex(h => keywords.some(kw => h === kw || h.includes(kw)));

  const idxName = findCol(['nombre_espacio', 'nombre espacio', 'espacio cultural', 'espacio', 'museo', 'sede', 'institucion', 'establecimiento', 'lugar', 'nombre', 'name']);
  const idxAddress = findCol(['direccion', 'domicilio', 'calle', 'ubicacion', 'address']);
  const idxBarrio = findCol(['barrio', 'neighborhood', 'localidad']);
  const idxComuna = findCol(['comuna', 'cgp']);
  const idxContactName = findCol(['referente_nombre', 'referente nombre', 'nombre referente', 'referente', 'contacto', 'responsable', 'coordinador', 'contact_name']);
  const idxContactPhone = findCol(['referente_celular', 'referente celular', 'celular referente', 'telefono referente', 'celular', 'telefono', 'cel', 'tel', 'whatsapp', 'contact_phone']);
  const idxContactEmail = findCol(['referente_email', 'referente email', 'email referente', 'mail referente', 'email', 'correo', 'mail', 'contact_email']);
  const idxQuota = findCol(['cupo_requerido', 'cupo requerido', 'cupo', 'vacantes', 'voluntarios', 'cantidad', 'quota_required', 'quota']);
  const idxLat = findCol(['latitud', 'lat']);
  const idxLng = findCol(['longitud', 'lng', 'lon']);

  const spaces = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const getVal = (idx) => {
      if (idx === -1 || idx === undefined || row[idx] === undefined || row[idx] === null) return '';
      return String(row[idx]).trim();
    };

    const name = getVal(idxName !== -1 ? idxName : 0);
    if (!name || name.toLowerCase() === 'total') continue;

    const rawBarrio = getVal(idxBarrio);
    const rawComuna = getVal(idxComuna);
    const normBarrio = normalizeNeighborhoodCABA(rawBarrio);
    const comunaNum = extractComunaNumber(rawComuna, normBarrio) || 1;
    const finalBarrio = normBarrio || (Object.values(BARRIOS_CABA_DATA).find(b => b.comuna === comunaNum)?.key || 'SAN NICOLAS');

    const rawQuota = getVal(idxQuota);
    const parsedQuota = rawQuota ? parseInt(rawQuota.replace(/\D/g, ''), 10) : 2;
    const quotaRequired = !isNaN(parsedQuota) && parsedQuota > 0 ? parsedQuota : 2;

    const rawLat = parseFloat(getVal(idxLat).replace(',', '.'));
    const rawLng = parseFloat(getVal(idxLng).replace(',', '.'));
    const fallbackCoords = resolveCoordinates({ neighborhood: finalBarrio, comuna: comunaNum });

    const spaceId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `sp_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`;

    spaces.push({
      id: spaceId,
      name,
      address: getVal(idxAddress) || 'Dirección a confirmar',
      neighborhood: finalBarrio,
      comuna: comunaNum,
      contact_name: getVal(idxContactName) || '',
      contact_phone: getVal(idxContactPhone) || '',
      contact_email: getVal(idxContactEmail) || '',
      quota_required: quotaRequired,
      lat: !isNaN(rawLat) ? rawLat : fallbackCoords.lat,
      lng: !isNaN(rawLng) ? rawLng : fallbackCoords.lng
    });
  }

  if (spaces.length === 0) {
    throw new Error('No se encontraron espacios culturales válidos en el archivo seleccionado.');
  }

  return spaces;
}

/**
 * Parsea el archivo de Nómina de Voluntarios (`Confirmados Capacitación LNDLM.xlsx`)
 * Campos soportados: `nombre`, `apellido`, `dni`, `cuitcuil`, `fecha_de_nacimiento`, `comuna`, `barrio`, `email`, `celular`, `canal`, `asistio`
 */
export async function parseVolunteersExcel(file) {
  const rows = await readSpreadsheetRows(file, ['Voluntarios', 'Confirmados', 'Inscriptos', 'Datos1']);
  if (!rows || rows.length < 2) {
    throw new Error('El archivo de voluntarios está vacío o no contiene filas válidas.');
  }

  let headerRowIdx = 0;
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const joined = (rows[r] || []).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (joined.includes('dni') || joined.includes('documento') || joined.includes('apellido') || joined.includes('cuit')) {
      headerRowIdx = r;
      break;
    }
  }

  const headers = (rows[headerRowIdx] || []).map(h =>
    String(h || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

  const findCol = (keywords) =>
    headers.findIndex(h => keywords.some(kw => h === kw || h.includes(kw)));

  const idxFirstName = findCol(['nombre', 'first_name', 'first name', 'nombres']);
  const idxLastName = findCol(['apellido', 'last_name', 'last name', 'apellidos']);
  const idxDni = findCol(['dni', 'documento', 'nro doc', 'numero de documento']);
  const idxCuil = findCol(['cuitcuil', 'cuit cuil', 'cuil', 'cuit']);
  const idxBirthDate = findCol(['fecha_de_nacimiento', 'fecha de nacimiento', 'nacimiento', 'birth_date', 'fecha nac']);
  const idxComuna = findCol(['comuna', 'zona']);
  const idxBarrio = findCol(['barrio', 'neighborhood', 'localidad']);
  const idxEmail = findCol(['email', 'correo', 'mail']);
  const idxPhone = findCol(['celular', 'telefono', 'phone', 'cel', 'tel', 'whatsapp']);
  const idxChannel = findCol(['canal', 'como se entero', 'difusion', 'origen', 'channel']);
  const idxAsistio = findCol(['asistio', 'asistencia', 'presente', 'attended_training', 'attended']);

  const volunteers = [];
  const seenDnis = new Set();
  let duplicateCount = 0;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const getVal = (idx) => {
      if (idx === -1 || idx === undefined || row[idx] === undefined || row[idx] === null) return '';
      return String(row[idx]).trim();
    };

    const firstName = getVal(idxFirstName) || '';
    const lastName = getVal(idxLastName) || '';
    let rawDni = getVal(idxDni).replace(/[.\s-]/g, '');
    const cuil = getVal(idxCuil);

    // Si no vino DNI pero sí CUIL (11 dígitos), extraer los 8 dígitos centrales del DNI
    if (!rawDni && cuil) {
      const cleanCuil = cuil.replace(/\D/g, '');
      if (cleanCuil.length === 11) {
        rawDni = cleanCuil.substring(2, 10);
      }
    }

    if (!rawDni && !firstName && !lastName) continue;
    const dni = rawDni || `VOL-${i}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (seenDnis.has(dni)) {
      duplicateCount++;
      continue;
    }
    seenDnis.add(dni);

    const rawBarrio = getVal(idxBarrio);
    const rawComuna = getVal(idxComuna);
    const normBarrio = normalizeNeighborhoodCABA(rawBarrio);
    const comunaNum = extractComunaNumber(rawComuna, normBarrio);

    const rawAsistio = getVal(idxAsistio).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const attended = ['true', 'si', '1', 'x', 'presente', 'asistio', 'yes'].includes(rawAsistio);

    volunteers.push({
      dni,
      first_name: firstName || 'Voluntario',
      last_name: lastName || '',
      cuil: cuil || '',
      birth_date: getVal(idxBirthDate) || '',
      comuna: comunaNum,
      neighborhood: normBarrio,
      barrio_display: getDisplayNeighborhoodCABA(normBarrio || rawBarrio),
      email: getVal(idxEmail) || '',
      phone: getVal(idxPhone) || '',
      channel: getVal(idxChannel) || '',
      attended_training: attended,
      status: attended ? 'PRESENTE_CAPACITACION' : 'INSCRIPTO'
    });
  }

  return { volunteers, duplicateCount };
}

/**
 * ============================================================================
 * 5. PERSISTENCIA EN SUPABASE + SINCRONIZACIÓN CON REUNIÓN Y LOCALSTORAGE
 * ============================================================================
 */

const getLocalStorageKey = (meetingId) => `lndlm_state_${meetingId || 'global'}`;
const getGlobalSpacesKey = () => `lndlm_cultural_spaces_global_v1`;

/**
 * Obtiene el estado JSON auxiliar almacenado en `reuniones.config_uno_a_uno`
 */
async function fetchReunionConfigJson(meetingId) {
  if (!meetingId) return {};
  try {
    const { data } = await supabase
      .from('reuniones')
      .select('config_uno_a_uno')
      .eq('id', meetingId)
      .maybeSingle();
    if (data && data.config_uno_a_uno) {
      return typeof data.config_uno_a_uno === 'string'
        ? JSON.parse(data.config_uno_a_uno)
        : data.config_uno_a_uno;
    }
  } catch (e) {}
  return {};
}

/**
 * Guarda estado compacto LNDLM dentro de `reuniones.config_uno_a_uno` para garantizar
 * sincronización multi-dispositivo en Supabase incluso si las tablas DDL aún no fueron corridas.
 */
async function saveToReunionConfigJson(meetingId, lndlmPatch) {
  if (!meetingId) return;
  try {
    const currentCfg = await fetchReunionConfigJson(meetingId);
    const existingLndlm = currentCfg.lndlm_data || {};
    const updatedCfg = {
      ...currentCfg,
      is_lndlm_event: true,
      lndlm_data: {
        ...existingLndlm,
        ...lndlmPatch,
        updated_at: new Date().toISOString()
      }
    };
    await supabase
      .from('reuniones')
      .update({ config_uno_a_uno: updatedCfg })
      .eq('id', meetingId);
  } catch (err) {
    console.warn('Aviso sincronizando config_uno_a_uno en reunión:', err);
  }
}

/**
 * Carga todos los datos del Módulo LNDLM para una reunión:
 * 1. Lista de asistentes/inscriptos de la reunión (`getAsistentesPorReunion`)
 * 2. Espacios culturales (`lndlm_cultural_spaces` o fallback en reunión/localStorage)
 * 3. Asignaciones y metadatos de voluntarios (`lndlm_assignments`, `lndlm_volunteers`, o fallback)
 */
export async function loadLndlmMeetingData(meetingId) {
  if (!meetingId) return { volunteers: [], spaces: [], error: null };

  // 1. Cargar asistentes de la reunión desde `inscripciones_asistencias` + `vecinos`
  const [asisRes, currentCfg] = await Promise.all([
    getAsistentesPorReunion(meetingId),
    fetchReunionConfigJson(meetingId)
  ]);

  const meetingAttendees = asisRes.data || [];
  const cfgLndlm = currentCfg?.lndlm_data || {};

  // Fallback local
  let localData = {};
  let globalSpacesLocal = [];
  try {
    localData = JSON.parse(localStorage.getItem(getLocalStorageKey(meetingId)) || '{}');
    globalSpacesLocal = JSON.parse(localStorage.getItem(getGlobalSpacesKey()) || '[]');
  } catch (e) {}

  // 2. Intentar cargar Espacios Culturales desde tabla `lndlm_cultural_spaces`
  let spaces = [];
  try {
    const { data: dbSpaces, error: errSpaces } = await supabase
      .from('lndlm_cultural_spaces')
      .select('*')
      .order('comuna', { ascending: true })
      .order('name', { ascending: true });

    if (!errSpaces && dbSpaces && dbSpaces.length > 0) {
      spaces = dbSpaces;
    }
  } catch (e) {}

  if (spaces.length === 0) {
    if (Array.isArray(cfgLndlm.spaces) && cfgLndlm.spaces.length > 0) {
      spaces = cfgLndlm.spaces;
    } else if (Array.isArray(localData.spaces) && localData.spaces.length > 0) {
      spaces = localData.spaces;
    } else if (Array.isArray(globalSpacesLocal) && globalSpacesLocal.length > 0) {
      spaces = globalSpacesLocal;
    }
  }

  // Normalizar espacios
  spaces = spaces.map(s => {
    const normBarrio = normalizeNeighborhoodCABA(s.neighborhood || s.barrio);
    const comunaNum = extractComunaNumber(s.comuna, normBarrio) || 1;
    const coords = resolveCoordinates({ ...s, neighborhood: normBarrio, comuna: comunaNum });
    return {
      ...s,
      neighborhood: normBarrio,
      comuna: comunaNum,
      quota_required: Math.max(0, parseInt(s.quota_required ?? 2, 10) || 0),
      lat: s.lat ?? coords.lat,
      lng: s.lng ?? coords.lng
    };
  });

  // 3. Intentar cargar asignaciones y metadatos desde `lndlm_assignments` y `lndlm_volunteers`
  const dbAssignmentsMap = {}; // { [dni]: { space_id, proximity_tier, assignment_score, distance_km, status } }
  const dbVolunteersMetaMap = {}; // { [dni]: { cuil, birth_date, channel, neighborhood, comuna, ... } }

  try {
    const [resAssig, resVols] = await Promise.all([
      supabase.from('lndlm_assignments').select('*').eq('meeting_id', meetingId),
      supabase.from('lndlm_volunteers').select('*').eq('meeting_id', meetingId)
    ]);

    if (!resAssig.error && Array.isArray(resAssig.data)) {
      resAssig.data.forEach(a => {
        const dni = String(a.attendee_id || '').trim();
        if (dni) dbAssignmentsMap[dni] = a;
      });
    }

    if (!resVols.error && Array.isArray(resVols.data)) {
      resVols.data.forEach(v => {
        const dni = String(v.dni || '').trim();
        if (dni) {
          dbVolunteersMetaMap[dni] = v;
          if (!dbAssignmentsMap[dni] && (v.assigned_space_id || v.status === 'BAJA' || v.status === 'SUPLENTE')) {
            dbAssignmentsMap[dni] = {
              attendee_id: dni,
              space_id: v.assigned_space_id,
              proximity_tier: v.proximity_tier,
              assignment_score: v.assignment_score,
              distance_km: v.distance_km,
              status: v.status
            };
          }
        }
      });
    }
  } catch (e) {}

  // Combinar con asignaciones y metadatos guardados en `cfgLndlm` o `localData`
  const fallbackAssignments = {
    ...(localData.assignments || {}),
    ...(cfgLndlm.assignments || {})
  };
  const fallbackMeta = {
    ...(localData.volunteersMeta || {}),
    ...(cfgLndlm.volunteersMeta || {})
  };

  // 4. Unificar lista final de voluntarios a partir de `inscripciones_asistencias` de la reunión
  const mergedVolunteers = meetingAttendees.map(item => {
    const v = item.vecino || {};
    const dni = String(item.vecino_id || v.dni || '').trim();
    const meta = dbVolunteersMetaMap[dni] || fallbackMeta[dni] || {};
    const assig = dbAssignmentsMap[dni] || fallbackAssignments[dni] || {};

    const rawBarrio = meta.neighborhood || v.barrio || '';
    const normBarrio = normalizeNeighborhoodCABA(rawBarrio);
    const comunaNum = extractComunaNumber(meta.comuna || v.comuna, normBarrio);
    const coords = resolveCoordinates({ neighborhood: normBarrio, comuna: comunaNum });

    // El check-in de la reunión (`item.asistio`) es la fuente de verdad de asistencia,
    // o bien `meta.attended_training` si fue marcado desde el módulo
    const attended = Boolean(item.asistio);

    let assignedSpaceId = assig.space_id || assig.assigned_space_id || null;
    // Validar que el espacio asignado exista
    if (assignedSpaceId && !spaces.some(s => s.id === assignedSpaceId)) {
      assignedSpaceId = null;
    }

    let status = assig.status || meta.status || (attended ? 'PRESENTE_CAPACITACION' : 'INSCRIPTO');
    if (status === 'BAJA') {
      assignedSpaceId = null;
    } else if (!attended) {
      assignedSpaceId = null;
      status = 'INSCRIPTO';
    } else if (assignedSpaceId) {
      status = 'ASIGNADO';
    } else if (status === 'ASIGNADO' && !assignedSpaceId) {
      status = 'SUPLENTE';
    }

    // Bandera de asignación a dedo (BD; si la columna aún no existe, respaldo en la config de la reunión)
    const isManual = Boolean(
      assig.is_manual_override ?? fallbackAssignments[dni]?.is_manual_override ?? false
    ) && Boolean(assignedSpaceId) && status === 'ASIGNADO';

    // Calcular o recuperar score y distancia si está asignado
    let proximityTier = assig.proximity_tier || null;
    let assignmentScore = assig.assignment_score || null;
    let distanceKm = assig.distance_km ?? null;

    if (isManual && !proximityTier) {
      proximityTier = 'MANUAL';
      assignmentScore = null;
    }

    if (assignedSpaceId) {
      const sp = spaces.find(s => s.id === assignedSpaceId);
      if (sp && isManual) {
        if (distanceKm == null) {
          distanceKm = evaluateProximityAffinity({ neighborhood: normBarrio, comuna: comunaNum, lat: coords.lat, lng: coords.lng }, sp).distance_km;
        }
      } else if (sp && (!proximityTier || !assignmentScore || distanceKm == null)) {
        const aff = evaluateProximityAffinity({ neighborhood: normBarrio, comuna: comunaNum, lat: coords.lat, lng: coords.lng }, sp);
        proximityTier = aff.proximity_tier;
        assignmentScore = aff.assignment_score;
        distanceKm = aff.distance_km;
      }
    }

    return {
      id: item.id || dni,
      inscripcion_id: item.id,
      meeting_id: meetingId,
      dni,
      first_name: v.nombre || meta.first_name || 'Voluntario',
      last_name: v.apellido || meta.last_name || '',
      cuil: meta.cuil || '',
      birth_date: meta.birth_date || '',
      comuna: comunaNum,
      neighborhood: normBarrio,
      barrio_display: getDisplayNeighborhoodCABA(normBarrio || v.barrio),
      email: v.email || meta.email || '',
      phone: v.celular || meta.phone || '',
      channel: item.como_se_entero || meta.channel || '',
      attended_training: attended,
      assigned_space_id: assignedSpaceId,
      assignment_score: assignmentScore,
      proximity_tier: proximityTier,
      distance_km: distanceKm,
      status,
      is_manual_override: isManual,
      lat: coords.lat,
      lng: coords.lng
    };
  });

  return {
    volunteers: mergedVolunteers,
    spaces,
    error: null
  };
}

/**
 * Guarda la lista de Espacios Culturales en Supabase y en resguardo local/reunión
 */
export async function saveLndlmCulturalSpaces(meetingId, spaces = []) {
  const normalizedSpaces = spaces.map(s => {
    const normBarrio = normalizeNeighborhoodCABA(s.neighborhood || s.barrio);
    const comunaNum = extractComunaNumber(s.comuna, normBarrio) || 1;
    const coords = resolveCoordinates({ ...s, neighborhood: normBarrio, comuna: comunaNum });
    return {
      id: s.id || ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `sp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
      name: String(s.name || '').trim(),
      address: String(s.address || '').trim(),
      neighborhood: normBarrio,
      comuna: comunaNum,
      contact_name: String(s.contact_name || '').trim(),
      contact_phone: String(s.contact_phone || '').trim(),
      contact_email: String(s.contact_email || '').trim(),
      quota_required: Math.max(0, parseInt(s.quota_required ?? 2, 10) || 0),
      lat: s.lat ?? coords.lat,
      lng: s.lng ?? coords.lng
    };
  });

  // 1. Intentar guardar en la tabla `lndlm_cultural_spaces`
  try {
    // Upsert por lotes de 200
    for (let i = 0; i < normalizedSpaces.length; i += 200) {
      const chunk = normalizedSpaces.slice(i, i + 200);
      await supabase.from('lndlm_cultural_spaces').upsert(chunk, { onConflict: 'id' });
    }
  } catch (e) {
    console.warn('Fallback en guardado de lndlm_cultural_spaces:', e);
  }

  // 2. Guardar en localStorage y en `reuniones.config_uno_a_uno`
  try {
    localStorage.setItem(getGlobalSpacesKey(), JSON.stringify(normalizedSpaces));
    const localKey = getLocalStorageKey(meetingId);
    const prevLocal = JSON.parse(localStorage.getItem(localKey) || '{}');
    localStorage.setItem(localKey, JSON.stringify({ ...prevLocal, spaces: normalizedSpaces }));
  } catch (e) {}

  await saveToReunionConfigJson(meetingId, { spaces: normalizedSpaces });
  return { data: normalizedSpaces, error: null };
}

/**
 * Elimina un espacio cultural puntual o vacía la lista de espacios
 */
export async function deleteLndlmCulturalSpace(meetingId, spaceId, remainingSpaces = []) {
  try {
    if (spaceId) {
      await supabase.from('lndlm_cultural_spaces').delete().eq('id', spaceId);
    }
  } catch (e) {}
  return await saveLndlmCulturalSpaces(meetingId, remainingSpaces);
}

/**
 * Guarda el mapa de asignaciones y estados de los voluntarios tanto en `lndlm_assignments` / `lndlm_volunteers`
 * como en el almacenamiento sincronizado de la reunión.
 */
export async function saveLndlmAssignments(meetingId, volunteers = []) {
  if (!meetingId) return { error: null };

  const compactAssignments = {};
  const volunteersMeta = {};
  const dbAssignmentRows = [];
  const dbVolunteerRows = [];
  // 'MANUAL' es un estado solo de UI: en BD el tier queda null (el CHECK solo admite los 4 niveles del motor)
  const dbTier = (t) => (t === 'MANUAL' ? null : (t || null));

  volunteers.forEach(v => {
    const dni = String(v.dni || '').trim();
    if (!dni) return;

    if (v.cuil || v.birth_date || v.channel) {
      volunteersMeta[dni] = {
        cuil: v.cuil || '',
        birth_date: v.birth_date || '',
        channel: v.channel || '',
        neighborhood: v.neighborhood || '',
        comuna: v.comuna || null
      };
    }

    if (v.assigned_space_id || v.status === 'SUPLENTE' || v.status === 'BAJA' || v.status === 'ASIGNADO') {
      compactAssignments[dni] = {
        space_id: v.assigned_space_id || null,
        proximity_tier: v.proximity_tier || null,
        assignment_score: v.assignment_score || null,
        distance_km: v.distance_km ?? null,
        status: v.status,
        is_manual_override: Boolean(v.is_manual_override)
      };

      if (v.status === 'ASIGNADO' || v.status === 'SUPLENTE' || v.status === 'BAJA') {
        dbAssignmentRows.push({
          meeting_id: meetingId,
          attendee_id: dni,
          space_id: v.assigned_space_id || null,
          proximity_tier: dbTier(v.proximity_tier),
          assignment_score: v.assignment_score || null,
          distance_km: v.distance_km ?? null,
          status: v.status === 'BAJA' ? 'BAJA' : (v.assigned_space_id ? 'ASIGNADO' : 'SUPLENTE'),
          is_manual_override: Boolean(v.is_manual_override) && Boolean(v.assigned_space_id),
          updated_at: new Date().toISOString()
        });
      }
    }

    dbVolunteerRows.push({
      meeting_id: meetingId,
      first_name: v.first_name || 'Voluntario',
      last_name: v.last_name || '',
      dni,
      cuil: v.cuil || null,
      birth_date: v.birth_date || null,
      comuna: v.comuna || null,
      neighborhood: v.neighborhood || null,
      email: v.email || null,
      phone: v.phone || null,
      channel: v.channel || null,
      attended_training: Boolean(v.attended_training),
      assigned_space_id: v.assigned_space_id || null,
      assignment_score: v.assignment_score || null,
      proximity_tier: dbTier(v.proximity_tier),
      distance_km: v.distance_km ?? null,
      status: v.status || 'INSCRIPTO',
      is_manual_override: Boolean(v.is_manual_override) && Boolean(v.assigned_space_id),
      updated_at: new Date().toISOString()
    });
  });

  // 1. Intentar guardar en `lndlm_assignments` y `lndlm_volunteers`
  // Si la columna `is_manual_override` todavía no existe (migración pendiente), reintenta sin ella
  // para no perder el resto de la persistencia.
  const upsertWithFallback = async (table, rows, onConflict) => {
    for (let i = 0; i < rows.length; i += 300) {
      const chunk = rows.slice(i, i + 300);
      let { error } = await supabase.from(table).upsert(chunk, { onConflict });
      if (error && /is_manual_override/i.test(`${error.message || ''} ${error.details || ''}`)) {
        console.warn(`Falta la columna is_manual_override en ${table}. Ejecutá la migración 20261103_lndlm_manual_override.sql`);
        const stripped = chunk.map(({ is_manual_override: _omit, ...rest }) => rest);
        ({ error } = await supabase.from(table).upsert(stripped, { onConflict }));
      }
      if (error) console.warn(`Error guardando en ${table}:`, error.message);
    }
  };

  try {
    if (dbAssignmentRows.length > 0) await upsertWithFallback('lndlm_assignments', dbAssignmentRows, 'meeting_id,attendee_id');
    if (dbVolunteerRows.length > 0) await upsertWithFallback('lndlm_volunteers', dbVolunteerRows, 'meeting_id,dni');
  } catch (e) {
    console.warn('Fallback en guardado de lndlm_assignments/lndlm_volunteers:', e);
  }

  // 2. Guardar en localStorage y en `reuniones.config_uno_a_uno`
  try {
    const localKey = getLocalStorageKey(meetingId);
    const prevLocal = JSON.parse(localStorage.getItem(localKey) || '{}');
    localStorage.setItem(
      localKey,
      JSON.stringify({
        ...prevLocal,
        assignments: compactAssignments,
        volunteersMeta: { ...(prevLocal.volunteersMeta || {}), ...volunteersMeta }
      })
    );
  } catch (e) {}

  await saveToReunionConfigJson(meetingId, {
    assignments: compactAssignments,
    volunteersMeta
  });

  return { error: null };
}

/**
 * Importa masivamente la nómina de voluntarios (`Confirmados Capacitación LNDLM.xlsx`)
 * vinculándola tanto al circuito normal de Reunión (`vecinos` + `inscripciones_asistencias`)
 * como a los metadatos específicos de LNDLM (`cuil`, `birth_date`, `neighborhood` normalizado).
 */
export async function importVolunteersToMeeting(meetingId, parsedVolunteers = []) {
  if (!meetingId || !parsedVolunteers || parsedVolunteers.length === 0) {
    return { count: 0, error: new Error('No hay voluntarios para importar.') };
  }

  const vecinosPayload = parsedVolunteers.map(v => ({
    dni: v.dni,
    nombre: v.first_name || 'Voluntario',
    apellido: v.last_name || '',
    celular: v.phone || null,
    email: v.email || null,
    barrio: getDisplayNeighborhoodCABA(v.neighborhood),
    comuna: normalizeComuna(v.comuna ? `Comuna ${v.comuna}` : 'Comuna 1')
  }));

  const asistenciasPayload = parsedVolunteers.map(v => ({
    reunion_id: meetingId,
    vecino_id: v.dni,
    asistio: Boolean(v.attended_training),
    estado_convocatoria: 'inscripto',
    como_se_entero: normalizeCanalDifusion(v.channel),
    tema_previo: v.cuil ? `CUIL: ${v.cuil}${v.birth_date ? ` | Nac: ${v.birth_date}` : ''}` : null
  }));

  await bulkUpsertVecinos(vecinosPayload);
  await bulkGuardarAsistencias(asistenciasPayload);
  await saveLndlmAssignments(meetingId, parsedVolunteers);

  return { count: parsedVolunteers.length, error: null };
}

/**
 * Genera las filas de asignación horizontal de voluntarios por espacio cultural
 * con las columnas requeridas para la coordinación en museos.
 */
export function buildSpacesAssignmentRows(volunteers = [], spaces = []) {
  const assignedBySpace = {};
  spaces.forEach(s => {
    assignedBySpace[s.id] = [];
  });

  volunteers.forEach(v => {
    if (v.status === 'ASIGNADO' && v.assigned_space_id && assignedBySpace[v.assigned_space_id]) {
      assignedBySpace[v.assigned_space_id].push(v);
    }
  });

  // Determinar la cantidad máxima de voluntarios asignados en cualquier espacio (mínimo 3 para asegurar columnas)
  let maxVols = 3;
  spaces.forEach(s => {
    const count = (assignedBySpace[s.id] || []).length;
    if (count > maxVols) maxVols = count;
  });

  // Ordenar espacios por Comuna, luego Barrio y Nombre
  const sortedSpaces = [...spaces].sort((a, b) => {
    const ca = Number(a.comuna) || 99;
    const cb = Number(b.comuna) || 99;
    if (ca !== cb) return ca - cb;
    const ba = (a.neighborhood || '').localeCompare(b.neighborhood || '');
    if (ba !== 0) return ba;
    return (a.name || '').localeCompare(b.name || '');
  });

  return sortedSpaces.map(sp => {
    const row = {
      'Comuna del Espacio Cultural': sp.comuna ? (String(sp.comuna).startsWith('Comuna') ? sp.comuna : `Comuna ${sp.comuna}`) : '',
      'Barrio del Espacio Cultural': sp.neighborhood || '',
      'Nombre del Espacio Cultural': sp.name || '',
      'Cupo del Espacio Cultural': Number(sp.quota_required ?? 2),
      'Dirección del Espacio Cultural': sp.address || '',
      'Referente del Espacio Cultural': sp.contact_name || '',
      'Numero de teléfono del Referente del Espacio Cultural': sp.contact_phone || '',
      'Mail del Referente del Espacio Cultural': sp.contact_email || ''
    };

    const assigned = assignedBySpace[sp.id] || [];

    for (let i = 1; i <= maxVols; i++) {
      const vol = assigned[i - 1];
      const fullName = vol ? `${vol.first_name || ''} ${vol.last_name || ''}`.trim() : '';
      row[`Nombre y Apellido del Voluntario Asignado ${i}`] = fullName;
      row[`DNI del Voluntario Asignado ${i}`] = vol?.dni || '';
      row[`Comuna del Voluntario Asignado ${i}`] = vol?.comuna ? (String(vol.comuna).startsWith('Comuna') ? vol.comuna : `Comuna ${vol.comuna}`) : '';
      row[`Barrio del Voluntario Asignado ${i}`] = vol?.neighborhood || vol?.barrio || '';
      row[`Mail del Voluntario Asignado ${i}`] = vol?.email || '';
      row[`Teléfono del Voluntario Asignado ${i}`] = vol?.phone || '';
    }

    return row;
  });
}

/**
 * Descarga en Excel la asignación de voluntarios a los museos / espacios culturales (vista horizontal por museo)
 */
export function exportSpacesAssignmentExcel(volunteers = [], spaces = []) {
  const wb = XLSX.utils.book_new();
  const rows = buildSpacesAssignmentRows(volunteers, spaces);

  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Info: 'No hay espacios culturales cargados.' }]);

  if (rows.length > 0) {
    const colKeys = Object.keys(rows[0]);
    ws['!cols'] = colKeys.map(k => ({
      wch: Math.max(k.length + 2, 14)
    }));
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Asignacion_Por_Museo');
  const safeDate = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `Asignacion_Voluntarios_Museos_LNDLM_${safeDate}.xlsx`);
}

/**
 * Exporta el Excel Maestro de LNDLM 2026 con múltiples hojas listas para operación y notificaciones (11/11 y 12/11)
 */
export function exportMasterLndlmExcel(reunion, volunteers = [], spaces = [], summary = null) {
  const wb = XLSX.utils.book_new();
  const spacesMap = {};
  spaces.forEach(s => {
    spacesMap[s.id] = s;
  });

  // HOJA 0: ASIGNACIÓN HORIZONTAL POR ESPACIO CULTURAL (Vista solicitada para museos)
  const museumRows = buildSpacesAssignmentRows(volunteers, spaces);
  const wsMuseum = XLSX.utils.json_to_sheet(
    museumRows.length > 0 ? museumRows : [{ Info: 'No hay espacios culturales cargados.' }]
  );
  if (museumRows.length > 0) {
    const colKeys = Object.keys(museumRows[0]);
    wsMuseum['!cols'] = colKeys.map(k => ({ wch: Math.max(k.length + 2, 14) }));
  }
  XLSX.utils.book_append_sheet(wb, wsMuseum, 'Asignacion_Por_Museo');

  // HOJA 1: NÓMINA DE VOLUNTARIOS ASIGNADOS (Para envío de notificaciones 11/11 y 12/11)
  const assignedRows = volunteers
    .filter(v => v.status === 'ASIGNADO' && v.assigned_space_id)
    .map(v => {
      const sp = spacesMap[v.assigned_space_id] || {};
      const tierMeta = PROXIMITY_TIER_META[v.proximity_tier] || PROXIMITY_TIER_META.RESTO_CABA;
      return {
        'Estado': 'ASIGNADO',
        'DNI Voluntario': v.dni,
        'CUIL / CUIT': v.cuil || '',
        'Nombre': v.first_name || '',
        'Apellido': v.last_name || '',
        'Fecha Nacimiento': v.birth_date || '',
        'Celular Voluntario': v.phone || '',
        'Email Voluntario': v.email || '',
        'Barrio Voluntario (Normalizado)': v.neighborhood || '',
        'Comuna Voluntario': v.comuna ? `Comuna ${v.comuna}` : '',
        'Canal Inscripción': v.channel || '',
        'Espacio Cultural Asignado': sp.name || '',
        'Dirección del Espacio': sp.address || '',
        'Barrio del Espacio': sp.neighborhood || '',
        'Comuna del Espacio': sp.comuna ? `Comuna ${sp.comuna}` : '',
        'Nivel de Cercanía': tierMeta.label,
        'Score de Afinidad': v.assignment_score || '',
        'Distancia Estimada (km)': v.distance_km != null ? v.distance_km : '',
        'Referente del Espacio': sp.contact_name || '',
        'Celular Referente': sp.contact_phone || '',
        'Email Referente': sp.contact_email || ''
      };
    });

  const wsAssigned = XLSX.utils.json_to_sheet(
    assignedRows.length > 0
      ? assignedRows
      : [{ Info: 'Aún no se han ejecutado asignaciones de voluntarios.' }]
  );
  XLSX.utils.book_append_sheet(wb, wsAssigned, '1_Asignados_Notificaciones');

  // HOJA 2: ESTADO DE COBERTURA POR ESPACIO CULTURAL (166 Sedes)
  const spacesRows = spaces.map((sp, idx) => {
    const volsInSpace = volunteers.filter(v => v.status === 'ASIGNADO' && v.assigned_space_id === sp.id);
    const req = Math.max(0, Number(sp.quota_required ?? 2));
    const cubierto = volsInSpace.length;
    const vacantes = Math.max(0, req - cubierto);
    return {
      '#': idx + 1,
      'Espacio Cultural': sp.name || '',
      'Dirección': sp.address || '',
      'Barrio': sp.neighborhood || '',
      'Comuna': sp.comuna ? `Comuna ${sp.comuna}` : '',
      'Cupo Requerido': req,
      'Voluntarios Asignados': cubierto,
      'Vacantes Pendientes': vacantes,
      'Estado de Cupo': cubierto >= req ? 'COMPLETO' : (cubierto > 0 ? 'INCOMPLETO' : 'SIN ASIGNAR'),
      'Detalle Voluntarios (Nombre y DNI)': volsInSpace.map(v => `${v.first_name} ${v.last_name} (DNI ${v.dni} - ${v.neighborhood || 'S/B'})`).join(' | '),
      'Celulares Voluntarios': volsInSpace.map(v => v.phone || '-').join(' / '),
      'Referente Sede': sp.contact_name || '',
      'Celular Referente': sp.contact_phone || '',
      'Email Referente': sp.contact_email || ''
    };
  });

  const wsSpaces = XLSX.utils.json_to_sheet(
    spacesRows.length > 0 ? spacesRows : [{ Info: 'Sin espacios culturales cargados.' }]
  );
  XLSX.utils.book_append_sheet(wb, wsSpaces, '2_Sedes_Culturales');

  // HOJA 3: BANCO DE SUPLENTES DISPONIBLES (Presentes en Capacitación sin sede asignada)
  const substitutesRows = volunteers
    .filter(v => v.attended_training && (v.status === 'SUPLENTE' || (!v.assigned_space_id && v.status !== 'BAJA')))
    .sort((a, b) => (a.comuna || 99) - (b.comuna || 99) || (a.neighborhood || '').localeCompare(b.neighborhood || ''))
    .map((v, idx) => ({
      'Orden': idx + 1,
      'Estado': 'SUPLENTE DISPONIBLE',
      'Comuna': v.comuna ? `Comuna ${v.comuna}` : '',
      'Barrio (Normalizado)': v.neighborhood || '',
      'DNI': v.dni,
      'CUIL / CUIT': v.cuil || '',
      'Nombre': v.first_name || '',
      'Apellido': v.last_name || '',
      'Fecha Nacimiento': v.birth_date || '',
      'Celular': v.phone || '',
      'Email': v.email || '',
      'Canal': v.channel || ''
    }));

  const wsSubstitutes = XLSX.utils.json_to_sheet(
    substitutesRows.length > 0 ? substitutesRows : [{ Info: 'No hay suplentes disponibles en este momento.' }]
  );
  XLSX.utils.book_append_sheet(wb, wsSubstitutes, '3_Banco_Suplentes');

  // HOJA 4: PADRÓN COMPLETO DE LA CAPACITACIÓN (Todos los inscriptos, presentes, ausentes y bajas)
  const allRows = volunteers.map(v => {
    const sp = v.assigned_space_id ? spacesMap[v.assigned_space_id] : null;
    return {
      'DNI': v.dni,
      'CUIL / CUIT': v.cuil || '',
      'Nombre': v.first_name || '',
      'Apellido': v.last_name || '',
      'Fecha Nacimiento': v.birth_date || '',
      'Comuna': v.comuna ? `Comuna ${v.comuna}` : '',
      'Barrio Normalizado': v.neighborhood || '',
      'Email': v.email || '',
      'Celular': v.phone || '',
      'Canal': v.channel || '',
      'Asistió a Capacitación': v.attended_training ? 'SI' : 'NO',
      'Estado LNDLM': v.status || 'INSCRIPTO',
      'Sede Asignada': sp ? sp.name : '-',
      'Barrio Sede': sp ? sp.neighborhood : '-',
      'Score Cercanía': v.assignment_score || '-',
      'Nivel Cercanía': v.proximity_tier || '-'
    };
  });

  const wsAll = XLSX.utils.json_to_sheet(allRows);
  XLSX.utils.book_append_sheet(wb, wsAll, '4_Padron_Total_LNDLM');

  const safeDate = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `Asignacion_LNDLM_2026_${safeDate}.xlsx`);
}

/**
 * Descarga una plantilla Excel de ejemplo para Espacios Culturales o Voluntarios
 */
export function downloadTemplateLndlm(type = 'spaces') {
  const wb = XLSX.utils.book_new();
  if (type === 'spaces') {
    const sample = [
      {
        nombre_espacio: 'Museo Nacional de Bellas Artes',
        direccion: 'Av. del Libertador 1473',
        barrio: 'RECOLETA',
        comuna: 2,
        referente_nombre: 'María Laura Gómez',
        referente_celular: '1144556677',
        referente_email: 'mlgomez@bellasartes.gob.ar',
        cupo_requerido: 4
      },
      {
        nombre_espacio: 'Usina del Arte',
        direccion: 'Agustín R. Caffarena 1',
        barrio: 'LA BOCA',
        comuna: 4,
        referente_nombre: 'Martín Pereyra',
        referente_celular: '1155667788',
        referente_email: 'mpereyra@buenosaires.gob.ar',
        cupo_requerido: 4
      },
      {
        nombre_espacio: 'Museo de Arte Moderno de Buenos Aires',
        direccion: 'Av. San Juan 350',
        barrio: 'SAN TELMO',
        comuna: 1,
        referente_nombre: 'Carolina Díaz',
        referente_celular: '1166778899',
        referente_email: 'cdiaz@museomoderno.org',
        cupo_requerido: 3
      }
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    XLSX.utils.book_append_sheet(wb, ws, 'Datos1');
    XLSX.writeFile(wb, 'Plantilla_Domicilios_Espacios_Culturales_LNDLM.xlsx');
  } else {
    const sample = [
      {
        nombre: 'Sofía',
        apellido: 'Martínez',
        dni: '42123456',
        cuitcuil: '27421234564',
        fecha_de_nacimiento: '15/05/1999',
        comuna: 'Comuna 2',
        barrio: 'Recoleta',
        email: 'sofia.martinez@mail.com',
        celular: '1133445566',
        canal: 'WhatsApp',
        asistio: 'SI'
      },
      {
        nombre: 'Lucas',
        apellido: 'Fernández',
        dni: '40987654',
        cuitcuil: '20409876543',
        fecha_de_nacimiento: '22/08/1998',
        comuna: 'Comuna 4',
        barrio: 'La Boca',
        email: 'lucas.f@mail.com',
        celular: '1122334455',
        canal: 'Redes Sociales',
        asistio: 'SI'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    XLSX.utils.book_append_sheet(wb, ws, 'Confirmados');
    XLSX.writeFile(wb, 'Plantilla_Confirmados_Capacitacion_LNDLM.xlsx');
  }
}
