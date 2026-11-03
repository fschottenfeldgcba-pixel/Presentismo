/**
 * Motor logístico LNDLM 2026 - Ruteo y agrupación de viandas (Greedy / vecino más cercano).
 * Módulo puro (sin dependencias) para poder testearlo de forma aislada.
 */

export const MAX_VIANDAS_PER_TRIP = 10;

export function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(x => x == null || isNaN(x))) return 99.9;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const round2 = (n) => Math.round(n * 100) / 100;

// ============================================================================
// AUTO-PROPUESTA DE LOGÍSTICA (Nodrizas + flota de motos)
// ============================================================================

export const TRIPS_PER_MOTO = 2.5; // viajes completos promedio por moto en una ventana de 90 min

export const LOGISTICS_MACRO_ZONES = [
  { key: 'CENTRO', label: 'Centro Histórico', comunas: [1, 3] },
  { key: 'NORTE', label: 'Norte', comunas: [2, 13, 14] },
  { key: 'SUR', label: 'Sur', comunas: [4, 8] },
  { key: 'OESTE', label: 'Oeste / Resto', comunas: [5, 6, 7, 9, 10, 11, 12, 15] }
];

/**
 * Motos_Sugeridas = ceil(Total_Viandas_Zona / (10 * 2.5)), mínimo 1.
 */
export function suggestMotosForViandas(totalViandas) {
  return Math.max(1, Math.ceil((Number(totalViandas) || 0) / (MAX_VIANDAS_PER_TRIP * TRIPS_PER_MOTO)));
}

/**
 * Sugiere las Camionetas Nodrizas y la cantidad de motos de cada una.
 *
 * @param spacesData [{ id, name, comuna, neighborhood, lat, lng, viandas }]  viandas = voluntarios asignados al espacio
 * @param options.displayBarrio (neighborhoodKey) => nombre legible para la nomenclatura
 *
 * Solo considera espacios con al menos 1 voluntario asignado. Cada macro-zona ubica su pin
 * en el centro de masa (lat/lng ponderado por viandas) de sus espacios.
 */
export function suggestLogisticsSetup(spacesData = [], { displayBarrio = (b) => b, zones = LOGISTICS_MACRO_ZONES } = {}) {
  const active = (spacesData || []).filter(s =>
    Number(s.viandas) > 0 && s.lat != null && s.lng != null && !isNaN(s.lat) && !isNaN(s.lng)
  );

  const buckets = zones.map(z => ({ zone: z, spaces: [] }));
  active.forEach(s => {
    const idx = zones.findIndex(z => z.comunas.includes(Number(s.comuna)));
    buckets[idx >= 0 ? idx : zones.length - 1].spaces.push(s);
  });

  const result = [];
  buckets.forEach(({ zone, spaces }) => {
    if (spaces.length === 0) return;
    const total = spaces.reduce((a, s) => a + Number(s.viandas), 0);
    const lat = spaces.reduce((a, s) => a + Number(s.lat) * Number(s.viandas), 0) / total;
    const lng = spaces.reduce((a, s) => a + Number(s.lng) * Number(s.viandas), 0) / total;

    // Comuna/barrio donde "cae" el centroide: el espacio más cercano al pin
    let nearest = spaces[0];
    let nearestD = Infinity;
    spaces.forEach(s => {
      const d = haversineKm(lat, lng, s.lat, s.lng);
      if (d < nearestD) { nearestD = d; nearest = s; }
    });

    result.push({
      name: `Nodriza C${nearest.comuna} - ${displayBarrio(nearest.neighborhood) || zone.label}`,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      moto_count: suggestMotosForViandas(total),
      zone_comunas: [...zone.comunas],
      zone_barrios: [],
      total_viandas: total,
      spaces_count: spaces.length,
      zone_label: zone.label
    });
  });
  return result;
}

/**
 * Calcula, por espacio, los datos de despacho a partir de las asignaciones.
 * @param spaces  [{ id, name, address, lat, lng, comuna, neighborhood, contact_name, contact_phone }]
 * @param assignments [{ attendee_id, space_id, status, check_in_time, is_food_receiver }]
 * @param namesByDni { [dni]: 'Nombre Apellido' }
 * @returns { [spaceId]: { assigned, checkedIn, viandas, receiverDni, receiverName } }
 */
