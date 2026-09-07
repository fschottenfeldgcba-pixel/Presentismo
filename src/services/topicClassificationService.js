/**
 * Servicio de Clasificación Inteligente de Temas y Prestaciones GCBA
 * 
 * Regla de visualización:
 * - Para reuniones donde Ignacio Baistrocchi es el funcionario principal: se utiliza el sistema de PINs (🟡 Amarillo, 🔵 Azul, 🟢 Verde, 🔴 Rojo) y 📝 Post-its.
 * - Para el resto de las reuniones (Jorge Macri, Clara Muzzio, Sanchez Zinny, Waldo Wolff, etc.): se utiliza el sistema estándar de TEMAS / CATEGORÍAS de Gobierno sin pines ni post-its.
 */

const GEMINI_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) || (typeof process !== 'undefined' && process.env?.VITE_GEMINI_API_KEY) || '';

// Cache en memoria para clasificaciones de texto
const classificationCache = new Map();

/**
 * Detecta si una reunión corresponde a Ignacio Baistrocchi (Ministerio de Espacio Público)
 */
export function isBaistrocchiMeeting(reunion) {
  if (!reunion) return false;
  const funcStr = (reunion.funcionario || '').toLowerCase();
  const nameStr = (reunion.nombre || '').toLowerCase();
  return funcStr.includes('baistrocchi') || nameStr.includes('baistrocchi');
}

// Definiciones visuales base para Modo Baistrocchi (Pines)
export const PIN_CONFIGS = {
  AMARILLO: {
    key: 'amarillo',
    tipo: 'pin',
    color: '#CA8A04',
    bgColor: '#FEF08A',
    borderColor: '#EAB308',
    textColor: '#854D0E',
    icon: '🟡',
    nombre: 'Pin Amarillo (Luminaria)',
    tagPrincipal: 'Luminaria',
    prioridad: 2,
    perteneceMEPHU: true
  },
  AZUL: {
    key: 'azul',
    tipo: 'pin',
    color: '#2563EB',
    bgColor: '#DBEAFE',
    borderColor: '#93C5FD',
    textColor: '#1E40AF',
    icon: '🔵',
    nombre: 'Pin Azul (Pluviales)',
    tagPrincipal: 'Pluviales',
    prioridad: 2,
    perteneceMEPHU: true
  },
  VERDE: {
    key: 'verde',
    tipo: 'pin',
    color: '#16A34A',
    bgColor: '#DCFCE7',
    borderColor: '#86EFAC',
    textColor: '#15803D',
    icon: '🟢',
    nombre: 'Pin Verde (Veredas)',
    tagPrincipal: 'Veredas',
    prioridad: 2,
    perteneceMEPHU: true
  },
  ROJO: {
    key: 'rojo',
    tipo: 'pin',
    color: '#DC2626',
    bgColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    textColor: '#991B1B',
    icon: '🔴',
    nombre: 'Pin Rojo (Espacio Público)',
    tagPrincipal: 'Espacio Público',
    prioridad: 1,
    perteneceMEPHU: true
  },
  POST_IT: {
    key: 'post_it',
    tipo: 'post_it',
    color: '#475569',
    bgColor: '#FEF9C3',
    borderColor: '#FDE047',
    textColor: '#713F12',
    icon: '📝',
    nombre: 'Post-it (Fuera de Mapa)',
    tagPrincipal: 'Fuera de Mapa',
    prioridad: 3,
    perteneceMEPHU: false
  }
};

