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

export const DEFAULT_EQUIPO_CERCANIA = [
  { id: '29cabb27-8c37-4c3a-a967-e4930d4dbe4a', nombre_completo: 'Ana Laura Franchini' },
  { id: '8fa6cbaf-89a5-417b-ae4f-0ac9a9b6a6db', nombre_completo: 'Araceli Arleo' },
  { id: 'cd8733ed-225a-4228-91d5-ec0f264d063f', nombre_completo: 'Federico pereyra' },
  { id: 'a2fac56b-eec9-48d3-9f65-eb9e26255583', nombre_completo: 'Federico Pereyra' },
  { id: '40dfaef7-ed69-4e99-8ff5-a9298de79d4b', nombre_completo: 'Germán Severina' },
  { id: 'c14c372c-5715-44ed-9c44-2243a592a22f', nombre_completo: 'Ibelis Florencia Holzer' },
  { id: 'c45c1ff4-5538-4718-b8fa-88d8ceb88dcb', nombre_completo: 'José Ignacio Pais' },
  { id: '3201d47e-e6c7-4611-992a-c4e00df85f5a', nombre_completo: 'Julian Gonzalez' },
  { id: 'db89054a-0603-430d-a7d4-1943039a963f', nombre_completo: 'Julian Gonzalez Dematine' },
  { id: '9cf32e04-5676-4ee0-a4be-8deabf695c2a', nombre_completo: 'Participación BA' },
  { id: 'f9a8d71e-eff9-4d90-9549-c441d9675221', nombre_completo: 'Ramiro' },
  { id: 'b8937be1-affe-4824-aa4d-1c9cd0d7eaca', nombre_completo: 'Tomas Lamas' }
];

export const DEFAULT_AGENTES_TERRITORIO = [
  { id: '3303553a-24cf-49de-9353-cbab2dfb8e26', nombre_completo: 'Bayo Franco Ezequiel' },
  { id: '5d32fe3e-fe16-4a14-83ca-15454a846411', nombre_completo: 'Borrelli Emanuel' },
  { id: '929d1d80-f7e2-4922-9fad-06f1fdafab1a', nombre_completo: 'Brenda Sarubbi' },
  { id: 'e1c99a36-81c9-4edc-ae2f-26f05467f9a0', nombre_completo: 'Camila Gonzalez' },
  { id: 'ac979583-b359-47aa-86b9-7256fc620733', nombre_completo: 'Carlos Rodríguez' },
  { id: 'd7194093-01f5-4cbc-ae73-a8c7351fd3c4', nombre_completo: 'Caro Matias Ezequiel' },
  { id: '5a859e5a-0fad-4f39-9cb0-2d5d36dfe0ed', nombre_completo: 'Diaz Lucia Macarena' },
  { id: 'a6ddcfd2-989a-4123-8136-a80237575bf6', nombre_completo: 'Equipo Territorio' },
  { id: '777e52c2-0f48-497a-b792-86f9f3d232df', nombre_completo: 'Esteban Martínez' },
  { id: 'c25ca015-e9a4-47a5-8869-f206bae7c576', nombre_completo: 'Franco Ezequiel Bayo' },
  { id: '7e2e7c3b-a24b-495b-8ed9-ce6da0ebd718', nombre_completo: 'Gonzalez Camila Milagros' },
  { id: '853b4d88-2761-48d3-9753-56e1f8e892a6', nombre_completo: 'Javier Alberto Margaruccio' },
  { id: 'a9f469a4-70e9-4c77-857b-bbac5746d655', nombre_completo: 'Lautaro Senin' },
  { id: '3e7b152f-b1da-4c05-9aaa-99107895f57b', nombre_completo: 'Lucas Peralta' },
  { id: '0577c567-95a8-4cb9-96e1-24344ba05116', nombre_completo: 'Lucchetta Antonella Daiana' },
  { id: 'b34381a2-c6cb-4bf7-996e-e7b5fa83dafd', nombre_completo: 'Margaruccio Javier Alberto' },
  { id: '74d7bb74-4697-43b1-a49b-2ef86a771804', nombre_completo: 'Mariela Blanco' },
  { id: '9fabfebf-41a1-46b6-8741-9315b88cdb6b', nombre_completo: 'Martinez Donde Tomas' },
  { id: '4b6a47f2-6bdf-4ef8-93ec-e8bdc89b7cb2', nombre_completo: 'Miriam Benavidez' },
  { id: '65188232-d840-4204-ad0b-053391936ae0', nombre_completo: 'Nicolas Peroni' },
  { id: '1eb165d4-d95f-4bbd-b744-1b817cdcec83', nombre_completo: 'Nicolás Benítez' },
  { id: '8c7cdb67-b79c-45bc-a951-59aac3d52bb4', nombre_completo: 'Ruiz Diaz Brenda' },
  { id: '9405f1cd-bf80-431f-a486-e97212852c6d', nombre_completo: 'Santino Angrisani' },
  { id: 'c13d2cb4-8c42-4cff-9323-15a5f357b30f', nombre_completo: 'Sassani Valentina Sol' },
  { id: 'cc92253c-8b32-4204-ac85-425ed4ac6e1d', nombre_completo: 'Silvia Castiiglio' },
  { id: '5d46a772-21c2-4b41-afb0-c7aae7085e7d', nombre_completo: 'Sofía Gómez' },
  { id: '8a8b8b1d-8167-42fa-83c0-6ad2f8103cb3', nombre_completo: 'Tobar Cao Erick' },
  { id: '227c0bb8-5900-447d-a882-1780169d3765', nombre_completo: 'Valeria Fernández' }
];

