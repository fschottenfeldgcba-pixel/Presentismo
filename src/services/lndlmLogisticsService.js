import { supabase } from '../lib/supabaseClient.js';
import { generateDeliveryRoutes, computeSpaceLogistics } from './lndlmRouting.js';

/**
 * Servicio de Logística LNDLM 2026 (Fase 2):
 * Nodrizas, rutas, tracking en vivo y API de la WebApp del voluntario.
 */

const CHECKIN_BUCKET = 'lndlm-checkins';

const isMissingTable = (error) =>
  Boolean(error) && (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || /does not exist|schema cache/i.test(error.message || ''));

const isRlsOrMissing = (error) =>
  Boolean(error) && (
    error.code === '42P01' ||
    error.code === '42501' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST202' ||
    /row-level security|permission denied|does not exist|schema cache/i.test(error.message || '')
  );

export const MIGRATION_HINT =
  'Permisos RLS o tablas de Fase 2 pendientes en Supabase. Ejecutá en el SQL Editor el archivo supabase/migrations/20261105_fix_lndlm_rls_policies.sql';

// Helper para sincronizar datos en reuniones.config_uno_a_uno como respaldo resiliente
async function fetchReunionConfigJson(meetingId) {
  if (!meetingId) return {};
  try {
    const { data } = await supabase
      .from('reuniones')
      .select('config_uno_a_uno')
      .eq('id', meetingId)
      .maybeSingle();
    return data?.config_uno_a_uno || {};
  } catch {
    return {};
  }
}

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

// ============================================================================
// NODRIZAS (HUBS)
// ============================================================================

export async function getLogisticHubs(meetingId) {
  let dbHubs = null;
  let dbErr = null;
  try {
    const { data, error } = await supabase
      .from('lndlm_logistic_hubs')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true });
    if (!error) dbHubs = data;
    else dbErr = error;
  } catch (err) {
    dbErr = err;
  }

  if (Array.isArray(dbHubs) && dbHubs.length > 0) {
    return { data: dbHubs, error: null };
  }

  // Fallback transparente a config_uno_a_uno si la tabla falla o está vacía
  try {
    const cfg = await fetchReunionConfigJson(meetingId);
    const fallbackHubs = cfg?.lndlm_data?.hubs || [];
    if (fallbackHubs.length > 0) {
      return { data: fallbackHubs, error: null };
    }
  } catch {}

  if (dbErr && !isRlsOrMissing(dbErr)) {
    return { data: [], error: dbErr, missing: isMissingTable(dbErr) };
  }
  return { data: dbHubs || [], error: null };
}