export function computeSpaceLogistics(spaces, assignments, namesByDni = {}) {
  const result = {};
  spaces.forEach(s => {
    result[s.id] = { assigned: 0, checkedIn: 0, viandas: 0, receiverDni: null, receiverName: '', firstCheckIn: null };
  });
  assignments.forEach(a => {
    if (a.status !== 'ASIGNADO' || !a.space_id || !result[a.space_id]) return;
    const r = result[a.space_id];
    r.assigned++;
    r.viandas++; // viandas = cupo total asignado al espacio
    if (a.check_in_time) {
      r.checkedIn++;
      const t = new Date(a.check_in_time).getTime();
      if (a.is_food_receiver) r.explicitReceiver = a.attendee_id;
      if (r.firstCheckIn === null || t < r.firstCheckIn) {
        r.firstCheckIn = t;
        r.firstDni = a.attendee_id;
      }
    }
  });
  Object.values(result).forEach(r => {
    r.receiverDni = r.explicitReceiver || r.firstDni || null; // el designado por la app, o el primero en llegar
    r.receiverName = r.receiverDni ? (namesByDni[r.receiverDni] || r.receiverDni) : '';
  });
  return result;
}

/**
 * Genera las rutas de reparto.
 *
 * Reglas:
 *  - Solo se despachan espacios con al menos 1 voluntario con check-in.
 *  - Viandas por espacio = cupo total de voluntarios asignados (hayan llegado o no).
 *  - Cada espacio se asigna a una Nodriza: las que abastecen su comuna/barrio; si ninguna, la más cercana.
 *  - Regla 2 (Excepción de Sedes Masivas > 10 viandas): si un espacio requiere > 10 viandas, se generan viajes
 *    directos y exclusivos de 10 viandas para ese espacio; el remanente (< 10) pasa al pool general.
 *  - Regla 1 (Cierre por exceso / Bulto cerrado): no fraccionar pedidos chicos. Si el acumulado es 7 y el próximo
 *    requiere 4 (7+4=11 > 10), la ruta actual se cierra con 7 viandas y el espacio de 4 pasa COMPLETO como
 *    primer destino de una nueva ruta.
 *  - Las rutas se reparten equitativamente entre las motos del hub (Moto 1 Viaje 1, Moto 2 Viaje 1...).
 *
 * @param excludeSpaceIds Set de espacios ya cubiertos por rutas en tránsito / entregadas.
 * @param deliveredBySpace Mapa { [spaceId]: viandasYaDespachadas }
 */