/**
 * Obtiene la lista de integrantes del Equipo de Cercanía desde la tabla equipo_cercania.
 */
export const getEquipoCercania = async () => {
  try {
    const { data, error } = await supabase
      .from('equipo_cercania')
      .select('id, nombre_completo, telefono')
      .order('nombre_completo', { ascending: true });

    if (!error && data && data.length > 0) {
      return { data, error: null };
    }
  } catch (err) {
    console.error('Error al consultar equipo_cercania:', err);
  }

  // Resguardo con los integrantes oficiales de la tabla equipo_cercania
  return { data: DEFAULT_EQUIPO_CERCANIA, error: null };
};

/**
 * Obtiene la lista de Agentes de Territorio desde la tabla agentes_territorio.
 */
export const getAgentesTerritorio = async () => {
  try {
    const { data, error } = await supabase
      .from('agentes_territorio')
      .select('id, nombre_completo')
      .order('nombre_completo', { ascending: true });

    if (!error && data && data.length > 0) {
      return { data, error: null };
    }
  } catch (err) {
    console.error('Error al consultar agentes_territorio:', err);
  }

  // Resguardo con los integrantes oficiales de la tabla agentes_territorio
  return { data: DEFAULT_AGENTES_TERRITORIO, error: null };
};

/**
 * Obtiene las reuniones. Por defecto limita a los últimos 180 días para reducir egress.
 * Pasar { historico: true } para obtener todas sin límite de fecha.
 */
