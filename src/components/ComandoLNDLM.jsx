import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ArrowLeft, Plus, Trash2, Save, RefreshCw, Copy, ExternalLink, MapPin, Users, Navigation, CheckCircle2
} from 'lucide-react';
import LndlmMap from './LndlmMap';
import { loadLndlmMeetingData, BARRIOS_CABA_DATA } from '../services/lndlmService';
import { computeSpaceLogistics, MAX_VIANDAS_PER_TRIP, suggestLogisticsSetup, suggestMotosForViandas, TRIPS_PER_MOTO } from '../services/lndlmRouting';
import {
  getLogisticHubs, saveLogisticHub, saveAllLogisticHubs, deleteLogisticHub,
  getDeliveryRoutes, setRouteStatus, getLiveAssignments, generateAndSaveRoutes,
  MIGRATION_HINT
} from '../services/lndlmLogisticsService';

const HUB_COLORS = ['#0F172A', '#7C3AED', '#0891B2', '#BE185D', '#4D7C0F', '#C2410C'];
const STATE_META = {
  EMPTY: { color: '#94A3B8', label: 'Sin voluntarios presentes' },
  WAITING: { color: '#EF4444', label: 'Con check-in, esperando vianda' },
  IN_TRANSIT: { color: '#F59E0B', label: 'Vianda en ruta' },
  DELIVERED: { color: '#10B981', label: 'Viandas recibidas' }
};
const ROUTE_STATUS_META = {
  PENDING: { label: 'Pendiente', bg: '#F1F5F9', color: '#475569' },
  IN_TRANSIT: { label: 'Despachada', bg: '#FEF3C7', color: '#92400E' },
  DELIVERED: { label: 'Entregada', bg: '#D1FAE5', color: '#065F46' }
};
const SORTED_BARRIOS = Object.keys(BARRIOS_CABA_DATA).sort((a, b) => a.localeCompare(b));
const STATUS_RANK = { PENDING: 1, IN_TRANSIT: 2, DELIVERED: 3 };

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default function ComandoLNDLM({ reunion, onBack }) {
  const meetingId = reunion?.id;

  const [spaces, setSpaces] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missingMigration, setMissingMigration] = useState(false);
  const [tab, setTab] = useState('live'); // 'live' | 'setup'
  const [toast, setToast] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [hubDraft, setHubDraft] = useState(null);
  const [barrioToAdd, setBarrioToAdd] = useState('');
  const [proposedHubs, setProposedHubs] = useState(null); // auto-propuesta pendiente de guardar
  const [savingProposal, setSavingProposal] = useState(false);
  const promotedRef = useRef(new Set());

  const showToast = (text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(prev => (prev?.text === text ? null : prev)), 8000);
  };

  // Datos "pesados" (se cargan una vez): espacios y nombres de voluntarios
  const loadStatic = useCallback(async () => {
    if (!meetingId) return;
    const { volunteers: vols, spaces: sps } = await loadLndlmMeetingData(meetingId);
    setVolunteers(vols || []);
    setSpaces(sps || []);
  }, [meetingId]);

  // Datos "livianos" (polling): nodrizas, rutas y check-ins
  const refreshLive = useCallback(async () => {
    if (!meetingId) return;
    const [h, r, a] = await Promise.all([getLogisticHubs(meetingId), getDeliveryRoutes(meetingId), getLiveAssignments(meetingId)]);
    setMissingMigration(Boolean(h.missing || r.missing || a.missing));
    if (!h.error) setHubs(h.data);
    if (!r.error) setRoutes(r.data);
    if (!a.error) setAssignments(a.data);
    setLastUpdate(new Date());
  }, [meetingId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadStatic(), refreshLive()]);
      setLoading(false);
    })();
  }, [loadStatic, refreshLive]);

  useEffect(() => {
    const t = setInterval(refreshLive, 10000);
    return () => clearInterval(t);
  }, [refreshLive]);

  // ---------------------------------------------------------------------------
  // DERIVADOS
  // ---------------------------------------------------------------------------
  const namesByDni = useMemo(() => {
    const m = {};
    volunteers.forEach(v => { m[v.dni] = `${v.first_name} ${v.last_name}`.trim(); });
    return m;
  }, [volunteers]);

  const spaceLogistics = useMemo(() => computeSpaceLogistics(spaces, assignments, namesByDni), [spaces, assignments, namesByDni]);

  const foodReceivedBySpace = useMemo(() => {
    const m = {};
    assignments.forEach(a => {
      if (a.status === 'ASIGNADO' && a.space_id && a.food_received_time) m[a.space_id] = a.food_received_time;
    });
    return m;
  }, [assignments]);

  // Mejor estado de ruta por espacio (Entregada > Despachada > Pendiente)
  const routeStatusBySpace = useMemo(() => {
    const m = {};
    routes.forEach(r => (r.itinerary || []).forEach(stop => {
      if (!m[stop.space_id] || STATUS_RANK[r.status] > STATUS_RANK[m[stop.space_id]]) m[stop.space_id] = r.status;
    }));
    return m;
  }, [routes]);

  const getSpaceState = useCallback((s) => {
    const l = spaceLogistics[s.id];
    if (!l || l.checkedIn === 0) return 'EMPTY';
    if (foodReceivedBySpace[s.id] || routeStatusBySpace[s.id] === 'DELIVERED') return 'DELIVERED';
    if (routeStatusBySpace[s.id] === 'IN_TRANSIT') return 'IN_TRANSIT';
    return 'WAITING';
  }, [spaceLogistics, foodReceivedBySpace, routeStatusBySpace]);

  const kpis = useMemo(() => {
    const assigned = Object.values(spaceLogistics).reduce((acc, l) => acc + l.assigned, 0);
    const present = Object.values(spaceLogistics).reduce((acc, l) => acc + l.checkedIn, 0);
    const viandasPrepared = assigned;
    let delivered = 0;
    let inTransitViandas = 0;
    spaces.forEach(s => {
      const st = getSpaceState(s);
      const v = spaceLogistics[s.id]?.viandas || 0;
      if (st === 'DELIVERED') delivered += v;
      if (st === 'IN_TRANSIT') inTransitViandas += v;
    });
    const totalMotos = hubs.reduce((acc, h) => acc + (Number(h.moto_count) || 0), 0);
    const motosBusy = routes.filter(r => r.status === 'IN_TRANSIT').length;
    return {
      viandasPrepared,
      present,
      assigned,
      pct: assigned > 0 ? Math.round((present / assigned) * 100) : 0,
      delivered,
      pending: Math.max(0, viandasPrepared - delivered),
      inTransitViandas,
      routesCount: routes.length,
      routesPending: routes.filter(r => r.status === 'PENDING').length,
      motosAvailable: Math.max(0, totalMotos - motosBusy),
      totalMotos
    };
  }, [spaceLogistics, spaces, hubs, routes, getSpaceState]);

  // Una ruta pasa sola a "Entregada" cuando TODOS sus espacios confirmaron desde la app
  useEffect(() => {
    routes.forEach(async (r) => {
      if (r.status === 'DELIVERED' || promotedRef.current.has(r.id)) return;
      const stops = r.itinerary || [];
      if (stops.length > 0 && stops.every(st => foodReceivedBySpace[st.space_id])) {
        promotedRef.current.add(r.id);
        await setRouteStatus(r.id, 'DELIVERED');
        refreshLive();
      }
    });
  }, [routes, foodReceivedBySpace, refreshLive]);

  // Marcadores y líneas del mapa en vivo
  const hubsColored = useMemo(() => hubs.map((h, i) => ({ ...h, color: HUB_COLORS[i % HUB_COLORS.length] })), [hubs]);

  const mapMarkers = useMemo(() => spaces.map(s => {
    const st = getSpaceState(s);
    const l = spaceLogistics[s.id] || { assigned: 0, checkedIn: 0, viandas: 0, receiverName: '' };
    return {
      id: s.id,
      lat: s.lat,
      lng: s.lng,
      color: STATE_META[st].color,
      radius: st === 'EMPTY' ? 6 : 9,
      label: `${s.name} — ${STATE_META[st].label}`,
      popup: `<b>${esc(s.name)}</b><br/>${esc(s.address)}<br/>👥 ${l.checkedIn}/${l.assigned} presentes · 🍱 ${l.viandas} viandas<br/>${l.receiverName ? `Receptor: ${esc(l.receiverName)}<br/>` : ''}<b>${STATE_META[st].label}</b>`
    };
  }), [spaces, spaceLogistics, getSpaceState]);

  const routeLines = useMemo(() => {
    const spaceById = {};
    spaces.forEach(s => { spaceById[s.id] = s; });
    return routes.filter(r => r.status !== 'DELIVERED').map(r => {
      const hubIdx = hubs.findIndex(h => h.id === r.hub_id);
      const hub = hubs[hubIdx];
      const pts = [];
      if (hub) pts.push([hub.lat, hub.lng]);
      (r.itinerary || []).forEach(st => {
        const sp = spaceById[st.space_id];
        if (sp) pts.push([sp.lat, sp.lng]);
      });
      return {
        points: pts,
        color: HUB_COLORS[(hubIdx < 0 ? 0 : hubIdx) % HUB_COLORS.length],
        dashed: r.status === 'PENDING',
        label: `Moto ${r.moto_number ?? '-'} · Viaje ${r.trip_number ?? '-'} (${r.total_viandas} viandas)`
      };
    });
  }, [routes, hubs, spaces]);

  const recentCheckins = useMemo(() =>
    assignments
      .filter(a => a.check_in_time)
      .sort((a, b) => new Date(b.check_in_time) - new Date(a.check_in_time))
      .slice(0, 15), [assignments]);

  const spaceNameById = useMemo(() => {
    const m = {};
    spaces.forEach(s => { m[s.id] = s.name; });
    return m;
  }, [spaces]);

  const hubNameById = useMemo(() => {
    const m = {};
    hubs.forEach(h => { m[h.id] = h.name; });
    return m;
  }, [hubs]);

  const sortedRoutes = useMemo(() => [...routes].sort((a, b) =>
    (hubNameById[a.hub_id] || '').localeCompare(hubNameById[b.hub_id] || '') ||
    (a.trip_number || 0) - (b.trip_number || 0) || (a.moto_number || 0) - (b.moto_number || 0)
  ), [routes, hubNameById]);

  // ---------------------------------------------------------------------------
  // ACCIONES
  // ---------------------------------------------------------------------------
  const handleGenerate = async () => {
    if (hubs.length === 0) {
      showToast('Primero configurá al menos una Camioneta Nodriza en la pestaña "Configuración Logística".', 'warning');
      setTab('setup');
      return;
    }
    const keptCount = routes.filter(r => r.status !== 'PENDING').length;
    const ok = await window.confirm(
      `Se van a recalcular las rutas PENDIENTES con los check-ins actuales.${keptCount > 0 ? `\nLas ${keptCount} ruta(s) ya despachadas/entregadas se conservan.` : ''}\n\n¿Generar rutas de reparto?`,
      'Generar Rutas de Reparto'
    );
    if (!ok) return;
    setGenerating(true);
    const res = await generateAndSaveRoutes({ meetingId, hubs, spaces, assignments, namesByDni, existingRoutes: routes });
    setGenerating(false);
    await refreshLive();
    if (res.error) {
      showToast(res.missing ? MIGRATION_HINT : `Error al generar rutas: ${res.error.message}`, 'error');
      return;
    }
    if (res.routes.length === 0) {
      showToast(res.warnings[0] || 'No hay espacios con check-in pendientes de despacho.', 'warning');
      return;
    }
    const totalV = res.routes.reduce((acc, r) => acc + r.total_viandas, 0);
    showToast(`🛵 ${res.routes.length} ruta(s) generadas para ${res.routedSpaces} espacio(s) con check-in (${totalV} viandas).${res.warnings.length ? ' ⚠️ ' + res.warnings.join(' ') : ''}`, res.warnings.length ? 'warning' : 'success');
  };

  const handleRouteStatus = async (route, status) => {
    await setRouteStatus(route.id, status);
    if (status !== 'DELIVERED') promotedRef.current.delete(route.id);
    await refreshLive();
  };

  const startNewHub = () => {
    setHubDraft({
      name: `Nodriza ${hubs.length + 1}`,
      lat: -34.6083,
      lng: -58.42,
      moto_count: 2,
      zone_comunas: [],
      zone_barrios: []
    });
    setBarrioToAdd('');
  };

  // Auto-Proponer: arma las nodrizas sugeridas SOLO en el estado de React (no guarda hasta confirmar)
  const handleAutoPropose = () => {
    try {
      const assignedCount = {};
      volunteers.forEach(v => {
        if (v.status === 'ASIGNADO' && v.assigned_space_id) {
          assignedCount[v.assigned_space_id] = (assignedCount[v.assigned_space_id] || 0) + 1;
        }
      });
      const spacesData = spaces.map(s => ({
        id: s.id,
        name: s.name,
        comuna: s.comuna,
        neighborhood: s.neighborhood,
        lat: s.lat,
        lng: s.lng,
        viandas: assignedCount[s.id] || 0
      }));

      const suggestion = suggestLogisticsSetup(spacesData, {
        displayBarrio: (b) => BARRIOS_CABA_DATA[b]?.display || b
      });

      if (!suggestion || suggestion.length === 0) {
        showToast('No hay espacios con voluntarios asignados o con coordenadas válidas para proponer una distribución.', 'warning');
        return;
      }
      setHubDraft(null);
      setProposedHubs(suggestion.map((h, i) => ({ ...h, id: `proposal_${i}` })));
      showToast(`Propuesta generada: ${suggestion.length} nodrizas. Arrastrá los pines, editá nombres o motos y guardá.`, 'info');
    } catch (err) {
      console.error('Error al calcular auto-propuesta logística:', err);
      showToast('Error al calcular rutas: verifique que las sedes tengan coordenadas válidas', 'error');
    }
  };

  const updateProposedHub = (id, patch) => setProposedHubs(list => list.map(h => (h.id === id ? { ...h, ...patch } : h)));

  const handleSaveProposal = async () => {
    if (!proposedHubs || proposedHubs.length === 0) return;
    setSavingProposal(true);
    try {
      const res = await saveAllLogisticHubs(meetingId, proposedHubs);
      if (res?.error) {
        setSavingProposal(false);
        showToast(isMissing(res.error) ? MIGRATION_HINT : `Error al guardar: ${res.error.message}`, 'error');
        await refreshLive();
        return;
      }
      setSavingProposal(false);
      setProposedHubs(null);
      await refreshLive();
      showToast('Configuración logística guardada correctamente.', 'success');
    } catch (err) {
      setSavingProposal(false);
      showToast(`Error al guardar: ${err.message}`, 'error');
    }
  };

  const toggleComuna = (c) => {
    setHubDraft(d => ({
      ...d,
      zone_comunas: d.zone_comunas.includes(c) ? d.zone_comunas.filter(x => x !== c) : [...d.zone_comunas, c].sort((a, b) => a - b)
    }));
  };

  const handleSaveHub = async () => {
    if (!hubDraft.name?.trim()) {
      showToast('La nodriza necesita un nombre.', 'warning');
      return;
    }
    const { error } = await saveLogisticHub(meetingId, hubDraft);
    if (error) {
      showToast(isMissing(error) ? MIGRATION_HINT : `Error al guardar: ${error.message}`, 'error');
      return;
    }
    setHubDraft(null);
    await refreshLive();
    showToast('Nodriza guardada.', 'success');
  };

  const isMissing = (error) => error && (
    error.code === '42P01' ||
    error.code === '42501' ||
    error.code === 'PGRST205' ||
    /does not exist|schema cache|row-level security|permission denied/i.test(error.message || '')
  );

  const handleDeleteHub = async (hub) => {
    const ok = await window.confirm(`¿Eliminar la nodriza "${hub.name}"? También se borran sus rutas.`);
    if (!ok) return;
    await deleteLogisticHub(meetingId, hub.id);
    if (hubDraft?.id === hub.id) setHubDraft(null);
    await refreshLive();
  };

  const checkinUrl = `${window.location.origin}/?view=lndlm_checkin`;
  const copyCheckinUrl = async () => {
    try {
      await navigator.clipboard.writeText(checkinUrl);
      showToast('Link del check-in copiado. Compartilo por WhatsApp con los voluntarios.', 'success');
    } catch (e) {
      showToast(checkinUrl, 'info');
    }
  };

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  const kpiCard = (label, value, sub, color) => (
    <div className="card" style={{ padding: '0.9rem 1rem', borderLeft: `4px solid ${color}`, margin: 0 }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#0F172A' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{sub}</div>}
    </div>
  );

  const toastColors = {
    success: ['#ECFDF5', '#065F46', '#A7F3D0'],
    warning: ['#FFFBEB', '#92400E', '#FDE68A'],
    error: ['#FEF2F2', '#991B1B', '#FECACA'],
    info: ['#EFF6FF', '#1E40AF', '#BFDBFE']
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', paddingBottom: '3rem' }}>
      {/* CABECERA */}
      <div className="card" style={{ padding: '1.2rem 1.4rem', background: 'linear-gradient(135deg,#0F172A 0%,#1E293B 60%,#1E1B4B 100%)', color: '#fff', border: 'none', margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <div>
            <button onClick={onBack} className="btn" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '0.3rem 0.7rem', fontSize: '0.8rem', display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
              <ArrowLeft size={14} /> Volver a Asignación
            </button>
            <h1 style={{ margin: '0.5rem 0 0 0', fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>🛵 Mesa de Control LNDLM — Logística en Vivo</h1>
            <div style={{ color: '#94A3B8', fontSize: '0.82rem' }}>
              {reunion?.nombre} · actualiza cada 10 s{lastUpdate ? ` (última: ${lastUpdate.toLocaleTimeString('es-AR')})` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button onClick={copyCheckinUrl} className="btn" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', display: 'inline-flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.83rem', fontWeight: 600 }}>
              <Copy size={15} /> Copiar link del Check-in
            </button>
            <a href="?view=lndlm_checkin" target="_blank" rel="noreferrer" className="btn" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', display: 'inline-flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.83rem', fontWeight: 600, textDecoration: 'none' }}>
              <ExternalLink size={15} /> Ver WebApp
            </a>
            <button onClick={handleGenerate} disabled={generating} className="btn" style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)', color: '#0F172A', border: 'none', fontWeight: 800, display: 'inline-flex', gap: '0.45rem', alignItems: 'center', padding: '0.6rem 1.1rem' }}>
              🛵 {generating ? 'Generando...' : 'Generar Rutas de Reparto'}
            </button>
          </div>
        </div>
      </div>

      {missingMigration && (
        <div style={{ padding: '0.85rem 1.1rem', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontWeight: 600, fontSize: '0.88rem' }}>
          ⚠️ {MIGRATION_HINT}
        </div>
      )}

      {toast && (
        <div style={{ padding: '0.85rem 1.1rem', borderRadius: '10px', fontWeight: 600, fontSize: '0.9rem', background: toastColors[toast.type][0], color: toastColors[toast.type][1], border: `1px solid ${toastColors[toast.type][2]}`, display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 800 }}>✕</button>
        </div>
      )}

      {/* PESTAÑAS */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #E2E8F0', paddingBottom: '0.5rem' }}>
        {[['live', '📡 Mesa de Control en Vivo'], ['setup', `🚚 Configuración Logística (${hubs.length} nodrizas)`]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="btn" style={{ background: tab === k ? '#0F172A' : '#F1F5F9', color: tab === k ? '#fff' : '#475569', fontWeight: 700, border: 'none', padding: '0.55rem 1.1rem', borderRadius: '8px' }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Cargando datos logísticos...</div>
      ) : tab === 'live' ? (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '0.8rem' }}>
            {kpiCard('Viandas Preparadas', kpis.viandasPrepared, 'Cupo total asignado', '#6366F1')}
            {kpiCard('Voluntarios Presentes', `${kpis.present}`, `de ${kpis.assigned} asignados`, '#0EA5E9')}
            {kpiCard('% Presentismo', `${kpis.pct}%`, 'check-ins / asignados', '#14B8A6')}
            {kpiCard('Viandas Entregadas', kpis.delivered, 'confirmadas (app / manual)', '#10B981')}
            {kpiCard('Viandas Pendientes', kpis.pending, `${kpis.inTransitViandas} en ruta`, '#EF4444')}
            {kpiCard('Rutas Armadas', kpis.routesCount, `${kpis.routesPending} sin despachar`, '#F59E0B')}
            {kpiCard('Motos Disponibles', `${kpis.motosAvailable}`, `de ${kpis.totalMotos} totales`, '#8B5CF6')}
          </div>

          {/* MAPA */}
          <div className="card" style={{ padding: '1rem', margin: 0 }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.7rem', fontSize: '0.8rem', fontWeight: 600, color: '#334155', alignItems: 'center' }}>
              <span>🚚 Nodrizas</span>
              {Object.entries(STATE_META).map(([k, m]) => (
                <span key={k} style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: m.color, display: 'inline-block' }} /> {m.label}
                </span>
              ))}
              <span style={{ color: '#94A3B8' }}>(línea punteada = ruta sin despachar)</span>
            </div>
            <LndlmMap hubs={hubsColored} markers={mapMarkers} routeLines={routeLines} mode="live" height={520} />
          </div>

          {/* RUTAS */}
          <div className="card" style={{ padding: '1rem 1.2rem', margin: 0 }}>
            <h3 style={{ margin: '0 0 0.8rem 0', fontSize: '1.1rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Navigation size={18} /> Rutas de Reparto ({routes.length})
            </h3>
            {sortedRoutes.length === 0 ? (
              <div style={{ color: '#64748B', fontSize: '0.9rem', padding: '1rem', textAlign: 'center' }}>
                Todavía no hay rutas. Cuando los voluntarios empiecen a hacer check-in, tocá <b>"🛵 Generar Rutas de Reparto"</b>.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', textAlign: 'left', color: '#475569', borderBottom: '2px solid #E2E8F0' }}>
                      <th style={{ padding: '0.6rem' }}>Nodriza</th>
                      <th style={{ padding: '0.6rem' }}>Moto / Viaje</th>
                      <th style={{ padding: '0.6rem' }}>Itinerario</th>
                      <th style={{ padding: '0.6rem', textAlign: 'center' }}>Viandas</th>
                      <th style={{ padding: '0.6rem', textAlign: 'center' }}>Km</th>
                      <th style={{ padding: '0.6rem' }}>Estado</th>
                      <th style={{ padding: '0.6rem', textAlign: 'right' }}>Acciones manuales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRoutes.map(r => {
                      const meta = ROUTE_STATUS_META[r.status];
                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid #E2E8F0', verticalAlign: 'top' }}>
                          <td style={{ padding: '0.6rem', fontWeight: 700 }}>{hubNameById[r.hub_id] || '—'}</td>
                          <td style={{ padding: '0.6rem', whiteSpace: 'nowrap' }}>🛵 Moto {r.moto_number ?? '—'} · Viaje {r.trip_number ?? '—'}</td>
                          <td style={{ padding: '0.6rem' }}>
                            {(r.itinerary || []).map((st, i) => {
                              const confirmed = Boolean(foodReceivedBySpace[st.space_id]);
                              return (
                                <div key={`${st.space_id}-${i}`} style={{ marginBottom: '0.25rem' }}>
                                  <b>{i + 1}.</b> {st.space_name || spaceNameById[st.space_id]} — <b>{st.viandas}</b> viandas
                                  {st.food_receiver && <span style={{ color: '#64748B' }}> · recibe: {st.food_receiver}</span>}
                                  {confirmed && <span style={{ color: '#059669', fontWeight: 700 }}> ✔ recibido</span>}
                                </div>
                              );
                            })}
                          </td>
                          <td style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 800 }}>{r.total_viandas}/{MAX_VIANDAS_PER_TRIP}</td>
                          <td style={{ padding: '0.6rem', textAlign: 'center' }}>{r.distance_km ?? '—'}</td>
                          <td style={{ padding: '0.6rem' }}>
                            <span style={{ background: meta.bg, color: meta.color, fontWeight: 800, fontSize: '0.74rem', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>{meta.label}</span>
                            {r.dispatched_at && <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>salió {fmtTime(r.dispatched_at)}</div>}
                            {r.delivered_at && <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>entregó {fmtTime(r.delivered_at)}</div>}
                          </td>
                          <td style={{ padding: '0.6rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {r.status === 'PENDING' && (
                              <button onClick={() => handleRouteStatus(r, 'IN_TRANSIT')} className="btn" style={{ background: '#F59E0B', color: '#0F172A', border: 'none', fontWeight: 800, fontSize: '0.76rem', padding: '0.3rem 0.65rem', marginRight: '0.3rem' }}>
                                🛵 Despachada
                              </button>
                            )}
                            {r.status !== 'DELIVERED' && (
                              <button onClick={() => handleRouteStatus(r, 'DELIVERED')} className="btn" style={{ background: '#10B981', color: '#fff', border: 'none', fontWeight: 800, fontSize: '0.76rem', padding: '0.3rem 0.65rem', marginRight: '0.3rem' }}>
                                <CheckCircle2 size={12} style={{ marginRight: 3 }} /> Entregada
                              </button>
                            )}
                            {r.status !== 'PENDING' && (
                              <button onClick={() => handleRouteStatus(r, 'PENDING')} className="btn btn-outline" style={{ fontSize: '0.72rem', padding: '0.28rem 0.55rem' }}>
                                ↩ Revertir
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* EVIDENCIA */}
          <div className="card" style={{ padding: '1rem 1.2rem', margin: 0 }}>
            <h3 style={{ margin: '0 0 0.6rem 0', fontSize: '1.05rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={17} /> Últimos check-ins (con foto de evidencia)
            </h3>
            {recentCheckins.length === 0 ? (
              <div style={{ color: '#64748B', fontSize: '0.88rem' }}>Aún no hay check-ins.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '0.5rem' }}>
                {recentCheckins.map(a => (
                  <div key={a.attendee_id} style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0.5rem 0.7rem', fontSize: '0.82rem' }}>
                    <div style={{ fontWeight: 700 }}>
                      {namesByDni[a.attendee_id] || a.attendee_id} {a.is_food_receiver && <span title="Receptor de viandas">🍱</span>}
                    </div>
                    <div style={{ color: '#64748B' }}>🏛️ {spaceNameById[a.space_id] || '—'} · {fmtTime(a.check_in_time)}</div>
                    {a.check_in_photo_url && (
                      <a href={a.check_in_photo_url} target="_blank" rel="noreferrer" style={{ color: '#2563EB', fontWeight: 600 }}>📸 Ver foto</a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* ================== CONFIGURACIÓN LOGÍSTICA ================== */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(380px,1fr))', gap: '1rem', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <button onClick={startNewHub} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', fontWeight: 800, padding: '0.7rem' }}>
              <Plus size={16} /> Agregar Camioneta Nodriza
            </button>

            {hubs.length === 0 && !hubDraft && !proposedHubs && (
              <div className="card" style={{ margin: 0, padding: '1.5rem', textAlign: 'center', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                <div>Todavía no hay Camionetas Nodrizas. Podés generar una propuesta automática (4 macro-zonas con flota sugerida) o armarlas a mano.</div>
                <button onClick={handleAutoPropose} className="btn btn-primary" style={{ fontWeight: 800, padding: '0.75rem' }}>
                  ✨ Auto-Proponer Distribución Logística
                </button>
                <button onClick={startNewHub} className="btn btn-outline" style={{ fontWeight: 700, padding: '0.6rem' }}>
                  ➕ Configurar Manualmente
                </button>
              </div>
            )}

            {proposedHubs && (
              <div className="card" style={{ margin: 0, padding: '1rem 1.1rem', border: '2px solid #F59E0B' }}>
                <h3 style={{ margin: '0 0 0.3rem 0', fontSize: '1.05rem' }}>✨ Propuesta logística (sin guardar)</h3>
                <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '0.7rem' }}>
                  Motos = ⌈viandas de la zona ÷ ({MAX_VIANDAS_PER_TRIP} × {TRIPS_PER_MOTO} viajes)⌉, mínimo 1. Arrastrá los pines del mapa para ubicarlos en avenidas reales.
                </div>
                {proposedHubs.map((h, i) => (
                  <div key={h.id} style={{ borderLeft: `5px solid ${HUB_COLORS[i % HUB_COLORS.length]}`, background: '#F8FAFC', borderRadius: '8px', padding: '0.6rem 0.7rem', marginBottom: '0.6rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700 }}>Nombre</label>
                        <input value={h.name} onChange={e => updateProposedHub(h.id, { name: e.target.value })} style={{ width: '100%', padding: '0.4rem', borderRadius: '8px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700 }}>🛵 Motos</label>
                        <input type="number" min="0" value={h.moto_count} onChange={e => updateProposedHub(h.id, { moto_count: e.target.value })} style={{ width: '100%', padding: '0.4rem', borderRadius: '8px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }} />
                      </div>
                      <button type="button" onClick={() => setProposedHubs(list => list.filter(x => x.id !== h.id))} className="btn btn-outline" style={{ padding: '0.35rem 0.5rem', color: '#DC2626', borderColor: '#FECACA' }}><Trash2 size={13} /></button>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '0.3rem' }}>
                      {h.zone_label} · Comunas {h.zone_comunas.join(', ')} · {h.spaces_count} espacios · {h.total_viandas} viandas (sugeridas: {suggestMotosForViandas(h.total_viandas)} motos)
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setProposedHubs(null)} disabled={savingProposal}>Descartar</button>
                  <button type="button" className="btn btn-primary" onClick={handleSaveProposal} disabled={savingProposal || proposedHubs.length === 0} style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', fontWeight: 700 }}>
                    <Save size={15} /> {savingProposal ? 'Guardando...' : 'Guardar Configuración'}
                  </button>
                </div>
              </div>
            )}

            {hubs.map((h, i) => (
              <div key={h.id} className="card" style={{ margin: 0, padding: '0.9rem 1rem', borderLeft: `5px solid ${HUB_COLORS[i % HUB_COLORS.length]}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '1rem' }}>🚚 {h.name}</div>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button onClick={() => { setHubDraft({ ...h }); setBarrioToAdd(''); }} className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}>Editar</button>
                    <button onClick={() => handleDeleteHub(h)} className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', color: '#DC2626', borderColor: '#FECACA' }}><Trash2 size={13} /></button>
                  </div>
                </div>
                <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '0.3rem' }}>
                  🛵 {h.moto_count} moto(s) · 📍 {Number(h.lat).toFixed(4)}, {Number(h.lng).toFixed(4)}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.2rem' }}>
                  Zona: {(h.zone_comunas || []).length === 0 && (h.zone_barrios || []).length === 0
                    ? 'sin zona (atiende espacios sin nodriza asignada, por cercanía)'
                    : [
                        (h.zone_comunas || []).length ? `Comunas ${(h.zone_comunas || []).join(', ')}` : '',
                        (h.zone_barrios || []).length ? `Barrios: ${(h.zone_barrios || []).map(b => BARRIOS_CABA_DATA[b]?.display || b).join(', ')}` : ''
                      ].filter(Boolean).join(' · ')}
                </div>
              </div>
            ))}

            {hubDraft && (
              <div className="card" style={{ margin: 0, padding: '1rem 1.1rem', border: '2px solid #6366F1' }}>
                <h3 style={{ margin: '0 0 0.7rem 0', fontSize: '1.05rem' }}>{hubDraft.id ? '✏️ Editar Nodriza' : '🚚 Nueva Nodriza'}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.6rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Nombre</label>
                    <input value={hubDraft.name} onChange={e => setHubDraft(d => ({ ...d, name: e.target.value }))} style={{ width: '100%', padding: '0.45rem', borderRadius: '8px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>🛵 Motos (Y)</label>
                    <input type="number" min="0" value={hubDraft.moto_count} onChange={e => setHubDraft(d => ({ ...d, moto_count: e.target.value }))} style={{ width: '100%', padding: '0.45rem', borderRadius: '8px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Latitud</label>
                    <input type="number" step="any" value={hubDraft.lat ?? ''} onChange={e => setHubDraft(d => ({ ...d, lat: e.target.value }))} style={{ width: '100%', padding: '0.45rem', borderRadius: '8px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Longitud</label>
                    <input type="number" step="any" value={hubDraft.lng ?? ''} onChange={e => setHubDraft(d => ({ ...d, lng: e.target.value }))} style={{ width: '100%', padding: '0.45rem', borderRadius: '8px', border: '1px solid #CBD5E1', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6366F1', margin: '0.4rem 0', fontWeight: 600 }}>
                  <MapPin size={12} /> Hacé clic en el mapa (o arrastrá el pin rojo) para ubicar la nodriza.
                </div>

                <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Comunas que abastece</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', margin: '0.3rem 0 0.6rem' }}>
                  {Array.from({ length: 15 }, (_, i) => i + 1).map(c => {
                    const on = hubDraft.zone_comunas.includes(c);
                    return (
                      <button key={c} type="button" onClick={() => toggleComuna(c)} style={{ padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', border: on ? '2px solid #4F46E5' : '1px solid #CBD5E1', background: on ? '#E0E7FF' : '#fff', color: on ? '#3730A3' : '#64748B' }}>
                        C{c}
                      </button>
                    );
                  })}
                </div>

                <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Barrios puntuales (opcional)</label>
                <div style={{ display: 'flex', gap: '0.4rem', margin: '0.3rem 0' }}>
                  <select value={barrioToAdd} onChange={e => setBarrioToAdd(e.target.value)} style={{ flex: 1, padding: '0.4rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                    <option value="">Agregar barrio...</option>
                    {SORTED_BARRIOS.filter(b => !hubDraft.zone_barrios.includes(b)).map(b => (
                      <option key={b} value={b}>{BARRIOS_CABA_DATA[b].display} (C{BARRIOS_CABA_DATA[b].comuna})</option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-outline" disabled={!barrioToAdd} onClick={() => { setHubDraft(d => ({ ...d, zone_barrios: [...d.zone_barrios, barrioToAdd] })); setBarrioToAdd(''); }} style={{ fontSize: '0.8rem' }}>
                    Agregar
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.7rem' }}>
                  {hubDraft.zone_barrios.map(b => (
                    <span key={b} style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '999px', padding: '0.15rem 0.2rem 0.15rem 0.6rem', fontSize: '0.76rem', fontWeight: 600 }}>
                      {BARRIOS_CABA_DATA[b]?.display || b}
                      <button type="button" onClick={() => setHubDraft(d => ({ ...d, zone_barrios: d.zone_barrios.filter(x => x !== b) }))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#DC2626', fontWeight: 800 }}>✕</button>
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setHubDraft(null)}>Cancelar</button>
                  <button type="button" className="btn btn-primary" onClick={handleSaveHub} style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', fontWeight: 700 }}>
                    <Save size={15} /> Guardar Nodriza
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ margin: 0, padding: '0.9rem' }}>
            <div style={{ fontSize: '0.82rem', color: '#64748B', marginBottom: '0.5rem', fontWeight: 600 }}>
              Mapa de CABA {hubDraft ? '— modo ubicación de nodriza' : '— nodrizas y espacios culturales'}
            </div>
            <LndlmMap
              key={hubDraft ? `picker-${hubDraft.id || 'new'}` : 'overview'}
              hubs={proposedHubs
                ? proposedHubs.map((h, i) => ({ ...h, color: HUB_COLORS[i % HUB_COLORS.length] }))
                : hubsColored.filter(h => h.id !== hubDraft?.id)}
              draggableHubs={Boolean(proposedHubs) && !hubDraft}
              onHubMove={(id, lat, lng) => updateProposedHub(id, { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) })}
              markers={hubDraft ? [] : mapMarkers.map(m => ({ ...m, color: '#64748B', radius: 5 }))}
              mode={hubDraft ? 'picker' : 'live'}
              picker={hubDraft ? { lat: hubDraft.lat === '' ? null : Number(hubDraft.lat), lng: hubDraft.lng === '' ? null : Number(hubDraft.lng) } : null}
              onPick={hubDraft ? (lat, lng) => setHubDraft(d => ({ ...d, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) })) : undefined}
              height={560}
            />
            <button onClick={() => { loadStatic(); refreshLive(); }} className="btn btn-outline" style={{ marginTop: '0.6rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <RefreshCw size={13} /> Recargar espacios y datos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