export async function saveLogisticHub(meetingId, hub) {
  const hubId = hub.id || ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `hub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const payload = {
    id: hubId,
    meeting_id: meetingId,
    name: String(hub.name || '').trim() || 'Nodriza',
    lat: hub.lat === '' || hub.lat == null ? null : Number(hub.lat),
    lng: hub.lng === '' || hub.lng == null ? null : Number(hub.lng),
    moto_count: Math.max(0, parseInt(hub.moto_count, 10) || 0),
    zone_comunas: (hub.zone_comunas || []).map(Number),
    zone_barrios: hub.zone_barrios || [],
    updated_at: new Date().toISOString()
  };

  let dbResult = null;
  let dbError = null;

  try {
    if (hub.id) {
      const { data, error } = await supabase.from('lndlm_logistic_hubs').update(payload).eq('id', hub.id).select().single();
      dbResult = data;
      dbError = error;
    } else {
      const { data, error } = await supabase.from('lndlm_logistic_hubs').insert(payload).select().single();
      dbResult = data;
      dbError = error;
    }
  } catch (err) {
    dbError = err;
  }

  // Sincronizar en config_uno_a_uno como resguardo persistente
  try {
    const cfg = await fetchReunionConfigJson(meetingId);
    const existingHubs = (cfg?.lndlm_data?.hubs || []).filter(h => h.id !== hubId);
    await saveToReunionConfigJson(meetingId, { hubs: [...existingHubs, payload] });
  } catch (e) {
    console.warn('Aviso sincronizando hubs en config_uno_a_uno:', e);
  }

  // Si falló en la tabla por RLS o falta de tabla pero se guardó en config_uno_a_uno, devolver éxito
  if (dbError && isRlsOrMissing(dbError)) {
    return { data: payload, error: null, fallbackUsed: true };
  }

  return { data: dbResult, error: dbError };
}

export async function saveAllLogisticHubs(meetingId, hubs = []) {
  const normalizedHubs = hubs.map(h => ({
    id: h.id && !h.id.startsWith('prop_') ? h.id : ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `hub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
    meeting_id: meetingId,
    name: String(h.name || '').trim() || 'Nodriza',
    lat: h.lat === '' || h.lat == null ? null : Number(h.lat),
    lng: h.lng === '' || h.lng == null ? null : Number(h.lng),
    moto_count: Math.max(0, parseInt(h.moto_count, 10) || 0),
    zone_comunas: (h.zone_comunas || []).map(Number),
    zone_barrios: h.zone_barrios || [],
    updated_at: new Date().toISOString()
  }));

  let dbError = null;
  try {
    await supabase.from('lndlm_logistic_hubs').delete().eq('meeting_id', meetingId);
    const { error: insErr } = await supabase.from('lndlm_logistic_hubs').insert(normalizedHubs);
    if (insErr) dbError = insErr;
  } catch (err) {
    dbError = err;
  }

  // Sincronizar en config_uno_a_uno
  try {
    await saveToReunionConfigJson(meetingId, { hubs: normalizedHubs });
  } catch (e) {
    console.warn('Aviso guardando hubs en config_uno_a_uno:', e);
  }

  if (dbError && isRlsOrMissing(dbError)) {
    return { data: normalizedHubs, error: null, fallbackUsed: true };
  }

  return { data: normalizedHubs, error: dbError };
}

export async function deleteLogisticHub(meetingIdOrHubId, optionalHubId) {
  const hubId = optionalHubId || meetingIdOrHubId;
  const meetingId = optionalHubId ? meetingIdOrHubId : null;

  try {
    await supabase.from('lndlm_logistic_hubs').delete().eq('id', hubId);
  } catch {}

  if (meetingId) {
    try {
      const cfg = await fetchReunionConfigJson(meetingId);
      const updatedHubs = (cfg?.lndlm_data?.hubs || []).filter(h => h.id !== hubId);
      await saveToReunionConfigJson(meetingId, { hubs: updatedHubs });
    } catch {}
  }
  return { error: null };
}

// ============================================================================
// RUTAS DE REPARTO
// ============================================================================

export async function getDeliveryRoutes(meetingId) {
  let dbRoutes = null;
  let dbErr = null;
  try {
    const { data, error } = await supabase
      .from('lndlm_delivery_routes')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true });
    if (!error) dbRoutes = data;
    else dbErr = error;
  } catch (err) {
    dbErr = err;
  }

  if (Array.isArray(dbRoutes) && dbRoutes.length > 0) {
    return { data: dbRoutes, error: null };
  }

  // Fallback a config_uno_a_uno
  try {
    const cfg = await fetchReunionConfigJson(meetingId);
    const fallbackRoutes = cfg?.lndlm_data?.routes || [];
    if (fallbackRoutes.length > 0) {
      return { data: fallbackRoutes, error: null };
    }
  } catch {}

  if (dbErr && !isRlsOrMissing(dbErr)) {
    return { data: [], error: dbErr, missing: isMissingTable(dbErr) };
  }
  return { data: dbRoutes || [], error: null };
}

export async function setRouteStatus(routeId, status) {
  const now = new Date().toISOString();
  const patch = { status, updated_at: now };
  if (status === 'IN_TRANSIT') { patch.dispatched_at = now; patch.delivered_at = null; }
  if (status === 'DELIVERED') { patch.delivered_at = now; }
  if (status === 'PENDING') { patch.dispatched_at = null; patch.delivered_at = null; }
  return await supabase.from('lndlm_delivery_routes').update(patch).eq('id', routeId);
}

/**
 * Check-ins / recepciones en vivo (campos de lndlm_assignments).
 */
