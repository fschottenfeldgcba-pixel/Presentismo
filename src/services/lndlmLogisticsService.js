import { supabase } from '../lib/supabaseClient.js';
import { generateDeliveryRoutes, computeSpaceLogistics } from './lndlmRouting.js';

/**
 * Servicio de Logística LNDLM 2026 (Fase 2):
 * Nodrizas, rutas, tracking en vivo y API de la WebApp del voluntario.
 */

const CHECKIN_BUCKET = 'lndlm-checkins';

const isMissingTable = (error) =>
  Boolean(error) && (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || /does not exist|schema cache/i.test(error.message || ''));

export const MIGRATION_HINT =
  'Faltan tablas/funciones de la Fase 2 en Supabase. Ejecutá en el SQL Editor el archivo supabase/migrations/20261102_lndlm_phase2_logistics.sql';

// ============================================================================
// NODRIZAS (HUBS)
// ============================================================================

export async function getLogisticHubs(meetingId) {
  const { data, error } = await supabase
    .from('lndlm_logistic_hubs')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: true });
  if (error) return { data: [], error, missing: isMissingTable(error) };
  return { data: data || [], error: null };
}

export async function saveLogisticHub(meetingId, hub) {
  const payload = {
    meeting_id: meetingId,
    name: String(hub.name || '').trim() || 'Nodriza',
    lat: hub.lat === '' || hub.lat == null ? null : Number(hub.lat),
    lng: hub.lng === '' || hub.lng == null ? null : Number(hub.lng),
    moto_count: Math.max(0, parseInt(hub.moto_count, 10) || 0),
    zone_comunas: (hub.zone_comunas || []).map(Number),
    zone_barrios: hub.zone_barrios || [],
    updated_at: new Date().toISOString()
  };
  if (hub.id) {
    const { data, error } = await supabase.from('lndlm_logistic_hubs').update(payload).eq('id', hub.id).select().single();
    return { data, error };
  }
  const { data, error } = await supabase.from('lndlm_logistic_hubs').insert(payload).select().single();
  return { data, error };
}

export async function deleteLogisticHub(hubId) {
  return await supabase.from('lndlm_logistic_hubs').delete().eq('id', hubId);
}

// ============================================================================
// RUTAS DE REPARTO
// ============================================================================

export async function getDeliveryRoutes(meetingId) {
  const { data, error } = await supabase
    .from('lndlm_delivery_routes')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: true });
  if (error) return { data: [], error, missing: isMissingTable(error) };
  return { data: data || [], error: null };
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
  const del = await supabase.from('lndlm_delivery_routes').delete().eq('meeting_id', meetingId).eq('status', 'PENDING');
  if (del.error) return { ...result, error: del.error, missing: isMissingTable(del.error) };

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
    const ins = await supabase.from('lndlm_delivery_routes').insert(rows);
    if (ins.error) return { ...result, error: ins.error };
  }

  return { ...result, keptRoutes: keptRoutes.length, error: null };
}

// ============================================================================
// API DE LA WEBAPP DEL VOLUNTARIO (RPC con DNI)
// ============================================================================