// Estilos temáticos estándar para TODAS las demás reuniones (Modo Temas)
export const STANDARD_CATEGORY_STYLES = {
  'Luminaria':                 { icon: '💡', color: '#CA8A04', bgColor: '#FEF08A', borderColor: '#EAB308', textColor: '#854D0E' },
  'Pluviales':                 { icon: '💧', color: '#2563EB', bgColor: '#DBEAFE', borderColor: '#93C5FD', textColor: '#1E40AF' },
  'Veredas':                   { icon: '🚶', color: '#16A34A', bgColor: '#DCFCE7', borderColor: '#86EFAC', textColor: '#15803D' },
  'Bacheo y Calzadas':         { icon: '🛣️', color: '#D97706', bgColor: '#FEF3C7', borderColor: '#FCD34D', textColor: '#B45309' },
  'Aperturas y Obras':         { icon: '🏗️', color: '#EA580C', bgColor: '#FFEDD5', borderColor: '#FDBA74', textColor: '#C2410C' },
  'Paisaje y Parques':         { icon: '⛲', color: '#059669', bgColor: '#D1FAE5', borderColor: '#6EE7B7', textColor: '#047857' },
  'Ferias y Mercados':         { icon: '🎪', color: '#9333EA', bgColor: '#F3E8FF', borderColor: '#D8B4FE', textColor: '#7E22CE' },
  'Espacio Público':           { icon: '🏛️', color: '#4B5563', bgColor: '#F3F4F6', borderColor: '#D1D5DB', textColor: '#374151' },
  'Higiene Urbana (JGM)':      { icon: '🗑️', color: '#0D9488', bgColor: '#CCFBF1', borderColor: '#5EEAD4', textColor: '#0F766E' },
  'Higiene Urbana':            { icon: '🗑️', color: '#0D9488', bgColor: '#CCFBF1', borderColor: '#5EEAD4', textColor: '#0F766E' },
  'Arbolado y Poda (Comunas)': { icon: '🌳', color: '#15803D', bgColor: '#DCFCE7', borderColor: '#86EFAC', textColor: '#166534' },
  'Arbolado y Poda':           { icon: '🌳', color: '#15803D', bgColor: '#DCFCE7', borderColor: '#86EFAC', textColor: '#166534' },
  'Ordenamiento Urbano (JGM)': { icon: '🏪', color: '#E11D48', bgColor: '#FFE4E6', borderColor: '#FDA4AF', textColor: '#BE123C' },
  'Ordenamiento Urbano':       { icon: '🏪', color: '#E11D48', bgColor: '#FFE4E6', borderColor: '#FDA4AF', textColor: '#BE123C' },
  'Seguridad':                 { icon: '👮', color: '#1E40AF', bgColor: '#DBEAFE', borderColor: '#93C5FD', textColor: '#1E3A8A' },
  'Situación de Calle':        { icon: '🏠', color: '#7C3AED', bgColor: '#EDE9FE', borderColor: '#C4B5FD', textColor: '#6D28D9' },
  'Tránsito y Movilidad':      { icon: '🚍', color: '#F97316', bgColor: '#FFEDD5', borderColor: '#FDBA74', textColor: '#C2410C' },
  'Salud':                     { icon: '🏥', color: '#DC2626', bgColor: '#FEE2E2', borderColor: '#FCA5A5', textColor: '#991B1B' },
  'Educación':                 { icon: '🎓', color: '#2563EB', bgColor: '#EFF6FF', borderColor: '#BFDBFE', textColor: '#1D4ED8' },
  'Consorcios':                { icon: '🏢', color: '#0891B2', bgColor: '#CFFAFE', borderColor: '#67E8F9', textColor: '#0E7490' },
  'Cultura':                   { icon: '🎭', color: '#C026D3', bgColor: '#FAE8FF', borderColor: '#F0ABFC', textColor: '#A21CAF' },
  'Desarrollo Social':         { icon: '🤝', color: '#4338CA', bgColor: '#E0E7FF', borderColor: '#A5B4FC', textColor: '#3730A3' },
  'Trámites y Servicios':      { icon: '📋', color: '#0284C7', bgColor: '#E0F2FE', borderColor: '#7DD3FC', textColor: '#0369A1' }
};

/**
 * Normaliza un string para búsqueda de keywords
 */
