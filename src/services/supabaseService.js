import { supabase } from '../lib/supabaseClient';

/**
 * Servicio de conexión con Supabase para el Sistema de Presentismo.
 * Todas las funciones capturan errores y retornan la estructura estándar { data, error }.
 */

// =========================================================================
// CACHÉ EN MEMORIA DE SESIÓN
// Para listas estáticas (funcionarios, agentes_territorio) que no cambian
// durante una sesión normal de trabajo. TTL por defecto: 5 minutos.
// =========================================================================
const SESSION_CACHE = {};

/**
 * Ejecuta una query de Supabase y cachea el resultado en memoria.
 * Si hay datos en caché dentro del TTL, los retorna sin consultar Supabase.
 * @param {string} key - Clave única para identificar el caché
 * @param {Function} queryFn - Función async que retorna { data, error }
 * @param {number} ttlMs - Tiempo de vida del caché en milisegundos (default: 5 min)
 */
export const cachedQuery = async (key, queryFn, ttlMs = 5 * 60 * 1000) => {
  const cached = SESSION_CACHE[key];
  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return { data: cached.data, error: null };
  }
  const result = await queryFn();
  if (!result.error && result.data) {
    SESSION_CACHE[key] = { data: result.data, timestamp: Date.now() };
  }
  return result;
};

/** Invalida una entrada del caché manualmente (útil tras crear/editar registros) */
export const invalidateCache = (key) => {
  delete SESSION_CACHE[key];
};


// =========================================================================
// 1. AUTENTICACIÓN Y USUARIOS (Supabase Auth + perfiles_usuarios)
// =========================================================================

/**
 * Autentica al usuario en Supabase Auth y luego cruza los datos con la tabla perfiles_usuarios
 * para obtener su rol y nombre.
 */
export const login = async (email, password) => {
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('No se devolvieron datos de usuario tras la autenticación.');

    // Cruzar con la tabla perfiles_usuarios para obtener rol y nombre
    let { data: profileData, error: profileError } = await supabase
      .from('perfiles_usuarios')
      .select('id, email, nombre, rol')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    // Si la fila en perfiles_usuarios no existe (por ejemplo, si falló en el registro previo debido a RLS),
    // la creamos de forma automática y transparente en el momento del login.
    if (!profileData) {
      const { data: newProfile, error: insertError } = await supabase
        .from('perfiles_usuarios')
        .insert([
          {
            id: authData.user.id,
            email: authData.user.email,
            nombre: authData.user.user_metadata?.nombre || 'Francisco Schottenfeld',
            rol: 'gerencia' // Rol inicial
          }
        ])
        .select()
        .single();

      if (insertError) throw insertError;
      profileData = newProfile;
    }

    return { data: profileData, error: null };
  } catch (error) {
    console.error('Error en login:', error);
    return { data: null, error };
  }
};

/**
 * Registra un nuevo usuario en Supabase Auth y crea su perfil correspondiente
 * en la tabla perfiles_usuarios de manera coordinada.
 */
export const signUp = async (email, password, nombre, rol) => {
  try {
    // 1. Crear en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombre: nombre
        }
      }
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('No se pudo crear el usuario en el servicio de autenticación.');

    // 2. Crear registro en la tabla perfiles_usuarios vinculando el UUID
    const { data: profileData, error: profileError } = await supabase
      .from('perfiles_usuarios')
      .insert([
        {
          id: authData.user.id,
          email: email,
          nombre: nombre,
          rol: rol
        }
      ])
      .select()
      .single();

    if (profileError) throw profileError;

    return { data: profileData, error: null };
  } catch (error) {
    console.error('Error en signUp:', error);
    return { data: null, error };
  }
};

/**
 * Envía un correo electrónico para restablecer la contraseña.
 */
export const recuperarPassword = async (email) => {
  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en recuperarPassword:', error);
    return { data: null, error };
  }
};

// =========================================================================
// 2. REUNIONES
// =========================================================================

/**
 * Obtiene todas las reuniones ordenadas por fecha en orden descendente.
 */
/**
 * Obtiene las reuniones. Por defecto limita a los últimos 180 días para reducir egress.
 * Pasar { historico: true } para obtener todas sin límite de fecha.
 */
