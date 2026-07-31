import { supabase } from '../lib/supabaseClient';

export const EXCLUDED_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'a', 'en', 'con', 'por', 'para', 'sin', 'sobre', 'entre', 'hacia', 'desde', 'hasta', 'contra', 'segun', 'etc',
  'y', 'e', 'o', 'u', 'ni', 'pero', 'sino', 'aunque', 'porque', 'que', 'si',
  'me', 'te', 'se', 'nos', 'les', 'lo', 'la', 'le', 'ellos', 'ellas', 'esto', 'eso', 'aquello', 'quien', 'cual', 'mi', 'mis', 'su', 'sus', 'nuestro', 'nuestra',
  'ser', 'estar', 'haber', 'tener', 'hacer', 'poder', 'ir', 'decir', 'dar', 'quedar', 'es', 'fue', 'son', 'estaba', 'tiene', 'tienen', 'hizo',
  'hay', 'hace', 'esta', 'está', 'estan', 'están', 'era', 'puede', 'pueden', 'cuando', 'donde', 'como', 'comenta', 'comentan', 'dice', 'dicen', 'pide', 'piden', 'solicita', 'solicitan', 'agradece',
  'muy', 'mas', 'menos', 'ya', 'aun', 'tambien', 'siempre', 'nunca', 'casi', 'solo', 'incluso', 'bueno', 'entonces', 'digamos', 'osea', 'nada', 'tipo',
  'momento', 'veces', 'todo', 'todos', 'mucho', 'mucha', 'muchos', 'muchas', 'persona', 'personas', 'gente', 'tema'
]);

const LEMMA_OVERRIDES = {
  'calles': 'calle', 'veredas': 'vereda', 'autos': 'auto', 'motos': 'moto',
  'vecinos': 'vecino', 'arboles': 'arbol', 'luces': 'luz', 'camaras': 'camara',
  'basuras': 'basura', 'contenedores': 'contenedor', 'punteros': 'puntero',
  'semaforos': 'semaforo', 'plazas': 'plaza', 'parques': 'parque', 'baches': 'bache',
  'perros': 'perro', 'ratas': 'rata', 'plagas': 'plaga', 'rampas': 'rampa',
  'colectivos': 'colectivo', 'paradas': 'parada', 'multas': 'multa',
  'ruidos': 'ruido', 'obras': 'obra', 'reuniones': 'reunion', 'problemas': 'problema'
};

export const processAndNormalizeWord = (rawWord) => {
  if (!rawWord) return null;
  let w = rawWord.toLowerCase();
  w = w.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  w = w.replace(/[^a-zñ]/g, '');
  if (!w || w.length <= 2) return null;
  if (LEMMA_OVERRIDES[w]) {
    w = LEMMA_OVERRIDES[w];
  } else if (w.endsWith('es') && w.length > 4) {
    w = w.slice(0, -2);
  } else if (w.endsWith('s') && !w.endsWith('is') && !w.endsWith('us') && w.length > 3) {
    w = w.slice(0, -1);
  }
  if (EXCLUDED_WORDS.has(w)) return null;
  return w;
};

// 1.1 Lógica de fechas (Período anterior)
export const calcularPeriodoAnterior = (fechaDesde, fechaHasta) => {
  if (!fechaDesde) return null;
  
  const desde = new Date(fechaDesde);
  let hasta = fechaHasta ? new Date(fechaHasta) : new Date(); // Si no hay hasta, es hasta hoy.

  // Normalizar horas
  desde.setHours(0, 0, 0, 0);
  hasta.setHours(23, 59, 59, 999);

  const diffTime = Math.abs(hasta - desde);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const anteriorHasta = new Date(desde);
  anteriorHasta.setDate(anteriorHasta.getDate() - 1);
  anteriorHasta.setHours(23, 59, 59, 999);

  const anteriorDesde = new Date(anteriorHasta);
  anteriorDesde.setDate(anteriorDesde.getDate() - (diffDays - 1));
  anteriorDesde.setHours(0, 0, 0, 0);

  return { anteriorDesde, anteriorHasta, currentDesde: desde, currentHasta: hasta };
};