function normalize(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Coincidencia segura de palabras clave respetando límites de palabras cortas
 */
function matchKeyword(text, kw) {
  const normKw = normalize(kw);
  if (!normKw) return false;
  if (normKw.length <= 4) {
    const regex = new RegExp('(^|[^a-z0-9])' + normKw + '($|[^a-z0-9])', 'i');
    return regex.test(text);
  }
  return text.includes(normKw);
}

/**
 * Diccionario Exhaustivo de Palabras Clave y Prestaciones Oficiales GCBA
 */
const KEYWORDS = {
  // 1. LUMINARIA Y ALUMBRADO
  LUMINARIA: [
    'luminaria', 'luminarias', 'luz', 'luces', 'alumbrado', 'farola', 'farolas', 
    'lampara', 'lamparas', 'poste de luz', 'postes de luz', 'iluminacion', 'oscuridad', 
    'foco', 'focos', 'led', 'luz apagada', 'luces apagadas', 'despeje de luminarias', 
    'columna de alumbrado', 'falta de luz', 'calle oscura', 'cable de luz',
    'limpieza de artefacto de alumbrado', 'mayor iluminacion', 'reparacion de luminaria',
    'luminaria encendida durante el dia', 'toma de energia de alumbrado publico',
    'columna/poste/cable en mal estado', 'buzon electrico en mal estado'
  ],

  // 2. PLUVIALES Y SANEAMIENTO HÍDRICO
  PLUVIALES: [
    'pluvial', 'pluviales', 'sumidero', 'sumideros', 'desague', 'desagues', 
    'boca de tormenta', 'bocas de tormenta', 'inundacion', 'inundaciones', 'anegamiento', 
    'anegamientos', 'rejilla', 'rejillas', 'caño de agua', 'cañeria de desague', 
    'agua estancada', 'drenaje', 'alcantarilla', 'alcantarillas', 'desborde de agua',
    'lago', 'laguna', 'saneamiento hidrico', 'destape de sumidero', 'boca de registro pluvial',
    'calle anegada', 'calle inundada', 'reparacion de cuneta'
  ],

  // 3. VEREDAS Y ACERAS
  VEREDAS: [
    'vereda', 'veredas', 'baldosa', 'baldosas', 'baldosa rota', 'baldosas rotas', 
    'pozo en vereda', 'pozos en vereda', 'rotura de vereda', 'vereda rota', 'vereda destruida', 
    'rampa rota', 'rampa de discapacitado', 'rampas', 'acera', 'aceras', 
    'reparacion de vereda', 'arreglo de vereda', 'cemento en vereda',
    'corte de raices con arreglo en vereda', 'falta de rampas de acceso', 'rampas de accesibilidad',
    'tapa de empresa en vereda', 'reposicion de tapa en vereda', 'restos de obra en vereda'
  ],

  // 4. BACHEO Y CALZADAS (ESPACIO PÚBLICO)
  CALZADAS: [
    'bache', 'baches', 'bacheo', 'pavimentacion', 'asfalto', 'calzada', 'calle rota', 
    'puente', 'puentes', 'viaducto', 'viaductos', 'paso bajo nivel', 'mantenimiento urbano',
    'nivelacion por hundimiento del pavimento', 'tapa de empresa en calle', 'reparacion de cordon',
    'reparacion de bache', 'apertura hundida', 'granito hundido', 'bache en ciclovia',
    'calle de adoquines', 'elementos en tuneles'
  ],

  // 5. APERTURAS Y OBRAS EN VÍA PÚBLICA (ESPACIO PÚBLICO)
  APERTURAS: [
    'apertura', 'aperturas', 'aysa', 'edesur', 'edenor', 'metrogas', 'telecom', 
    'obra de empresa', 'pozo de obra', 'zanja', 'zanjas', 'obra sin terminar', 
    'subsuelo', 'rompieron la calle', 'cierre de obra', 'expediente de catastro',
    'construccion sin permiso', 'caida de materiales', 'antenas de telefonia'
  ],

  // 6. PAISAJE URBANO Y PARQUES EMBLEMÁTICOS
  PAISAJE_PARQUES: [
    'parque emblematico', 'fuente', 'fuentes', 'monumento', 'monumentos', 
    'patrimonio', 'paisaje urbano', 'arte urbano', 'mural', 'murales', 'padrinazgo', 
    'entorno urbano', 'puesta en valor', 'mobiliario urbano', 'banco de plaza', 'canil', 'caniles',
    'guardian de plaza', 'bancos mesas y sillas en parque', 'baños publicos en parque',
    'bebederos en parque', 'patio de juegos en parque', 'pintura sobre grafitis'
  ],

  // 7. FERIAS Y MERCADOS HABILITADOS
  FERIAS: [
    'feria de la ciudad', 'feria habilitada', 'mercado', 'mercados', 'permiso de evento'
  ],

  // --- TEMAS FUERA DE ESPACIO PÚBLICO ---
  // 8. HIGIENE URBANA Y RESIDUOS (JGM)
  HIGIENE: [
    'basura', 'basural', 'contenedor', 'contenedores', 'container', 'containers', 'conteiner', 'conteiners',
    'olor a basura', 'mugre', 'higiene', 'higiene urbana', 'barrendero', 'barrenderos', 'barrido', 
    'limpieza', 'sucio', 'suciedad', 'reciclado', 'recicladores', 'reciclar', 'campana verde', 
    'tacho', 'tachos', 'desratizacion', 'roedores', 'ratas', 'recoleccion', 'recoleccion de basura', 
    'antivandalico', 'caca de perro', 'residuos', 'residuos solidos', 'generadores especiales', 'volquete', 'volquetes', 'aridos',
    'recuperadores urbanos', 'acopio de recuperadores', 'camion recuperador', 'desratizar',
    'desinsectar', 'limpieza de via publica', 'puntos verdes', 'residuos voluminosos', 'animales muertos en via publica'
  ],

  // 9. ARBOLADO Y PODA (COMUNAS)
  ARBOLADO: [
    'arbol', 'arboles', 'arboleda', 'rama', 'ramas', 'poda', 'desmoche', 'raiz', 'raices', 
    'tala', 'arbol caido', 'tronco', 'platano', 'platanos', 'poda de arboles', 'hojas de arbol',
    'arbol con enfermedades', 'extraccion de arbol', 'restos de poda', 'plantacion de arbol'
  ],

  // 10. ORDENAMIENTO URBANO Y FISCALIZACIÓN COMERCIAL (JGM / AGC)
  ORDENAMIENTO: [
    'mantero', 'manteros', 'venta ambulante', 'puesto ilegal', 'compra venta no autorizada', 
    'expendio de alimentos', 'decomiso', 'mercaderia secuestrada', 'venta ilegal', 'puesto de la calle',
    'trabas para deambular', 'ocupacion indebida', 'ocupacion del espacio publico',
    'alimentos en malas condiciones', 'estructura publicitaria', 'garita de seguridad abandonada',
    'marquesina', 'toldo publicitario', 'puesto de diarios', 'puesto de flores', 'pirotecnia'
  ],

  // 11. SITUACIÓN DE CALLE
  SITUACION_CALLE: [
    'situacion de calle', 'gente en calle', 'persona en calle', 'vive en la calle', 'viven en la calle', 
    'vive en la via publica', 'viven en la via publica', 'gente que vive en la via publica', 
    'ranchada', 'ranchadas', 'colchon', 'colchones', 'acampe', 'operativo 108', 'personas o familias en situacion de calle'
  ],

  // 12. SEGURIDAD Y NARCOMENUDEO
  SEGURIDAD: [
    'seguridad', 'inseguridad', 'robo', 'robos', 'robar', 'droga', 'drogas', 'delito', 
    'delitos', 'policia', 'patrullero', 'patrulleros', 'comisaria', 'narcomenudeo', 
    'bunker', 'asalto', 'camara de seguridad', 'domo', 'totem', 'casa tomada', 'trapito', 'trapitos',
    'alcaldias', 'comportamiento policial', 'disturbios y vandalismo', 'mayor presencia policial', 'victima de robo'
  ],

  // 13. TRÁNSITO Y TRANSPORTE
  TRANSITO: [
    'transporte', 'transito', 'semaforo', 'semaforos', 'colectivo', 'colectivos', 'subte', 'linea', 
    'parada', 'multa', 'multas', 'estacionar', 'estacionamiento', 'fotomulta', 'bicisenda', 
    'ciclovia', 'velocidad', 'onda verde', 'agentes de transito', 'auto en deposito', 'cruce peligroso',
    'reductor de velocidad', 'refugio de transporte', 'remocion de vehiculo', 'reparacion de semaforo',
    'senal de transito', 'taxi'
  ],

  // 14. SALUD
  SALUD: [
    'salud', 'hospital', 'hospitales', 'cesac', 'medico', 'medicos', 'turno', 'remedio', 
    'ambulancia', 'guardia', 'dengue', 'vacuna', 'discapacidad', 'salud mental',
    'criaderos de mosquitos', 'atencion en centro de salud'
  ],

  // 15. EDUCACIÓN
  EDUCACION: [
    'escuela', 'escuelas', 'colegio', 'colegios', 'jardin', 'vacantes', 'docente', 'maestro',
    'comedores de establecimientos educativos', 'reclamo contra un docente'
  ],

  // 16. CONSORCIOS, EDIFICIOS Y DERECHOS DEL CONSUMIDOR
  CONSORCIOS: [
    'consorcio', 'consorcios', 'expensas', 'administrador', 'rpa', 'impuesto', 'abl', 'agip', 
    'habilitacion comercial', 'pyme', 'ruido de boliche', 'musica alta', 'recital',
    'tanques de agua', 'ascensores', 'escaleras mecanicas', 'incendio', 'ruidos molestos', 'vibraciones'
  ],

  // 17. CULTURA Y COMUNIDAD
  CULTURA: [
    'cultura', 'experiencias culturales', 'carnaval', 'clubes y polideportivos', 'espacios culturales',
    'programacion artistica', 'actividades culturales'
  ],

  // 18. DESARROLLO SOCIAL Y VIVIENDA
  DESARROLLO_SOCIAL: [
    'ayuda social', 'tercera edad', 'centro de jubilados', 'centros de jubilados',
    'ivc', 'vivienda', 'urbanizaciones ivc', 'barrios populares', 'programas sociales'
  ],

  // 19. TRÁMITES Y SERVICIOS GCBA
  TRAMITES: [
    'tramite', 'tramites', 'tramites a distancia', 'tad', 'ba colaborativa', 'sistema de turnos',
    'capacitaciones', 'bac', 'solicitudes derivadas'
  ]
};

/**
 * Función auxiliar para obtener el objeto visual de un badge
 * según si la reunión corresponde a Baistrocchi (con PINs) o general (con Temas)
 */
export function getBadgeDisplay(badge, isBaistrocchi = false) {
  if (isBaistrocchi) {
    return {
      nombre: badge.nombrePin || badge.nombre,
      icon: badge.pinIcon || badge.icon || '📍',
      bgColor: badge.pinBgColor || badge.bgColor,
      textColor: badge.pinTextColor || badge.textColor,
      borderColor: badge.pinBorderColor || badge.borderColor,
      prioridad: badge.prioridad
    };
  }

  // Modo Estándar (Reuniones Generales / Temas)
  const cleanSubtag = (badge.subtag || badge.tagPrincipal || badge.nombre || '')
    .replace(' (JGM)', '')
    .replace(' (Comunas)', '')
    .trim();

  const stdStyle = STANDARD_CATEGORY_STYLES[badge.subtag] || STANDARD_CATEGORY_STYLES[cleanSubtag] || {
    icon: '🏷️',
    bgColor: '#F1F5F9',
    textColor: '#334155',
    borderColor: '#CBD5E1'
  };

  return {
    nombre: cleanSubtag,
    icon: stdStyle.icon,
    bgColor: stdStyle.bgColor,
    textColor: stdStyle.textColor,
    borderColor: stdStyle.borderColor,
    prioridad: badge.prioridad
  };
}

/**
 * Crea un badge con metadata para ambos modos (PIN y Tema)
 */
function createBadge(config, subtag, nombrePin, standardTag = null) {
  const stdTag = standardTag || subtag.replace(' (JGM)', '').replace(' (Comunas)', '').trim();
  const stdStyle = STANDARD_CATEGORY_STYLES[subtag] || STANDARD_CATEGORY_STYLES[stdTag] || {};

  return {
    key: config.key,
    tipo: config.tipo,
    subtag: subtag,
    standardTag: stdTag,
    nombrePin: nombrePin,
    nombre: nombrePin,
    pinIcon: config.icon,
    pinBgColor: config.bgColor,
    pinBorderColor: config.borderColor,
    pinTextColor: config.textColor,
    // Estilo estándar
    icon: stdStyle.icon || config.icon,
    bgColor: config.bgColor,
    borderColor: config.borderColor,
    textColor: config.textColor,
    prioridad: config.prioridad,
    perteneceMEPHU: config.perteneceMEPHU
  };
}

/**
 * Clasificación Heurística Instantánea (< 1ms).
 * Detecta y devuelve todos los Pines y Temas coincidentes en `badges`.
 */
export function classifyTopicHeuristic(text) {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    const defaultBadge = createBadge(PIN_CONFIGS.ROJO, 'Espacio Público', 'Pin Rojo (Espacio Público)');
    return {
      ...defaultBadge,
      badges: [defaultBadge],
      detectedTags: ['Espacio Público'],
      allTags: ['Espacio Público'],
      categoria: 'rojo',
      confidence: 'low'
    };
  }

  const norm = normalize(text);
  const badges = [];

  // 1. Luminaria (Pin Amarillo)
  if (KEYWORDS.LUMINARIA.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.AMARILLO, 'Luminaria', 'Pin Amarillo (Luminaria)'));
  }

  // 2. Pluviales (Pin Azul)
  if (KEYWORDS.PLUVIALES.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.AZUL, 'Pluviales', 'Pin Azul (Pluviales)'));
  }

  // 3. Veredas (Pin Verde)
  if (KEYWORDS.VEREDAS.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.VERDE, 'Veredas', 'Pin Verde (Veredas)'));
  }

  // 4. Otros temas propios de Espacio Público (Pin Rojo)
  if (KEYWORDS.CALZADAS.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.ROJO, 'Bacheo y Calzadas', 'Pin Rojo (Bacheo y Calzadas)'));
  }

  if (KEYWORDS.APERTURAS.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.ROJO, 'Aperturas y Obras', 'Pin Rojo (Aperturas y Obras)'));
  }

  if (KEYWORDS.PAISAJE_PARQUES.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.ROJO, 'Paisaje y Parques', 'Pin Rojo (Paisaje y Parques)'));
  }

  if (KEYWORDS.FERIAS.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.ROJO, 'Ferias y Mercados', 'Pin Rojo (Ferias y Mercados)'));
  }

  // 5. Temas Fuera del Ministerio (Post-its)
  if (KEYWORDS.ARBOLADO.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.POST_IT, 'Arbolado y Poda (Comunas)', 'Post-it (Arbolado y Poda - Comunas)', 'Arbolado y Poda'));
  }

  if (KEYWORDS.ORDENAMIENTO.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.POST_IT, 'Ordenamiento Urbano (JGM)', 'Post-it (Ordenamiento Urbano - JGM)', 'Ordenamiento Urbano'));
  }

  if (KEYWORDS.HIGIENE.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.POST_IT, 'Higiene Urbana (JGM)', 'Post-it (Higiene Urbana - JGM)', 'Higiene Urbana'));
  }

  if (KEYWORDS.SITUACION_CALLE.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.POST_IT, 'Situación de Calle', 'Post-it (Situación de Calle)'));
  }

  if (KEYWORDS.SEGURIDAD.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.POST_IT, 'Seguridad', 'Post-it (Seguridad)'));
  }

  if (KEYWORDS.TRANSITO.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.POST_IT, 'Tránsito y Movilidad', 'Post-it (Tránsito y Movilidad)'));
  }

  if (KEYWORDS.SALUD.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.POST_IT, 'Salud', 'Post-it (Salud)'));
  }

  if (KEYWORDS.EDUCACION.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.POST_IT, 'Educación', 'Post-it (Educación)'));
  }

  if (KEYWORDS.CONSORCIOS.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.POST_IT, 'Consorcios', 'Post-it (Consorcios)'));
  }

  if (KEYWORDS.CULTURA.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.POST_IT, 'Cultura', 'Post-it (Cultura)'));
  }

  if (KEYWORDS.DESARROLLO_SOCIAL.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.POST_IT, 'Desarrollo Social', 'Post-it (Desarrollo Social)'));
  }

  if (KEYWORDS.TRAMITES.some(kw => matchKeyword(norm, kw))) {
    badges.push(createBadge(PIN_CONFIGS.POST_IT, 'Trámites y Servicios', 'Post-it (Trámites y Servicios)'));
  }

  // Si no se detectó ningún tag explícito, asignar Espacio Público genérico
  if (badges.length === 0) {
    const defaultBadge = createBadge(PIN_CONFIGS.ROJO, 'Espacio Público', 'Pin Rojo (Espacio Público)');
    badges.push(defaultBadge);
  }

  // Ordenar badges por prioridad: Prioridad 1 > Prioridad 2 > Prioridad 3
  badges.sort((a, b) => a.prioridad - b.prioridad);

  const mainBadge = badges[0];
  const allTagNames = badges.map(b => b.subtag);

  return {
    ...mainBadge,
    badges,
    detectedTags: allTagNames,
    allTags: allTagNames,
    categoria: mainBadge.key,
    prioridad: mainBadge.prioridad,
    perteneceMEPHU: mainBadge.perteneceMEPHU
  };
}

