// Mock Data que simula el esquema exacto de PostgreSQL/Supabase
// Permite inicializar y probar toda la lógica polimórfica del lado del cliente.

export const ROLES_USUARIO = {
  GERENCIA: 'gerencia',
  CERCANIA: 'cercania',
  TERRITORIO_COORDINACION: 'territorio_coordinacion',
  AGENTE_TERRITORIO: 'agente_territorio'
};

export const TIPOS_REUNION = {
  ENCUENTRO: 'Encuentro con Vecinos',
  TEMATICA: 'Reunion Tematica',
  UNO_A_UNO: 'Uno a Uno',
  SEGURIDAD: 'Seguridad en Tu Barrio',
  CAFE: 'Cafe con Vecinos',
  PROCESOS_CO_CREACION: 'Procesos Participativos - Co Creacion',
  PROCESOS_INFORMATIVA: 'Procesos Participativos - Reunion Informativa',
  PRIMERA_PERSONA: 'Primera Persona',
  EXPERIENCIAS_BA: 'Experiencias BA',
  VOLUNTARIADOS: 'Voluntariados'
};

export const ESTADO_CONVOCATORIA = {
  INSCRIPTO: 'inscripto',
  SELECCIONADO: 'seleccionado_uno_a_uno',
  WALK_IN: 'walk_in'
};

export const ESTADO_ORADOR = {
  ESPERA: 'en_espera',
  HABLO: 'hablo',
  BAJO: 'se_bajo'
};

// Usuarios de prueba con perfiles
export const mockPerfilesUsuarios = [
  { id: 'u0', email: 'fschottenfeld@gmail.com', nombre: 'F. Schottenfeld', rol: ROLES_USUARIO.GERENCIA, password: '32272854' },
  { id: 'u1', email: 'gerencia@participacion.gob.ar', nombre: 'Carla Solís', rol: ROLES_USUARIO.GERENCIA, password: '123' },
  { id: 'u2', email: 'cercania@participacion.gob.ar', nombre: 'Javier Domínguez', rol: ROLES_USUARIO.CERCANIA, password: '123' },
  { id: 'u3', email: 'coordinacion@participacion.gob.ar', nombre: 'Mariela Blanco', rol: ROLES_USUARIO.TERRITORIO_COORDINACION, password: '123' },
  { id: 'u4', email: 'agente@participacion.gob.ar', nombre: 'Esteban Martínez', rol: ROLES_USUARIO.AGENTE_TERRITORIO, password: '123' }
];

// Padrón central de vecinos
export let mockVecinos = [];

// Reuniones creadas
export let mockReuniones = [];

// Inscripciones y Asistencias unificadas
export let mockInscripcionesAsistencias = [];

// Oradores para encuentros
export let mockOradores = [];

// Preguntas QR
export let mockPreguntasQR = [];

// --- FUNCIONES MOCK CLIENTE (Simulan llamadas a API de Supabase) ---

export const getReuniones = () => [...mockReuniones];

export const saveReunion = (reunion) => {
  const newReunion = {
    ...reunion,
    id: `r_${Date.now()}`,
    created_at: new Date().toISOString()
  };
  mockReuniones = [newReunion, ...mockReuniones];
  return newReunion;
};

export const updateReunion = (id, fields) => {
  mockReuniones = mockReuniones.map(r => r.id === id ? { ...r, ...fields } : r);
  return mockReuniones.find(r => r.id === id);
};

export const getVecinos = () => [...mockVecinos];

export const addVecino = (vecino) => {
  const exist = mockVecinos.find(v => v.dni === vecino.dni);
  if (exist) {
    // Si ya existe, actualizamos sus datos (pisa duplicados)
    mockVecinos = mockVecinos.map(v => v.dni === vecino.dni ? { ...v, ...vecino } : v);
    return mockVecinos.find(v => v.dni === vecino.dni);
  }
  const newVecino = { ...vecino, created_at: new Date().toISOString() };
  mockVecinos.push(newVecino);
  return newVecino;
};

export const getAsistencias = (reunionId) => {
  return mockInscripcionesAsistencias
    .filter(ia => ia.reunion_id === reunionId)
    .map(ia => {
      const vecino = mockVecinos.find(v => v.dni === ia.vecino_id);
      return { ...ia, vecino };
    });
};