// Función para obtener KPIs rápidos de un conjunto de IDs de reuniones
const fetchKPIsForReuniones = async (reunionesIds) => {
  if (!reunionesIds || reunionesIds.length === 0) return { convocados: 0, asistentes: 0, oradores: 0, conversion: 0 };
  
  let inscripciones = [];
  let page = 0;
  while (true) {
    const { data } = await supabase.from('inscripciones_asistencias')
      .select('asistio').in('reunion_id', reunionesIds)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    inscripciones = inscripciones.concat(data);
    if (data.length < 1000) break;
    page++;
  }

  let oradores = [];
  page = 0;
  while (true) {
    const { data } = await supabase.from('oradores')
      .select('reunion_id').in('reunion_id', reunionesIds)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    oradores = oradores.concat(data);
    if (data.length < 1000) break;
    page++;
  }

  const convocados = inscripciones.length;
  const asistentes = inscripciones.filter(i => i.asistio).length;
  const conversion = convocados > 0 ? (asistentes / convocados) : 0;
  
  return { convocados, asistentes, oradores: oradores.length, conversion };
};

export const fetchDashboardData = async (filtros) => {
  const { selectedComunas, selectedBarrio, selectedFuncionario, selectedTipoReunion, selectedTema, fechaDesde, fechaHasta, searchQuery } = filtros;
  
  const pageSize = 1000;
  
  // 1. Traer reuniones válidas con filtros aplicados en el servidor
  // Si no hay rango de fechas manual, se limita a los últimos 180 días para reducir egress
  let reuniones = [];
  let page = 0;
  const defaultCutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const queryDesde = fechaDesde || defaultCutoff;
  // Extender el rango para incluir también el período anterior (para comparativos)
  // Estimamos el período anterior duplicando el rango hacia atrás
  const queryDesdeConAnterior = fechaDesde
    ? (() => {
        const desde = new Date(fechaDesde);
        const hasta = fechaHasta ? new Date(fechaHasta) : new Date();
        const diffDays = Math.ceil(Math.abs(hasta - desde) / (1000 * 60 * 60 * 24));
        const anteriorDesdeExt = new Date(desde);
        anteriorDesdeExt.setDate(anteriorDesdeExt.getDate() - diffDays - 1);
        return anteriorDesdeExt.toISOString().split('T')[0];
      })()
    : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  while (true) {
    let query = supabase
      .from('reuniones')
      .select('id, nombre, funcionario, fecha, comuna, barrio, tipo_reunion, semaforo_politico, clima, tema')
      .gte('fecha', queryDesdeConAnterior)
      .order('id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    // Filtros server-side opcionales
    if (selectedFuncionario) query = query.ilike('funcionario', `%${selectedFuncionario}%`);
    if (selectedTipoReunion) query = query.eq('tipo_reunion', selectedTipoReunion);
    if (selectedBarrio) query = query.eq('barrio', selectedBarrio);
    if (fechaHasta) query = query.lte('fecha', fechaHasta);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    reuniones = reuniones.concat(data);
    if (data.length < pageSize) break;
    page++;
  }
  
  const validReuniones = reuniones.filter(r => {
    const name = (r.nombre || '').toLowerCase();
    return !name.includes('test') && !name.includes('prueba');
  });

  const reunionesMap = {};
  validReuniones.forEach(r => { reunionesMap[r.id] = r; });

  // 1.5. Determinar las fechas
  let periodos = calcularPeriodoAnterior(fechaDesde, fechaHasta);
  // Si no hay fechas, comparamos este año con el año pasado por defecto para no cargar 10 años
  if (!periodos) {
    const hoy = new Date();
    const primerDiaAno = new Date(hoy.getFullYear(), 0, 1);
    periodos = calcularPeriodoAnterior(primerDiaAno.toISOString().split('T')[0], hoy.toISOString().split('T')[0]);
  }

  const { anteriorDesde, anteriorHasta, currentDesde, currentHasta } = periodos;

  // Filtrar IDs de reuniones
  const reunionesFiltradas = validReuniones.filter(r => {
    if (selectedComunas && selectedComunas.length > 0 && !selectedComunas.includes(r.comuna)) return false;
    if (selectedBarrio && r.barrio !== selectedBarrio) return false;
    if (selectedFuncionario && (!r.funcionario || !r.funcionario.toLowerCase().includes(selectedFuncionario.toLowerCase()))) return false;
    if (selectedTipoReunion && r.tipo_reunion !== selectedTipoReunion) return false;
    if (selectedTema) {
      const temaStr = (r.tema || '').toLowerCase();
      const nameStr = (r.nombre || '').toLowerCase();
      const searchT = selectedTema.toLowerCase();
      if (!temaStr.includes(searchT) && !nameStr.includes(searchT)) return false;
    }
    return true;
  });

  const reunionesActuales = reunionesFiltradas.filter(r => {
    if (r.fecha) {
      const d = new Date(r.fecha);
      return d >= currentDesde && d <= currentHasta;
    }
    return false;
  });

  const reunionesAnteriores = reunionesFiltradas.filter(r => {
    if (r.fecha) {
      const d = new Date(r.fecha);
      return d >= anteriorDesde && d <= anteriorHasta;
    }
    return false;
  });

  const actualIds = reunionesActuales.map(r => r.id);
  const anteriorIds = reunionesAnteriores.map(r => r.id);
  const histIds = reunionesFiltradas.map(r => r.id); // Todas las reuniones que matchean los filtros (sin fecha)

  // 2. Fetch de datos actuales (completo, para poder tener vecinos y drill down)
  let inscripcionesActual = [];
  page = 0;
  if (actualIds.length > 0) {
    while (true) {
      const { data } = await supabase.from('inscripciones_asistencias').select('vecino_id, reunion_id, asistio, tema_previo').in('reunion_id', actualIds).order('vecino_id').range(page * pageSize, (page + 1) * pageSize - 1);
      if (!data || data.length === 0) break;
      inscripcionesActual = inscripcionesActual.concat(data);
      if (data.length < pageSize) break;
      page++;
    }
  }

  let oradoresActual = [];
  page = 0;
  if (actualIds.length > 0) {
    while (true) {
      const { data } = await supabase.from('oradores').select('vecino_id, reunion_id, estado, tema_original, tema_efectivo, tags').in('reunion_id', actualIds).order('vecino_id').range(page * pageSize, (page + 1) * pageSize - 1);
      if (!data || data.length === 0) break;
      oradoresActual = oradoresActual.concat(data);
      if (data.length < pageSize) break;
      page++;
    }
  }

  // Fetch Vecinos actuales
  const uniqueDnis = [...new Set([...inscripcionesActual.map(i => String(i.vecino_id).trim()), ...oradoresActual.map(o => String(o.vecino_id).trim())])].filter(Boolean);
  let vecinos = [];
  if (uniqueDnis.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < uniqueDnis.length; i += chunkSize) {
      const chunk = uniqueDnis.slice(i, i + chunkSize);
      const { data } = await supabase.from('vecinos').select('dni, nombre, apellido, comuna, barrio, celular, email').in('dni', chunk);
      if (data) vecinos = vecinos.concat(data);
    }
  }
  
  if (searchQuery) {
    const q = searchQuery.toLowerCase().trim();
    vecinos = vecinos.filter(v => 
      String(v.dni).includes(q) || (v.nombre && v.nombre.toLowerCase().includes(q)) || (v.apellido && v.apellido.toLowerCase().includes(q)) || (v.celular && String(v.celular).includes(q)) || (v.email && v.email.toLowerCase().includes(q))
    );
  }

  // Filtrado de vecinos test
  vecinos = vecinos.filter(v => !((v.nombre || '').toLowerCase().includes('test') || (v.apellido || '').toLowerCase().includes('test')));
  
  // 3. Obtener histórico general de la persona (para KPI Fidelización)
  const asistentesDnis = [...new Set(inscripcionesActual.filter(i => i.asistio).map(i => String(i.vecino_id).trim()))];
  let fielesDnis = new Set();
  
  if (asistentesDnis.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < asistentesDnis.length; i += chunkSize) {
      const chunk = asistentesDnis.slice(i, i + chunkSize);
      const { data } = await supabase.from('inscripciones_asistencias')
        .select('vecino_id, reunion_id')
        .in('vecino_id', chunk)
        .eq('asistio', true)
        .range(0, 9999);
      
      if (data) {
        const counts = {};
        data.forEach(d => {
          const dni = String(d.vecino_id).trim();
          counts[dni] = (counts[dni] || 0) + 1;
        });
        Object.keys(counts).forEach(dni => {
          if (counts[dni] >= 2) fielesDnis.add(dni);
        });
      }
    }
  }

  // Procesar lista vecinos
  const processedList = vecinos.map(v => {
    const vInscs = inscripcionesActual.filter(i => String(i.vecino_id).trim() === String(v.dni).trim());
    const vOrads = oradoresActual.filter(o => String(o.vecino_id).trim() === String(v.dni).trim());
    
    return {
      ...v,
      totalInscripciones: vInscs.length,
      totalAsistencias: vInscs.filter(i => i.asistio).length,
      totalOratorias: vOrads.length,
      inscripcionesReuniones: vInscs.map(i => ({ ...i, reunion: reunionesMap[i.reunion_id] })),
      esFiel: fielesDnis.has(String(v.dni).trim())
    };
  });

  // 4. Fetch Periodo Anterior y Global Histórico
  const prevKPIs = await fetchKPIsForReuniones(anteriorIds);
  const histKPIs = await fetchKPIsForReuniones(histIds);

  const kpis = {
    actual: {
      convocatorias: processedList.reduce((acc, v) => acc + v.totalInscripciones, 0),
      vecinosUnicos: processedList.length,
      asistencias: processedList.reduce((acc, v) => acc + v.totalAsistencias, 0),
      oradores: processedList.reduce((acc, v) => acc + v.totalOratorias, 0),
      asistentesPrimeraVez: inscripcionesActual.filter(i => i.asistio && !fielesDnis.has(String(i.vecino_id).trim())).length,
      asistentesReincidentes: inscripcionesActual.filter(i => i.asistio && fielesDnis.has(String(i.vecino_id).trim())).length,
      conversion: 0,
      tasaUsoPalabra: 0
    },
    anterior: prevKPIs,
    historico: {
      ...histKPIs,
      promedioConversion: histKPIs.conversion
    },
    fechas: {
      currentDesde, currentHasta, anteriorDesde, anteriorHasta
    }
  };
  kpis.actual.conversion = kpis.actual.convocatorias > 0 ? (kpis.actual.asistencias / kpis.actual.convocatorias) : 0;
  kpis.actual.tasaUsoPalabra = kpis.actual.asistencias > 0 ? (kpis.actual.oradores / kpis.actual.asistencias) : 0;
  kpis.anterior.tasaUsoPalabra = prevKPIs.asistentes > 0 ? (prevKPIs.oradores / prevKPIs.asistentes) : 0;
  
  // Extraer las frases globales para la nube interactiva desde el tema_previo de las inscripciones
  const frasesGlobales = inscripcionesActual
    .filter(i => i.tema_previo && i.tema_previo.trim() !== '')
    .map(i => ({ tema_original: i.tema_previo }));

  return { 
    vecinos: processedList, 
    kpis, 
    reunionesActuales,
    frasesGlobales,
    periodos
  };
};

export const generateInsights = (kpisActual, kpisAnterior, periodos) => {
  const insights = [];
  
  if (kpisActual.asistencias > 0) {
    const fidelizacion = (kpisActual.asistentesReincidentes / kpisActual.asistencias) * 100;
    if (fidelizacion > 30) {
      insights.push(`🔄 Alta construcción de comunidad: El ${fidelizacion.toFixed(1)}% de los asistentes ya había participado en actividades previas.`);
    } else {
      insights.push(`🌱 Público nuevo: Gran mayoría de los asistentes participaron por primera vez en este período.`);
    }
  }

  if (kpisActual.tasaUsoPalabra > 0.2) {
    insights.push(`🎤 Alto nivel de debate participativo: Más del 20% de los asistentes pidió la palabra.`);
  }

  if (insights.length === 0) {
    insights.push("📌 El comportamiento de las métricas se mantiene estable dentro de los parámetros esperados.");
  }

  return insights;
};