export const getReuniones = async ({ historico = false } = {}) => {
  try {
    let query = supabase
      .from('reuniones')
      .select('id, nombre, fecha, lugar, barrio, comuna, tipo_reunion, tema, funcionario, gestion_presente, clima, semaforo_politico, active_orador_id, sintesis_cualitativa, config_uno_a_uno, created_at')
      .order('fecha', { ascending: false });

    if (!historico) {
      const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      query = query.gte('fecha', cutoff);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en getReuniones:', error);
    return { data: null, error };
  }
};

/**
 * Crea una nueva reunión y retorna el registro recién insertado.
 */
export const createReunion = async (reunionData) => {
  try {
    const { data, error } = await supabase
      .from('reuniones')
      .insert([reunionData])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en createReunion:', error);
    return { data: null, error };
  }
};

/**
 * Actualiza los campos de una reunión (como marcas de inicio/fin o interrupciones).
 */
export const updateReunion = async (reunionId, fields) => {
  try {
    const { data, error } = await supabase
      .from('reuniones')
      .update(fields)
      .eq('id', reunionId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en updateReunion:', error);
    return { data: null, error };
  }
};

// =========================================================================
// 3. PADRÓN DE VECINOS
// =========================================================================

/**
 * Realiza un alta o actualización (upsert) en el padrón central de vecinos.
 * Utiliza el DNI como clave primaria para pisar registros duplicados.
 */
export const upsertVecino = async (vecinoData) => {
  try {
    const { data, error } = await supabase
      .from('vecinos')
      .upsert(vecinoData)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en upsertVecino:', error);
    return { data: null, error };
  }
};

export const cambiarDniVecino = async (oldDni, newDni, updates = {}) => {
  try {
    // 1. Verificar si el nuevo DNI ya existe en la base de datos
    const { data: existingVecino } = await supabase
      .from('vecinos')
      .select('dni')
      .eq('dni', newDni)
      .maybeSingle();

    if (!existingVecino) {
      // Obtener datos del vecino viejo para clonar
      const { data: oldVecino, error: errFetch } = await supabase
        .from('vecinos')
        .select('*')
        .eq('dni', oldDni)
        .single();
      if (errFetch) throw errFetch;

      // Insertar nuevo vecino con el DNI correcto
      const { error: errInsert } = await supabase
        .from('vecinos')
        .insert({
          ...oldVecino,
          ...updates,
          dni: newDni
        });
      if (errInsert) throw errInsert;
    } else {
      // Si ya existe, actualizamos sus datos con las novedades
      const { error: errUpdateExisting } = await supabase
        .from('vecinos')
        .update(updates)
        .eq('dni', newDni);
      if (errUpdateExisting) throw errUpdateExisting;
    }

    // 2. Actualizar las referencias de inscripción
    await supabase
      .from('inscripciones_asistencias')
      .update({ vecino_id: newDni })
      .eq('vecino_id', oldDni);

    // 3. Actualizar las referencias de oradores
    await supabase
      .from('oradores')
      .update({ vecino_id: newDni })
      .eq('vecino_id', oldDni);

    // 4. Eliminar el DNI viejo/temporal si es distinto al nuevo
    if (oldDni !== newDni) {
      await supabase
        .from('vecinos')
        .delete()
        .eq('dni', oldDni);
    }

    return { data: { dni: newDni }, error: null };
  } catch (error) {
    console.error('Error en cambiarDniVecino:', error);
    return { data: null, error };
  }
};

// =========================================================================
// 4. INSCRIPCIONES Y ASISTENCIAS (EL CORAZÓN DEL SISTEMA)
// =========================================================================

/**
 * Obtiene la lista de asistentes a una reunión incluyendo un JOIN automático 
 * con la información del vecino.
 */
export const getAsistentesPorReunion = async (reunionId) => {
  try {
    const { data, error } = await supabase
      .from('inscripciones_asistencias')
      .select('id, reunion_id, vecino_id, asistio, estado_convocatoria, horario_bloque_asignado, confirmado, como_se_entero, tema_previo, agente_territorio_id, vecino:vecinos(dni, nombre, apellido, barrio, comuna, celular, email), agente_territorio:agentes_territorio(id, nombre_completo)')
      .eq('reunion_id', reunionId);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en getAsistentesPorReunion:', error);
    return { data: null, error };
  }
};

/**
 * OPTIMIZACIÓN DE RED EN TERRITORIO:
 * Registra o actualiza la asistencia de un vecino de forma directa en un solo viaje de red.
 * Utiliza .upsert() especificando el conflicto sobre 'reunion_id,vecino_id'.
 */
export const guardarAsistencia = async (reunionId, vecinoDni, asistioVal, extraData = {}) => {
  try {
    const upsertData = {
      reunion_id: reunionId,
      vecino_id: vecinoDni,
      asistio: asistioVal,
      ...extraData
    };

    const { data, error } = await supabase
      .from('inscripciones_asistencias')
      .upsert(upsertData, { onConflict: 'reunion_id,vecino_id' })
      .select('id, reunion_id, vecino_id, asistio, estado_convocatoria, horario_bloque_asignado, confirmado, como_se_entero, tema_previo, agente_territorio_id')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en guardarAsistencia:', error);
    return { data: null, error };
  }
};

// =========================================================================
// 5. ORADORES (Encuentros / Cafés con Vecinos)
// =========================================================================

/**
 * Obtiene la cola de oradores asignados a una reunión en orden de intervención.
 */
export const getOradores = async (reunionId) => {
  try {
    const { data, error } = await supabase
      .from('oradores')
      .select('id, reunion_id, vecino_id, estado, orden, tema_original, tema_efectivo, created_at, vecino:vecinos(dni, nombre, apellido, barrio, comuna)')
      .eq('reunion_id', reunionId)
      .order('orden', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en getOradores:', error);
    return { data: null, error };
  }
};

/**
 * Registra una solicitud de palabra / orador en el micrófono.
 */
export const registrarOrador = async (oradorData) => {
  try {
    const { data, error } = await supabase
      .from('oradores')
      .insert([oradorData])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en registrarOrador:', error);
    return { data: null, error };
  }
};

/**
 * Modifica el estado del orador en el micrófono (espera, habló, se bajó)
 * y actualiza el tema efectivo si se completó la intervención.
 */
export const updateOradorEstado = async (oradorId, estado, temaEfectivo = null) => {
  try {
    const updateData = { estado };
    if (temaEfectivo !== null) {
      updateData.tema_efectivo = temaEfectivo;
    }

    const { data, error } = await supabase
      .from('oradores')
      .update(updateData)
      .eq('id', oradorId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en updateOradorEstado:', error);
    return { data: null, error };
  }
};

// =========================================================================
// 6. PREGUNTAS QR (Reuniones Temáticas)
// =========================================================================

/**
 * Obtiene las preguntas recopiladas mediante QR para una reunión temática.
 */
export const getPreguntasQR = async (reunionId) => {
  try {
    const { data, error } = await supabase
      .from('preguntas_qr')
      .select('*, vecino:vecinos(*)')
      .eq('reunion_id', reunionId);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en getPreguntasQR:', error);
    return { data: null, error };
  }
};

/**
 * Registra una nueva pregunta de vecino enviada a través de QR.
 */
export const addPreguntaQR = async (reunionId, vecinoDni, preguntaText) => {
  try {
    const { data, error } = await supabase
      .from('preguntas_qr')
      .insert([{
        reunion_id: reunionId,
        vecino_id: vecinoDni,
        pregunta: preguntaText
      }])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en addPreguntaQR:', error);
    return { data: null, error };
  }
};

/**
 * Elimina un registro de orador de la cola.
 */
export const eliminarOrador = async (reunionId, vecinoDni) => {
  try {
    const { data, error } = await supabase
      .from('oradores')
      .delete()
      .eq('reunion_id', reunionId)
      .eq('vecino_id', vecinoDni);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en eliminarOrador:', error);
    return { data: null, error };
  }
};

/**
 * Actualiza el tema original/planteado del orador.
 */
export const updateOradorTema = async (oradorId, temaOriginal) => {
  try {
    const { data, error } = await supabase
      .from('oradores')
      .update({ tema_original: temaOriginal })
      .eq('id', oradorId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en updateOradorTema:', error);
    return { data: null, error };
  }
};

/**
 * Actualiza cualquier propiedad de un registro de orador (estado, tema_original, tema_efectivo).
 */
export const updateOradorDetails = async (oradorId, updates) => {
  try {
    const { data, error } = await supabase
      .from('oradores')
      .update(updates)
      .eq('id', oradorId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en updateOradorDetails:', error);
    return { data: null, error };
  }
};

/**
 * Normaliza el canal de difusión para ajustarse estrictamente al enum canal_difusion_enum.
 */
export const normalizeCanalDifusion = (val) => {
  if (val === null || val === undefined || val.toString().trim() === '') return null;
  const clean = val.toString().trim().toLowerCase();
  
  if (['mailing', 'mail', 'email'].includes(clean)) return 'Mailing';
  if (['whatsapp', 'wpp', 'wa'].includes(clean)) return 'WhatsApp';
  if (['llamada', 'telefono', 'celular', 'llamada telefonica', 'llamada telefónica'].includes(clean)) return 'Llamada Telefónica';
  if (['redes', 'redes sociales', 'facebook', 'instagram', 'twitter'].includes(clean)) return 'Redes Sociales';
  if (['vecino', 'boca a boca', 'comunidad'].includes(clean)) return 'Vecino';
  if (['cartel', 'folleto', 'carteleria', 'folletos', 'carteleria / folleto', 'cartelería / folleto'].includes(clean)) return 'Cartelería / Folleto';
  if (['medios', 'radio', 'diario', 'medios locales', 'medio local'].includes(clean)) return 'Medios Locales';
  if (['walk-in', 'walk_in', 'walkin', 'puerta', 'en puerta', 'espontaneo', 'espontáneo'].includes(clean)) return 'Walk-in';
  if (['territorio', 'territorial', 'agente'].includes(clean)) return 'Territorio';
  
  return 'Otro';
};

/**
 * Normaliza la comuna para ajustarse estrictamente al enum comuna_ba_enum.
 */
export const normalizeComuna = (val) => {
  if (val === null || val === undefined || val.toString().trim() === '') return null;
  const clean = val.toString().trim();
  
  if (clean.toLowerCase().includes('norte')) {
    return 'Comuna 1 Norte';
  }
  if (clean.toLowerCase().includes('sur')) {
    return 'Comuna 1 Sur';
  }

  const match = clean.match(/\d+/);
  if (match) {
    const num = parseInt(match[0]);
    if (num >= 1 && num <= 15) {
      return `Comuna ${num}`;
    }
  }
  return 'Comuna 1';
};

/**
 * Obtiene la lista de todos los funcionarios registrados en la tabla reuniones.
 */
export const getFuncionariosList = async () => {
  try {
    const { data, error } = await supabase
      .from('reuniones')
      .select('funcionario');

    if (error) throw error;

    // Obtener nombres únicos y filtrar nulos/vacíos
    const list = [...new Set(data.map(r => r.funcionario))]
      .filter(f => f && f.trim() !== '')
      .sort((a, b) => a.localeCompare(b));

    return { data: list, error: null };
  } catch (error) {
    console.error('Error en getFuncionariosList:', error);
    return { data: [], error };
  }
};

/**
 * Obtiene toda la información relacionada a los eventos de un funcionario
 * para procesar las métricas de BI en cliente.
 */
export const getFuncionarioStats = async (funcionarioName) => {
  try {
    // 1. Obtener reuniones del funcionario
    const { data: meetings, error: errMeetings } = await supabase
      .from('reuniones')
      .select('id, nombre, fecha, tipo_reunion, comuna')
      .eq('funcionario', funcionarioName);

    if (errMeetings) throw errMeetings;

    if (!meetings || meetings.length === 0) {
      return { data: { meetings: [], attendance: [], speakers: [] }, error: null };
    }

    const meetingIds = meetings.map(m => m.id);

    // 2. Obtener inscripciones y asistencias de esas reuniones
    const { data: attendance, error: errAttendance } = await supabase
      .from('inscripciones_asistencias')
      .select('reunion_id, vecino_id, asistio, como_se_entero, estado_convocatoria, vecino:vecinos(dni, nombre, apellido, celular, email)')
      .in('reunion_id', meetingIds);

    if (errAttendance) throw errAttendance;

    // 3. Obtener oradores de esas reuniones
    const { data: speakers, error: errSpeakers } = await supabase
      .from('oradores')
      .select('reunion_id, vecino_id, estado, tema_original, tema_efectivo, vecino:vecinos(dni, nombre, apellido)')
      .in('reunion_id', meetingIds);

    if (errSpeakers) throw errSpeakers;

    return {
      data: {
        meetings,
        attendance,
        speakers
      },
      error: null
    };
  } catch (error) {
    console.error('Error en getFuncionarioStats:', error);
    return { data: null, error };
  }
};

/**
 * Elimina todos los inscriptos/asistentes de una reunión.
 * También limpia la cola de oradores asociada a la reunión.
 */
export const eliminarTodosLosInscriptos = async (reunionId) => {
  try {
    // 1. Eliminar oradores de la reunión primero
    const { error: errOradores } = await supabase
      .from('oradores')
      .delete()
      .eq('reunion_id', reunionId);

    if (errOradores) throw errOradores;

    // 2. Eliminar inscripciones/asistencias
    const { data, error } = await supabase
      .from('inscripciones_asistencias')
      .delete()
      .eq('reunion_id', reunionId);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en eliminarTodosLosInscriptos:', error);
    return { data: null, error };
  }
};

/**
 * Elimina una reunión y todos sus datos asociados (asistencia y oradores)
 */
export const deleteReunionCompleta = async (reunionId) => {
  try {
    // 1. Eliminar oradores
    const { error: errOradores } = await supabase
      .from('oradores')
      .delete()
      .eq('reunion_id', reunionId);

    if (errOradores) throw errOradores;

    // 2. Eliminar inscripciones/asistencias
    const { error: errAsistencias } = await supabase
      .from('inscripciones_asistencias')
      .delete()
      .eq('reunion_id', reunionId);

    if (errAsistencias) throw errAsistencias;

    // 3. Eliminar la reunión
    const { data, error } = await supabase
      .from('reuniones')
      .delete()
      .eq('id', reunionId);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en deleteReunionCompleta:', error);
    return { data: null, error };
  }
};

/**
 * Actualiza la contraseña del usuario logueado o en sesión de recuperación.
 */
export const updatePassword = async (newPassword) => {
  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en updatePassword:', error);
    return { data: null, error };
  }
};

/**
 * Fusiona dos fichas de vecinos duplicadas, consolidando datos y migrando el historial de interacciones al registro maestro.
 * 
 * @param {string} masterDni - El DNI real y válido que se conservará como clave principal (ej: '23299267').
 * @param {string} duplicateDniOrId - El DNI erróneo o ID temporal a fusionar (ej: '1544791761').
 * @param {object} overrideFields - Campos opcionales a sobreescribir ({ email, phone/celular, barrio, comuna, nombre, apellido }).
 */
export const unifyCitizenRecords = async (masterDni, duplicateDniOrId, overrideFields = {}) => {
  try {
    const cleanMasterDni = String(masterDni || '').trim();
    const cleanDuplicateDni = String(duplicateDniOrId || '').trim();

    if (!cleanMasterDni || !cleanDuplicateDni) {
      throw new Error('Debe proporcionar el DNI Maestro y el DNI/ID Duplicado.');
    }

    if (cleanMasterDni === cleanDuplicateDni) {
      throw new Error('El DNI Maestro y el DNI Duplicado no pueden ser idénticos.');
    }

    // 1. Obtener la ficha del registro duplicado y maestro
    const { data: duplicateVecino } = await supabase
      .from('vecinos')
      .select('*')
      .eq('dni', cleanDuplicateDni)
      .maybeSingle();

    const { data: masterVecino } = await supabase
      .from('vecinos')
      .select('*')
      .eq('dni', cleanMasterDni)
      .maybeSingle();

    if (!duplicateVecino && !masterVecino) {
      throw new Error(`No se encontró ningún vecino registrado con DNI ${cleanDuplicateDni} ni ${cleanMasterDni}.`);
    }

    // 2. Consolidar campos (Relleno de vacíos + Overrides)
    const baseNombre = overrideFields.nombre || masterVecino?.nombre || duplicateVecino?.nombre || 'Vecino';
    const baseApellido = overrideFields.apellido || masterVecino?.apellido || duplicateVecino?.apellido || '';
    const baseCelular = overrideFields.phone || overrideFields.celular || masterVecino?.celular || duplicateVecino?.celular || '';
    const baseEmail = overrideFields.email || masterVecino?.email || duplicateVecino?.email || '';
    const baseBarrio = overrideFields.barrio || masterVecino?.barrio || duplicateVecino?.barrio || '';
    const baseComuna = overrideFields.comuna || masterVecino?.comuna || duplicateVecino?.comuna || '';

    const consolidatedMaster = {
      dni: cleanMasterDni,
      nombre: baseNombre,
      apellido: baseApellido,
      celular: baseCelular,
      email: baseEmail,
      barrio: baseBarrio,
      comuna: baseComuna
    };

    // Upsert Ficha Maestra
    const { data: updatedMaster, error: errUpsert } = await supabase
      .from('vecinos')
      .upsert(consolidatedMaster)
      .select()
      .single();

    if (errUpsert) throw errUpsert;

    // 3. Reasignar Historial de Inscripciones / Asistencias
    const { data: dupInscripciones } = await supabase
      .from('inscripciones_asistencias')
      .select('*')
      .eq('vecino_id', cleanDuplicateDni);

    let countInscripcionesMigradas = 0;
    if (dupInscripciones && dupInscripciones.length > 0) {
      const { data: masterInscripciones } = await supabase
        .from('inscripciones_asistencias')
        .select('*')
        .eq('vecino_id', cleanMasterDni);

      const masterReunionMap = new Map((masterInscripciones || []).map(i => [i.reunion_id, i]));

      for (const dupInsc of dupInscripciones) {
        const existingMasterInsc = masterReunionMap.get(dupInsc.reunion_id);
        if (existingMasterInsc) {
          // Fusionar asistencias y eliminar duplicado
          const mergedAsistio = existingMasterInsc.asistio || dupInsc.asistio;
          await supabase
            .from('inscripciones_asistencias')
            .update({ asistio: mergedAsistio })
            .eq('id', existingMasterInsc.id);

          await supabase
            .from('inscripciones_asistencias')
            .delete()
            .eq('id', dupInsc.id);
        } else {
          // Migrar inscripción al maestro
          await supabase
            .from('inscripciones_asistencias')
            .update({ vecino_id: cleanMasterDni })
            .eq('id', dupInsc.id);
        }
        countInscripcionesMigradas++;
      }
    }

    // 4. Reasignar Historial de Oradores
    const { data: dupOradores } = await supabase
      .from('oradores')
      .select('*')
      .eq('vecino_id', cleanDuplicateDni);

    let countOradoresMigrados = 0;
    if (dupOradores && dupOradores.length > 0) {
      await supabase
        .from('oradores')
        .update({ vecino_id: cleanMasterDni })
        .eq('vecino_id', cleanDuplicateDni);
      countOradoresMigrados = dupOradores.length;
    }

    // 5. Eliminar ficha duplicada
    if (duplicateVecino && cleanDuplicateDni !== cleanMasterDni) {
      await supabase
        .from('vecinos')
        .delete()
        .eq('dni', cleanDuplicateDni);
    }

    return {
      data: {
        masterRecord: updatedMaster,
        salvagedFields: {
          email: baseEmail,
          celular: baseCelular,
          barrio: baseBarrio,
          comuna: baseComuna
        },
        reassignedHistory: {
          inscripciones: countInscripcionesMigradas,
          oradores: countOradoresMigrados
        }
      },
      error: null
    };

  } catch (error) {
    console.error('Error en unifyCitizenRecords:', error);
    return { data: null, error };
  }
};
