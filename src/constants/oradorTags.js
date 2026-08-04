/**
 * Tags temáticos predefinidos para clasificar los temas tratados por los oradores.
 */
export const ORADOR_TAGS = [
  { label: 'Tránsito y Movilidad',                color: '#f97316' },
  { label: 'Seguridad',                           color: '#1e40af' },
  { label: 'Higiene Urbana',                      color: '#0d9488' },
  { label: 'Situación de Calle',                  color: '#7c3aed' },
  { label: 'Espacio Público y Veredas',           color: '#d97706' },
  { label: 'Arbolado y Parques',                  color: '#15803d' },
  { label: 'Infraestructura y Obras',             color: '#6b7280' },
  { label: 'Eventos, Fiestas y Ruidos',           color: '#e11d48' },
  { label: 'Salud',                               color: '#dc2626' },
  { label: 'Educación',                           color: '#2563eb' },
  { label: 'Comercio e Impuestos',                color: '#92400e' },
  { label: 'Mascotas',                            color: '#059669' },
  { label: 'Trámites y Servicios GCBA',           color: '#0284c7' },
  { label: 'Desarrollo Social',                   color: '#4338ca' },
];

/**
 * Diccionario de palabras clave por tag para la detección automática.
 * Todas las keywords deben estar en minúsculas y sin acentos.
 */
