import { supabase } from '../lib/supabaseClient';

/**
 * Servicio de conexión con Supabase para el Sistema de Presentismo.
 * Todas las funciones capturan errores y retornan la estructura estándar { data, error }.
 */

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
      .select('*')
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

// =========================================================================
// 2. REUNIONES
// =========================================================================

/**
 * Obtiene todas las reuniones ordenadas por fecha en orden descendente.
 */
export const getReuniones = async () => {
  try {
    const { data, error } = await supabase
      .from('reuniones')
      .select('*')
      .order('fecha', { ascending: false });

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
      .select('*, vecino:vecinos(*)')
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
      .select('*, vecino:vecinos(*)')
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
      .select('*, vecino:vecinos(*)')
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
  
  return 'Otro';
};

/**
 * Normaliza la comuna para ajustarse estrictamente al enum comuna_ba_enum.
 */
export const normalizeComuna = (val) => {
  if (val === null || val === undefined || val.toString().trim() === '') return null;
  const clean = val.toString().trim();
  
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
