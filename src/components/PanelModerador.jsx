import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Mic, Users, Trash2, ArrowUp, ArrowDown, Share2, Clipboard, Check, RefreshCw, Plus } from 'lucide-react';
import { updateReunion, getOradores, updateOradorDetails, getAsistentesPorReunion, registrarOrador, guardarAsistencia } from '../services/supabaseService';
import { supabase } from '../lib/supabaseClient';

const SEMAFORO_MAP = {
  verde: { label: '🟢 Verde - Sin riesgo', waLabel: '🟢 sin riesgo' },
  amarillo: { label: '🟡 Amarillo - Requiere seguimiento', waLabel: '🟡 requiere seguimiento' },
  rojo: { label: '🔴 Rojo - Crítico', waLabel: '🔴 crítico' }
};

const CLIMA_MAP = {
  bajo: { label: '🔥 Clima bajo', waLabel: 'bajo' },
  medio: { label: '🔥 Clima medio', waLabel: 'medio' },
  alto: { label: '🔥 Clima caliente', waLabel: 'caliente' }
};

export default function PanelModerador({ reunion, onBack }) {
  // Datos cualitativos de la reunión
  const [clima, setClima] = useState(reunion.clima || 'bajo');
  const [semaforoPolitico, setSemaforoPolitico] = useState(reunion.semaforo_politico || 'verde');
  const [sintesisCualitativa, setSintesisCualitativa] = useState(reunion.sintesis_cualitativa || '');
  const [gestionPresente, setGestionPresente] = useState(
    reunion.gestion_presente || `- ${reunion.funcionario || 'Funcionario'}\n`
  );
  const [horaInicioReal, setHoraInicioReal] = useState(reunion.hora_inicio_real || '');
  const [horaFinReal, setHoraFinReal] = useState(reunion.hora_fin_real || '');
  const [savingReunion, setSavingReunion] = useState(false);

  // Datos de asistencia de inscriptos
  const [inscriptosCount, setInscriptosCount] = useState(0);
  const [presentesCount, setPresentesCount] = useState(0);
  const [ratioAsistencia, setRatioAsistencia] = useState(0);
  const [asistentes, setAsistentes] = useState([]);
  const [selectedLastMinuteDni, setSelectedLastMinuteDni] = useState('');

  // Historial de asistencias/oratorias para visualización en moderación
  const [vecinoStatsMap, setVecinoStatsMap] = useState({});

  // Búsqueda y creación de vecinos sobre la marcha
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  
  const [newDni, setNewDni] = useState('');
  const [newNombre, setNewNombre] = useState('');
  const [newApellido, setNewApellido] = useState('');
  const [newCelular, setNewCelular] = useState('');

  // Cola de oradores
  const [oradores, setOradores] = useState([]);
  const [loadingOradores, setLoadingOradores] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [activeSpeakerTimer, setActiveSpeakerTimer] = useState(0);
  const [speakerTimerInterval, setSpeakerTimerInterval] = useState(null);
  
  // Campo de edición de minuta en vivo
  const [liveMinuta, setLiveMinuta] = useState('');
  
  // Campo para edición rápida de tema original en la lista
  const [editingOradorId, setEditingOradorId] = useState(null);
  const [editingTemaText, setEditingTemaText] = useState('');

  // Edición de minutas de oradores finalizados
  const [editingFinishedId, setEditingFinishedId] = useState(null);
  const [editingFinishedText, setEditingFinishedText] = useState('');

  // Cargar datos de asistencia
  const loadHistoricalStatsForVecinos = async (dnis) => {
    if (!dnis || dnis.length === 0) return;
    try {
      // 1. Obtener asistencias históricas
      const { data: asistencias, error: errAsist } = await supabase
        .from('inscripciones_asistencias')
        .select('vecino_id, asistio')
        .in('vecino_id', dnis);

      if (errAsist) throw errAsist;

      // 2. Obtener oratorias históricas (excluyendo la reunión actual)
      const { data: oradoresHist, error: errOrad } = await supabase
        .from('oradores')
        .select('vecino_id, reunion_id')
        .eq('estado', 'hablo')
        .neq('reunion_id', reunion.id)
        .in('vecino_id', dnis);

      if (errOrad) throw errOrad;

      const statsMap = {};
      dnis.forEach(dni => {
        statsMap[dni] = { asistencias: 0, orador: 0 };
      });

      asistencias?.forEach(asis => {
        if (asis.asistio) {
          if (!statsMap[asis.vecino_id]) statsMap[asis.vecino_id] = { asistencias: 0, orador: 0 };
          statsMap[asis.vecino_id].asistencias = (statsMap[asis.vecino_id].asistencias || 0) + 1;
        }
      });

      oradoresHist?.forEach(orad => {
        if (!statsMap[orad.vecino_id]) statsMap[orad.vecino_id] = { asistencias: 0, orador: 0 };
        statsMap[orad.vecino_id].orador = (statsMap[orad.vecino_id].orador || 0) + 1;
      });

      setVecinoStatsMap(prev => ({ ...prev, ...statsMap }));
    } catch (err) {
      console.error('Error cargando estadísticas históricas:', err);
    }
  };

  // Cargar datos de asistencia
  const loadAsistenciaStats = async () => {
    try {
      const { data, error } = await getAsistentesPorReunion(reunion.id);
      if (!error && data) {
        setAsistentes(data);
        const total = data.length;
        const presentes = data.filter(a => a.asistio).length;
        setInscriptosCount(total);
        setPresentesCount(presentes);
        setRatioAsistencia(total > 0 ? Math.round((presentes / total) * 100) : 0);

        const dnis = data.map(a => a.vecino_id);
        if (dnis.length > 0) {
          loadHistoricalStatsForVecinos(dnis);
        }
      }
    } catch (err) {
      console.error('Error al cargar estadísticas de asistencia:', err);
    }
  };

  // Cargar y normalizar cola de oradores
  const loadOradores = async () => {
    setLoadingOradores(true);
    try {
      const { data, error } = await getOradores(reunion.id);
      if (!error && data) {
        // Ordenar por el campo 'orden' de Supabase
        const sorted = data.sort((a, b) => (a.orden || 0) - (b.orden || 0));
        
        // Si hay oradores que no tienen un número de orden secuencial asignado,
        // lo normalizamos secuencialmente en el primer renderizado.
        const needsNormalization = sorted.some((item, idx) => item.orden !== idx + 1);
        if (needsNormalization) {
          const promises = sorted.map((item, idx) => {
            item.orden = idx + 1;
            return updateOradorDetails(item.id, { orden: idx + 1 });
          });
          await Promise.all(promises);
        }

        setOradores(sorted);

        const dnis = sorted.map(o => o.vecino_id);
        if (dnis.length > 0) {
          loadHistoricalStatsForVecinos(dnis);
        }
      }
    } catch (err) {
      console.error('Error al cargar oradores:', err);
    } finally {
      setLoadingOradores(false);
    }
  };

  const handleAddLastMinuteSpeaker = async (dni) => {
    if (!dni) return;
    const attendee = asistentes.find(a => a.vecino_id === dni);
    if (!attendee) return;
    
    const maxOrden = oradores.reduce((max, o) => Math.max(max, o.orden || 0), 0);
    
    const newOrador = {
      reunion_id: reunion.id,
      vecino_id: dni,
      estado: 'en_espera',
      orden: maxOrden + 1,
      tema_original: 'Orador de último momento'
    };
    
    const { data, error } = await registrarOrador(newOrador);
    if (!error) {
      setSelectedLastMinuteDni('');
      await loadOradores();
      alert('Orador agregado exitosamente a la cola.');
    } else {
      alert(`Error al registrar orador: ${error.message}`);
    }
  };

  const handleSearchVecinos = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    setShowRegisterForm(false);
    try {
      const q = searchQuery.trim();
      const { data, error } = await supabase
        .from('vecinos')
        .select('*')
        .or(`dni.eq.${q},nombre.ilike.%${q}%,apellido.ilike.%${q}%`)
        .limit(5);
        
      if (!error && data) {
        setSearchResults(data);
        if (data.length === 0) {
          if (/^\d+$/.test(q)) {
            setNewDni(q);
          } else {
            setNewDni('');
          }
          setShowRegisterForm(true);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const handleAddSearchedSpeaker = async (vecino) => {
    try {
      // 1. Asegurar registro de asistencia
      const { data: attendance } = await supabase
        .from('inscripciones_asistencias')
        .select('*')
        .eq('reunion_id', reunion.id)
        .eq('vecino_id', vecino.dni)
        .maybeSingle();
        
      if (!attendance) {
        await guardarAsistencia(reunion.id, vecino.dni, true, {
          estado_convocatoria: 'presente',
          como_se_entero: 'Espontáneo'
        });
        await loadAsistenciaStats();
      }
    } catch (err) {
      console.error(err);
    }

    // 2. Agregar como orador
    await handleAddLastMinuteSpeaker(vecino.dni);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleCreateAndAddSpeaker = async (e) => {
    e.preventDefault();
    if (!newDni.trim() || !newNombre.trim() || !newApellido.trim()) {
      alert('Por favor completa DNI, Nombre y Apellido.');
      return;
    }
    
    try {
      // 1. Upsert vecino
      const { error: vecError } = await supabase.from('vecinos').upsert({
        dni: newDni.trim(),
        nombre: newNombre.trim(),
        apellido: newApellido.trim(),
        celular: newCelular.trim() || null,
        comuna: reunion.comuna || 'Comuna 1'
      });
      
      if (vecError) throw vecError;
      
      // 2. Guardar asistencia
      await guardarAsistencia(reunion.id, newDni.trim(), true, {
        estado_convocatoria: 'presente',
        como_se_entero: 'Espontáneo'
      });
      
      // 3. Registrar como orador
      await handleAddLastMinuteSpeaker(newDni.trim());
      
      // Limpiar estados
      setShowRegisterForm(false);
      setSearchQuery('');
      setNewDni('');
      setNewNombre('');
      setNewApellido('');
      setNewCelular('');
      
      await loadAsistenciaStats();
    } catch (err) {
      console.error(err);
      alert(`Error al registrar vecino: ${err.message}`);
    }
  };

  useEffect(() => {
    loadAsistenciaStats();
    loadOradores();
  }, [reunion.id]);

  // Manejo del cronómetro del orador activo
  useEffect(() => {
    if (activeSpeaker) {
      const interval = setInterval(() => {
        setActiveSpeakerTimer(t => t + 1);
      }, 1000);
      setSpeakerTimerInterval(interval);
      return () => clearInterval(interval);
    } else {
      if (speakerTimerInterval) clearInterval(speakerTimerInterval);
      setActiveSpeakerTimer(0);
    }
  }, [activeSpeaker]);

  // Formatear segundos a MM:SS
  const formatSpeakerTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  // Guardar datos cualitativos en la tabla reuniones de Supabase
  const handleSaveCualitativos = async () => {
    setSavingReunion(true);
    try {
      const { error } = await updateReunion(reunion.id, {
        clima: clima,
        semaforo_politico: semaforoPolitico,
        sintesis_cualitativa: sintesisCualitativa.trim() || null,
        gestion_presente: gestionPresente.trim() || null,
        hora_inicio_real: horaInicioReal || null,
        hora_fin_real: horaFinReal || null
      });

      if (error) throw error;
      alert('¡Datos cualitativos guardados con éxito en la base de datos!');
    } catch (err) {
      console.error(err);
      alert(`Error al guardar cambios de la reunión: ${err.message}`);
    } finally {
      setSavingReunion(false);
    }
  };

  // Mover Orador en la Cola - ACTUALIZACIÓN OPTIMISTA (Optimistic UI)
  const handleMoveSpeaker = async (index, direction, queueItems) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= queueItems.length) return;

    // Respaldar estado anterior completo de oradores por si falla la red
    const previousOradores = [...oradores];

    // Clonar lista de oradores para alterar el estado visual localmente
    const newOradoresList = [...oradores];
    
    // Obtener los dos items a intercambiar dentro de la cola activa de "en_espera"
    const itemA = queueItems[index];
    const itemB = queueItems[targetIndex];

    // Encontrar sus índices en la lista general de oradores
    const idxA = newOradoresList.findIndex(o => o.id === itemA.id);
    const idxB = newOradoresList.findIndex(o => o.id === itemB.id);

    if (idxA === -1 || idxB === -1) return;

    // Intercambiar orden localmente
    const orderA = newOradoresList[idxA].orden;
    const orderB = newOradoresList[idxB].orden;

    newOradoresList[idxA].orden = orderB;
    newOradoresList[idxB].orden = orderA;

    // Reordenar la lista general
    newOradoresList.sort((a, b) => (a.orden || 0) - (b.orden || 0));

    // Actualizar UI de forma inmediata (en < 100ms)
    setOradores(newOradoresList);

    // Guardar cambios en segundo plano (Supabase)
    try {
      const { error: errA } = await updateOradorDetails(itemA.id, { orden: orderB });
      if (errA) throw errA;

      const { error: errB } = await updateOradorDetails(itemB.id, { orden: orderA });
      if (errB) throw errB;
      
      console.log(`[Optimistic UI] Reordenamiento exitoso para orador ID ${itemA.id} y ${itemB.id}`);
    } catch (err) {
      console.error('[Optimistic UI] Error al actualizar orden en Supabase, aplicando rollback:', err);
      // Reversión automática en caso de error de red
      setOradores(previousOradores);
      alert('Error de red al intentar reordenar oradores. Se revirtió al orden anterior.');
    }
  };

  // Acciones sobre los oradores
  const handleLlamarAlMic = (orador) => {
    setActiveSpeaker(orador);
    setLiveMinuta(orador.tema_efectivo || '');
    setActiveSpeakerTimer(0);
  };

  const handleCancelarMic = () => {
    setActiveSpeaker(null);
    setLiveMinuta('');
  };

  const handleFinalizarExposicion = async () => {
    if (!activeSpeaker) return;
    try {
      const { error } = await updateOradorDetails(activeSpeaker.id, {
        estado: 'hablo',
        tema_efectivo: liveMinuta.trim() || null,
        duracion_segundos: activeSpeakerTimer
      });

      if (error) throw error;

      // Actualizar localmente
      setOradores(prev => prev.map(o => {
        if (o.id === activeSpeaker.id) {
          return { 
            ...o, 
            estado: 'hablo', 
            tema_efectivo: liveMinuta.trim() || null,
            duracion_segundos: activeSpeakerTimer
          };
        }
        return o;
      }));

      setActiveSpeaker(null);
      alert('¡Orador marcado como efectivo y minuta guardada!');
    } catch (err) {
      console.error(err);
      alert(`Error al guardar exposición del orador: ${err.message}`);
    }
  };

  const handleMarcarSeBajo = async (oradorId) => {
    if (await confirm('¿Estás seguro de que esta persona se bajó de la cola de oradores?')) {
      try {
        const { error } = await updateOradorDetails(oradorId, {
          estado: 'se_bajo',
          tema_efectivo: null
        });

        if (error) throw error;

        setOradores(prev => prev.map(o => {
          if (o.id === oradorId) {
            return { ...o, estado: 'se_bajo', tema_efectivo: null };
          }
          return o;
        }));

        if (activeSpeaker && activeSpeaker.id === oradorId) {
          setActiveSpeaker(null);
        }
      } catch (err) {
        console.error(err);
        alert(`Error: ${err.message}`);
      }
    }
  };

  const handleMarcarNoHablo = async (oradorId) => {
    if (await confirm('¿Estás seguro de que esta persona no llegó a hablar?')) {
      try {
        const { error } = await updateOradorDetails(oradorId, {
          estado: 'no_hablo',
          tema_efectivo: null
        });

        if (error) throw error;

        setOradores(prev => prev.map(o => {
          if (o.id === oradorId) {
            return { ...o, estado: 'no_hablo', tema_efectivo: null };
          }
          return o;
        }));

        if (activeSpeaker && activeSpeaker.id === oradorId) {
          setActiveSpeaker(null);
        }
      } catch (err) {
        console.error(err);
        alert(`Error al cambiar el estado del orador: ${err.message}`);
      }
    }
  };

  const handleEliminarOrador = async (oradorId, nombreVecino) => {
    if (await confirm(`¿Estás seguro de que querés eliminar permanentemente a ${nombreVecino || 'este vecino'} de la lista de oradores?`)) {
      try {
        const { error } = await supabase
          .from('oradores')
          .delete()
          .eq('id', oradorId);

        if (error) throw error;

        // Quitar de la UI
        setOradores(prev => prev.filter(o => o.id !== oradorId));
        if (activeSpeaker && activeSpeaker.id === oradorId) {
          setActiveSpeaker(null);
        }
        alert('¡Orador eliminado con éxito!');
      } catch (err) {
        console.error(err);
        alert(`Error al eliminar orador: ${err.message}`);
      }
    }
  };

  const handleDevolverACola = async (oradorId) => {
    try {
      const { error } = await updateOradorDetails(oradorId, {
        estado: 'en_espera'
      });

      if (error) throw error;

      setOradores(prev => prev.map(o => {
        if (o.id === oradorId) {
          return { ...o, estado: 'en_espera' };
        }
        return o;
      }));
    } catch (err) {
      console.error(err);
      alert(`Error: ${err.message}`);
    }
  };

  const handleSaveTemaEdicion = async (oradorId) => {
    try {
      const { error } = await updateOradorDetails(oradorId, {
        tema_original: editingTemaText
      });

      if (error) throw error;

      setOradores(prev => prev.map(o => {
        if (o.id === oradorId) {
          return { ...o, tema_original: editingTemaText };
        }
        return o;
      }));

      setEditingOradorId(null);
    } catch (err) {
      console.error(err);
      alert(`Error al actualizar tema original: ${err.message}`);
    }
  };
  const handleSaveFinishedMinuta = async (oradorId) => {
    try {
      const { error } = await updateOradorDetails(oradorId, {
        tema_efectivo: editingFinishedText
      });

      if (error) throw error;

      setOradores(prev => prev.map(o => {
        if (o.id === oradorId) {
          return { ...o, tema_efectivo: editingFinishedText };
        }
        return o;
      }));

      setEditingFinishedId(null);
    } catch (err) {
      console.error(err);
      alert(`Error al guardar minuta: ${err.message}`);
    }
  };

  // Copiar resumen con formato WhatsApp solicitado al portapapeles
  const handleCopyWhatsAppText = async () => {
    try {
      // Formatear la fecha
      let displayFecha = '';
      let displayHora = '17 hs';
      if (reunion.fecha) {
        const parts = reunion.fecha.split('-');
        if (parts.length === 3) {
          displayFecha = `${parts[2]}/${parts[1]}`;
        }
      }
      
      // Obtener hora de la reunion formateada si existe
      if (reunion.nombre && reunion.nombre.includes('-')) {
        const nameParts = reunion.nombre.split('-');
        const lastPart = nameParts[nameParts.length - 1].trim();
        if (lastPart.toLowerCase().includes('hs') || lastPart.toLowerCase().includes('h')) {
          displayHora = lastPart.toLowerCase().replace('hs', ' hs').replace('h', ' hs');
        }
      }

      const oradoresAnotados = oradores.length;
      const oradoresEfectivos = oradores.filter(o => o.estado === 'hablo');

      const txt = `👨👩👧👦 RDV | *${reunion.funcionario || reunion.nombre}* - ${reunion.comuna}
📅 ${displayFecha || 'Fecha'} | 🕠 ${displayHora}
⏰ Inicio: ${horaInicioReal || '--:--'} hs | Finalizó: ${horaFinReal || '--:--'} hs

📋 Inscriptos: ${inscriptosCount}
👥 Asistentes: ${presentesCount} (${ratioAsistencia}%)
📝 Oradores anotados: ${oradoresAnotados}
 🎤 Oradores efectivos: ${oradoresEfectivos.length}

🔥 Clima ${CLIMA_MAP[clima]?.waLabel || clima}
🚦 Semáforo político: ${SEMAFORO_MAP[semaforoPolitico]?.waLabel || semaforoPolitico}

*📝 Síntesis cualitativa:*
${sintesisCualitativa.trim() || 'La reunión se desarrolló con normalidad.'}

*🏛️ Gestión presente:*
${gestionPresente.trim() || '- ' + (reunion.funcionario || 'Funcionario')}

*📌 Temas más comentados:*
${oradoresEfectivos.length > 0 
  ? oradoresEfectivos.map(o => {
      const tel = o.vecino?.celular ? ` ${o.vecino.celular}` : '';
      return `${o.vecino?.nombre} ${o.vecino?.apellido}${tel}: ${o.tema_efectivo || o.tema_original || 'Sin minuta registrada.'}`;
    }).join('\n\n')
  : 'No se registraron oradores efectivos.'
}`;

      await navigator.clipboard.writeText(txt);
      alert('¡Resumen de WhatsApp copiado con éxito al portapapeles!');
    } catch (err) {
      console.error(err);
      alert('No se pudo copiar automáticamente. Por favor seleccioná el texto y copialo manualmente.');
    }
  };

  // Clasificar oradores para la UI
  const queueActive = oradores.filter(o => o.estado === 'en_espera');
  const queueFinished = oradores.filter(o => o.estado === 'hablo' || o.estado === 'se_bajo');
  const potentialSpeakers = asistentes.filter(a => 
    !oradores.some(o => o.vecino_id === a.vecino_id)
  );

  return (
    <div className="container" style={{ paddingBottom: '4rem', maxWidth: '900px' }}>
      {/* Botón de volver */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={16} /> Volver al Tablero
        </button>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', margin: 0, fontWeight: '700' }}>
          Panel de Moderación de Reunión
        </h2>
      </div>

      {/* Tarjeta de Información General */}
      <div className="card" style={{ marginBottom: '1.5rem', backgroundColor: 'var(--bg-header)', color: '#ffffff', border: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h3 style={{ fontSize: '1.4rem', margin: '0 0 4px 0', fontWeight: '700', color: 'var(--color-highlight)' }}>
              {reunion.nombre}
            </h3>
            <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9 }}>
              Lugar: <strong>{reunion.lugar}</strong> | Fecha: <strong>{reunion.fecha}</strong>
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff', fontSize: '0.8rem', padding: '6px 12px' }}>
              {reunion.tipo_reunion}
            </span>
            <div style={{ marginTop: '8px', fontSize: '0.8rem', opacity: 0.9 }}>
              Comuna: <strong>{reunion.comuna}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* AGREGAR ORADORES DE ÚLTIMO MOMENTO */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '16px', backgroundColor: '#F8FAFC', border: '1px dashed var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={16} style={{ color: 'var(--color-highlight)' }} />
            <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--color-primary)', fontWeight: '700' }}>
              Agregar oradores de último momento
            </h4>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            Permite sumar vecinos anotados en asistencia o registrar nuevos vecinos espontáneos.
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          
          {/* Opción A: Seleccionar de la asistencia pre-cargada */}
          <div style={{ borderRight: '1px solid var(--color-border)', paddingRight: '1rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Opción A: Vecinos en la Asistencia ({potentialSpeakers.length})</div>
            {potentialSpeakers.length > 0 ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  className="form-control form-control-sm"
                  value={selectedLastMinuteDni}
                  onChange={(e) => setSelectedLastMinuteDni(e.target.value)}
                  style={{ fontSize: '0.85rem', flex: 1 }}
                >
                  <option value="">-- Seleccionar Vecino --</option>
                  {potentialSpeakers.map(a => {
                    const stats = vecinoStatsMap[a.vecino_id];
                    const statsText = stats && (stats.asistencias > 0 || stats.orador > 0)
                      ? ` (${stats.asistencias} asist. / ${stats.orador} orad.)`
                      : '';
                    return (
                      <option key={a.vecino_id} value={a.vecino_id}>
                        {a.vecino?.nombre} {a.vecino?.apellido} ({a.vecino_id}){statsText}
                      </option>
                    );
                  })}
                </select>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleAddLastMinuteSpeaker(selectedLastMinuteDni)}
                  disabled={!selectedLastMinuteDni}
                  style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px' }}
                >
                  <Plus size={14} /> Agregar
                </button>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                No hay vecinos inscriptos pendientes. Usá la Opción B.
              </p>
            )}
          </div>

          {/* Opción B: Buscar en padrón general o crear vecino */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Opción B: Buscar en Padrón o Registrar</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="DNI o Nombre..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ fontSize: '0.85rem', flex: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchVecinos()}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleSearchVecinos}
                disabled={searching}
                style={{ whiteSpace: 'nowrap', padding: '6px 12px' }}
              >
                {searching ? 'Buscando...' : 'Buscar'}
              </button>
            </div>

            {/* Resultados de búsqueda */}
            {searchResults.length > 0 && (
              <div style={{ backgroundColor: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: '6px', maxHeight: '120px', overflowY: 'auto', marginBottom: '8px' }}>
                {searchResults.map(v => (
                  <div 
                    key={v.dni} 
                    onClick={() => handleAddSearchedSpeaker(v)}
                    style={{ padding: '6px 10px', fontSize: '0.8rem', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    className="search-item-hover"
                  >
                    <span><strong>{v.nombre} {v.apellido}</strong> ({v.dni})</span>
                    <span style={{ color: 'var(--color-highlight)', fontWeight: 'bold', fontSize: '0.75rem' }}>+ Agregar</span>
                  </div>
                ))}
              </div>
            )}

            {/* Formulario de registro si no se encuentra */}
            {showRegisterForm && (
              <form onSubmit={handleCreateAndAddSpeaker} style={{ backgroundColor: '#EFF6FF', padding: '8px', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
                <span style={{ fontSize: '0.75rem', color: '#1E40AF', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
                  ⚠️ Vecino no encontrado. Registrar y agregar orador:
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="DNI"
                    value={newDni}
                    onChange={(e) => setNewDni(e.target.value)}
                    style={{ fontSize: '0.75rem' }}
                    required
                  />
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Celular (Opcional)"
                    value={newCelular}
                    onChange={(e) => setNewCelular(e.target.value)}
                    style={{ fontSize: '0.75rem' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Nombre"
                    value={newNombre}
                    onChange={(e) => setNewNombre(e.target.value)}
                    style={{ fontSize: '0.75rem' }}
                    required
                  />
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Apellido"
                    value={newApellido}
                    onChange={(e) => setNewApellido(e.target.value)}
                    style={{ fontSize: '0.75rem' }}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-sm" style={{ width: '100%', fontSize: '0.75rem', padding: '4px' }}>
                  Crear y Agregar a la Cola
                </button>
              </form>
            )}
          </div>

        </div>
      </div>

      {/* SECCIÓN SUPERIOR: COLA ACTIVA (65%) Y MICRÓFONO EN VIVO (35%) */}
      <div style={{ display: 'grid', gridTemplateColumns: '65fr 35fr', gap: '1.5rem', alignItems: 'start', marginBottom: '1.5rem' }}>
        {/* 1. COLA DE ORADORES ACTIVOS */}
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ fontSize: '1.15rem', color: 'var(--color-primary)', marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', fontWeight: '700' }}>
            <Users size={18} style={{ color: 'var(--color-highlight)' }} />
            Cola Activa ({queueActive.length})
          </h3>

          {loadingOradores ? (
            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <RefreshCw className="spinner" size={24} style={{ color: 'var(--color-highlight)' }} />
              <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Cargando cola...</p>
            </div>
          ) : queueActive.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>
              {queueActive.map((item, index) => (
                <div key={item.id} style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px', backgroundColor: '#FFFFFF', display: 'flex', gap: '12px', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  
                  {/* Botones de ordenamiento optimista */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={index === 0}
                      onClick={() => handleMoveSpeaker(index, 'up', queueActive)}
                      style={{ padding: '4px', height: 'auto', minWidth: 'auto', color: index === 0 ? '#CBD5E1' : '#64748B' }}
                      title="Subir prioridad"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={index === queueActive.length - 1}
                      onClick={() => handleMoveSpeaker(index, 'down', queueActive)}
                      style={{ padding: '4px', height: 'auto', minWidth: 'auto', color: index === queueActive.length - 1 ? '#CBD5E1' : '#64748B' }}
                      title="Bajar prioridad"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>

                  {/* Datos del vecino */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        #{index + 1} - {item.vecino?.nombre} {item.vecino?.apellido}
                        {(() => {
                          const stats = vecinoStatsMap[item.vecino_id];
                          if (stats && (stats.asistencias > 0 || stats.orador > 0)) {
                            return (
                              <span 
                                style={{ fontSize: '0.7rem', backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold' }} 
                                title={`Historial de participación: ${stats.asistencias} asistencias y ${stats.orador} exposiciones`}
                              >
                                {stats.asistencias} asist. / {stats.orador} orad.
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: '500' }}>
                        {item.vecino?.celular || 'Sin celular'}
                      </span>
                    </div>
                    
                    {editingOradorId === item.id ? (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={editingTemaText}
                          onChange={(e) => setEditingTemaText(e.target.value)}
                          style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => handleSaveTemaEdicion(item.id)} style={{ padding: '4px 8px' }}>Guardar</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingOradorId(null)} style={{ padding: '4px 8px' }}>Cancelar</button>
                      </div>
                    ) : (
                      <div 
                        style={{ fontSize: '0.85rem', color: '#475569', cursor: 'pointer', fontStyle: 'italic' }} 
                        onClick={() => {
                          setEditingOradorId(item.id);
                          setEditingTemaText(item.tema_original || '');
                        }}
                        title="Click para editar tema"
                      >
                        "{item.tema_original || 'Tema no especificado'}"
                      </div>
                    )}
                  </div>

                  {/* Acciones */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleLlamarAlMic(item)}
                      style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: '600', backgroundColor: '#F0FDFA', color: '#0D9488', border: '1px solid #99F6E4', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Mic size={12} /> Mic
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleMarcarNoHablo(item.id)}
                      style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: '600', backgroundColor: '#FEF3C7', color: '#D97706', border: '1px solid #FCD34D', display: 'flex', alignItems: 'center', gap: '4px' }}
                      title="Marcar como que no llegó a hablar"
                    >
                      No habló
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleEliminarOrador(item.id, `${item.vecino?.nombre} ${item.vecino?.apellido}`)}
                      style={{ padding: '6px', color: '#EF4444', border: '1px solid #FCA5A5' }}
                      title="Eliminar orador permanentemente"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              No hay oradores en espera.
            </div>
          )}
        </div>

        {/* 2. VECINO EN EL MICRÓFONO (VIVO) */}
        <div className="card" style={{ margin: 0, border: '1px solid var(--color-highlight)', backgroundColor: '#F0FDFA' }}>
          <h3 style={{ fontSize: '1.15rem', color: 'var(--color-primary)', marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', fontWeight: '700' }}>
            <Mic size={18} style={{ color: 'var(--color-highlight)' }} />
            Vecino en el Mic (Vivo)
          </h3>

          {activeSpeaker ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <h4 style={{ margin: '0 0 2px 0', fontSize: '1.1rem', color: 'var(--color-primary)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {activeSpeaker.vecino?.nombre} {activeSpeaker.vecino?.apellido}
                    {(() => {
                      const stats = vecinoStatsMap[activeSpeaker.vecino_id];
                      if (stats && (stats.asistencias > 0 || stats.orador > 0)) {
                        return (
                          <span 
                            style={{ fontSize: '0.75rem', backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }} 
                            title={`Historial de participación: ${stats.asistencias} asistencias y ${stats.orador} exposiciones`}
                          >
                            Historial: {stats.asistencias} asist. / {stats.orador} orad.
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </h4>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    DNI: {activeSpeaker.vecino?.dni} | Tel: {activeSpeaker.vecino?.celular || 'Sin celular'}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ 
                    fontSize: '1.5rem', 
                    fontWeight: '700', 
                    color: activeSpeakerTimer >= 120 ? '#EF4444' : 'var(--color-primary)',
                    fontFamily: 'monospace'
                  }}>
                    {formatSpeakerTime(activeSpeakerTimer)}
                  </div>
                  {activeSpeakerTimer >= 120 && (
                    <span style={{ color: '#EF4444', fontSize: '0.7rem', fontWeight: '700', display: 'block' }}>
                      ¡Tiempo excedido!
                    </span>
                  )}
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '10px', border: '1px solid var(--color-border)', marginBottom: '12px', fontSize: '0.85rem', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Tema original:
                </div>
                "{activeSpeaker.tema_original || 'No especificado'}"
              </div>

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-primary)', marginBottom: '4px', display: 'block' }}>Minuta del Micrófono *</label>
                <textarea
                  className="form-control"
                  rows={4}
                  placeholder="Escribí la minuta final de lo que expone el vecino..."
                  value={liveMinuta}
                  onChange={(e) => setLiveMinuta(e.target.value)}
                  style={{ fontSize: '0.85rem', lineHeight: '1.3' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleFinalizarExposicion}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: '600', padding: '10px' }}
                >
                  <Check size={16} /> Finalizar y Guardar
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={handleCancelarMic}
                    style={{ flex: 1, fontWeight: '600', padding: '8px' }}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleMarcarSeBajo(activeSpeaker.id)}
                    style={{ flex: 1, color: '#EF4444', border: '1px solid #FCA5A5', padding: '8px' }}
                  >
                    Se Bajó
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              <Mic size={28} style={{ color: '#94A3B8', marginBottom: '8px' }} />
              <p style={{ margin: 0, fontWeight: '500' }}>No hay vecino activo.</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem' }}>Presioná "Mic" en la cola.</p>
            </div>
          )}
        </div>
      </div>

      {/* STACK VERTICAL DE COMPONENTES AL 100% ANCHO (SECCIÓN INFERIOR) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* 3. HISTORIAL / FINALIZADOS (100% WIDTH) */}
        <div className="card" style={{ margin: 0, backgroundColor: '#F8FAFC' }}>
          <h3 style={{ fontSize: '1.1rem', color: 'var(--color-primary)', marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', fontWeight: '700' }}>
            <Check size={18} style={{ color: 'var(--color-success)' }} />
            Ya expusieron / Se bajaron ({queueFinished.length})
          </h3>

          {queueFinished.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
              {queueFinished.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF', fontSize: '0.85rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', gap: '12px' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <strong style={{ color: 'var(--color-primary)' }}>
                        {item.vecino?.nombre} {item.vecino?.apellido}
                      </strong>
                      <span className={`badge ${item.estado === 'hablo' ? 'badge-success' : item.estado === 'no_hablo' ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: '12px' }}>
                        {item.estado === 'hablo' ? `Habló (${formatSpeakerTime(item.duracion_segundos || 0)})` : item.estado === 'no_hablo' ? 'No llegó a hablar' : 'Se bajó'}
                      </span>
                    </div>

                    {editingFinishedId === item.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                        <textarea
                          className="form-control form-control-sm"
                          rows={2}
                          value={editingFinishedText}
                          onChange={(e) => setEditingFinishedText(e.target.value)}
                          style={{ fontSize: '0.8rem', width: '100%', padding: '6px 10px', borderRadius: '6px' }}
                          placeholder="Escribí acá el comentario final..."
                        />
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn btn-primary btn-sm" onClick={() => handleSaveFinishedMinuta(item.id)} style={{ padding: '2px 8px', fontSize: '0.75rem' }}>Guardar</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditingFinishedId(null)} style={{ padding: '2px 8px', fontSize: '0.75rem' }}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      item.estado === 'hablo' && (
                        <div 
                          style={{ color: '#475569', fontSize: '0.8rem', fontStyle: 'italic', cursor: 'pointer', lineHeight: '1.4' }}
                          onClick={() => {
                            setEditingFinishedId(item.id);
                            setEditingFinishedText(item.tema_efectivo || item.tema_original || '');
                          }}
                          title="Click para editar minuta"
                        >
                          "{item.tema_efectivo || item.tema_original || 'Sin minuta registrada.'}"
                        </div>
                      )
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {item.estado === 'hablo' && editingFinishedId !== item.id && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setEditingFinishedId(item.id);
                          setEditingFinishedText(item.tema_efectivo || item.tema_original || '');
                        }}
                        style={{ padding: '4px 8px', fontSize: '0.75rem', fontWeight: '600' }}
                      >
                        Editar
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleDevolverACola(item.id)}
                      style={{ padding: '4px 8px', fontSize: '0.75rem', fontWeight: '600' }}
                    >
                      Re-encolar
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleEliminarOrador(item.id, `${item.vecino?.nombre} ${item.vecino?.apellido}`)}
                      style={{ padding: '4px', color: '#EF4444', border: '1px solid #FCA5A5', display: 'flex', alignItems: 'center' }}
                      title="Eliminar orador permanentemente"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '1.25rem', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
              Aún no finalizó ninguna exposición.
            </div>
          )}
        </div>

        {/* 4. VARIABLES CUALITATIVAS (AL FINAL) (100% WIDTH) */}
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ fontSize: '1.15rem', color: 'var(--color-primary)', marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', fontWeight: '700' }}>
            <Save size={18} style={{ color: 'var(--color-highlight)' }} />
            Variables Cualitativas (Al cierre de la reunión)
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Hora Inicio Real</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Ej: 17:07"
                value={horaInicioReal}
                onChange={(e) => setHoraInicioReal(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Hora Fin Real</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Ej: 18:39"
                value={horaFinReal}
                onChange={(e) => setHoraFinReal(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Clima de la Reunión</label>
              <select
                className="form-control form-control-sm"
                value={clima}
                onChange={(e) => setClima(e.target.value)}
              >
                {Object.keys(CLIMA_MAP).map(key => (
                  <option key={key} value={key}>{CLIMA_MAP[key].label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Semáforo Político</label>
              <select
                className="form-control form-control-sm"
                value={semaforoPolitico}
                onChange={(e) => setSemaforoPolitico(e.target.value)}
              >
                {Object.keys(SEMAFORO_MAP).map(key => (
                  <option key={key} value={key}>{SEMAFORO_MAP[key].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Síntesis Cualitativa</label>
            <textarea
              className="form-control"
              rows={4}
              placeholder="Escribí un resumen corto sobre el clima, comportamiento y temas generales..."
              value={sintesisCualitativa}
              onChange={(e) => setSintesisCualitativa(e.target.value)}
              style={{ fontSize: '0.85rem' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Gestión Presente</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="- Nombre Apellido, Cargo"
              value={gestionPresente}
              onChange={(e) => setGestionPresente(e.target.value)}
              style={{ fontSize: '0.85rem' }}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSaveCualitativos}
            disabled={savingReunion}
            style={{ width: '100%', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: '600' }}
          >
            <Save size={16} /> {savingReunion ? 'Guardando...' : 'Guardar Datos Cualitativos'}
          </button>
        </div>

        {/* 5. EXPORTADOR PARA WHATSAPP (DEBAJO DE TODO) (100% WIDTH) */}
        <div className="card" style={{ margin: 0, borderTop: '4px solid var(--color-highlight)' }}>
          <h3 style={{ fontSize: '1.15rem', color: 'var(--color-primary)', marginTop: 0, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' }}>
            <Share2 size={18} style={{ color: 'var(--color-highlight)' }} />
            Exportador para WhatsApp
          </h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
            Genera y copia al portapapeles el resumen ejecutivo de la reunión formateado con emojis para compartir de forma directa con el equipo.
          </p>

          <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '14px', border: '1px solid var(--color-border)', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
              <div>Inscriptos: <strong>{inscriptosCount}</strong></div>
              <div>Asistentes: <strong>{presentesCount} ({ratioAsistencia}%)</strong></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>Anotados: <strong>{oradores.length}</strong></div>
              <div>Efectivos: <strong>{oradores.filter(o => o.estado === 'hablo').length}</strong></div>
            </div>
          </div>

          <button
            className="btn btn-highlight"
            onClick={handleCopyWhatsAppText}
            style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: '700' }}
          >
            <Clipboard size={16} /> Copiar Resumen de WhatsApp
          </button>
        </div>

      </div>
    </div>
  );
}