/**
 * Clasificación con Inteligencia Artificial (Gemini) con soporte de catálogo oficial de prestaciones GCBA.
 */
export async function classifyTopicWithAI(text) {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return classifyTopicHeuristic('');
  }

  const cleanText = text.trim();
  const cacheKey = normalize(cleanText);

  if (classificationCache.has(cacheKey)) {
    return classificationCache.get(cacheKey);
  }

  // Fallback heurístico inmediato
  const fallback = classifyTopicHeuristic(cleanText);

  if (!GEMINI_API_KEY) {
    classificationCache.set(cacheKey, fallback);
    return fallback;
  }

  try {
    const prompt = `Actuás como el clasificador oficial de problemáticas y prestaciones ciudadanas de la Ciudad de Buenos Aires.

El vecino expresó el siguiente texto sobre los temas que desea manifestar en la reunión:
"""${cleanText}"""

INSTRUCCIONES:
1. Detectá TODOS los temas planteados en el texto.
2. Para cada tema detectado, generá un badge con su categoría y subtag oficial:
   - "Luminaria" (Alumbrado público, farolas, luces, led, postes de luz) -> categoria: "amarillo", nombre_pin: "Pin Amarillo (Luminaria)", subtag: "Luminaria", prioridad: 2, pertenece_mephu: true
   - "Pluviales" (Sumideros tapados, alcantarillas, bocas de tormenta, inundaciones, desbordes) -> categoria: "azul", nombre_pin: "Pin Azul (Pluviales)", subtag: "Pluviales", prioridad: 2, pertenece_mephu: true
   - "Veredas" (Baldosas rotas/flojas, pozos en veredas, rampas de accesibilidad, aceras) -> categoria: "verde", nombre_pin: "Pin Verde (Veredas)", subtag: "Veredas", prioridad: 2, pertenece_mephu: true
   - "Bacheo y Calzadas" (Baches en calle o ciclovía, pavimentación, asfalto, puentes, cordones) -> categoria: "rojo", nombre_pin: "Pin Rojo (Bacheo y Calzadas)", subtag: "Bacheo y Calzadas", prioridad: 1, pertenece_mephu: true
   - "Aperturas y Obras" (Obras de Aysa, Edesur, MetroGAS, Telecom, zanjas sin tapar, catastro) -> categoria: "rojo", nombre_pin: "Pin Rojo (Aperturas y Obras)", subtag: "Aperturas y Obras", prioridad: 1, pertenece_mephu: true
   - "Paisaje y Parques" (Parques emblemáticos, plazas, fuentes, monumentos, juegos de plaza, caniles, murales) -> categoria: "rojo", nombre_pin: "Pin Rojo (Paisaje y Parques)", subtag: "Paisaje y Parques", prioridad: 1, pertenece_mephu: true
   - "Ferias y Mercados" (Ferias de la Ciudad, mercados autorizados) -> categoria: "rojo", nombre_pin: "Pin Rojo (Ferias y Mercados)", subtag: "Ferias y Mercados", prioridad: 1, pertenece_mephu: true
   - "Higiene Urbana (JGM)" (Basura, contenedores/conteiners, barrenderos, barrido, reciclado, puntos verdes, volquetes, desratización) -> categoria: "post_it", nombre_pin: "Post-it (Higiene Urbana - JGM)", subtag: "Higiene Urbana (JGM)", prioridad: 3, pertenece_mephu: false
   - "Arbolado y Poda (Comunas)" (Poda de árboles, ramas, raíces, tala, árboles caídos, plátanos) -> categoria: "post_it", nombre_pin: "Post-it (Arbolado y Poda - Comunas)", subtag: "Arbolado y Poda (Comunas)", prioridad: 3, pertenece_mephu: false
   - "Ordenamiento Urbano (JGM)" (Manteros, venta ambulante, ocupación indebida de veredas/mesas, decomisos, puestos ilegales) -> categoria: "post_it", nombre_pin: "Post-it (Ordenamiento Urbano - JGM)", subtag: "Ordenamiento Urbano (JGM)", prioridad: 3, pertenece_mephu: false
   - "Seguridad" (Policía, robos, drogas, narcomenudeo, cámaras, comisarías, trapitos) -> categoria: "post_it", nombre_pin: "Post-it (Seguridad)", subtag: "Seguridad", prioridad: 3, pertenece_mephu: false
   - "Situación de Calle" (Gente durmiendo en calle / vía pública, ranchadas, colchones, acampes, BAP 108) -> categoria: "post_it", nombre_pin: "Post-it (Situación de Calle)", subtag: "Situación de Calle", prioridad: 3, pertenece_mephu: false
   - "Tránsito y Movilidad" (Colectivos, subtes, semáforos, paradas, fotomultas, bicisendas, estacionamiento) -> categoria: "post_it", nombre_pin: "Post-it (Tránsito y Movilidad)", subtag: "Tránsito y Movilidad", prioridad: 3, pertenece_mephu: false
   - "Salud" (Hospitales, CESAC, turnos médicos, dengue, ambulancias) -> categoria: "post_it", nombre_pin: "Post-it (Salud)", subtag: "Salud", prioridad: 3, pertenece_mephu: false
   - "Educación" (Escuelas, vacantes, colegios, docentes) -> categoria: "post_it", nombre_pin: "Post-it (Educación)", subtag: "Educación", prioridad: 3, pertenece_mephu: false
   - "Consorcios" (Expensas, administradores, RPA, tanques de agua, ascensores, ruidos molestos) -> categoria: "post_it", nombre_pin: "Post-it (Consorcios)", subtag: "Consorcios", prioridad: 3, pertenece_mephu: false
   - "Cultura" (Eventos culturales, talleres, clubes) -> categoria: "post_it", nombre_pin: "Post-it (Cultura)", subtag: "Cultura", prioridad: 3, pertenece_mephu: false
   - "Desarrollo Social" (Vivienda, IVC, tercera edad, ayuda social) -> categoria: "post_it", nombre_pin: "Post-it (Desarrollo Social)", subtag: "Desarrollo Social", prioridad: 3, pertenece_mephu: false
   - "Trámites y Servicios" (TAD, turnos web, BA Colaborativa) -> categoria: "post_it", nombre_pin: "Post-it (Trámites y Servicios)", subtag: "Trámites y Servicios", prioridad: 3, pertenece_mephu: false

Responde EXCLUSIVAMENTE un JSON válido con esta estructura:
{
  "badges": [
    {
      "categoria": "amarillo" | "azul" | "verde" | "rojo" | "post_it",
      "nombre_pin": "Nombre descriptivo del pin o post-it",
      "subtag": "Subtag oficial del tema",
      "pertenece_mephu": true | false,
      "prioridad": 1 | 2 | 3
    }
  ]
}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 700 }
        })
      }
    );

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      const cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      const parsedBadges = Array.isArray(parsed.badges) && parsed.badges.length > 0 
        ? parsed.badges 
        : [parsed];

      const formattedBadges = parsedBadges.map(b => {
        const base = b.categoria === 'amarillo' ? PIN_CONFIGS.AMARILLO
          : b.categoria === 'azul' ? PIN_CONFIGS.AZUL
          : b.categoria === 'verde' ? PIN_CONFIGS.VERDE
          : b.categoria === 'post_it' ? PIN_CONFIGS.POST_IT
          : PIN_CONFIGS.ROJO;

        const subtag = b.subtag || base.tagPrincipal;
        const nombrePin = b.nombre_pin || base.nombre;
        return createBadge(base, subtag, nombrePin);
      });

      // Ordenar badges por prioridad (1 > 2 > 3)
      formattedBadges.sort((a, b) => a.prioridad - b.prioridad);

      const mainBadge = formattedBadges[0];
      const allTagNames = formattedBadges.map(b => b.subtag);

      const result = {
        ...mainBadge,
        badges: formattedBadges,
        detectedTags: allTagNames,
        allTags: allTagNames,
        categoria: mainBadge.key,
        prioridad: mainBadge.prioridad,
        perteneceMEPHU: mainBadge.perteneceMEPHU,
        fromAI: true
      };

      classificationCache.set(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.warn('Fallback a heurística para clasificación de tema:', err.message);
  }

  classificationCache.set(cacheKey, fallback);
  return fallback;
}