export async function getLiveAssignments(meetingId) {
  const { data, error } = await supabase
    .from('lndlm_assignments')
    .select('attendee_id, space_id, status, check_in_time, check_in_photo_url, is_food_receiver, food_received_time')
    .eq('meeting_id', meetingId)
    .limit(5000);
  if (error) return { data: [], error, missing: isMissingTable(error) || /check_in_time|column/i.test(error.message || '') };
  return { data: data || [], error: null };
}

/**
 * Genera las rutas respetando las que ya salieron (IN_TRANSIT / DELIVERED):
 * solo reemplaza las PENDING y solo rutea los espacios aún no cubiertos.
 */
export async function generateAndSaveRoutes({ meetingId, hubs, spaces, assignments, namesByDni, existingRoutes }) {
  const spaceLogistics = computeSpaceLogistics(spaces, assignments, namesByDni);

  const keptRoutes = (existingRoutes || []).filter(r => r.status !== 'PENDING');
  const deliveredBySpace = {};
  keptRoutes.forEach(r => (r.itinerary || []).forEach(stop => {
    deliveredBySpace[stop.space_id] = (deliveredBySpace[stop.space_id] || 0) + (stop.viandas || 0);
  }));
  const excludeSpaceIds = new Set();
  spaces.forEach(s => {
    const needed = spaceLogistics[s.id]?.viandas || 0;
    const delivered = deliveredBySpace[s.id] || 0;
    if (delivered >= needed && needed > 0) {
      excludeSpaceIds.add(s.id);
    }
  });

  const result = generateDeliveryRoutes({ hubs, spaces, spaceLogistics, excludeSpaceIds, deliveredBySpace });

  // Borrar rutas pendientes anteriores y guardar las nuevas
  try {
    await supabase.from('lndlm_delivery_routes').delete().eq('meeting_id', meetingId).eq('status', 'PENDING');
  } catch {}

  let insErr = null;
  if (result.routes.length > 0) {
    const rows = result.routes.map(r => ({
      meeting_id: meetingId,
      hub_id: r.hub_id,
      moto_number: r.moto_number,
      trip_number: r.trip_number,
      status: 'PENDING',
      total_viandas: r.total_viandas,
      distance_km: r.distance_km,
      itinerary: r.itinerary
    }));
    try {
      const ins = await supabase.from('lndlm_delivery_routes').insert(rows);
      if (ins.error) insErr = ins.error;
    } catch (e) {
      insErr = e;
    }
  }

  // Resguardo en config_uno_a_uno
  try {
    await saveToReunionConfigJson(meetingId, { routes: result.routes });
  } catch {}

  if (insErr && !isRlsOrMissing(insErr)) {
    return { ...result, error: insErr };
  }

  return { ...result, keptRoutes: keptRoutes.length, error: null };
}

// ============================================================================
// API DE LA WEBAPP DEL VOLUNTARIO (RPC con DNI)
// ============================================================================

/**
 * Genera variantes representativas de un DNI (con y sin puntos, sin ceros iniciales)
 * para garantizar compatibilidad con cualquier formato almacenado en Supabase.
 */
function getDniVariants(rawDni) {
  const clean = String(rawDni || '').replace(/\D/g, '').trim();
  if (!clean) return [];
  const dotted = clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const noZeros = clean.replace(/^0+/, '');
  const variants = [clean, dotted, noZeros, String(rawDni || '').trim()].filter(Boolean);
  return Array.from(new Set(variants));
}

