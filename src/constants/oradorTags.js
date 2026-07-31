/**
 * Tags temáticos predefinidos para clasificar los temas tratados por los oradores.
 */
export const ORADOR_TAGS = [
  { label: 'Tránsito',                            color: '#f97316' },
  { label: 'Infraestructura',                     color: '#6b7280' },
  { label: 'Seguridad',                           color: '#1e40af' },
  { label: 'Situación de Calle',                  color: '#7c3aed' },
  { label: 'Higiene',                             color: '#0d9488' },
  { label: 'Educación',                           color: '#2563eb' },
  { label: 'Salud',                               color: '#dc2626' },
  { label: 'Espacio Público (Veredas)',            color: '#d97706' },
  { label: 'Espacios Verdes (Plazas y Parques)',   color: '#16a34a' },
  { label: 'Arbolado',                            color: '#15803d' },
  { label: 'Actividades Comerciales',             color: '#92400e' },
  { label: 'Emprendedurismo y Trabajo',           color: '#4338ca' },
];

/**
 * Diccionario de palabras clave por tag para la detección automática.
 * Todas las keywords deben estar en minúsculas y sin acentos.
 */
export const TAG_KEYWORD_MAP = {
  "Tránsito": [
    "transito", "auto", "autos", "trafico", "varado", "varados", "cola", "colas", 
    "semaforo", "semaforos", "colectivo", "colectivos", "embotellamiento", "esquina", 
    "corte", "cortes", "contramano", "velocidad", "estacionar", "estacionamiento", 
    "estacionado", "estacionados", "garaje", "peaton", "cruce", "camion", "camiones", 
    "moto", "motos", "escape", "escapes", "ruido de motor", "subte", "linea f", 
    "parada", "multa", "multas", "micro", "micros", "transporte"
  ],
  "Infraestructura": [
    "obra", "obras", "bache", "baches", "asfalto", "calle", "calles", "alumbrado", 
    "luz", "luces", "cable", "cables", "poste", "postes", "inundacion", "agua", 
    "pluvial", "sumidero", "caño", "caños", "edificio", "construccion", "construcciones",
    "puente", "garita", "garitas", "destruida", "destruidas", "abandono"
  ],
  "Seguridad": [
    "seguridad", "inseguridad", "droga", "drogas", "robar", "robo", "robos", 
    "delito", "delitos", "casa tomada", "casas tomadas", "policia", "patrullero", 
    "patrulleros", "chorro", "chorros", "camara", "camaras", "domo", "alarma", 
    "comisaria", "zona liberada", "asalto", "violencia", "trapito", "trapitos", 
    "exigen dinero", "insultan", "amenazan", "usurpacion", "usurpaciones", "ilegal", "ilegales"
  ],
  "Situación de Calle": [
    "situacion de calle", "gente en calle", "persona en calle", "personas en calle", 
    "ranchada", "ranchadas", "colchon", "colchones", "dormir en la calle", 
    "acampe", "indigente", "indigencia", "ocupacion"
  ],
  "Higiene": [
    "basura", "basural", "contenedor", "contenedores", "olor", "olores", "mugre", 
    "higiene", "barrendero", "barrenderos", "ratas", "roedores", "limpieza", 
    "desmonte", "sucio", "reciclado", "recicladores", "campana verde", "tacho", 
    "tachos", "suciedad"
  ],
  "Educación": [
    "escuela", "escuelas", "colegio", "colegios", "jardin", "vacantes", "docente", 
    "docentes", "maestro", "maestros", "educacion", "aula", "estudiante", "alumnos"
  ],
  "Salud": [
    "salud", "hospital", "hospitales", "cesac", "turno", "turnos", "medico", 
    "medicos", "remedio", "remedios", "ambulancia", "guardia", "atencion medica", 
    "especialista", "pediatra"
  ],
  "Espacio Público (Veredas)": [
    "vereda", "veredas", "baldosa", "baldosas", "rotura de vereda", "rampa", 
    "rampas", "obstaculo", "puesto", "puestos", "mantero", "manteros", 
    "venta ambulante", "marquesina", "rompe la vereda", "destruida"
  ],
  "Espacios Verdes (Plazas y Parques)": [
    "plaza", "plazas", "parque", "parques", "juegos", "canil", "caniles", 
    "cesped", "pasto", "banco", "bancos", "guardaparque", "reja", "rejas"
  ],
  "Arbolado": [
    "arbol", "arboles", "rama", "ramas", "poda", "desmoche", "raiz", "raices", 
    "hojas", "arbolado", "tala", "arbol caido", "tronco"
  ],
  "Actividades Comerciales": [
    "comercio", "comercios", "local", "locales", "bar", "bares", "ruido molesto", 
    "ruidos molestos", "ruidos", "habilitacion", "inspeccion", "horario nocturno", 
    "boliche", "musica alta"
  ],
  "Emprendedurismo y Trabajo": [
    "trabajo", "empleo", "capacitacion", "emprendedor", "emprendedores", "taller", 
    "credito", "pyme", "pymes", "feria", "feriantes"
  ]
};

/**
 * Normaliza un string: minúsculas y sin acentos/diacríticos.
 */
function normalizeText(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Detecta automáticamente los tags a partir del texto de la minuta.
 * Asigna un tag si hay AL MENOS 1 coincidencia de palabra clave en el texto.
 *
 * @param {string} text – tema_efectivo del orador
 * @returns {string[]} – array de labels de tags detectados
 */
export function autoDetectTags(text) {
  if (!text || text.trim() === '') return [];
  const normalized = normalizeText(text);

  return ORADOR_TAGS
    .map(tag => tag.label)
    .filter(label => {
      const keywords = TAG_KEYWORD_MAP[label] || [];
      const matchCount = keywords.filter(kw => normalized.includes(normalizeText(kw))).length;
      return matchCount >= 1;
    });
}

/**
 * Devuelve el objeto de tag dado su label, o undefined si no existe.
 */
export const getTagByLabel = (label) =>
  ORADOR_TAGS.find((t) => t.label === label);