export const TAG_KEYWORD_MAP = {
  // 1. TRÁNSITO Y MOVILIDAD
  "Tránsito y Movilidad": [
    "transito", "auto", "autos", "trafico", "varado", "varados", "cola", "colas", 
    "semaforo", "semaforos", "colectivo", "colectivos", "embotellamiento", "esquina", 
    "corte", "cortes", "contramano", "velocidad", "estacionar", "estacionamiento", 
    "estacionado", "estacionados", "garaje", "garage", "peaton", "cruce", "camion", 
    "camiones", "moto", "motos", "escape", "escapes", "ruido de motor", "subte", 
    "linea f", "linea d", "linea h", "parada", "multa", "multas", "micro", "micros", 
    "transporte", "ciclistas", "ciclovia", "bicisenda", "bicis", "bicicleta", "delivery", 
    "rappi", "grúa", "grua", "doble fila", "transito pesado", "acarreos", "fotomulta",
    "onda verde", "metrobús", "metrobus", "agentes de transito", "monopatines"
  ],

  // 2. SEGURIDAD Y PREVENCIÓN
  "Seguridad": [
    "seguridad", "inseguridad", "droga", "drogas", "robar", "robo", "robos", "delito", 
    "delitos", "casa tomada", "casas tomadas", "policia", "patrullero", "patrulleros", 
    "chorro", "chorros", "camara", "camaras", "domo", "domos", "alarma", "comisaria", 
    "comisarias", "zona liberada", "asalto", "violencia", "trapito", "trapitos", 
    "exigen dinero", "insultan", "amenazan", "usurpacion", "usurpaciones", "ilegal", 
    "ilegales", "narcomenudeo", "bunker", "bunkers", "totem", "totems", "tiroteo", 
    "tiroteos", "presencia policial", "entraderas", "puntero", "venta de droga", 
    "venta de drogas", "modulos carcelarios", "prostitucion", "recorridas"
  ],

  // 3. HIGIENE URBANA Y RESIDUOS
  "Higiene Urbana": [
    "basura", "basural", "contenedor", "contenedores", "olor", "olores", "mugre", 
    "higiene", "barrendero", "barrenderos", "ratas", "roedores", "limpieza", "desmonte", 
    "sucio", "reciclado", "recicladores", "campana verde", "tacho", "tachos", "suciedad", 
    "desratizacion", "desratizar", "recoleccion", "barrido", "basura fuera", 
    "antivandalico", "antivandalicos", "excremento", "caca", "olor a pis"
  ],

  // 4. PERSONAS EN SITUACIÓN DE CALLE
  "Situación de Calle": [
    "situacion de calle", "gente en calle", "persona en calle", "personas en calle", 
    "ranchada", "ranchadas", "colchon", "colchones", "dormir en la calle", "acampe", 
    "indigente", "indigencia", "ocupacion", "indigentes", "gente durmiendo", 
    "duermen en la calle", "pedir plata", "operativo 108", "paradores", "parador"
  ],

  // 5. ESPACIO PÚBLICO Y VEREDAS
  "Espacio Público y Veredas": [
    "vereda", "veredas", "baldosa", "baldosas", "rotura de vereda", "rampa", "rampas", 
    "obstaculo", "puesto", "puestos", "mantero", "manteros", "venta ambulante", 
    "marquesina", "rompe la vereda", "destruida", "ocupacion indebida", "decks", "deck", 
    "mesas en vereda", "caballetes", "kiosco de revistas", "puesto de flores", "arboles rompen vereda", "sumideros tapados", "bache", "baches", "asfalto", "calle", "calles", "alumbrado", 
    "luz", "luces", "cable", "cables", "poste", "postes", "inundacion", "inundaciones", 
    "agua", "pluvial", "sumidero", "sumideros", "adoquines", "empedrado"
  ],

  // 6. ARBOLADO Y ESPACIOS VERDES
  "Arbolado y Parques": [
    "arbol", "arboles", "rama", "ramas", "poda", "desmoche", "raiz", "raices", "hojas", 
    "arbolado", "tala", "arbol caido", "tronco", "platano", "platanos", "alergia", 
    "plaza", "plazas", "parque", "parques", "juegos", "cesped", "pasto", "banco", 
    "bancos", "guardaparque", "reja", "rejas plaza", "espacio verde", "espacios verdes", 
    "despeje de luminarias"
  ],

  // 7. INFRAESTRUCTURA Y OBRAS
  "Infraestructura y Obras": [
    "obra", "obras", "caño", "caños", "edificio", "construccion", 
    "construcciones", "puente", "garita", "garitas", "destruida", "destruidas", "abandono", 
    "paso bajo nivel", "viaducto", "soterramiento", "edificio abandonado", 
    "codigo urbanistico", "permisos de obra"
  ],

  // 8. EVENTOS, RECITALES Y NOCHE (RUIDOS MOLESTOS)
  "Eventos, Fiestas y Ruidos": [
    "ruido", "ruidos", "ruido molesto", "ruidos molestos", "recital", "recitales", 
    "evento masivo", "eventos masivos", "boliche", "boliches", "musica alta", "movistar arena", 
    "ferro", "river", "huracan", "velez", "fuegos artificiales", "pirotecnia", "vibraciones", 
    "cancha", "partidos", "escape libre", "candombe", "murga", "murgas", "corsos"
  ],

  // 9. SALUD Y SALUD MENTAL
  "Salud": [
    "salud", "hospital", "hospitales", "cesac", "turno", "turnos", "medico", "medicos", 
    "remedio", "remedios", "ambulancia", "guardia", "atencion medica", "especialista", 
    "pediatra", "salud mental", "padecimientos", "addicciones", "adiccion", "consumo problematico", 
    "dengue", "vacunas", "vacunacion", "cud", "discapacidad", "junta medica"
  ],

  // 10. EDUCACIÓN Y ESCUELAS
  "Educación": [
    "escuela", "escuelas", "colegio", "colegios", "jardin", "vacantes", "docente", 
    "docentes", "maestro", "maestros", "educacion", "aula", "estudiante", "alumnos", 
    "sendero seguro", "senderos escolares", "salida del colegio", "nivel educativo"
  ],

  // 11. COMERCIO, PYMES e IMPUESTOS
  "Comercio e Impuestos": [
    "comercio", "comercios", "local", "locales", "bar", "bares", "habilitacion", 
    "habilitaciones", "inspeccion", "horario nocturno", "impuesto", "impuestos", 
    "abl", "agip", "afip", "multa comercial", "pyme", "pymes", "emprendedor", "emprendedores", 
    "feria", "ferias", "feriantes", "competencia desleal", "carga y descarga"
  ],

  // 12. MASCOTAS Y FAUNA URBANA
  "Mascotas": [
    "perro", "perros", "canil", "caniles", "perros sueltos", "mascotas", "caca de perro", 
    "orina de perro", "tenencia responsable", "perros peligrosos", "gatos"
  ],

  // 13. TRÁMITES Y ATENCIÓN GCBA
  "Trámites y Servicios GCBA": [
    "tramite", "tramites", "147", "pagina web", "boti", "mi ba", "tad", "licencia de conducir", 
    "registro", "psicodiagnostico", "atencion al vecino", "reclamo no resuelto", "falta de respuesta"
  ],

  // 14. DESARROLLO SOCIAL Y COMUNITARIO
  "Desarrollo Social": [
    "centro de jubilados", "subsidio", "club de barrio", "comedor", "comedores", 
    "vulnerabilidad", "inclusion", "talleres", "capacitacion", "adultos mayores", "personas mayores"
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
 * Asigna un tag si hay 2 o más coincidencias de palabras clave en el texto.
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
      return matchCount >= 2;
    });
}

/**
 * Devuelve el objeto de tag dado su label, o undefined si no existe.
 */
export const getTagByLabel = (label) =>
  ORADOR_TAGS.find((t) => t.label === label);