export const getReuniones = async ({ historico = false, limit = null, offset = null } = {}) => {
  try {
    let query = supabase
      .from('reuniones')
      .select('id, nombre, fecha, lugar, barrio, comuna, tipo_reunion, tema, funcionario, gestion_presente, clima, semaforo_politico, active_orador_id, sintesis_cualitativa, config_uno_a_uno, hora_inicio_real, hora_fin_real, created_at, funcionarios_acompanantes, responsable_cercania_id, integrantes_asignados, observaciones_preparacion, equipo_cercania(id, nombre_completo, telefono)')
      .order('fecha', { ascending: false });

    if (!historico && limit === null) {
      const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      query = query.gte('fecha', cutoff);
    }

    if (limit !== null) {
      const from = offset || 0;
      const to = from + limit - 1;
      query = query.range(from, to);
    } else if (historico) {
      query = query.range(0, 9999);
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

/**
 * Unifica dos registros de vecinos duplicados (masterDni y duplicateDni),
 * transfiriendo asistencias y oratorios al master, actualizando datos y eliminando el duplicado.
 */
export const unificarVecinos = async (masterDni, duplicateDni, mergedFields = {}) => {
  try {
    // 1. Actualizar el registro maestro con los datos consolidados
    const { error: errUpdateMaster } = await supabase
      .from('vecinos')
      .update(mergedFields)
      .eq('dni', masterDni);
    if (errUpdateMaster) throw errUpdateMaster;

    // 2. Manejar inscripciones_asistencias
    const { data: masterInscs } = await supabase
      .from('inscripciones_asistencias')
      .select('reunion_id, asistio, id')
      .eq('vecino_id', masterDni);

    const { data: dupInscs } = await supabase
      .from('inscripciones_asistencias')
      .select('reunion_id, asistio, id')
      .eq('vecino_id', duplicateDni);

    const masterReunionMap = {};
    (masterInscs || []).forEach(i => { masterReunionMap[i.reunion_id] = i; });

    if (dupInscs && dupInscs.length > 0) {
      for (const dup of dupInscs) {
        const existingMaster = masterReunionMap[dup.reunion_id];
        if (existingMaster) {
          if (dup.asistio && !existingMaster.asistio) {
            await supabase
              .from('inscripciones_asistencias')
              .update({ asistio: true, hora_marcado: new Date().toISOString() })
              .eq('id', existingMaster.id);
          }
          await supabase
            .from('inscripciones_asistencias')
            .delete()
            .eq('id', dup.id);
        } else {
          await supabase
            .from('inscripciones_asistencias')
            .update({ vecino_id: masterDni })
            .eq('id', dup.id);
        }
      }
    }

    // 3. Manejar oradores
    const { data: dupOradores } = await supabase
      .from('oradores')
      .select('id, reunion_id')
      .eq('vecino_id', duplicateDni);

    if (dupOradores && dupOradores.length > 0) {
      for (const o of dupOradores) {
        const { data: masterOrador } = await supabase
          .from('oradores')
          .select('id')
          .eq('reunion_id', o.reunion_id)
          .eq('vecino_id', masterDni)
          .maybeSingle();

        if (masterOrador) {
          await supabase.from('oradores').delete().eq('id', o.id);
        } else {
          await supabase.from('oradores').update({ vecino_id: masterDni }).eq('id', o.id);
        }
      }
    }

    // 4. Eliminar el registro duplicado del padrón central
    if (masterDni !== duplicateDni) {
      await supabase
        .from('vecinos')
        .delete()
        .eq('dni', duplicateDni);
    }

    return { data: { masterDni }, error: null };
  } catch (error) {
    console.error('Error al unificar vecinos:', error);
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
    let allData = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('inscripciones_asistencias')
        .select('id, reunion_id, vecino_id, asistio, estado_convocatoria, horario_bloque_asignado, confirmado, como_se_entero, tema_previo, agente_territorio_id, vecino:vecinos(dni, nombre, apellido, barrio, comuna, celular, email), agente_territorio:agentes_territorio(id, nombre_completo)')
        .eq('reunion_id', reunionId)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      if (data.length < pageSize) break;
      page++;
    }

    return { data: allData, error: null };
  } catch (error) {
    console.error('Error en getAsistentesPorReunion:', error);
    return { data: null, error };
  }
};

/**
 * Realiza altas/actualizaciones masivas de vecinos por lotes (chunking de a 500)
 */
export const bulkUpsertVecinos = async (vecinosList, chunkSize = 500) => {
  try {
    if (!vecinosList || vecinosList.length === 0) return { data: [], error: null };
    
    let allData = [];
    for (let i = 0; i < vecinosList.length; i += chunkSize) {
      const chunk = vecinosList.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from('vecinos')
        .upsert(chunk, { onConflict: 'dni' })
        .select();

      if (error) throw error;
      if (data) allData = allData.concat(data);
    }
    return { data: allData, error: null };
  } catch (error) {
    console.error('Error en bulkUpsertVecinos:', error);
    return { data: null, error };
  }
};

/**
 * Realiza altas/actualizaciones masivas de inscripciones y asistencias por lotes (chunking de a 500)
 */
export const bulkGuardarAsistencias = async (asistenciasList, chunkSize = 500) => {
  try {
    if (!asistenciasList || asistenciasList.length === 0) return { data: [], error: null };
    
    let allData = [];
    for (let i = 0; i < asistenciasList.length; i += chunkSize) {
      const chunk = asistenciasList.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from('inscripciones_asistencias')
        .upsert(chunk, { onConflict: 'reunion_id,vecino_id' })
        .select();

      if (error) throw error;
      if (data) allData = allData.concat(data);
    }
    return { data: allData, error: null };
  } catch (error) {
    console.error('Error en bulkGuardarAsistencias:', error);
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
      .select('id, reunion_id, vecino_id, estado, orden, tema_original, tema_efectivo, tags, duracion_segundos, created_at, vecino:vecinos(dni, nombre, apellido, barrio, comuna, celular, email)')
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
 * Actualiza cualquier propiedad de un registro de orador (estado, tema_original, tema_efectivo, tags, etc.).
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
 * Guarda los tags temáticos de un orador (auto-save al hacer click en un chip).
 * @param {string|number} oradorId – ID del orador
 * @param {string[]} tags – array de labels de tags seleccionados
 */
export const updateOradorTags = async (oradorId, tags) => {
  try {
    const { data, error } = await supabase
      .from('oradores')
      .update({ tags })
      .eq('id', oradorId)
      .select('id, tags')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error en updateOradorTags:', error);
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
      .select('funcionario')
      .not('funcionario', 'is', null)
      .range(0, 9999);

    if (error) throw error;

    // Obtener nombres únicos y filtrar nulos/vacíos, dividiendo por coma o barra
    const setOfFuncs = new Set();
    (data || []).forEach(r => {
      if (!r.funcionario) return;
      const parts = r.funcionario.split(/[,/]/).map(s => s.trim()).filter(Boolean);
      parts.forEach(p => setOfFuncs.add(p));
    });

    const list = [...setOfFuncs].sort((a, b) => a.localeCompare(b));

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
