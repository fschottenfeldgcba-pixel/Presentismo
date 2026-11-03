import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, Clock, MapPin, Users, Tag, Maximize2, Minimize2, Tv, 
  Sparkles, CheckCircle2, AlertCircle, ArrowRight, MessageSquare, 
  ChevronRight, Calendar, User, FileText, UserCheck
} from 'lucide-react';
import MapaReclamosComuna from './MapaReclamosComuna';
import { subscribeProyector, getLastProyectorState } from '../services/proyectorSyncService';
import { getSolicitudesPorReunion } from '../services/solicitudesService';
import { getOradores, getAsistentesPorReunion } from '../services/supabaseService';
import { supabase } from '../lib/supabaseClient';
import { autoDetectTags } from '../constants/oradorTags';

export default function PantallaProyeccion({ reunionId: propReunionId }) {
  // Obtener ID de la reunión por prop o por query string
  const reunionId = propReunionId || (() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('reunion_id');
    }
    return null;
  })();

  const [reunion, setReunion] = useState(null);
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [activeTimer, setActiveTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isDevolucion, setIsDevolucion] = useState(false);
  const [devolucionFuncionario, setDevolucionFuncionario] = useState('');
  const [nextSpeakers, setNextSpeakers] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [metricsOradores, setMetricsOradores] = useState({ total: 0, hablaron: 0, faltan: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTimeFormatted, setCurrentTimeFormatted] = useState('');
  const [currentDateFormatted, setCurrentDateFormatted] = useState('');
  const [loading, setLoading] = useState(true);

  // Reloj en vivo de la cabecera (Fecha completa en español + Hora)
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTimeFormatted(now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
      const dateStr = now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      setCurrentDateFormatted(dateStr);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Timer del orador activo
  useEffect(() => {
    let timerInterval = null;
    if (isTimerRunning && !isDevolucion) {
      timerInterval = setInterval(() => {
        setActiveTimer(t => t + 1);
      }, 1000);
    }
    return () => {
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [isTimerRunning, isDevolucion]);

  // Cargar estado inicial y suscribir a eventos de moderación
  useEffect(() => {
    if (!reunionId) return;

    // 1. Cargar último estado si existe en caché local
    const lastState = getLastProyectorState(reunionId);
    if (lastState) {
      if (lastState.speaker) setActiveSpeaker(lastState.speaker);
      if (typeof lastState.timer === 'number') setActiveTimer(lastState.timer);
      if (typeof lastState.isRunning === 'boolean') setIsTimerRunning(lastState.isRunning);
      if (lastState.nextSpeakers) setNextSpeakers(lastState.nextSpeakers);
    }

    // Verificar si hay devolución activa en localStorage
    try {
      const lastDevRaw = localStorage.getItem(`presentismo_devolucion_${reunionId}`);
      if (lastDevRaw) {
        const parsedDev = JSON.parse(lastDevRaw);
        if (parsedDev && parsedDev.activa) {
          setIsDevolucion(true);
          setDevolucionFuncionario(parsedDev.funcionario || '');
        }
      }
    } catch (e) {}

    // 2. Suscribirse a BroadcastChannel y eventos de storage cross-window
    const unsubscribe = subscribeProyector(reunionId, (event) => {
      if (!event) return;
      if (event.type === 'DEVOLUCION_START') {
        setIsDevolucion(true);
        setDevolucionFuncionario(event.funcionario || '');
        setActiveSpeaker(null);
        setIsTimerRunning(false);
      } else if (event.type === 'DEVOLUCION_CLEAR') {
        setIsDevolucion(false);
      } else if (event.type === 'ACTIVE_SPEAKER' || event.type === 'SPEAKER_CALL') {
        setIsDevolucion(false);
        setActiveSpeaker(event.speaker || null);
        setActiveTimer(event.timer || 0);
        setIsTimerRunning(true);
        if (Array.isArray(event.nextSpeakers)) {
          setNextSpeakers(event.nextSpeakers);
        }
      } else if (event.type === 'TIMER_TICK') {
        if (typeof event.timer === 'number') {
          setActiveTimer(event.timer);
          setIsTimerRunning(true);
        }
      } else if (event.type === 'SPEAKER_CLEAR' || event.type === 'SPEAKER_CLEARED') {
        setActiveSpeaker(null);
        setIsTimerRunning(false);
        setActiveTimer(0);
      } else if (event.type === 'QUEUE_UPDATE') {
        if (Array.isArray(event.nextSpeakers)) {
          setNextSpeakers(event.nextSpeakers);
        }
      } else if (event.type === 'TAGS_UPDATE') {
        if (Array.isArray(event.tags)) {
          setAllTags(event.tags);
        }
      }
    });

    return () => unsubscribe();
  }, [reunionId]);

  // Polling y sincronización periódica desde Supabase (garantía de actualización)
  useEffect(() => {
    if (!reunionId) return;

    let isMounted = true;

    const syncFromDatabase = async () => {
      try {
        // Cargar reunión
        const { data: reunData } = await supabase
          .from('reuniones')
          .select('*')
          .eq('id', reunionId)
          .single();

        if (!isMounted || !reunData) return;
        setReunion(reunData);

        // Cargar solicitudes de la papeleta digital
        const resSol = await getSolicitudesPorReunion(reunionId);
        const solicitudesData = resSol?.data || [];
        if (isMounted) {
          setSolicitudes(prev => {
            if (prev.length === solicitudesData.length && 
                prev.every((p, i) => p.id === solicitudesData[i]?.id && p.updated_at === solicitudesData[i]?.updated_at)) {
              return prev;
            }
            return solicitudesData;
          });
        }

        // Sincronizar según el tipo de reunión:
        if (reunData.tipo_reunion === 'Uno a Uno') {
          // Reunión 1 a 1:
          const { data: asisData } = await getAsistentesPorReunion(reunionId);
          if (!asisData || !isMounted) return;

          // Parsear configuración de timers activos
          let activeTimers = {};
          let timeRecords = {};
          try {
            const cfg = typeof reunData.config_uno_a_uno === 'string' 
              ? JSON.parse(reunData.config_uno_a_uno) 
              : reunData.config_uno_a_uno;
            if (cfg?.activeTimers) activeTimers = cfg.activeTimers;
            if (cfg?.timeRecords) timeRecords = cfg.timeRecords;
          } catch (e) {}

          // Buscar orador activo en los timers corriendo
          const activeDni = Object.keys(activeTimers).find(dni => activeTimers[dni]?.isRunning || activeTimers[dni]?.startMs);
          if (activeDni) {
            const asisItem = asisData.find(a => String(a.vecino_id) === String(activeDni));
            const timerInfo = activeTimers[activeDni];
            const elapsed = timerInfo?.startMs ? Math.floor((Date.now() - timerInfo.startMs) / 1000) : 0;
            
            setActiveSpeaker({
              id: activeDni,
              dni: activeDni,
              nombre: asisItem?.vecino ? `${asisItem.vecino.nombre} ${asisItem.vecino.apellido}` : `DNI: ${activeDni}`,
              tema: asisItem?.tema_previo || 'Reunión Uno a Uno',
              horario: asisItem?.horario_bloque_asignado || timerInfo?.horaIngreso,
              vecino: asisItem?.vecino || {}
            });
            setActiveTimer(elapsed);
            setIsTimerRunning(true);
          }

          // Próximos 4 en la cola de atención (1a1: convocados, confirmados o presentes no atendidos)
          const convocados = asisData.filter(a => 
            a.estado_convocatoria === 'citado' || 
            a.estado_convocatoria === 'walk_in' || 
            a.confirmado || 
            a.asistio
          );
          const waitingQueue = convocados
            .filter(a => !timeRecords[a.vecino_id]?.horaSalida && String(a.vecino_id) !== String(activeDni))
            .sort((a, b) => {
              if (a.asistio && !b.asistio) return -1;
              if (!a.asistio && b.asistio) return 1;
              return (a.horario_bloque_asignado || '').localeCompare(b.horario_bloque_asignado || '');
            })
            .slice(0, 4)
            .map((item, idx) => ({
              id: item.vecino_id,
              posicion: String(idx + 1),
              nombre: item.vecino ? `${item.vecino.nombre} ${item.vecino.apellido}` : `Vecino DNI ${item.vecino_id}`,
              tema: item.tema_previo || 'Consulta vecinal',
              horario: item.horario_bloque_asignado || '--:--'
            }));
          setNextSpeakers(waitingQueue);

          const total1a1 = convocados.length;
          const hablaron1a1 = convocados.filter(a => timeRecords[a.vecino_id]?.horaSalida).length;
          const faltan1a1 = convocados.filter(a => !timeRecords[a.vecino_id]?.horaSalida).length;
          setMetricsOradores({ total: total1a1, hablaron: hablaron1a1, faltan: faltan1a1 });

          // Tags agregados a partir de temas de inscripción y solicitudes
          const tagsCount = {};
          solicitudesData.forEach(s => {
            if (s.tematica) {
              const cleanT = s.tematica.split('/')[0].trim();
              tagsCount[cleanT] = (tagsCount[cleanT] || 0) + 1;
            }
          });
          asisData.forEach(a => {
            if (a.tema_previo) {
              const detected = autoDetectTags(a.tema_previo);
              detected.forEach(t => { tagsCount[t] = (tagsCount[t] || 0) + 1; });
            }
          });
          const tagList = Object.entries(tagsCount)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
          setAllTags(tagList);

        } else {
          // Reunión General / Temática:
          const { data: oradoresData } = await getOradores(reunionId);
          if (!oradoresData || !isMounted) return;

          // Verificar si hay devolución activa en localStorage
          let devActiva = false;
          try {
            const devRaw = localStorage.getItem(`presentismo_devolucion_${reunionId}`);
            if (devRaw) {
              const parsed = JSON.parse(devRaw);
              if (parsed?.activa) {
                devActiva = true;
                setIsDevolucion(true);
                if (parsed.funcionario) setDevolucionFuncionario(parsed.funcionario);
              }
            }
          } catch (e) {}

          if (!devActiva) {
            setIsDevolucion(false);
          }

          // Orador activo en el micrófono (solo si no está en devolución del funcionario)
          const active = !devActiva && (reunData.active_orador_id 
            ? oradoresData.find(o => o.id === reunData.active_orador_id) 
            : oradoresData.find(o => o.estado === 'hablando'));

          if (active) {
            setActiveSpeaker({
              id: active.id,
              dni: active.vecino?.dni || active.vecino_id,
              nombre: active.vecino?.nombre ? active.vecino.nombre.trim() : (active.vecino ? `${active.vecino.nombre} ${active.vecino.apellido}` : 'Orador en micrófono'),
              tema: active.tema_efectivo || active.tema_original || 'Exposición general',
              tags: active.tags || [],
              vecino: active.vecino || {}
            });
            setIsTimerRunning(true);
          } else if (!devActiva) {
            setActiveSpeaker(null);
            setIsTimerRunning(false);
            setActiveTimer(0);
          }

          // Próximos 4 oradores en espera (General / Temática: 'en_espera', 'espera', o anotados sin terminar)
          let waiting = oradoresData
            .filter(o => 
              (o.estado === 'en_espera' || o.estado === 'espera' || !o.estado) && 
              o.estado !== 'hablo' && 
              o.estado !== 'se_bajo' && 
              o.estado !== 'no_hablo' && 
              (!active || o.id !== active.id)
            )
            .sort((a, b) => (a.orden || 0) - (b.orden || 0))
            .slice(0, 4)
            .map((o, idx) => ({
              id: o.id,
              posicion: String(idx + 1),
              nombre: o.vecino?.nombre ? o.vecino.nombre.trim() : (o.vecino ? `${o.vecino.nombre} ${o.vecino.apellido}` : 'Vecino anotado'),
              tema: o.tema_original || o.tema_efectivo || 'Tema a plantear',
              tags: o.tags || []
            }));

          setNextSpeakers(waiting);

          const totalGen = oradoresData.length;
          const hablaronGen = oradoresData.filter(o => o.estado === 'hablo').length;
          const faltanGen = oradoresData.filter(o => 
            o.estado !== 'hablo' && 
            o.estado !== 'se_bajo' && 
            o.estado !== 'no_hablo'
          ).length;
          setMetricsOradores({ total: totalGen, hablaron: hablaronGen, faltan: faltanGen });

          // Tags agregados
          const tagsCount = {};
          oradoresData.forEach(o => {
            if (o.tags && o.tags.length > 0) {
              o.tags.forEach(t => { tagsCount[t] = (tagsCount[t] || 0) + 1; });
            } else if (o.tema_efectivo || o.tema_original) {
              const detected = autoDetectTags(o.tema_efectivo || o.tema_original);
              detected.forEach(t => { tagsCount[t] = (tagsCount[t] || 0) + 1; });
            }
          });
          solicitudesData.forEach(s => {
            if (s.tematica) {
              const cleanT = s.tematica.split('/')[0].trim();
              tagsCount[cleanT] = (tagsCount[cleanT] || 0) + 1;
            }
          });
          const tagList = Object.entries(tagsCount)
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
          setAllTags(tagList);
        }

        setLoading(false);
      } catch (err) {
        console.warn('Error sincronizando pantalla de proyección:', err);
      }
    };

    syncFromDatabase();
    const pollInterval = setInterval(syncFromDatabase, 2500);
    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [reunionId]);

  // Formatear segundos a MM:SS
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Pantalla completa toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  // Reclamo en la papeleta del orador activo (nulo si está en devolución del funcionario)
  const activeSpeakerDni = !isDevolucion ? (activeSpeaker?.dni || activeSpeaker?.vecino?.dni || activeSpeaker?.vecino_id) : null;
  const speakerClaim = activeSpeakerDni
    ? solicitudes.find(s => String(s.dni).trim() === String(activeSpeakerDni).trim())
    : null;

  // Extraer exclusivamente el primer nombre (sin apellido ni DNI)
  const getSoloNombre = (fullName, vecinoObj) => {
    if (vecinoObj?.nombre) return vecinoObj.nombre.trim();
    if (!fullName) return 'Aguardando orador...';
    const clean = fullName.replace(/DNI:\s*\d+/gi, '').trim();
    const parts = clean.split(' ').filter(Boolean);
    if (parts.length <= 1) return parts[0] || 'Vecino';
    if (parts.length === 2) return parts[0];
    return parts.slice(0, -1).join(' ');
  };

  const speakerSoloNombre = getSoloNombre(activeSpeaker?.nombre, activeSpeaker?.vecino);

  // Límite de tiempo estimado: exactamente 2:00 (120 segundos) estándar como en el modelo original
  const targetDurationSecs = activeSpeaker?.totalSeconds || 120;
  
  // Cuenta regresiva que empieza en 2:00 y va bajando hasta 00:00
  const remainingSecs = Math.max(0, targetDurationSecs - activeTimer);
  const countdownMins = Math.floor(remainingSecs / 60);
  const countdownSecs = remainingSecs % 60;
  const countdownFormatted = `${countdownMins.toString().padStart(2, '0')}:${countdownSecs.toString().padStart(2, '0')}`;
  
  // Porcentaje transcurrido (para el barrido circular de la aguja / sector)
  const percentElapsed = Math.min(100, (activeTimer / targetDurationSecs) * 100);
  
  // Estado de tiempo cumplido
  const isFinished = activeTimer >= targetDurationSecs;
  const isWarning = remainingSecs <= 30 && remainingSecs > 0;

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: '#FFFFFF',
      color: '#0F172A',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'row',
      overflow: 'hidden',
      userSelect: 'none'
    }}>
      <style>{`
        @keyframes pulseScale {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 25px rgba(121, 222, 200, 0.6);
          }
          50% {
            transform: scale(1.04);
            box-shadow: 0 0 50px rgba(121, 222, 200, 0.95);
          }
        }
      `}</style>

      {/* SECCIÓN IZQUIERDA: HEADER + MAPA (LIBERA EL ESPACIO SUPERIOR DERECHO PARA EL TIMER) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        
        {/* 1. TOP BAR INSTITUCIONAL QUE OCUPA SÓLO EL ANCHO DEL MAPA */}
        <header style={{
          height: '68px',
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          padding: '0 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          zIndex: 1000
        }}>
          {/* Identidad BA */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              backgroundColor: '#FFC700',
              color: '#070E1A',
              fontWeight: '900',
              fontSize: '1rem',
              padding: '4px 10px',
              borderRadius: '6px',
              letterSpacing: '1px'
            }}>
              BA
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: '800', letterSpacing: '-0.3px', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#64748B', fontWeight: '600' }}>Barrio / Comuna:</span>
                <span style={{ color: '#0C2331', fontWeight: '900' }}>
                  {reunion?.comuna || 'Ciudad de Buenos Aires'}
                </span>
              </div>
              <div style={{ fontSize: '0.76rem', color: '#475569', fontWeight: '500' }}>
                {reunion?.nombre || 'Reunión con Vecinos'}
              </div>
            </div>
          </div>

          {/* SCORECARDS INSTITUCIONALES DE ORADORES */}
          {metricsOradores.total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Total Oradores */}
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                padding: '3px 12px',
                textAlign: 'center',
                minWidth: '70px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontSize: '0.60rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Total
                </div>
                <div style={{ fontSize: '1.12rem', fontWeight: '900', color: '#0C2331', lineHeight: '1.1' }}>
                  {metricsOradores.total}
                </div>
              </div>

              {/* Hablaron */}
              <div style={{
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: '8px',
                padding: '3px 12px',
                textAlign: 'center',
                minWidth: '70px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontSize: '0.60rem', fontWeight: '800', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Hablaron
                </div>
                <div style={{ fontSize: '1.12rem', fontWeight: '900', color: '#059669', lineHeight: '1.1' }}>
                  {metricsOradores.hablaron}
                </div>
              </div>

              {/* Faltan */}
              <div style={{
                backgroundColor: 'rgba(2, 132, 199, 0.08)',
                border: '1px solid rgba(2, 132, 199, 0.35)',
                borderRadius: '8px',
                padding: '3px 12px',
                textAlign: 'center',
                minWidth: '70px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
              }}>
                <div style={{ fontSize: '0.60rem', fontWeight: '800', color: '#0284C7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Faltan
                </div>
                <div style={{ fontSize: '1.12rem', fontWeight: '900', color: '#0284C7', lineHeight: '1.1' }}>
                  {metricsOradores.faltan}
                </div>
              </div>
            </div>
          )}

          {/* EN VIVO + Tarjeta Reloj/Fecha Original BA + Pantalla Completa agrupados a la izquierda del timer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              padding: '4px 10px',
              borderRadius: '20px',
              color: '#DC2626',
              fontSize: '0.74rem',
              fontWeight: '800',
              letterSpacing: '0.5px'
            }}>
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: '#EF4444',
                boxShadow: '0 0 8px #EF4444',
                animation: 'pulse 1.5s infinite'
              }}></span>
              EN VIVO
            </div>

            {/* Tarjeta de Fecha y Hora al estilo original BA de las fotos */}
            <div style={{
              backgroundColor: '#0C2331',
              borderRadius: '8px',
              padding: '4px 14px',
              textAlign: 'right',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              border: '1px solid rgba(121, 222, 200, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}>
              <div style={{ fontSize: '0.68rem', color: '#94A3B8', textTransform: 'lowercase', fontWeight: '500', letterSpacing: '-0.2px' }}>
                {currentDateFormatted}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#FFFFFF', lineHeight: '1.1', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                {currentTimeFormatted}
              </div>
            </div>

            <button
              type="button"
              onClick={toggleFullscreen}
              style={{
                background: '#F1F5F9',
                border: '1px solid #CBD5E1',
                color: '#1E293B',
                borderRadius: '6px',
                padding: '5px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.75rem',
                fontWeight: '700'
              }}
              title="Pantalla Completa (F11)"
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              <span>{isFullscreen ? 'Salir' : 'Pantalla Completa'}</span>
            </button>
          </div>
        </header>

        {/* 2. ÁREA PRINCIPAL: MAPA TERRITORIAL DE RECLAMOS */}
        <div style={{ flex: 1, position: 'relative', height: 'calc(100vh - 68px)' }}>
          {reunion ? (
            <MapaReclamosComuna
              reunion={reunion}
              solicitudes={solicitudes}
              highlightDni={activeSpeakerDni}
              proyectorMode={true}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748B' }}>
              Cargando mapa territorial...
            </div>
          )}
        </div>
      </div>

      {/* SECCIÓN DERECHA: SIDEBAR COMPLETO HASTA ARRIBA (100VH) - MÁS ESPACIO PARA EL TIMER Y COLA */}
      <aside style={{
        width: '440px',
        height: '100vh',
        backgroundColor: '#FFFFFF',
        borderLeft: '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px 18px',
        boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.05)',
        zIndex: 950,
        overflowY: 'auto'
      }}>
        {/* BLOQUE 1: ORADOR ACTUAL + RELOJ CIRCULAR AMPLIADO (180px) O DEVOLUCIÓN DEL FUNCIONARIO */}
        <div style={{
          backgroundColor: '#F8FAFC',
          border: isDevolucion
            ? '2.5px solid #0C2331'
            : (isFinished 
                ? '2px solid #79DEC8' 
                : (activeSpeaker ? '2px solid #0284C7' : '1.5px solid #E2E8F0')),
          borderRadius: '14px',
          padding: '16px 18px',
          boxShadow: isDevolucion
            ? '0 6px 20px rgba(12, 35, 49, 0.08)'
            : '0 2px 10px rgba(0, 0, 0, 0.03)',
          transition: 'all 0.3s ease',
          flexShrink: 0
        }}>
          {isDevolucion ? (
            /* BLOQUE: EN DEVOLUCIÓN DEL FUNCIONARIO (SIN TIMER) */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              padding: '8px 4px',
              animation: 'fadeIn 0.3s ease'
            }}>
              {/* Badge superior */}
              <div style={{
                backgroundColor: '#0C2331',
                color: '#79DEC8',
                fontSize: '0.74rem',
                fontWeight: '900',
                padding: '4px 12px',
                borderRadius: '20px',
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '14px'
              }}>
                <Mic size={13} className="animate-pulse" />
                <span>Devolución Institucional en Vivo</span>
              </div>

              {/* Ícono institucional BA */}
              <div style={{
                width: '74px',
                height: '74px',
                borderRadius: '50%',
                backgroundColor: '#FEF9C3',
                border: '3px solid #FFC700',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '14px',
                boxShadow: '0 4px 16px rgba(255, 199, 0, 0.28)'
              }}>
                <UserCheck size={38} style={{ color: '#0C2331' }} />
              </div>

              {/* Rótulo de autoridad */}
              <div style={{
                fontSize: '0.76rem',
                fontWeight: '800',
                color: '#64748B',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '4px'
              }}>
                Palabra y cierre de autoridades
              </div>

              {/* Mensaje solicitado: "En devolución de XXXX" */}
              <div style={{
                fontSize: '1.65rem',
                fontWeight: '900',
                color: '#0C2331',
                lineHeight: '1.2',
                marginBottom: '10px',
                letterSpacing: '-0.3px'
              }}>
                En devolución de {devolucionFuncionario || reunion?.funcionario || 'el Funcionario'}
              </div>

              <p style={{
                fontSize: '0.86rem',
                color: '#475569',
                margin: '0 0 16px 0',
                lineHeight: '1.4',
                maxWidth: '300px'
              }}>
                Respuestas integrales a los reclamos, solicitudes y consultas presentadas por los vecinos en la reunión.
              </p>

              <div style={{
                backgroundColor: '#E2E8F0',
                color: '#0F172A',
                fontSize: '0.74rem',
                fontWeight: '700',
                padding: '4px 14px',
                borderRadius: '20px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>🏛️</span>
                <span>Gobierno de la Ciudad de Buenos Aires</span>
              </div>
            </div>
          ) : (
            /* VISTA HABITUAL: ORADOR ACTIVO O EN ESPERA CON TIMER */
            <>
              {/* Header del orador */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{
                  backgroundColor: activeSpeaker ? '#FFC700' : '#E2E8F0',
                  color: activeSpeaker ? '#070E1A' : '#475569',
                  fontSize: '0.74rem',
                  fontWeight: '900',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <Mic size={13} className={activeSpeaker ? 'animate-pulse' : ''} />
                  {activeSpeaker ? 'Vecino en el Micrófono' : 'Micrófono en Espera'}
                </span>

                {activeSpeaker?.orden ? (
                  <span style={{ fontSize: '0.82rem', fontWeight: '900', color: '#0C2331', fontFamily: 'monospace' }}>
                    Orador #{activeSpeaker.orden}
                  </span>
                ) : activeSpeaker?.horario ? (
                  <span style={{ fontSize: '0.74rem', color: '#64748B', fontFamily: 'monospace' }}>
                    {activeSpeaker.horario}
                  </span>
                ) : null}
              </div>

              {/* Nombre del orador: SOLO NOMBRE (sin apellido) */}
              <div style={{
                fontSize: '1.55rem',
                fontWeight: '900',
                color: '#0C2331',
                lineHeight: '1.15',
                marginBottom: '3px',
                letterSpacing: '-0.3px'
              }}>
                {activeSpeaker ? speakerSoloNombre : 'Aguardando próximo orador...'}
              </div>

              {/* Tema del orador */}
              <div style={{
                fontSize: '0.84rem',
                color: '#475569',
                marginBottom: '12px',
                lineHeight: '1.3',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {activeSpeaker ? (
                  <span><strong style={{ color: '#0C2331' }}>Tema:</strong> {activeSpeaker.tema || 'Intervención vecinal'}</span>
                ) : (
                  <span style={{ fontStyle: 'italic', color: '#94A3B8' }}>El moderador habilitará la palabra desde su panel</span>
                )}
              </div>

              {/* RELOJ CIRCULAR CUENTA REGRESIVA AMPLIADO (180px) */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 0'
              }}>
                <div style={{
                  width: '180px',
                  height: '180px',
                  borderRadius: '50%',
                  border: '5px solid #79DEC8',
                  boxShadow: isFinished
                    ? '0 0 30px rgba(121, 222, 200, 0.75)'
                    : (activeSpeaker ? '0 4px 18px rgba(12, 35, 49, 0.25)' : '0 4px 14px rgba(0, 0, 0, 0.12)'),
                  background: isFinished
                    ? '#79DEC8'
                    : (activeSpeaker && activeTimer > 0
                        ? `conic-gradient(#79DEC8 0% ${percentElapsed}%, #0C2331 ${percentElapsed}% 100%)`
                        : '#0C2331'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  transition: 'background 0.25s linear, box-shadow 0.3s ease',
                  animation: isFinished ? 'pulseScale 1.8s infinite ease-in-out' : 'none'
                }}>
                  {isFinished ? (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFFFFF',
                      fontWeight: '900',
                      fontSize: '1.25rem',
                      lineHeight: '1.15',
                      letterSpacing: '0.5px',
                      textAlign: 'center',
                      textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                    }}>
                      <span>TIEMPO</span>
                      <span>FINALIZADO</span>
                    </div>
                  ) : (
                    <div style={{
                      color: '#FFFFFF',
                      fontWeight: '900',
                      fontSize: '2.8rem',
                      letterSpacing: '1px',
                      lineHeight: '1',
                      fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      textShadow: '0 0 14px rgba(12, 35, 49, 0.95), 0 2px 8px rgba(0, 0, 0, 0.95)',
                      zIndex: 2
                    }}>
                      {countdownFormatted}
                    </div>
                  )}
                </div>

                {/* Status debajo del reloj */}
                <div style={{ marginTop: '8px', textAlign: 'center' }}>
                  {isFinished ? (
                    <span style={{
                      backgroundColor: '#79DEC8',
                      color: '#0C2331',
                      fontSize: '0.74rem',
                      fontWeight: '900',
                      padding: '3px 12px',
                      borderRadius: '20px',
                      letterSpacing: '0.5px'
                    }}>
                      ⏱️ TIEMPO CUMPLIDO
                    </span>
                  ) : isWarning ? (
                    <span style={{
                      backgroundColor: '#FEF3C7',
                      color: '#D97706',
                      border: '1px solid #FCD34D',
                      fontSize: '0.72rem',
                      fontWeight: '800',
                      padding: '2px 10px',
                      borderRadius: '20px'
                    }}>
                      ⚠️ Últimos {remainingSecs}s
                    </span>
                  ) : activeSpeaker ? (
                    <span style={{
                      backgroundColor: '#E0F2FE',
                      color: '#0369A1',
                      border: '1px solid #BAE6FD',
                      fontSize: '0.72rem',
                      fontWeight: '700',
                      padding: '2px 10px',
                      borderRadius: '20px'
                    }}>
                      Cuenta regresiva en curso
                    </span>
                  ) : (
                    <span style={{ color: '#64748B', fontSize: '0.72rem', fontStyle: 'italic' }}>
                      Listo para iniciar • 2:00
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* BLOQUE 2: PRÓXIMOS 4 ORADORES (FORMATO TABLA BA - SIEMPRE VISIBLE) */}
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #CBD5E1',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          flexShrink: 0
        }}>
          {/* Header estilo tabla BA (VECINO | TEMA) */}
          <div style={{
            backgroundColor: '#0C2331',
            padding: '9px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '2px solid #79DEC8'
          }}>
            <span style={{
              fontSize: '0.76rem',
              fontWeight: '900',
              color: '#FFFFFF',
              letterSpacing: '1px',
              textTransform: 'uppercase'
            }}>
              VECINO
            </span>
            <span style={{
              fontSize: '0.76rem',
              fontWeight: '900',
              color: '#79DEC8',
              letterSpacing: '1px',
              textTransform: 'uppercase'
            }}>
              TEMA
            </span>
          </div>

          {nextSpeakers && nextSpeakers.length > 0 ? (
            <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {nextSpeakers.map((spk, idx) => {
                const spkSoloNombre = getSoloNombre(spk.nombre, spk.vecino);
                return (
                  <div
                    key={spk.id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      borderLeft: '3px solid #0C2331',
                      border: '1px solid #E2E8F0',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '0', flex: 1 }}>
                      <span style={{
                        fontSize: '0.92rem',
                        fontWeight: '900',
                        color: '#0C2331',
                        fontFamily: 'monospace',
                        minWidth: '20px'
                      }}>
                        {idx + 1}
                      </span>
                      <div style={{ minWidth: '0', flex: 1 }}>
                        <div style={{
                          fontSize: '0.85rem',
                          fontWeight: '700',
                          color: '#0F172A',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {spkSoloNombre}
                        </div>
                      </div>
                    </div>

                    <div style={{
                      fontSize: '0.74rem',
                      color: '#475569',
                      textAlign: 'right',
                      maxWidth: '160px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {spk.tema}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '14px', textAlign: 'center', color: '#64748B', fontSize: '0.78rem', fontStyle: 'italic' }}>
              Aguardando oradores en espera...
            </div>
          )}
        </div>

        {/* BLOQUE 3: DETALLE DEL RECLAMO / CONSULTA EN SALA DEL ORADOR */}
        <div style={{
          backgroundColor: '#F8FAFC',
          border: activeSpeaker ? '1.5px solid #0284C7' : '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '12px 14px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '0.74rem',
              fontWeight: '800',
              color: activeSpeaker ? '#0284C7' : '#64748B',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              <MapPin size={13} /> {speakerClaim ? 'Reclamo Registrado en Sala' : 'Consulta en Tratamiento'}
            </div>
            {speakerClaim?.tematica && (
              <span style={{
                backgroundColor: '#E0F2FE',
                color: '#0369A1',
                fontSize: '0.68rem',
                fontWeight: '800',
                padding: '2px 8px',
                borderRadius: '10px'
              }}>
                {speakerClaim.tematica}
              </span>
            )}
          </div>

          {isDevolucion ? (
            <div style={{ textAlign: 'center', padding: '12px 8px' }}>
              <div style={{ fontSize: '0.84rem', fontWeight: '800', color: '#0F172A', marginBottom: '4px' }}>
                🗺️ Mapa Territorial Completo
              </div>
              <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: '1.4' }}>
                Todos los puntos geolocalizados de la Comuna se encuentran proyectados en el mapa mientras las autoridades realizan la devolución.
              </div>
            </div>
          ) : activeSpeaker ? (
            speakerClaim ? (
              <>
                <div style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0F172A', marginBottom: '4px' }}>
                  📍 {speakerClaim.direccion || 'Ubicación señalada en el mapa'}
                </div>
                <div style={{
                  fontSize: '0.80rem',
                  color: '#334155',
                  lineHeight: '1.4',
                  fontStyle: 'italic',
                  backgroundColor: '#FFFFFF',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  marginBottom: '8px',
                  maxHeight: '110px',
                  overflowY: 'auto'
                }}>
                  "{speakerClaim.descripcion}"
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', justifyContent: 'space-between' }}>
                  <span>👤 Vecino: <strong>{speakerSoloNombre}</strong></span>
                  <span style={{ color: '#0284C7', fontWeight: '700' }}>✓ Señalado en el mapa</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#0F172A', marginBottom: '4px' }}>
                  💬 Tema planteado:
                </div>
                <div style={{
                  fontSize: '0.80rem',
                  color: '#334155',
                  lineHeight: '1.4',
                  fontStyle: 'italic',
                  backgroundColor: '#FFFFFF',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  marginBottom: '8px'
                }}>
                  "{activeSpeaker.tema || 'Exposición vecinal en tratamiento'}"
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', justifyContent: 'space-between' }}>
                  <span>👤 Vecino: <strong>{speakerSoloNombre}</strong></span>
                  <span>📋 En diálogo con el funcionario</span>
                </div>
              </>
            )
          ) : (
            <div style={{ textAlign: 'center', padding: '10px', color: '#94A3B8', fontSize: '0.76rem', fontStyle: 'italic' }}>
              Aguardando orador... Al habilitar la palabra, se proyectará aquí el detalle del reclamo o consulta.
            </div>
          )}
        </div>

          {/* Footer del sidebar */}
          <div style={{ textAlign: 'center', fontSize: '0.68rem', color: '#94A3B8', marginTop: 'auto' }}>
            Pantalla de Escritorio Extendido • Sincronización Automática
          </div>
        </aside>
    </div>
  );
}