export function generateDeliveryRoutes({ hubs, spaces, spaceLogistics, excludeSpaceIds = new Set(), deliveredBySpace = {} }) {
  const warnings = [];
  const routes = [];
  const fallbackSpaces = [];

  const validHubs = (hubs || []).filter(h => h.lat != null && h.lng != null);
  if (validHubs.length === 0) {
    return { routes, warnings: ['No hay Camionetas Nodrizas con ubicación configurada.'], fallbackSpaces, routedSpaces: 0 };
  }

  const confirmed = spaces.filter(s => {
    const l = spaceLogistics[s.id];
    const already = deliveredBySpace[s.id] || 0;
    const remainingViandas = (l?.viandas || 0) - already;
    return l && l.checkedIn > 0 && remainingViandas > 0 && !excludeSpaceIds.has(s.id);
  });

  // 1) Asignar cada espacio a una nodriza
  const byHub = {};
  validHubs.forEach(h => { byHub[h.id] = []; });

  confirmed.forEach(s => {
    const zoneHubs = validHubs.filter(h =>
      (h.zone_comunas || []).map(Number).includes(Number(s.comuna)) ||
      (h.zone_barrios || []).includes(s.neighborhood)
    );
    let candidates = zoneHubs;
    if (candidates.length === 0) {
      candidates = validHubs;
      fallbackSpaces.push(s.name);
    }
    let best = candidates[0];
    let bestD = Infinity;
    candidates.forEach(h => {
      const d = haversineKm(h.lat, h.lng, s.lat, s.lng);
      if (d < bestD) { bestD = d; best = h; }
    });
    byHub[best.id].push(s);
  });

  if (fallbackSpaces.length > 0) {
    warnings.push(`${fallbackSpaces.length} espacio(s) sin nodriza de zona asignada: se les asignó la nodriza más cercana.`);
  }

  // 2) Clustering por nodriza con regla de bulto cerrado y excepción de sedes masivas
  validHubs.forEach(hub => {
    const hubRoutes = [];
    const pool = [];

    // Regla 2 - Excepción de Sedes Masivas (>= 10 viandas):
    // Si un único espacio requiere más de la capacidad de una moto (10 viandas),
    // se arman viajes directos y exclusivos de 10 viandas para ese espacio.
    // El remanente (< 10) se envía al pool general para agruparse por cercanía.
    byHub[hub.id].forEach(s => {
      const already = deliveredBySpace[s.id] || 0;
      const totalViandas = Math.max(0, (spaceLogistics[s.id]?.viandas || 0) - already);
      if (totalViandas <= 0) return;

      const fullTrips = Math.floor(totalViandas / MAX_VIANDAS_PER_TRIP);
      const remainder = totalViandas % MAX_VIANDAS_PER_TRIP;
      const l = spaceLogistics[s.id] || {};

      for (let t = 0; t < fullTrips; t++) {
        const d = haversineKm(hub.lat, hub.lng, s.lat, s.lng);
        hubRoutes.push({
          hub_id: hub.id,
          total_viandas: MAX_VIANDAS_PER_TRIP,
          distance_km: round2(d),
          itinerary: [
            {
              space_id: s.id,
              space_name: s.name,
              address: s.address || '',
              viandas: MAX_VIANDAS_PER_TRIP,
              food_receiver: l.receiverName || '',
              food_receiver_dni: l.receiverDni || '',
              distance_from_prev_km: round2(d)
            }
          ]
        });
      }

      if (remainder > 0) {
        pool.push({ space: s, viandas: remainder });
      }
    });

    // Regla 1 - Cierre por exceso (No partir pedidos chicos / bulto cerrado):
    // Si la ruta actual tiene un acumulado de viandas y el próximo espacio más cercano
    // supera la capacidad (ej: 7 + 4 = 11 > 10), NO SE FRACCIONA.
    // La ruta actual se cierra con 7 viandas, y ese espacio de 4 viandas pasa COMPLETO
    // a ser el primer destino de una nueva ruta.
    let current = [];
    let sum = 0;
    let cursor = { lat: hub.lat, lng: hub.lng };

    const closeRoute = () => {
      if (current.length === 0) return;
      let prev = { lat: hub.lat, lng: hub.lng };
      let dist = 0;
      const itinerary = current.map(p => {
        const d = haversineKm(prev.lat, prev.lng, p.space.lat, p.space.lng);
        dist += d;
        prev = p.space;
        const l = spaceLogistics[p.space.id] || {};
        return {
          space_id: p.space.id,
          space_name: p.space.name,
          address: p.space.address || '',
          viandas: p.viandas,
          food_receiver: l.receiverName || '',
          food_receiver_dni: l.receiverDni || '',
          distance_from_prev_km: round2(d)
        };
      });
      hubRoutes.push({
        hub_id: hub.id,
        total_viandas: sum,
        distance_km: round2(dist),
        itinerary
      });
      current = [];
      sum = 0;
      cursor = { lat: hub.lat, lng: hub.lng };
    };

    while (pool.length > 0) {
      let bestIdx = 0;
      let bestD = Infinity;
      pool.forEach((p, i) => {
        const d = haversineKm(cursor.lat, cursor.lng, p.space.lat, p.space.lng);
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
        }
      });

      const next = pool[bestIdx];

      if (sum === 0) {
        // Primera parada de la ruta (siempre cabe porque cada elemento del pool es < 10)
        current.push(next);
        sum = next.viandas;
        cursor = { lat: next.space.lat, lng: next.space.lng };
        pool.splice(bestIdx, 1);
      } else if (sum + next.viandas <= MAX_VIANDAS_PER_TRIP) {
        // Entra completo en la capacidad restante de la moto
        current.push(next);
        sum += next.viandas;
        cursor = { lat: next.space.lat, lng: next.space.lng };
        pool.splice(bestIdx, 1);
      } else {
        // Cierre por exceso:
        // Se cierra la ruta actual con su acumulado y el espacio pasa COMPLETO como primer destino de la nueva ruta
        closeRoute();
        current = [next];
        sum = next.viandas;
        cursor = { lat: next.space.lat, lng: next.space.lng };
        pool.splice(bestIdx, 1);
      }
    }
    closeRoute();

    // 3) Repartir viajes entre las motos del hub
    const motos = Number(hub.moto_count) || 0;
    if (motos === 0 && hubRoutes.length > 0) {
      warnings.push(`La nodriza "${hub.name}" no tiene motos asignadas: sus rutas quedaron sin moto.`);
    }
    hubRoutes.forEach((r, k) => {
      r.moto_number = motos > 0 ? (k % motos) + 1 : null;
      r.trip_number = motos > 0 ? Math.floor(k / motos) + 1 : k + 1;
      routes.push(r);
    });
  });

  return { routes, warnings, fallbackSpaces, routedSpaces: confirmed.length };
}