export const toggleAsistencia = (reunionId, vecinoDni, asistioVal, extraData = {}) => {
  let item = mockInscripcionesAsistencias.find(ia => ia.reunion_id === reunionId && ia.vecino_id === vecinoDni);
  
  if (!item) {
    // Si no está registrado en la reunión, se crea usando extraData o fallback a walk-in
    const newItem = {
      id: `ia_${reunionId}_${vecinoDni}`,
      reunion_id: reunionId,
      vecino_id: vecinoDni,
      asistio: asistioVal,
      estado_convocatoria: extraData.estado_convocatoria || ESTADO_CONVOCATORIA.WALK_IN,
      como_se_entero: extraData.como_se_entero || 'En el lugar',
      invitado_por: extraData.invitado_por || 'Territorio',
      tema_previo: extraData.tema_previo || '',
      necesita_accesibilidad: extraData.necesita_accesibilidad || 'No',
      hora_marcado: asistioVal ? new Date().toISOString() : null,
      horario_bloque_asignado: extraData.horario_bloque_asignado || null,
      hora_ingreso: extraData.hora_ingreso || null,
      hora_salida: extraData.hora_salida || null,
      pregunta_puerta: extraData.pregunta_puerta || null,
      created_at: new Date().toISOString()
    };
    mockInscripcionesAsistencias.push(newItem);
    return { ...newItem, vecino: mockVecinos.find(v => v.dni === vecinoDni) };
  } else {
    // Si existe, se actualiza el estado de asistencia
    mockInscripcionesAsistencias = mockInscripcionesAsistencias.map(ia => {
      if (ia.reunion_id === reunionId && ia.vecino_id === vecinoDni) {
        return {
          ...ia,
          asistio: asistioVal,
          hora_marcado: asistioVal ? new Date().toISOString() : null,
          ...extraData
        };
      }
      return ia;
    });
    const updated = mockInscripcionesAsistencias.find(ia => ia.reunion_id === reunionId && ia.vecino_id === vecinoDni);
    return { ...updated, vecino: mockVecinos.find(v => v.dni === vecinoDni) };
  }
};

export const getOradores = (reunionId) => {
  return mockOradores
    .filter(o => o.reunion_id === reunionId)
    .map(o => {
      const vecino = mockVecinos.find(v => v.dni === o.vecino_id);
      return { ...o, vecino };
    })
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));
};

export const addOrador = (reunionId, vecinoDni, temaOriginal) => {
  const currentCount = mockOradores.filter(o => o.reunion_id === reunionId).length;
  const newOrador = {
    id: `o_${Date.now()}`,
    reunion_id: reunionId,
    vecino_id: vecinoDni,
    tema_original: temaOriginal,
    tema_efectivo: null,
    estado: ESTADO_ORADOR.ESPERA,
    orden: currentCount + 1,
    created_at: new Date().toISOString()
  };
  mockOradores.push(newOrador);
  return { ...newOrador, vecino: mockVecinos.find(v => v.dni === vecinoDni) };
};

export const updateOradorEstado = (oradorId, estado, temaEfectivo = null) => {
  mockOradores = mockOradores.map(o => {
    if (o.id === oradorId) {
      return { ...o, estado, ...(temaEfectivo !== null ? { tema_efectivo: temaEfectivo } : {}) };
    }
    return o;
  });
  return mockOradores.find(o => o.id === oradorId);
};

export const getPreguntasQR = (reunionId) => {
  return mockPreguntasQR
    .filter(pq => pq.reunion_id === reunionId)
    .map(pq => {
      const vecino = mockVecinos.find(v => v.dni === pq.vecino_id);
      return { ...pq, vecino };
    });
};

export const addPreguntaQR = (reunionId, vecinoDni, preguntaText) => {
  const newPregunta = {
    id: `pq_${Date.now()}`,
    reunion_id: reunionId,
    vecino_id: vecinoDni,
    pregunta: preguntaText,
    created_at: new Date().toISOString()
  };
  mockPreguntasQR.push(newPregunta);
  return { ...newPregunta, vecino: mockVecinos.find(v => v.dni === vecinoDni) };
};