export async function lookupVolunteer(dni) {
  const cleanDni = String(dni || '').replace(/\D/g, '').trim();
  if (!cleanDni) {
    console.warn('[LNDLM Lookup] DNI vacío recibido.');
    return { data: { ok: false, error: 'NO_ATTENDANCE' }, error: null };
  }

  const dniVariants = getDniVariants(cleanDni);
  console.log('[LNDLM Lookup] 🔎 Validando DNI:', cleanDni, '| Variantes de búsqueda:', dniVariants);

  // 1. Intentar primero con la RPC nativa de Postgres
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('lndlm_volunteer_lookup', { p_dni: cleanDni });
    console.log('[LNDLM Lookup] 1. RPC lndlm_volunteer_lookup:', { rpcData, rpcErr });
    if (!rpcErr && rpcData?.ok && rpcData?.assigned) {
      console.log('[LNDLM Lookup] ✅ Acceso validado vía RPC Postgres.');
      return { data: rpcData, error: null };
    }
  } catch (rpcCatch) {
    console.warn('[LNDLM Lookup] 1. RPC falló o no existe, pasando a fallback directo:', rpcCatch);
  }

  // 2. Fallback resiliente multi-origen con consultas DIRECTAS y filtradas a Supabase
  try {
    const [assigRes, volRes, inasRes, vecRes] = await Promise.all([
      // A. lndlm_assignments: ¿Tiene museo asignado activamente?
      supabase
        .from('lndlm_assignments')
        .select('*')
        .in('attendee_id', dniVariants),

      // B. lndlm_volunteers: ¿Está registrado en la nómina LNDLM?
      supabase
        .from('lndlm_volunteers')
        .select('*')
        .in('dni', dniVariants),

      // C. inscripciones_asistencias: ¿Tiene presente marcado en la capacitación?
      supabase
        .from('inscripciones_asistencias')
        .select('*, reunion:reuniones(*), vecino:vecinos(*)')
        .in('vecino_id', dniVariants),

      // D. vecinos: Padrón unificado
      supabase
        .from('vecinos')
        .select('*')
        .in('dni', dniVariants)
    ]);

    console.log('[LNDLM Lookup] 2. Resultados crudos de Supabase:', {
      assignments: assigRes.data,
      assignmentsError: assigRes.error,
      volunteers: volRes.data,
      volunteersError: volRes.error,
      inscripciones: inasRes.data,
      inscripcionesError: inasRes.error,
      vecinos: vecRes.data,
      vecinosError: vecRes.error
    });

    // Identificar registros coincidentes
    const dbAssig = (assigRes.data || []).find(a => a.status === 'ASIGNADO' && a.space_id) || (assigRes.data || [])[0] || null;
    const volRow = (volRes.data || [])[0] || null;
    const inasRow = (inasRes.data || []).find(i => Boolean(i.asistio)) || (inasRes.data || [])[0] || null;
    const vecRow = (vecRes.data || [])[0] || inasRow?.vecino || null;

    // Respaldo en config_uno_a_uno de reuniones si la asignación está guardada en el JSON
    let cfgAssig = null;
    let cfgSpace = null;
    let cfgReunion = inasRow?.reunion || null;

    if (!dbAssig?.space_id) {
      try {
        const { data: reuniones } = await supabase
          .from('reuniones')
          .select('id, nombre, config_uno_a_uno')
          .or('is_lndlm_event.eq.true,nombre.ilike.%NDLM%,nombre.ilike.%Museos%,nombre.ilike.%Capacitaci%')
          .order('created_at', { ascending: false })
          .limit(6);

        for (const r of (reuniones || [])) {
          const lndlmData = r.config_uno_a_uno?.lndlm_data;
          if (lndlmData?.assignments?.[cleanDni]) {
            cfgAssig = lndlmData.assignments[cleanDni];
            cfgReunion = r;
            if (cfgAssig.space_id && Array.isArray(lndlmData.spaces)) {
              cfgSpace = lndlmData.spaces.find(s => s.id === cfgAssig.space_id);
            }
            break;
          }
        }
      } catch (cfgErr) {
        console.warn('[LNDLM Lookup] Error leyendo config_uno_a_uno:', cfgErr);
      }
    }

    // 3. Validación de Asistencia confirmada a la capacitación:
    // Habilitado si:
    // a) Está en inscripciones_asistencias con asistio = true
    // b) O tiene attended_training = true en lndlm_volunteers
    // c) O ya está ASIGNADO a un museo en lndlm_assignments (en el Tablero LNDLM)
    // d) O tiene asignación activa en config_uno_a_uno
    const hasAttended = Boolean(
      inasRow?.asistio ||
      volRow?.attended_training ||
      (dbAssig && dbAssig.status === 'ASIGNADO' && dbAssig.space_id) ||
      (cfgAssig && cfgAssig.status === 'ASIGNADO' && cfgAssig.space_id)
    );

    console.log('[LNDLM Lookup] 3. Evaluación de Asistencia:', {
      hasAttended,
      inasAsistio: inasRow?.asistio,
      volAttendedTraining: volRow?.attended_training,
      hasDbAssigSpace: Boolean(dbAssig && dbAssig.status === 'ASIGNADO' && dbAssig.space_id),
      hasCfgAssigSpace: Boolean(cfgAssig && cfgAssig.status === 'ASIGNADO' && cfgAssig.space_id)
    });

    if (!hasAttended) {
      console.warn('[LNDLM Lookup] ❌ DNI no registra asistencia a capacitación.');
      return { data: { ok: false, error: 'NO_ATTENDANCE' }, error: null };
    }

    const meetingId = dbAssig?.meeting_id || volRow?.meeting_id || inasRow?.reunion_id || cfgReunion?.id || null;
    const firstName = volRow?.first_name || vecRow?.nombre || inasRow?.vecino?.nombre || 'Voluntario';
    const lastName = volRow?.last_name || vecRow?.apellido || inasRow?.vecino?.apellido || '';

    // 4. Buscar asignación activa de sede
    const spaceId = (dbAssig?.status === 'ASIGNADO' ? dbAssig.space_id : null) ||
                    (volRow?.status === 'ASIGNADO' ? volRow.assigned_space_id : null) ||
                    (cfgAssig?.status === 'ASIGNADO' ? cfgAssig.space_id : null);

    const isAssigned = Boolean(spaceId);

    // Si aún no tiene sede asignada (está en banco de suplentes)
    if (!isAssigned) {
      console.log('[LNDLM Lookup] ℹ️ Voluntario confirmado sin espacio asignado (SUPLENTE).');
      return {
        data: {
          ok: true,
          assigned: false,
          volunteer: {
            first_name: firstName,
            last_name: lastName,
            dni: cleanDni
          }
        },
        error: null
      };
    }

    // 5. Cargar datos del Espacio Cultural (de tabla o config)
    let space = cfgSpace || null;
    if (!space && spaceId) {
      try {
        const { data: spRow } = await supabase
          .from('lndlm_cultural_spaces')
          .select('*')
          .eq('id', spaceId)
          .maybeSingle();
        if (spRow) space = spRow;
      } catch (spErr) {
        console.warn('[LNDLM Lookup] Error cargando espacio:', spErr);
      }
    }

    // 6. Estado de la ruta de entrega si existe
    let routeStatus = null;
    if (meetingId && spaceId) {
      try {
        const { data: routes } = await supabase
          .from('lndlm_delivery_routes')
          .select('status, itinerary')
          .eq('meeting_id', meetingId);
        const matched = (routes || []).find(r =>
          (r.itinerary || []).some(stop => stop.space_id === spaceId)
        );
        if (matched) routeStatus = matched.status;
      } catch {}
    }

    let teamAssigned = 1;
    let teamCheckedIn = dbAssig?.check_in_time ? 1 : 0;
    let receiverName = dbAssig?.is_food_receiver ? `${firstName} ${lastName}`.trim() : '';

    try {
      const { data: teamRows } = await supabase
        .from('lndlm_assignments')
        .select('attendee_id, check_in_time, is_food_receiver')
        .eq('space_id', spaceId)
        .eq('status', 'ASIGNADO');

      if (teamRows && teamRows.length > 0) {
        teamAssigned = teamRows.length;
        teamCheckedIn = teamRows.filter(r => r.check_in_time).length;
        const receiver = teamRows.find(r => r.is_food_receiver);
        if (receiver && dniVariants.includes(receiver.attendee_id)) {
          receiverName = `${firstName} ${lastName}`.trim();
        }
      }
    } catch {}

    const finalResult = {
      ok: true,
      assigned: true,
      volunteer: {
        first_name: firstName,
        last_name: lastName,
        dni: cleanDni
      },
      space: {
        id: space?.id || spaceId,
        name: space?.name || 'Espacio Cultural',
        address: space?.address || '',
        contact_name: space?.contact_name || '',
        contact_phone: space?.contact_phone || ''
      },
      checkin: {
        check_in_time: dbAssig?.check_in_time || null,
        is_food_receiver: Boolean(dbAssig?.is_food_receiver),
        food_received_time: dbAssig?.food_received_time || null
      },
      route_status: routeStatus,
      team: {
        assigned: teamAssigned,
        checked_in: teamCheckedIn,
        receiver_name: receiverName
      }
    };

    console.log('[LNDLM Lookup] 🎉 Login validado con éxito:', finalResult);
    return { data: finalResult, error: null };
  } catch (err) {
    console.error('[LNDLM Lookup] 💥 Error en lookupVolunteer fallback:', err);
    return { data: null, error: err };
  }
}

