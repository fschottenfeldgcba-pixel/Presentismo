import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Mic, Users, Trash2, ArrowUp, ArrowDown, Share2, Clipboard, Check, RefreshCw, Plus, Clock, MessageSquare, Award, Activity } from 'lucide-react';
import { updateReunion, getOradores, updateOradorDetails, updateOradorTags, getAsistentesPorReunion, registrarOrador, guardarAsistencia } from '../services/supabaseService';
import OradorTagSelector, { OradorTagsDisplay } from './OradorTagSelector';
import { supabase } from '../lib/supabaseClient';
import { TIPOS_REUNION } from '../data/mockData';
import PreguntasTematicas from './PreguntasTematicas';
import { autoDetectTags } from '../constants/oradorTags';

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

export default function PanelModerador({ reunion: initialReunion, onBack }) {
  const [reunion, setReunion] = useState(initialReunion);

  // Datos cualitativos de la reunión
  const [clima, setClima] = useState(initialReunion.clima || 'bajo');
  const [semaforoPolitico, setSemaforoPolitico] = useState(initialReunion.semaforo_politico || 'verde');
  const [sintesisCualitativa, setSintesisCualitativa] = useState(initialReunion.sintesis_cualitativa || '');
  const [gestionPresente, setGestionPresente] = useState(
    initialReunion.gestion_presente || `- ${initialReunion.funcionario || 'Funcionario'}\n`
  );
  const [horaInicioReal, setHoraInicioReal] = useState(initialReunion.hora_inicio_real || '');
  const [horaFinReal, setHoraFinReal] = useState(initialReunion.hora_fin_real || '');
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
  const [editingFinishedDuration, setEditingFinishedDuration] = useState('');
  // ID del orador cuyo selector de tags está expandido para corrección manual
  const [editingTagsFor, setEditingTagsFor] = useState(null);

  // Estados para Procesos Participativos - Co Creación
  const [cantMesas, setCantMesas] = useState(1);
  const [mesas, setMesas] = useState([]);
  const [mesasInitialized, setMesasInitialized] = useState(false);
  const [userChangedCantMesas, setUserChangedCantMesas] = useState(false);

  // Formato de reunión reactivo sobre la marcha
  const [reunionType, setReunionType] = useState(reunion.tipo_reunion);
  // Modo de Café (cola: lista estricta, libre: mesa colaborativa)
  const [cafeFormatMode, setCafeFormatMode] = useState('cola');

  // Cargar datos de asistencia
  const loadHistoricalStatsForVecinos = async (dnis) => {
    if (!dnis || dnis.length === 0) return;
    try {
      const statsMap = {};
      dnis.forEach(dni => {
        statsMap[dni] = { asistencias: 0, otrasAsistencias: 0, orador: 0 };
      });

      // Procesar por lotes de 100 DNIs para evitar el límite de longitud de URL HTTP (Error 414 URI Too Long)
      const chunkSize = 100;
      for (let i = 0; i < dnis.length; i += chunkSize) {
        const chunkDnis = dnis.slice(i, i + chunkSize);

        // 1. Obtener todas las asistencias confirmadas en cualquier reunión del sistema
        const { data: asistencias, error: errAsist } = await supabase
          .from('inscripciones_asistencias')
          .select('vecino_id, reunion_id, asistio, reunion:reuniones(nombre)')
          .in('vecino_id', chunkDnis)
          .eq('asistio', true);

        if (!errAsist && asistencias) {
          asistencias.forEach(asis => {
            const name = asis.reunion?.nombre?.toLowerCase() || '';
            if (name.includes('test') || name.includes('prueba')) return;

            if (!statsMap[asis.vecino_id]) {
              statsMap[asis.vecino_id] = { asistencias: 0, otrasAsistencias: 0, orador: 0 };
            }
            
            statsMap[asis.vecino_id].asistencias = (statsMap[asis.vecino_id].asistencias || 0) + 1;
            
            // Si la asistencia confirmada fue en otra reunión previa (distinta a la actual), se cuenta como recurrencia histórica
            if (asis.reunion_id !== reunion.id) {
              statsMap[asis.vecino_id].otrasAsistencias = (statsMap[asis.vecino_id].otrasAsistencias || 0) + 1;
            }
          });
        }

        // 2. Obtener oratorias históricas en cualquier otra reunión
        const { data: oByVecinoId } = await supabase
          .from('oradores')
          .select('vecino_id, dni, reunion_id, estado, vecino:vecinos(dni)')
          .neq('reunion_id', reunion.id)
          .in('vecino_id', chunkDnis);

        const { data: oByDni } = await supabase
          .from('oradores')
          .select('vecino_id, dni, reunion_id, estado, vecino:vecinos(dni)')
          .neq('reunion_id', reunion.id)
          .in('dni', chunkDnis);

        const combinedOradHist = [...(oByVecinoId || []), ...(oByDni || [])];

        combinedOradHist.forEach(orad => {
          if (orad.estado === 'se_bajo') return;

          const keys = [
            orad.vecino_id ? String(orad.vecino_id).trim() : null,
            orad.dni ? String(orad.dni).trim() : null,
            orad.vecino?.dni ? String(orad.vecino.dni).trim() : null
          ].filter(Boolean);

          keys.forEach(k => {
            if (!statsMap[k]) {
              statsMap[k] = { asistencias: 0, otrasAsistencias: 0, orador: 0 };
            }
            statsMap[k].orador = (statsMap[k].orador || 0) + 1;
          });
        });
      }

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

        const dnisPresentes = data.filter(a => a.asistio).map(a => a.vecino_id);
        if (dnisPresentes.length > 0) {
          loadHistoricalStatsForVecinos(dnisPresentes);
        }
      }
    } catch (err) {
      console.error('Error al cargar estadísticas de asistencia:', err);
    }
  };

  // Cargar y normalizar cola de oradores
  const loadOradores = async (showLoading = false) => {
    if (showLoading) setLoadingOradores(true);
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

        // Modificación no-bloqueante para evitar pisar campos tema_efectivo enfocados
        setOradores(prev => {
          return sorted.map(newItem => {
            const localItem = prev.find(o => o.id === newItem.id);
            if (localItem) {
              const isFocused = document.activeElement && 
                document.activeElement.tagName === 'TEXTAREA' && 
                localItem.tema_efectivo !== newItem.tema_efectivo;
              
              if (isFocused) {
                // Preservar el valor local que el usuario está editando en este momento
                return { ...newItem, tema_efectivo: localItem.tema_efectivo };
              }
            }
            return newItem;
          });
        });

        const dnis = sorted.map(o => o.vecino_id);
        if (dnis.length > 0) {
          loadHistoricalStatsForVecinos(dnis);
        }
      }
    } catch (err) {
      console.error('Error al cargar oradores:', err);
    } finally {
      if (showLoading) setLoadingOradores(false);
    }
  };

  // Inicialización de Mesas de Co-Creación
  useEffect(() => {
    if (reunion.tipo_reunion === TIPOS_REUNION.PROCESOS_CO_CREACION && !mesasInitialized) {
      let initializedFromDb = false;
      try {
        if (reunion.gestion_presente) {
          const parsed = JSON.parse(reunion.gestion_presente);
          if (parsed && Array.isArray(parsed.mesas)) {
            setMesas(parsed.mesas);
            setCantMesas(parsed.mesas.length);
            initializedFromDb = true;
            setMesasInitialized(true);
          }
        }
      } catch (err) {
        console.warn('Error parsing gestion_presente for Co-Creacion:', err);
      }

      if (!initializedFromDb && asistentes.length > 0) {
        const presentes = asistentes.filter(a => a.asistio);
        const suggested = Math.ceil(presentes.length / 10) || 1;
        setCantMesas(suggested);
        const initialMesas = Array.from({ length: suggested }, (_, i) => ({
          id: i + 1,
          minuta: '',
          vecinos: []
        }));
        setMesas(initialMesas);
        setMesasInitialized(true);
      }
    }
  }, [reunion.gestion_presente, asistentes, mesasInitialized]);

  const handleCantMesasChange = (newVal) => {
    setUserChangedCantMesas(true);
    const count = parseInt(newVal) || 1;
    setCantMesas(count);
    
    setMesas(prev => {
      if (prev.length < count) {
        // Agregar mesas
        const added = Array.from({ length: count - prev.length }, (_, i) => ({
          id: prev.length + i + 1,
          minuta: '',
          vecinos: []
        }));
        return [...prev, ...added];
      } else if (prev.length > count) {
        // Quitar mesas y pasar los vecinos de las mesas eliminadas a la Mesa 1
        const removedMesas = prev.slice(count);
        const unassignedDnis = [];
        removedMesas.forEach(m => unassignedDnis.push(...m.vecinos));
        
        const newMesas = prev.slice(0, count).map((m, idx) => {
          if (idx === 0) {
            return { ...m, vecinos: [...m.vecinos, ...unassignedDnis] };
          }
          return m;
        });
        return newMesas;
      }
      return prev;
    });
  };

  // Actualizar de forma reactiva la sugerencia de mesas según asistan vecinos
  useEffect(() => {
    if (reunion.tipo_reunion === TIPOS_REUNION.PROCESOS_CO_CREACION && !reunion.gestion_presente && !userChangedCantMesas && asistentes.length > 0) {
      const presentes = asistentes.filter(a => a.asistio);
      const suggested = Math.ceil(presentes.length / 10) || 1;
      if (suggested !== cantMesas) {
        setCantMesas(suggested);
        setMesas(prev => {
          if (prev.length === 0) {
            return Array.from({ length: suggested }, (_, i) => ({
              id: i + 1,
              minuta: '',
              vecinos: []
            }));
          }
          if (prev.length < suggested) {
            const added = Array.from({ length: suggested - prev.length }, (_, i) => ({
              id: prev.length + i + 1,
              minuta: '',
              vecinos: []
            }));
            return [...prev, ...added];
          } else if (prev.length > suggested) {
            const removedMesas = prev.slice(suggested);
            const unassignedDnis = [];
            removedMesas.forEach(m => unassignedDnis.push(...m.vecinos));
            return prev.slice(0, suggested).map((m, idx) => {
              if (idx === 0) {
                return { ...m, vecinos: [...m.vecinos, ...unassignedDnis] };
              }
              return m;
            });
          }
          return prev;
        });
      }
    }
  }, [asistentes, reunion.gestion_presente, userChangedCantMesas, cantMesas]);

  const handleAutoAssign = () => {
    const presentes = asistentes.filter(a => a.asistio).map(a => a.vecino_id);
    if (presentes.length === 0) {
      alert('No hay vecinos registrados como presentes en la asistencia para asignar.');
      return;
    }

    setMesas(prev => {
      const cleanMesas = prev.map(m => ({ ...m, vecinos: [] }));
      presentes.forEach((dni, idx) => {
        const mesaIdx = idx % cleanMesas.length;
        cleanMesas[mesaIdx].vecinos.push(dni);
      });
      return cleanMesas;
    });
  };

  const handleMoveNeighbor = (dni, targetTableId) => {
    setMesas(prev => {
      return prev.map(m => {
        const cleanVecinos = m.vecinos.filter(id => id !== dni);
        if (targetTableId !== "" && m.id === parseInt(targetTableId)) {
          cleanVecinos.push(dni);
        }
        return { ...m, vecinos: cleanVecinos };
      });
    });
  };

  const handleMesaMinutaChange = (mesaId, text) => {
    setMesas(prev => prev.map(m => {
      if (m.id === mesaId) {
        return { ...m, minuta: text };
      }
      return m;
    }));
  };

  // Cargar modo de café guardado
  useEffect(() => {
    if (reunionType === TIPOS_REUNION.CAFE && reunion.gestion_presente) {
      try {
        const parsed = JSON.parse(reunion.gestion_presente);
        if (parsed && parsed.cafeFormatMode) {
          setCafeFormatMode(parsed.cafeFormatMode);
        }
      } catch (err) {
        // Ignorar
      }
    }
  }, [reunionType, reunion.gestion_presente]);

  const handleToggleCafeMode = async (newMode) => {
    setCafeFormatMode(newMode);
    try {
      const payload = { cafeFormatMode: newMode };
      await updateReunion(reunion.id, {
        gestion_presente: JSON.stringify(payload)
      });
    } catch (err) {
      console.error('Error al guardar el modo de café:', err);
    }
  };

  const handleAddFreeIntervention = async (dni) => {
    if (oradores.some(o => o.vecino_id === dni)) {
      alert('Este vecino ya tiene una intervención registrada. Podés editar su nota directamente en la lista.');
      return;
    }
    
    const maxOrden = oradores.reduce((max, o) => Math.max(max, o.orden || 0), 0);
    const newOrador = {
      reunion_id: reunion.id,
      vecino_id: dni,
      estado: 'hablo',
      orden: maxOrden + 1,
      tema_original: 'Intervención en Mesa de Café'
    };
    
    const { data, error } = await registrarOrador(newOrador);
    if (!error) {
      await loadOradores();
    } else {
      alert(`Error al registrar la intervención: ${error.message}`);
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
        .or(`dni.ilike.%${q}%,nombre.ilike.%${q}%,apellido.ilike.%${q}%,celular.ilike.%${q}%`)
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
          como_se_entero: 'Walk-in'
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
        como_se_entero: 'Walk-in'
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

  const loadReunionDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('reuniones')
        .select('*')
        .eq('id', initialReunion.id)
        .single();
      if (!error && data) {
        setReunion(data);
        setReunionType(data.tipo_reunion);
        setClima(data.clima || 'bajo');
        setSemaforoPolitico(data.semaforo_politico || 'verde');
        setSintesisCualitativa(data.sintesis_cualitativa || '');
        setGestionPresente(data.gestion_presente || `- ${data.funcionario || 'Funcionario'}\n`);
        setHoraInicioReal(data.hora_inicio_real || '');
        setHoraFinReal(data.hora_fin_real || '');
      }
    } catch (err) {
      console.error('Error cargando detalles actualizados de la reunión:', err);
    }
  };

  useEffect(() => {
    loadReunionDetails();
    loadAsistenciaStats();
    loadOradores(true);
  }, [initialReunion.id]);

  // Polling automático cada 10 segundos en segundo plano
  useEffect(() => {
    const interval = setInterval(() => {
      loadAsistenciaStats();
      loadOradores(false);
    }, 10000);
    return () => clearInterval(interval);
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
      const isCoCreacion = reunion.tipo_reunion === TIPOS_REUNION.PROCESOS_CO_CREACION;
      const payload = {
        clima: clima,
        semaforo_politico: semaforoPolitico,
        sintesis_cualitativa: sintesisCualitativa.trim() || null,
        gestion_presente: isCoCreacion ? JSON.stringify({ mesas }) : (gestionPresente.trim() || null),
        hora_inicio_real: horaInicioReal || null,
        hora_fin_real: horaFinReal || null
      };

      const { error } = await updateReunion(reunion.id, payload);

      if (error) throw error;
      alert(isCoCreacion ? '¡Datos de mesas y minutas de co-creación guardados con éxito!' : '¡Datos cualitativos guardados con éxito en la base de datos!');
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

  // Helper para limpiar el orador activo de la base de datos si coincide con el modificado
  const cleanActiveSpeakerIfMatches = async (oradorId) => {
    if (activeSpeaker && activeSpeaker.id === oradorId) {
      setActiveSpeaker(null);
      try {
        await updateReunion(reunion.id, { active_orador_id: null });
      } catch (err) {
        console.error('Error al limpiar active_orador_id en Supabase:', err);
      }
    }
  };

  // Acciones sobre los oradores
  const handleLlamarAlMic = async (orador) => {
    setActiveSpeaker(orador);
    setLiveMinuta(orador.tema_efectivo || '');
    setActiveSpeakerTimer(0);
    try {
      await updateReunion(reunion.id, { active_orador_id: orador.id });
    } catch (err) {
      console.error('Error al guardar active_orador_id en Supabase:', err);
    }
  };

  const handleCancelarMic = async () => {
    setActiveSpeaker(null);
    setLiveMinuta('');
    try {
      await updateReunion(reunion.id, { active_orador_id: null });
    } catch (err) {
      console.error('Error al limpiar active_orador_id en Supabase:', err);
    }
  };

  const handleFinalizarExposicion = async () => {
    if (!activeSpeaker) return;
    try {
      const finalTema = liveMinuta.trim() || activeSpeaker.tema_efectivo || activeSpeaker.tema_original || null;
      const { error } = await updateOradorDetails(activeSpeaker.id, {
        estado: 'hablo',
        tema_efectivo: finalTema,
        duracion_segundos: activeSpeakerTimer
      });

      if (error) throw error;

      // Limpiar orador activo de la reunión
      await updateReunion(reunion.id, { active_orador_id: null });

      // Actualizar localmente
      setOradores(prev => prev.map(o => {
        if (o.id === activeSpeaker.id) {
          return { 
            ...o, 
            estado: 'hablo', 
            tema_efectivo: finalTema,
            duracion_segundos: activeSpeakerTimer
          };
        }
        return o;
      }));

      // Auto-detectar y guardar tags a partir del texto final
      const autoTags = autoDetectTags(finalTema || '');
      if (autoTags.length > 0) {
        await updateOradorTags(activeSpeaker.id, autoTags);
        setOradores(prev => prev.map(o =>
          o.id === activeSpeaker.id ? { ...o, tags: autoTags } : o
        ));
      }

      setActiveSpeaker(null);
      setLiveMinuta('');
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

        await cleanActiveSpeakerIfMatches(oradorId);
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

        await cleanActiveSpeakerIfMatches(oradorId);
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
        await cleanActiveSpeakerIfMatches(oradorId);
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
      let duracionSegundos = null;
      if (editingFinishedDuration && editingFinishedDuration.trim() !== '') {
        const parts = editingFinishedDuration.trim().split(':');
        if (parts.length === 2) {
          const m = parseInt(parts[0], 10);
          const s = parseInt(parts[1], 10);
          if (!isNaN(m) && !isNaN(s)) {
            duracionSegundos = m * 60 + s;
          }
        } else if (parts.length === 1) {
          const s = parseInt(parts[0], 10);
          if (!isNaN(s)) {
            duracionSegundos = s;
          }
        }
      }

      const updates = {
        tema_efectivo: editingFinishedText
      };
      if (duracionSegundos !== null) {
        updates.duracion_segundos = duracionSegundos;
      }

      const { error } = await updateOradorDetails(oradorId, updates);

      if (error) throw error;

      setOradores(prev => prev.map(o => {
        if (o.id === oradorId) {
          const res = { ...o, tema_efectivo: editingFinishedText };
          if (duracionSegundos !== null) res.duracion_segundos = duracionSegundos;
          return res;
        }
        return o;
      }));

      // Auto-detectar y guardar tags a partir del texto editado
      const autoTags = autoDetectTags(editingFinishedText || '');
      await updateOradorTags(oradorId, autoTags);
      setOradores(prev => prev.map(o =>
        o.id === oradorId ? { ...o, tags: autoTags } : o
      ));

      setEditingFinishedId(null);
    } catch (err) {
      console.error(err);
      alert(`Error al guardar minuta: ${err.message}`);
    }
  };

  const handleToggleTagModerador = async (oradorId, tagLabel) => {
    const orador = oradores.find(o => o.id === oradorId);
    if (!orador) return;
    const baseTags = (orador.tags && orador.tags.length > 0) ? orador.tags : autoDetectTags(orador.tema_efectivo || orador.tema_original || '');
    const newTags = baseTags.includes(tagLabel)
      ? baseTags.filter(t => t !== tagLabel)
      : [...baseTags, tagLabel];

    // Optimistic UI update
    setOradores(prev => prev.map(o => o.id === oradorId ? { ...o, tags: newTags } : o));

    // Auto-save
    const { error } = await updateOradorTags(oradorId, newTags);
    if (error) {
      console.error('Error al guardar tags:', error);
      // Revertir en error
      setOradores(prev => prev.map(o => o.id === oradorId ? { ...o, tags: baseTags } : o));
    }
  };

  // Helper para obtener el cupo formateado de la reunión
  const getCupoDisplay = () => {
    if (!reunion?.config_uno_a_uno) return 'S/D';
    try {
      const cfg = typeof reunion.config_uno_a_uno === 'string' 
        ? JSON.parse(reunion.config_uno_a_uno) 
        : reunion.config_uno_a_uno;
      if (cfg?.modalidadCupo === 'doble') {
        const tm = cfg.cupoTM || 0;
        const tt = cfg.cupoTT || 0;
        const total = Number(tm) + Number(tt);
        return `${total} (TM: ${tm} / TT: ${tt})`;
      }
      return cfg?.cupoGeneral || cfg?.cupo || 'S/D';
    } catch {
      return 'S/D';
    }
  };

  const isExperienciasOrVoluntariado = 
    reunionType === TIPOS_REUNION.EXPERIENCIAS_BA || 
    reunionType === TIPOS_REUNION.VOLUNTARIADOS ||
    reunion?.tipo_reunion === TIPOS_REUNION.EXPERIENCIAS_BA ||
    reunion?.tipo_reunion === TIPOS_REUNION.VOLUNTARIADOS;

  // Copiar mensaje de INICIO de reunión formateado para WhatsApp
  const handleCopyWhatsAppInicioText = async () => {
    try {
      let displayFecha = '';
      let displayHora = '17 hs';
      if (reunion.fecha) {
        const parts = reunion.fecha.split('-');
        if (parts.length === 3) {
          displayFecha = `${parts[2]}/${parts[1]}`;
        }
      }

      if (reunion.nombre && reunion.nombre.includes('-')) {
        const nameParts = reunion.nombre.split('-');
        const lastPart = nameParts[nameParts.length - 1].trim();
        if (lastPart.toLowerCase().includes('hs') || lastPart.toLowerCase().includes('h')) {
          displayHora = lastPart.toLowerCase().replace('hs', ' hs').replace('h', ' hs');
        }
      }

      const presentesList = asistentes.filter(a => a.asistio);
      const dnisPresentes = presentesList.map(a => a.vecino_id);
      if (dnisPresentes.length > 0) {
        await loadHistoricalStatsForVecinos(dnisPresentes);
      }

      let primerVezCount = 0;
      let recurrentesCount = 0;

      presentesList.forEach(a => {
        const otras = vecinoStatsMap[a.vecino_id]?.otrasAsistencias || 0;
        if (otras > 0) {
          recurrentesCount++;
        } else {
          primerVezCount++;
        }
      });

      // Formatear Gestión Presente como viñetas
      let gestionLines = (gestionPresente || '').trim();
      if (!gestionLines) {
        gestionLines = `- ${reunion.funcionario || 'Funcionario'}`;
      } else {
        gestionLines = gestionLines.split('\n')
          .map(l => l.trim().startsWith('-') ? l.trim() : `- ${l.trim()}`)
          .filter(Boolean)
          .join('\n');
      }

      if (isExperienciasOrVoluntariado) {
        const dayOfWeekNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        let diaSemana = '';
        let formattedDate = reunion.fecha || '';
        if (reunion.fecha) {
          const [y, m, d] = reunion.fecha.split('-').map(Number);
          const dateObj = new Date(y, m - 1, d);
          diaSemana = dayOfWeekNames[dateObj.getDay()] || '';
          formattedDate = `${d}/${m}/${y}`;
        }
        const actNombre = reunion.tema || reunion.nombre.split('-')[1]?.trim() || reunion.nombre;
        const confirmadosCount = asistentes.filter(a => a.confirmado || a.estado_convocatoria === 'seleccionado_uno_a_uno' || a.estado_convocatoria === 'citado').length;

        const txt = `📋 *INICIO DE ACTIVIDAD*
${reunion.tipo_reunion || 'Actividad'} - *${actNombre}*

📌 Día: ${diaSemana ? `${diaSemana} ` : ''}${formattedDate}
📌 Horario de Inicio: ${horaInicioReal || '--:--'} hs
📌 Inscriptos: ${inscriptosCount}
📌 Cupo: ${getCupoDisplay()}
📌 Confirmados: ${confirmadosCount} 
📌 Asistentes acreditados: ${presentesCount}

*🏛️ Gestión presente:*
${gestionLines}`;

        await navigator.clipboard.writeText(txt);
        alert('¡Mensaje de Inicio para WhatsApp copiado con éxito al portapapeles!');
        return;
      }

      const txt = `👨‍👩‍👧‍👦 RDV | *${reunion.funcionario || reunion.nombre}* - ${reunion.comuna}
📅 ${displayFecha || 'Fecha'} | 🕠 ${displayHora}
⏰ Inicio: ${horaInicioReal || '--:--'} hs

📋 Inscriptos: ${inscriptosCount}
👥 Asistentes: ${presentesCount} (${ratioAsistencia}%)
   🌱 Vecinos Primera Vez: ${primerVezCount}
   🔄 Vecinos Recurrentes: ${recurrentesCount}
📝 Oradores anotados: ${oradores.length}

*🏛️ Gestión presente:*
${gestionLines}`;

      await navigator.clipboard.writeText(txt);
      alert('¡Mensaje de Inicio para WhatsApp copiado con éxito al portapapeles!');
    } catch (err) {
      console.error(err);
      alert('No se pudo copiar automáticamente.');
    }
  };

  // Generador dinámico del resumen ejecutivo final formateado para WhatsApp
  const generateWhatsAppFinalText = () => {
    let displayFecha = '';
    let displayHora = '17 hs';
    if (reunion.fecha) {
      const parts = reunion.fecha.split('-');
      if (parts.length === 3) {
        displayFecha = `${parts[2]}/${parts[1]}`;
      }
    }
    
    if (reunion.nombre && reunion.nombre.includes('-')) {
      const nameParts = reunion.nombre.split('-');
      const lastPart = nameParts[nameParts.length - 1].trim();
      if (lastPart.toLowerCase().includes('hs') || lastPart.toLowerCase().includes('h')) {
        displayHora = lastPart.toLowerCase().replace('hs', ' hs').replace('h', ' hs');
      }
    }

    if (isExperienciasOrVoluntariado) {
      const dayOfWeekNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      let diaSemana = '';
      let formattedDate = reunion.fecha || '';
      if (reunion.fecha) {
        const [y, m, d] = reunion.fecha.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        diaSemana = dayOfWeekNames[dateObj.getDay()] || '';
        formattedDate = `${d}/${m}/${y}`;
      }
      const actNombre = reunion.tema || reunion.nombre.split('-')[1]?.trim() || reunion.nombre;
      const confirmadosCount = asistentes.filter(a => a.confirmado || a.estado_convocatoria === 'seleccionado_uno_a_uno' || a.estado_convocatoria === 'citado').length;

      return `REPORTE FINAL: 
${reunion.tipo_reunion || 'Actividad'} - ${actNombre}

📌 Día: ${diaSemana ? `${diaSemana} ` : ''}${formattedDate}
📌 Horario: ${horaInicioReal || '--:--'} hs
📌 Finalización: ${horaFinReal || '--:--'} hs
📌 Inscriptos: ${inscriptosCount}
📌 Cupo: ${getCupoDisplay()}
📌 Confirmados: ${confirmadosCount} 
📌 Asistentes totales: ${presentesCount}`;
    }

    const oradoresAnotados = oradores.length;
    const oradoresEfectivos = oradores.filter(o => o.estado === 'hablo');
    const totalSegundos = oradoresEfectivos.reduce((sum, o) => sum + (o.duracion_segundos || 0), 0);
    const avgSegundos = oradoresEfectivos.length > 0 ? Math.round(totalSegundos / oradoresEfectivos.length) : 0;
    const avgTimeStr = formatSpeakerTime(avgSegundos);

    const presentesList = asistentes.filter(a => a.asistio);
    let primerVezCount = 0;
    let recurrentesCount = 0;

    presentesList.forEach(a => {
      const otras = vecinoStatsMap[a.vecino_id]?.otrasAsistencias || 0;
      if (otras > 0) {
        recurrentesCount++;
      } else {
        primerVezCount++;
      }
    });

    let gestionLines = (gestionPresente || '').trim();
    if (!gestionLines) {
      gestionLines = `- ${reunion.funcionario || 'Funcionario'}`;
    } else {
      gestionLines = gestionLines.split('\n')
        .map(l => l.trim().startsWith('-') ? l.trim() : `- ${l.trim()}`)
        .filter(Boolean)
        .join('\n');
    }

    return `👨‍👩‍👧‍👦 RDV | *${reunion.funcionario || reunion.nombre}* - ${reunion.comuna}
📅 ${displayFecha || 'Fecha'} | 🕠 ${displayHora}
⏰ Inicio: ${horaInicioReal || '--:--'} hs | Finalizó: ${horaFinReal || '--:--'} hs

📋 Inscriptos: ${inscriptosCount}
👥 Asistentes: ${presentesCount} (${ratioAsistencia}%)
   🌱 Vecinos Primera Vez: ${primerVezCount}
   🔄 Vecinos Recurrentes: ${recurrentesCount}
📝 Oradores anotados: ${oradoresAnotados}
 🎤 Oradores efectivos: ${oradoresEfectivos.length}
⏱️ Tiempo promedio de oradores: ${avgTimeStr}

🚦 Semáforo político: ${SEMAFORO_MAP[semaforoPolitico]?.waLabel || semaforoPolitico}

*📝 Síntesis cualitativa:*
${sintesisCualitativa.trim() || 'La reunión se desarrolló con normalidad.'}

*🏛️ Gestión presente:*
${gestionLines}

*📌 Minuta de oradores:*
${oradoresEfectivos.length > 0 
  ? oradoresEfectivos.map(o => {
      const tel = o.vecino?.celular ? ` ${o.vecino.celular}` : '';
      return `${o.vecino?.nombre || ''} ${o.vecino?.apellido || ''}${tel}: ${o.tema_efectivo || o.tema_original || 'Sin minuta registrada.'}`;
    }).join('\n\n')
  : 'No se registraron oradores efectivos.'
}`;
  };

  // Copiar resumen con formato WhatsApp solicitado al portapapeles
  const handleCopyWhatsAppText = async () => {
    try {
      const presentesList = asistentes.filter(a => a.asistio);
      const dnisPresentes = presentesList.map(a => a.vecino_id);
      if (dnisPresentes.length > 0) {
        await loadHistoricalStatsForVecinos(dnisPresentes);
      }

      const txt = generateWhatsAppFinalText();
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

  // Calcular primera vez vs recurrentes para la barra de métricas de la UI
  const uiPresentesList = (asistentes || []).filter(a => a.asistio);
  let uiPrimerVezCount = 0;
  let uiRecurrentesCount = 0;
  uiPresentesList.forEach(a => {
    const otras = vecinoStatsMap[a.vecino_id]?.otrasAsistencias || 0;
    if (otras > 0) {
      uiRecurrentesCount++;
    } else {
      uiPrimerVezCount++;
    }
  });

  return (
    <div className="container" style={{ paddingBottom: '4rem', maxWidth: '900px' }}>
      {/* Botón de volver y acceso a Informe Final */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={16} /> Volver al Tablero
          </button>
          <a 
            href={`?view=dashboard&modal=informe&reunion_id=${reunion.id}`} 
            target="_blank" 
            className="btn btn-secondary btn-sm" 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px solid var(--color-highlight)', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: '600' }}
            title="Ver informe final y resumen cuantitativo/cualitativo"
          >
            <Activity size={14} style={{ color: 'var(--color-highlight)' }} /> Informe Final
          </a>
        </div>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', margin: 0, fontWeight: '700' }}>
          Panel de Moderación de Reunión
        </h2>
      </div>

      {/* Tarjeta de Información General */}
      <div className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, #0F172A, #1E293B)', color: '#ffffff', border: 'none', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h3 style={{ fontSize: '1.4rem', margin: '0 0 8px 0', fontWeight: '700', color: '#38BDF8' }}>
              {reunion.nombre}
            </h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#E2E8F0' }}>
              Lugar: <strong style={{ color: '#ffffff' }}>{reunion.lugar}</strong> | Fecha: <strong style={{ color: '#ffffff' }}>{reunion.fecha}</strong>
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
              <span style={{ fontSize: '0.65rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 'bold' }}>Formato de Reunión:</span>
              <select
                value={reunionType}
                onChange={async (e) => {
                  const newType = e.target.value;
                  const confirmChange = await window.confirm(`¿Estás seguro de que quieres cambiar el formato de la reunión a "${newType}" sobre la marcha?\nEsto modificará los controles y la vista de inmediato.`);
                  if (confirmChange) {
                    const { error } = await updateReunion(reunion.id, { tipo_reunion: newType });
                    if (!error) {
                      setReunionType(newType);
                    } else {
                      alert(`Error al cambiar el formato de la reunión: ${error.message}`);
                    }
                  }
                }}
                style={{
                  backgroundColor: '#1E293B',
                  color: '#ffffff',
                  border: '1px solid #475569',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  outline: 'none',
                  textAlign: 'right'
                }}
              >
                {[
                  { value: TIPOS_REUNION.ENCUENTRO, label: 'Formato Reunion con Vecinos Tradicional' },
                  { value: TIPOS_REUNION.CAFE, label: 'Formato Cafe' },
                  { value: TIPOS_REUNION.PROCESOS_CO_CREACION, label: 'Formato Co-Creación' }
                ].map(item => (
                  <option key={item.value} value={item.value} style={{ color: '#ffffff', backgroundColor: '#0F172A', textAlign: 'left' }}>
                    {item.label}
                  </option>
                ))}
                {![TIPOS_REUNION.ENCUENTRO, TIPOS_REUNION.CAFE, TIPOS_REUNION.PROCESOS_CO_CREACION].includes(reunionType) && (
                  <option value={reunionType} style={{ color: '#ffffff', backgroundColor: '#0F172A', textAlign: 'left' }}>
                    {reunionType}
                  </option>
                )}
              </select>
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#E2E8F0' }}>
              Comuna: <strong style={{ color: '#ffffff' }}>{reunion.comuna}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Selector de modo para Formato Café */}
      {reunionType === TIPOS_REUNION.CAFE && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', border: '1px solid var(--color-border)', flexDirection: 'row', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--color-primary)' }}>
            ☕ Configuración de Formato Café:
          </span>
          <div style={{ display: 'flex', gap: '8px', backgroundColor: '#E2E8F0', padding: '4px', borderRadius: '8px' }}>
            <button
              className={`btn btn-sm ${cafeFormatMode === 'cola' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleToggleCafeMode('cola')}
              style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: '600', border: 'none', borderRadius: '6px' }}
            >
              Lista Estricta
            </button>
            <button
              className={`btn btn-sm ${cafeFormatMode === 'libre' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleToggleCafeMode('libre')}
              style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: '600', border: 'none', borderRadius: '6px' }}
            >
              Minuta Libre
            </button>
          </div>
        </div>
      )}

      {/* ------------------ VISTA POLIMÓRFICA SEGÚN TIPO DE REUNIÓN ------------------ */}
      {reunionType === TIPOS_REUNION.TEMATICA ? (
        /* VISTA DE REUNIÓN TEMÁTICA (PREGUNTAS DE WHATSAPP / QR) */
        <div style={{ marginBottom: '1.5rem' }}>
          <PreguntasTematicas reunion={reunion} asistencias={asistentes} />
        </div>
      ) : reunionType === TIPOS_REUNION.PROCESOS_CO_CREACION ? (
        /* VISTA DE PROCESOS PARTICIPATIVOS - CO-CREACIÓN (MESAS DE TRABAJO) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Card de Configuración de Mesas */}
          <div className="card" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid var(--color-border)', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', color: 'var(--color-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' }}>
                <Users size={20} style={{ color: 'var(--color-highlight)' }} />
                Mesas de Co-Creación
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label htmlFor="cant-mesas" style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--color-text)', margin: 0 }}>Cant. de Mesas:</label>
                  <input
                    type="number"
                    id="cant-mesas"
                    className="form-control form-control-sm"
                    min="1"
                    max="30"
                    value={cantMesas}
                    onChange={(e) => handleCantMesasChange(e.target.value)}
                    style={{ width: '60px', padding: '4px 8px', fontSize: '0.85rem' }}
                  />
                </div>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={handleAutoAssign}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                >
                  Distribuir Vecinos Automáticamente
                </button>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0 0 16px 0' }}>
              Sugerencia por asistentes presentes: <strong>1 mesa cada 10 vecinos presentes</strong> (Basado en {asistentes.filter(a => a.asistio).length} presentes, sugerido: <strong>{Math.ceil(asistentes.filter(a => a.asistio).length / 10) || 1} mesas</strong>).
            </p>

            {/* Listado de Vecinos Sin Mesa */}
            {(() => {
              const getAssignedTableId = (dni) => {
                const found = mesas.find(m => m.vecinos.includes(dni));
                return found ? found.id : null;
              };
              const unassigned = asistentes.filter(a => a.asistio && !getAssignedTableId(a.vecino_id));

              if (unassigned.length > 0) {
                return (
                  <div style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                    <strong style={{ fontSize: '0.85rem', color: '#1E40AF', display: 'block', marginBottom: '8px' }}>
                      ⚠️ Vecinos presentes sin mesa asignada ({unassigned.length}):
                    </strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                      {unassigned.map(v => (
                        <div key={v.vecino_id} style={{ backgroundColor: '#FFFFFF', border: '1px solid #DBEAFE', borderRadius: '6px', padding: '6px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                          <span style={{ fontWeight: '500', color: '#1E293B' }}>{v.vecino?.nombre} {v.vecino?.apellido}</span>
                          <select 
                            onChange={(e) => handleMoveNeighbor(v.vecino_id, e.target.value)}
                            style={{ fontSize: '0.75rem', padding: '3px 6px', border: '1px solid #CBD5E1', borderRadius: '4px', color: '#475569', cursor: 'pointer', backgroundColor: '#F8FAFC' }}
                            defaultValue=""
                          >
                            <option value="" disabled>Asignar a...</option>
                            {mesas.map(m => (
                              <option key={m.id} value={m.id}>Mesa {m.id}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return (
                <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#166534', fontSize: '0.85rem', fontWeight: '500' }}>
                  ✅ ¡Todos los vecinos presentes han sido asignados a una mesa!
                </div>
              );
            })()}
          </div>

          {/* Cards de cada Mesa */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.5rem' }}>
            {mesas.map(m => {
              const getAssignedTableId = (dni) => {
                const found = mesas.find(tbl => tbl.vecinos.includes(dni));
                return found ? found.id : null;
              };

              return (
                <div className="card" key={m.id} style={{ margin: 0, display: 'flex', flexDirection: 'column', borderTop: '3px solid var(--color-highlight)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, color: 'var(--color-primary)', fontWeight: '700', fontSize: '1rem' }}>
                      Mesa {m.id}
                    </h4>
                    <span className="badge badge-info" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                      {m.vecinos.length} vecinos asignados
                    </span>
                  </div>

                  {/* Selector rápido para añadir/mover vecinos a esta mesa */}
                  <div style={{ marginBottom: '12px' }}>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleMoveNeighbor(e.target.value, m.id);
                          e.target.value = ""; // Reset
                        }
                      }}
                      style={{ 
                        width: '100%', 
                        fontSize: '0.8rem', 
                        padding: '8px 10px', 
                        borderRadius: '6px', 
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        cursor: 'pointer',
                        outline: 'none',
                        color: '#475569',
                        fontWeight: '500'
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>➕ Agregar / Mover vecino a Mesa {m.id}...</option>
                      {asistentes
                        .filter(a => a.asistio)
                        .map(a => {
                          const currentTableId = getAssignedTableId(a.vecino_id);
                          if (currentTableId === m.id) return null;
                          const suffix = currentTableId ? ` (Mesa ${currentTableId})` : ' (Sin mesa)';
                          return (
                            <option key={a.vecino_id} value={a.vecino_id}>
                              {a.vecino?.nombre} {a.vecino?.apellido} {suffix}
                            </option>
                          );
                        })}
                    </select>
                  </div>

                  {/* Minuta de Mesa */}
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Minuta / Notas de la Mesa {m.id}</label>
                    <textarea
                      className="form-control"
                      rows={4}
                      placeholder="Escribí los puntos principales debatidos en esta mesa..."
                      value={m.minuta || ''}
                      onChange={(e) => handleMesaMinutaChange(m.id, e.target.value)}
                      style={{ fontSize: '0.8rem', lineHeight: '1.4' }}
                    />
                  </div>

                  {/* Vecinos en la mesa */}
                  <div style={{ marginTop: 'auto' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', display: 'block', marginBottom: '6px' }}>Vecinos en esta mesa:</label>
                    {m.vecinos.length === 0 ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin vecinos asignados</span>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '100px', overflowY: 'auto' }}>
                        {m.vecinos.map(dni => {
                          const att = asistentes.find(a => a.vecino_id === dni);
                          return (
                            <div key={dni} style={{ 
                              backgroundColor: '#F8FAFC', 
                              borderRadius: '6px', 
                              padding: '4px 8px', 
                              fontSize: '0.75rem', 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              border: '1px solid #E2E8F0',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                            }}>
                              <span style={{ fontWeight: '500', color: '#1E293B' }}>
                                {att?.vecino?.nombre || 'Vecino'} {att?.vecino?.apellido || ''}
                              </span>
                              <button
                                onClick={() => handleMoveNeighbor(dni, "")}
                                style={{ 
                                  background: 'none', 
                                  border: 'none', 
                                  padding: 0, 
                                  cursor: 'pointer', 
                                  color: '#94A3B8', 
                                  display: 'flex', 
                                  alignItems: 'center',
                                  transition: 'color 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.color = '#EF4444'}
                                onMouseLeave={(e) => e.target.style.color = '#94A3B8'}
                                title="Quitar de esta mesa"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (reunionType === TIPOS_REUNION.CAFE && cafeFormatMode === 'libre') ? (
        /* VISTA DE FORMATO CAFÉ EN MODO MINUTA LIBRE / MESA COLABORATIVA */
        <div className="card" style={{ marginBottom: '1.5rem', padding: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: '1.4' }}>
              Mesa libre colaborativa: los vecinos conversan libremente sin turnos estrictos. Elige el nombre de un vecino del listado de presentes para registrar su intervención. <em>Nota: la toma detallada de minutas se gestiona principalmente por el equipo de Territorio desde Acreditaciones.</em>
            </p>

            <div style={{ marginTop: '8px' }}>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddFreeIntervention(e.target.value);
                    e.target.value = ""; // Reset
                  }
                }}
                style={{ width: '100%', fontSize: '0.85rem', padding: '10px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer', outline: 'none', fontWeight: '500', color: '#475569' }}
                defaultValue=""
              >
                <option value="" disabled>➕ Registrar intervención de vecino...</option>
                {asistentes
                  .filter(a => a.asistio)
                  .map(a => {
                    const alreadyAdded = oradores.some(o => o.vecino_id === a.vecino_id);
                    return (
                      <option key={a.vecino_id} value={a.vecino_id} disabled={alreadyAdded}>
                        {a.vecino?.nombre} {a.vecino?.apellido} {alreadyAdded ? ' (Ya registrado)' : ''}
                      </option>
                    );
                  })}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
              <h4 style={{ fontSize: '0.95rem', color: 'var(--color-primary)', margin: '0 0 4px 0', fontWeight: '700' }}>
                Intervenciones ({oradores.length})
              </h4>
              {oradores.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-text-muted)', fontSize: '0.85rem', border: '1px dashed #CBD5E1', borderRadius: '8px' }}>
                  Aún no hay intervenciones registradas. Elige un vecino de la lista para agregarlo.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {oradores.map((item, idx) => (
                    <div className="card" key={item.id} style={{ margin: 0, padding: '14px', borderLeft: '4px solid var(--color-highlight)', backgroundColor: '#FFFFFF' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--color-primary)' }}>
                          {idx + 1}. {item.vecino?.nombre} {item.vecino?.apellido} ({item.vecino_id})
                        </strong>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleEliminarOrador(item.id, `${item.vecino?.nombre} ${item.vecino?.apellido}`)}
                          style={{ padding: '4px', color: '#EF4444', border: '1px solid #FCA5A5', display: 'flex', alignItems: 'center', borderRadius: '4px' }}
                          title="Quitar intervención"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <textarea
                        className="form-control"
                        rows={2}
                        placeholder="Nota o minuta de la intervención (opcional, o completado por Territorio)..."
                        value={item.tema_efectivo || item.tema_original || ''}
                        onChange={(e) => {
                          const text = e.target.value;
                          setOradores(prev => prev.map(o => o.id === item.id ? { ...o, tema_efectivo: text } : o));
                        }}
                        onBlur={async (e) => {
                          await updateOradorDetails(item.id, { tema_efectivo: e.target.value });
                        }}
                        style={{ fontSize: '0.85rem', lineHeight: '1.4' }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* VISTA POR DEFECTO CON COLA DE ORADORES TRADICIONAL */
        <>
          {/* 1. INICIO DE REUNIÓN + GESTIÓN PRESENTE + COPIAR WHATSAPP INICIO */}
          <div className="card" style={{ marginBottom: '1.5rem', backgroundColor: '#FFFFFF', border: '1px solid var(--color-border)', borderTop: '4px solid var(--color-highlight)', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} style={{ color: 'var(--color-highlight)' }} />
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--color-primary)', fontWeight: '700' }}>
                  1. Inicio de Reunión & Gestión Presente
                </h3>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleCopyWhatsAppInicioText}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC', fontWeight: '700', fontSize: '0.8rem', padding: '6px 12px' }}
                title="Copiar mensaje de inicio formateado para WhatsApp"
              >
                <Clipboard size={14} /> Copiar WhatsApp Inicio
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--color-primary)', display: 'block', marginBottom: '4px' }}>
                  ⏰ Horario de Inicio Real
                </label>
                <input
                  type="time"
                  className="form-control form-control-sm"
                  value={horaInicioReal}
                  onChange={(e) => setHoraInicioReal(e.target.value)}
                  style={{ fontSize: '0.9rem', fontWeight: '600' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'block', marginTop: '3px' }}>
                  Precargado desde los datos de la reunión. Editable si arrancó a otra hora.
                </span>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--color-primary)', display: 'block', marginBottom: '4px' }}>
                  🏛️ Gestión Presente (Autoridades / Funcionarios)
                </label>
                <textarea
                  className="form-control form-control-sm"
                  rows={3}
                  placeholder="- Nombre Apellido, Cargo (uno por línea)"
                  value={gestionPresente}
                  onChange={(e) => setGestionPresente(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: '8px 12px', borderRadius: '6px', border: '1px solid #E2E8F0', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '0.78rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>📋 Inscriptos: <strong>{inscriptosCount}</strong></span>
                {isExperienciasOrVoluntariado && (
                  <>
                    <span style={{ color: '#CBD5E1' }}>|</span>
                    <span style={{ backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', padding: '1px 7px', borderRadius: '12px', fontSize: '0.74rem', fontWeight: '600' }}>
                      🎟️ Cupo: <strong>{getCupoDisplay()}</strong>
                    </span>
                    <span style={{ color: '#CBD5E1' }}>|</span>
                    <span style={{ backgroundColor: '#E0E7FF', color: '#4338CA', border: '1px solid #C7D2FE', padding: '1px 7px', borderRadius: '12px', fontSize: '0.74rem', fontWeight: '600' }}>
                      📞 Confirmados: <strong>{asistentes.filter(a => a.confirmado || a.estado_convocatoria === 'seleccionado_uno_a_uno' || a.estado_convocatoria === 'citado').length}</strong>
                    </span>
                  </>
                )}
                <span style={{ color: '#CBD5E1' }}>|</span>
                <span>👥 Asistentes: <strong>{presentesCount} ({ratioAsistencia}%)</strong></span>
                <span style={{ backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', padding: '1px 7px', borderRadius: '12px', fontSize: '0.74rem', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  🌱 1ª Vez: <strong>{uiPrimerVezCount}</strong>
                </span>
                <span style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8', border: '1px solid #93C5FD', padding: '1px 7px', borderRadius: '12px', fontSize: '0.74rem', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  🔄 Recurrentes: <strong>{uiRecurrentesCount}</strong>
                </span>
                {!isExperienciasOrVoluntariado && (
                  <>
                    <span style={{ color: '#CBD5E1' }}>|</span>
                    <span>📝 Oradores: <strong>{oradores.length}</strong></span>
                  </>
                )}
              </span>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSaveCualitativos}
                disabled={savingReunion}
                style={{ fontSize: '0.78rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Save size={12} /> {savingReunion ? 'Guardando...' : 'Guardar Inicio'}
              </button>
            </div>
          </div>

          {!isExperienciasOrVoluntariado && (
            <>
              {/* 2. AGREGAR ORADORES DE ÚLTIMO MOMENTO */}
              <div className="card" style={{ marginBottom: '1.5rem', padding: '16px', backgroundColor: '#F8FAFC', border: '1px dashed var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} style={{ color: 'var(--color-highlight)' }} />
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--color-primary)', fontWeight: '700' }}>
                  2. Oradores de Último Momento (Inscripción espontánea en vivo)
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
                placeholder="DNI, Nombre o Teléfono..."
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
                    <span><strong>{v.nombre} {v.apellido}</strong> ({v.dni}) {v.celular ? `📱 ${v.celular}` : ''}</span>
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

      {/* 3. COLA ACTIVA (65%) Y MICRÓFONO EN VIVO (35%) */}
      <div style={{ display: 'grid', gridTemplateColumns: '65fr 35fr', gap: '1.5rem', alignItems: 'start', marginBottom: '1.5rem' }}>
        {/* COLA DE ORADORES ACTIVOS */}
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ fontSize: '1.15rem', color: 'var(--color-primary)', marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', fontWeight: '700' }}>
            <Users size={18} style={{ color: 'var(--color-highlight)' }} />
            3. Cola Activa ({queueActive.length})
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

              <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '12px', border: '1px solid var(--color-border)', marginBottom: '14px', fontSize: '0.85rem' }}>
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>
                  📌 Tema / Minuta registrada (por equipo de Territorio):
                </div>
                <div style={{ fontWeight: '600', color: 'var(--color-primary)', fontStyle: 'italic', marginBottom: '8px', backgroundColor: '#FFFFFF', padding: '10px', borderRadius: '6px', border: '1px solid #E2E8F0', minHeight: '40px', lineHeight: '1.4' }}>
                  "{activeSpeaker.tema_efectivo || activeSpeaker.tema_original || 'Sin tema especificado aún por Territorio.'}"
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#059669', backgroundColor: '#ECFDF5', padding: '6px 10px', borderRadius: '6px', border: '1px solid #A7F3D0' }}>
                  <span>✍️ <strong>Nota de Flujo:</strong> La toma y edición de temas en vivo está a cargo de Territorio desde la pantalla de Acreditación. El moderador solo controla tiempos y turnos.</span>
                </div>
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

        
        {/* 4. YA EXPUSIERON / SE BAJARON (100% WIDTH) */}
        {(() => {
          const oradoresEfectivosFinished = queueFinished.filter(o => o.estado === 'hablo');
          const totalSegsFinished = oradoresEfectivosFinished.reduce((sum, o) => sum + (o.duracion_segundos || 0), 0);
          const avgSegsFinished = oradoresEfectivosFinished.length > 0 ? Math.round(totalSegsFinished / oradoresEfectivosFinished.length) : 0;
          const avgTimeStrFinished = formatSpeakerTime(avgSegsFinished);

          const expusieronCount = oradoresEfectivosFinished.length;
          const seBajaronCount = queueFinished.filter(o => o.estado === 'se_bajo' || o.estado === 'no_hablo').length;

          return (
            <div className="card" style={{ margin: 0, backgroundColor: '#F8FAFC' }}>
              <h3 style={{ fontSize: '1.05rem', color: 'var(--color-primary)', marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', fontWeight: '700', flexWrap: 'wrap' }}>
                <Check size={18} style={{ color: 'var(--color-success)' }} />
                <span>
                  4. Ya expusieron: <strong style={{ color: 'var(--color-primary)' }}>{expusieronCount}</strong>
                  {" - "}
                  Se bajaron: <strong style={{ color: 'var(--color-primary)' }}>{seBajaronCount}</strong>
                  {" - "}
                  Tiempo Promedio: <strong style={{ color: 'var(--color-primary)' }}>{avgTimeStrFinished} min</strong>
                </span>
              </h3>

              {queueFinished.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
              {queueFinished.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF', fontSize: '0.85rem', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', gap: '12px' }}>
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
                        {item.estado === 'hablo' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: '600' }}>Tiempo Hablado (MM:SS):</span>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={editingFinishedDuration}
                              onChange={(e) => setEditingFinishedDuration(e.target.value)}
                              placeholder="MM:SS"
                              style={{ width: '80px', padding: '2px 6px', fontSize: '0.8rem', height: '26px' }}
                            />
                          </div>
                        )}
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
                            setEditingFinishedDuration(formatSpeakerTime(item.duracion_segundos || 0));
                          }}
                          title="Click para editar minuta"
                        >
                          "{item.tema_efectivo || item.tema_original || 'Sin minuta registrada.'}"
                        </div>
                      )
                    )}

                    {/* Tags: pills de solo lectura (con auto-detect fallback) + expandible para correcciones */}
                    {item.estado === 'hablo' && (() => {
                      const effectiveTags = (item.tags && item.tags.length > 0)
                        ? item.tags
                        : autoDetectTags(item.tema_efectivo || item.tema_original || '');
                      return (
                        <div style={{ marginTop: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: editingTagsFor === item.id ? '5px' : 0 }}>
                            <span style={{ fontSize: '0.62rem', color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.3px', flexShrink: 0 }}>
                              🤖 Tags
                            </span>
                            {effectiveTags.length > 0
                              ? <OradorTagsDisplay tags={effectiveTags} compact />
                              : <span style={{ fontSize: '0.68rem', color: '#CBD5E1', fontStyle: 'italic' }}>sin asignar</span>
                            }
                            <button
                              type="button"
                              onClick={() => setEditingTagsFor(prev => prev === item.id ? null : item.id)}
                              title="Corregir tags"
                              style={{ background: 'none', border: '1px solid #CBD5E1', borderRadius: '5px', padding: '1px 6px', fontSize: '0.6rem', color: '#94A3B8', cursor: 'pointer', lineHeight: '1.5', flexShrink: 0 }}
                            >
                              {editingTagsFor === item.id ? 'cerrar' : '✏️'}
                            </button>
                          </div>
                          {editingTagsFor === item.id && (
                            <div style={{ padding: '7px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                              <OradorTagSelector
                                selectedTags={effectiveTags}
                                onToggle={(tag) => handleToggleTagModerador(item.id, tag)}
                                compact
                              />
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {item.estado === 'hablo' && editingFinishedId !== item.id && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setEditingFinishedId(item.id);
                          setEditingFinishedText(item.tema_efectivo || item.tema_original || '');
                          setEditingFinishedDuration(formatSpeakerTime(item.duracion_segundos || 0));
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
              
              {/* Promedio de duración para Uno a Uno */}
              {reunion.tipo_reunion === TIPOS_REUNION.UNO_A_UNO && (() => {
                const finishedHablo = queueFinished.filter(o => o.estado === 'hablo');
                const totalSeconds = finishedHablo.reduce((sum, o) => sum + (o.duracion_segundos || 0), 0);
                const avgSeconds = finishedHablo.length > 0 ? Math.round(totalSeconds / finishedHablo.length) : 0;
                return (
                  <div style={{
                    marginTop: '1rem',
                    padding: '12px 16px',
                    backgroundColor: '#E0F2FE',
                    border: '1px solid #BAE6FD',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem',
                    color: '#0369A1'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' }}>
                      <Clock size={16} />
                      <span>Tiempo Promedio de Atención (Vecinos):</span>
                    </div>
                    <strong style={{ fontSize: '1rem', fontFamily: 'monospace' }}>
                      {formatSpeakerTime(avgSeconds)}
                    </strong>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '1.25rem', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
              Aún no finalizó ninguna exposición.
            </div>
          )}
        </div>
      );
    })()}
            </>
          )}
        </>
      )}
      {/* STACK VERTICAL DE COMPONENTES AL 100% ANCHO (SECCIÓN INFERIOR) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
        {/* 5. VARIABLES CUALITATIVAS (AL CIERRE DE LA REUNIÓN) (100% WIDTH) */}
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ fontSize: '1.15rem', color: 'var(--color-primary)', marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', fontWeight: '700' }}>
            <Save size={18} style={{ color: 'var(--color-highlight)' }} />
            5. Variables Cualitativas (Al cierre de la reunión)
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Hora Fin Real</label>
              <input
                type="time"
                className="form-control form-control-sm"
                value={horaFinReal}
                onChange={(e) => setHoraFinReal(e.target.value)}
                style={{ fontSize: '0.9rem', fontWeight: '600' }}
              />
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

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Síntesis Cualitativa</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Escribí un resumen corto sobre el desarrollo y temas generales..."
              value={sintesisCualitativa}
              onChange={(e) => setSintesisCualitativa(e.target.value)}
              style={{ fontSize: '0.85rem' }}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleSaveCualitativos}
            disabled={savingReunion}
            style={{ width: '100%', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: '600' }}
          >
            <Save size={16} /> {savingReunion ? 'Guardando...' : 'Guardar Cierre de Reunión'}
          </button>
        </div>

        {/* 6. EXPORTADOR PARA WHATSAPP (DEBAJO DE TODO) (100% WIDTH) */}
        <div className="card" style={{ margin: 0, borderTop: '4px solid var(--color-highlight)' }}>
          <h3 style={{ fontSize: '1.15rem', color: 'var(--color-primary)', marginTop: 0, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' }}>
            <Share2 size={18} style={{ color: 'var(--color-highlight)' }} />
            6. Exportador para WhatsApp (Resumen Final)
          </h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
            Previsualización exacta del resumen ejecutivo de la reunión formateado para compartir con el equipo:
          </p>

          <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '14px', border: '1px solid var(--color-border)', marginBottom: '1.25rem', fontFamily: 'monospace', fontSize: '0.82rem', whiteSpace: 'pre-wrap', lineHeight: '1.5', color: '#1E293B', maxHeight: '300px', overflowY: 'auto' }}>
            {generateWhatsAppFinalText()}
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