export async function lookupVolunteer(dni) {
  const cleanDni = String(dni || '').replace(/\D/g, '');
  if (!cleanDni) {
    return { data: { ok: false, error: 'NO_ATTENDANCE' }, error: null };
  }

  // 1. Intentar primero con la RPC nativa de Postgres
  try {
    const { data, error } = await supabase.rpc('lndlm_volunteer_lookup', { p_dni: cleanDni });
    if (!error && data?.ok) {
      return { data, error: null };
    }
  } catch {
    // Continuar al fallback
  }

  // 2. Fallback resiliente: verificar asistencia en inscripciones_asistencias + vecinos de la reunión NDLM
  try {
    const { data: inas, error: inasErr } = await supabase
      .from('inscripciones_asistencias')
      .select('*, reunion:reuniones(*), vecino:vecinos(*)')
      .eq('vecino_id', cleanDni)
      .eq('asistio', true);

    if (inasErr) return { data: null, error: inasErr, missing: isMissingTable(inasErr) };

    const lndlmInas = (inas || []).find(i =>
      i.reunion?.is_lndlm_event ||
      /NDLM|Museos|LNDLM|Voluntariados.*Capacitaci/i.test(i.reunion?.nombre || '')
    );

    // Si no asistió a la capacitación
    if (!lndlmInas) {
      return { data: { ok: false, error: 'NO_ATTENDANCE' }, error: null };
    }

    const meetingId = lndlmInas.reunion_id;
    const vecino = lndlmInas.vecino || {};
    const reunion = lndlmInas.reunion || {};
    const cfg = reunion.config_uno_a_uno?.lndlm_data || {};

    // 3. Buscar asignación activa en lndlm_assignments o en config_uno_a_uno
    let dbAssig = null;
    try {
      const { data: assigRow } = await supabase
        .from('lndlm_assignments')
        .select('*')
        .eq('meeting_id', meetingId)
        .eq('attendee_id', cleanDni)
        .maybeSingle();
      if (assigRow) dbAssig = assigRow;
    } catch {}

    const confAssig = cfg.assignments?.[cleanDni];
    const spaceId = dbAssig?.space_id || (confAssig?.status === 'ASIGNADO' ? confAssig.space_id : null);
    const isAssigned = (dbAssig?.status === 'ASIGNADO' || confAssig?.status === 'ASIGNADO') && Boolean(spaceId);

    // Si aún no tiene sede asignada
    if (!isAssigned) {
      return {
        data: {
          ok: true,
          assigned: false,
          volunteer: {
            first_name: vecino.nombre || 'Voluntario',
            last_name: vecino.apellido || '',
            dni: cleanDni
          }
        },
        error: null
      };
    }

    // 4. Cargar datos del Espacio Cultural (de tabla o config)
    let space = null;
    try {
      const { data: spRow } = await supabase
        .from('lndlm_cultural_spaces')
        .select('*')
        .eq('id', spaceId)
        .maybeSingle();
      if (spRow) space = spRow;
    } catch {}

    if (!space && Array.isArray(cfg.spaces)) {
      space = cfg.spaces.find(s => s.id === spaceId);
    }

    // 5. Estado de la ruta de entrega si existe
    let routeStatus = null;
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

    return {
      data: {
        ok: true,
        assigned: true,
        volunteer: {
          first_name: vecino.nombre || 'Voluntario',
          last_name: vecino.apellido || '',
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
          assigned: 1,
          checked_in: dbAssig?.check_in_time ? 1 : 0,
          receiver_name: dbAssig?.is_food_receiver ? `${vecino.nombre || ''} ${vecino.apellido || ''}`.trim() : ''
        }
      },
      error: null
    };
  } catch (err) {
    console.error('Error en lookupVolunteer fallback:', err);
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
  const cleanDni = String(dni || '').replace(/\D/g, '');
  try {
    const { data, error } = await supabase.rpc('lndlm_checkin', { p_dni: cleanDni, p_photo_url: photoUrl });
    if (!error && data?.ok) return { data, error: null };
  } catch {}

  // Fallback si la RPC no existe o falla por RLS
  try {
    const now = new Date().toISOString();
    const { data: assig } = await supabase
      .from('lndlm_assignments')
      .select('*')
      .eq('attendee_id', cleanDni)
      .eq('status', 'ASIGNADO')
      .maybeSingle();

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
  const cleanDni = String(dni || '').replace(/\D/g, '');
  try {
    const { data, error } = await supabase.rpc('lndlm_confirm_food', { p_dni: cleanDni });
    if (!error && data?.ok) return { data, error: null };
  } catch {}

  try {
    const now = new Date().toISOString();
    const { data: assig } = await supabase
      .from('lndlm_assignments')
      .select('*')
      .eq('attendee_id', cleanDni)
      .eq('status', 'ASIGNADO')
      .maybeSingle();

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