/**
 * Comprime la foto en el celular (máx 1280px, JPEG 0.75) para subir rápido con datos móviles.
 */
export async function compressImage(file, maxSize = 1280, quality = 0.75) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob || file;
  } catch {
    return file; // si el navegador no soporta la compresión, sube el original
  }
}

export async function uploadCheckinPhoto(file, dni) {
  const blob = await compressImage(file);
  const cleanDni = String(dni || 'sin_dni').replace(/\D/g, '') || 'sin_dni';
  const path = `${cleanDni}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(CHECKIN_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false
  });
  if (error) return { url: null, error };
  const { data } = supabase.storage.from(CHECKIN_BUCKET).getPublicUrl(path);
  return { url: data?.publicUrl || null, error: null };
}

export async function volunteerCheckin(dni, photoUrl) {
  const cleanDni = String(dni || '').replace(/\D/g, '').trim();
  const dniVariants = getDniVariants(cleanDni);
  try {
    const { data, error } = await supabase.rpc('lndlm_checkin', { p_dni: cleanDni, p_photo_url: photoUrl });
    if (!error && data?.ok) return { data, error: null };
  } catch {}

  // Fallback si la RPC no existe o falla por RLS
  try {
    const now = new Date().toISOString();
    const { data: assigRows } = await supabase
      .from('lndlm_assignments')
      .select('*')
      .in('attendee_id', dniVariants)
      .eq('status', 'ASIGNADO');

    const assig = (assigRows || [])[0];

    if (!assig) return { data: { ok: false, error: 'NOT_ASSIGNED' }, error: null };

    if (assig.check_in_time) {
      return await lookupVolunteer(cleanDni);
    }

    const { count: receiversCount } = await supabase
      .from('lndlm_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('meeting_id', assig.meeting_id)
      .eq('space_id', assig.space_id)
      .eq('is_food_receiver', true);

    const isFirst = (receiversCount || 0) === 0;

    await supabase
      .from('lndlm_assignments')
      .update({
        check_in_time: now,
        check_in_photo_url: photoUrl,
        is_food_receiver: isFirst,
        updated_at: now
      })
      .eq('id', assig.id);

    return await lookupVolunteer(cleanDni);
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function volunteerConfirmFood(dni) {
  const cleanDni = String(dni || '').replace(/\D/g, '').trim();
  const dniVariants = getDniVariants(cleanDni);
  try {
    const { data, error } = await supabase.rpc('lndlm_confirm_food', { p_dni: cleanDni });
    if (!error && data?.ok) return { data, error: null };
  } catch {}

  try {
    const now = new Date().toISOString();
    const { data: assigRows } = await supabase
      .from('lndlm_assignments')
      .select('*')
      .in('attendee_id', dniVariants)
      .eq('status', 'ASIGNADO');

    const assig = (assigRows || [])[0];

    if (!assig) return { data: { ok: false, error: 'NOT_ASSIGNED' }, error: null };
    if (!assig.check_in_time) return { data: { ok: false, error: 'NOT_CHECKED_IN' }, error: null };
    if (!assig.is_food_receiver) return { data: { ok: false, error: 'NOT_RECEIVER' }, error: null };

    await supabase
      .from('lndlm_assignments')
      .update({
        food_received_time: now,
        updated_at: now
      })
      .eq('id', assig.id);

    return await lookupVolunteer(cleanDni);
  } catch (err) {
    return { data: null, error: err };
  }
}
