import React, { useState, useEffect } from 'react';
import { Play, Square, UserPlus, Clock, Trash2, CheckCircle2, UserCheck, RotateCcw, RefreshCw, FileText, Download, Copy, Activity, MessageSquare, Users, PhoneCall } from 'lucide-react';
import { guardarAsistencia, upsertVecino, getAsistentesPorReunion } from '../services/supabaseService';
import { supabase } from '../lib/supabaseClient';
import * as XLSX from 'xlsx';

const CLIMA_MAP = {
  bajo: { label: '🔥 Clima bajo', waLabel: 'bajo' },
  medio: { label: '🔥 Clima medio', waLabel: 'medio' },
  alto: { label: '🔥 Clima caliente', waLabel: 'caliente' }
};

const SEMAFORO_MAP = {
  verde: { label: '🟢 Verde (Favorable)', waLabel: 'verde 🟢' },
  amarillo: { label: '🟡 Amarillo (Neutral/Mixto)', waLabel: 'amarillo 🟡' },
  rojo: { label: '🔴 Rojo (Tenso/Reclamos)', waLabel: 'rojo 🔴' }
};

export default function Cronometro1a1({ reunion, initialAsistencias, onUpdate, onBack }) {
  const [asistencias, setAsistencias] = useState([]);
  const [activeTab1a1, setActiveTab1a1] = useState('atencion'); // 'atencion' | 'atendidos' | 'no_asistieron'
  const [searchQuery, setSearchQuery] = useState('');

  // Horario de inicio y fin estimado
  const [estimatedStart, setEstimatedStart] = useState("17:00");
  const [estimatedEnd, setEstimatedEnd] = useState("19:00");

  // Guardar el bloque horario seleccionado por vecino en la piscina
  // { DNI: string }
  const [selectedBlocks, setSelectedBlocks] = useState({});

  // Timers activos en memoria (para segundero en vivo)
  // { 'dni_vecino': { startMs: Number, elapsedSecs: Number, isRunning: Boolean, horaIngreso: String } }
  const [activeTimers, setActiveTimers] = useState({});

  // Registros de tiempo guardados de forma persistente
  // { 'dni_vecino': { horaIngreso: String, horaSalida: String, duracion: String } }
  const [timeRecords, setTimeRecords] = useState({});

  // Edición inline de Citados, Bloques, Tema y Duración
  const [editingCitationDni, setEditingCitationDni] = useState(null);
  const [editingSlotDni, setEditingSlotDni] = useState(null);
  const [editingTemaDni, setEditingTemaDni] = useState(null);
  const [editingDurationDni, setEditingDurationDni] = useState(null);
  const [tempCitationVal, setTempCitationVal] = useState('');
  const [tempSlotVal, setTempSlotVal] = useState('');
  const [tempTemaVal, setTempTemaVal] = useState('');
  const [tempDurationVal, setTempDurationVal] = useState('');
  const [citationOverrides, setCitationOverrides] = useState({});
  const [selectedForCopy, setSelectedForCopy] = useState({});
  const [syncing, setSyncing] = useState(false);

  // Formulario para registro "Por la ventana" (Walk-In excepcional)
  const [showVentanaModal, setShowVentanaModal] = useState(false);
  const [showInformeModal, setShowInformeModal] = useState(false);
  const [vetDni, setVetDni] = useState('');
  
  // Variables cualitativas editables locales
  const [localSintesis, setLocalSintesis] = useState(reunion.sintesis_cualitativa || '');
  const [localClima, setLocalClima] = useState(reunion.clima || 'bajo');
  const [localSemaforo, setLocalSemaforo] = useState(reunion.semaforo_politico || 'verde');
  const [localGestionPresente, setLocalGestionPresente] = useState(reunion.gestion_presente || (reunion.funcionario ? `- ${reunion.funcionario}\n` : ''));

  useEffect(() => {
    setLocalSintesis(reunion.sintesis_cualitativa || '');
    setLocalClima(reunion.clima || 'bajo');
    setLocalSemaforo(reunion.semaforo_politico || 'verde');
    setLocalGestionPresente(reunion.gestion_presente || (reunion.funcionario ? `- ${reunion.funcionario}\n` : ''));
  }, [reunion.sintesis_cualitativa, reunion.clima, reunion.semaforo_politico, reunion.gestion_presente, reunion.funcionario]);
  const [vetNombre, setVetNombre] = useState('');
  const [vetApellido, setVetApellido] = useState('');
  const [vetCelular, setVetCelular] = useState('');
  const [vetEmail, setVetEmail] = useState('');
  const [vetBloque, setVetBloque] = useState('');

  // Cargar asistencias iniciales
  useEffect(() => {
    setAsistencias(initialAsistencias);
  }, [initialAsistencias]);

  // Cargar configuración de Uno a Uno (horarios estimados, registros de tiempo y timers activos)
  useEffect(() => {
    const configData = reunion.config_uno_a_uno || (reunion.gestion_presente && reunion.gestion_presente.startsWith('{') ? reunion.gestion_presente : null);
    if (configData) {
      try {
        const config = typeof configData === 'string' ? JSON.parse(configData) : configData;
        if (config.estimatedStart) setEstimatedStart(config.estimatedStart);
        if (config.estimatedEnd) setEstimatedEnd(config.estimatedEnd);
        if (config.timeRecords) setTimeRecords(config.timeRecords);
        if (config.citationOverrides) setCitationOverrides(config.citationOverrides);

        // Re-hidratar los timers activos si los hubiera
        if (config.activeTimers) {
          const restoredTimers = {};
          Object.keys(config.activeTimers).forEach(dni => {
            const entry = config.activeTimers[dni];
            restoredTimers[dni] = {
              startMs: entry.startMs,
              elapsedSecs: Math.floor((Date.now() - entry.startMs) / 1000),
              isRunning: true,
              horaIngreso: entry.horaIngreso
            };
          });
          setActiveTimers(restoredTimers);
        }

        // Auto-calcular horarios si existen registros
        const { autoStart, autoEnd } = computeAutoTimes(config.timeRecords, config.activeTimers);
        if (autoStart) setEstimatedStart(autoStart);
        if (autoEnd) setEstimatedEnd(autoEnd);
      } catch (err) {
        console.warn('Error parsing Uno a Uno config:', err);
      }
    }
  }, [reunion.config_uno_a_uno, reunion.gestion_presente]);

  // Sincronización / Refresco manual completo desde Supabase
  const handleManualRefresh = async () => {
    setSyncing(true);
    try {
      // 1. Re-consultar la reunión actualizada (para config_uno_a_uno, sintesis, clima, etc)
      const { data: freshReunion, error: errReun } = await supabase
        .from('reuniones')
        .select('*')
        .eq('id', reunion.id)
        .single();

      if (!errReun && freshReunion) {
        if (freshReunion.sintesis_cualitativa) setLocalSintesis(freshReunion.sintesis_cualitativa);
        if (freshReunion.clima) setLocalClima(freshReunion.clima);
        if (freshReunion.semaforo_politico) setLocalSemaforo(freshReunion.semaforo_politico);
        if (freshReunion.gestion_presente) setLocalGestionPresente(freshReunion.gestion_presente);

        const configData = freshReunion.config_uno_a_uno || (freshReunion.gestion_presente && freshReunion.gestion_presente.startsWith('{') ? freshReunion.gestion_presente : null);
        if (configData) {
          const config = typeof configData === 'string' ? JSON.parse(configData) : configData;
          if (config.estimatedStart) setEstimatedStart(config.estimatedStart);
          if (config.estimatedEnd) setEstimatedEnd(config.estimatedEnd);
          if (config.timeRecords) setTimeRecords(config.timeRecords);
          if (config.citationOverrides) setCitationOverrides(config.citationOverrides);

          if (config.activeTimers) {
            const restoredTimers = {};
            Object.keys(config.activeTimers).forEach(dni => {
              const entry = config.activeTimers[dni];
              restoredTimers[dni] = {
                startMs: entry.startMs,
                elapsedSecs: Math.floor((Date.now() - entry.startMs) / 1000),
                isRunning: true,
                horaIngreso: entry.horaIngreso
              };
            });
            setActiveTimers(restoredTimers);
          }

          const { autoStart, autoEnd } = computeAutoTimes(config.timeRecords, config.activeTimers);
          if (autoStart) setEstimatedStart(autoStart);
          if (autoEnd) setEstimatedEnd(autoEnd);
        }
      }

      // 2. Re-consultar las asistencias completas (con bloques y datos del vecino)
      const { data: freshAsis, error: errAsis } = await getAsistentesPorReunion(reunion.id);
      if (!errAsis && freshAsis) {
        setAsistencias(freshAsis);
      }

      if (onUpdate) await onUpdate();
    } catch (err) {
      console.error('Error al sincronizar Uno a Uno:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Generador de dropdowns de tiempo en intervalos de 15 minutos
  const generateTimeOptions = () => {
    const options = [];
    for (let h = 8; h <= 22; h++) {
      for (let m = 0; m < 60; m += 15) {
        options.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      }
    }
    return options;
  };

  // Generador de turnos escalonados de 5 minutos
  const generateSlots = (startStr, endStr) => {
    if (!startStr || !endStr) return [];
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    let currentMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    const slots = [];
    while (currentMinutes + 5 <= endMinutes) {
      const hs = Math.floor(currentMinutes / 60).toString().padStart(2, '0');
      const ms = (currentMinutes % 60).toString().padStart(2, '0');

      const nextMinutes = currentMinutes + 5;
      const he = Math.floor(nextMinutes / 60).toString().padStart(2, '0');
      const me = (nextMinutes % 60).toString().padStart(2, '0');

      slots.push(`${hs}:${ms} - ${he}:${me}`);
      currentMinutes = nextMinutes;
    }
    return slots;
  };

  const HORAS_BLOQUE = generateSlots(estimatedStart, estimatedEnd);

  // Helper para serializar timers activos
  const serializeActiveTimers = (timers) => {
    const serialized = {};
    Object.keys(timers).forEach(dni => {
      if (timers[dni].isRunning) {
        serialized[dni] = {
          startMs: timers[dni].startMs,
          horaIngreso: timers[dni].horaIngreso
        };
      }
    });
    return serialized;
  };

  // Guardar configuración general en reuniones.config_uno_a_uno
  const saveUnoAUnoConfig = async (updatedStart, updatedEnd, updatedRecords, updatedActive, updatedOverrides = citationOverrides) => {
    const payload = {
      estimatedStart: updatedStart,
      estimatedEnd: updatedEnd,
      timeRecords: updatedRecords,
      activeTimers: updatedActive,
      citationOverrides: updatedOverrides
    };
    try {
      await supabase
        .from('reuniones')
        .update({ 
          config_uno_a_uno: payload,
          gestion_presente: null // Limpiamos la configuración JSON de este campo plain-text
        })
        .eq('id', reunion.id);
    } catch (err) {
      console.error('Error al guardar configuración de Uno a Uno:', err);
    }
  };

  // Handlers para edición inline
  const handleSaveCitationOverride = async (vecinoDni, newVal) => {
    let formattedVal = newVal.trim();
    if (formattedVal && !formattedVal.toLowerCase().endsWith('hs')) {
      formattedVal = `${formattedVal} hs`;
    }
    const newOverrides = {
      ...citationOverrides,
      [vecinoDni]: formattedVal
    };
    setCitationOverrides(newOverrides);
    setEditingCitationDni(null);

    await saveUnoAUnoConfig(estimatedStart, estimatedEnd, timeRecords, serializeActiveTimers(activeTimers), newOverrides);
    onUpdate();
  };

  const handleSaveSlotChange = async (vecinoDni, newSlot) => {
    try {
      await guardarAsistencia(reunion.id, vecinoDni, false, {
        horario_bloque_asignado: newSlot
      });
      setEditingSlotDni(null);
      onUpdate();
    } catch (err) {
      console.error('Error al guardar cambio de bloque:', err);
    }
  };

  const handleSaveTemaChange = async (vecinoDni, newTema, currentAsistio) => {
    try {
      await guardarAsistencia(reunion.id, vecinoDni, currentAsistio, {
        tema_previo: newTema
      });
      setEditingTemaDni(null);
      onUpdate();
    } catch (err) {
      console.error('Error al guardar cambio de tema:', err);
    }
  };

  const handleSaveDurationChange = async (vecinoDni, newVal) => {
    try {
      setEditingDurationDni(null);
      let cleaned = newVal.trim();
      if (cleaned === '') return;
      
      // Añadir el sufijo ' min' si no existe
      if (!cleaned.toLowerCase().includes('min')) {
        cleaned = `${cleaned} min`;
      }
      
      const newRecords = {
        ...timeRecords,
        [vecinoDni]: {
          ...timeRecords[vecinoDni],
          duracion: cleaned
        }
      };
      setTimeRecords(newRecords);
      
      await saveUnoAUnoConfig(estimatedStart, estimatedEnd, newRecords, serializeActiveTimers(activeTimers), citationOverrides);
      onUpdate();
    } catch (err) {
      console.error('Error al guardar cambio de duración:', err);
    }
  };

  const handleToggleReconfirmado = async (vecinoDni, currentConfirmado, currentAsistio) => {
    try {
      await guardarAsistencia(reunion.id, vecinoDni, currentAsistio, {
        confirmado: !currentConfirmado
      });
      onUpdate();
    } catch (err) {
      console.error('Error al guardar cambio de reconfirmación:', err);
    }
  };

  const handleToggleAsistio = async (vecinoDni, currentAsistio) => {
    try {
      // Actualización optimista local de la asistencia para que cambie de solapa inmediatamente
      setAsistencias(prev => prev.map(a => a.vecino_id === vecinoDni ? { ...a, asistio: !currentAsistio } : a));
      await guardarAsistencia(reunion.id, vecinoDni, !currentAsistio);
      onUpdate();
    } catch (err) {
      console.error('Error al guardar asistencia manual:', err);
    }
  };

  const handleSaveReunionQualitative = async (newSintesis, newClima, newSemaforo, newGestionPresente) => {
    try {
      const { error } = await supabase
        .from('reuniones')
        .update({
          sintesis_cualitativa: newSintesis,
          clima: newClima,
          semaforo_politico: newSemaforo,
          gestion_presente: newGestionPresente
        })
        .eq('id', reunion.id);
      if (error) throw error;
      onUpdate();
      alert('¡Síntesis, gestión presente y variables cualitativas guardadas con éxito!');
    } catch (err) {
      console.error('Error al guardar síntesis:', err);
      alert('No se pudo guardar la síntesis.');
    }
  };

  const handleToggleCopySelection = (dni) => {
    setSelectedForCopy(prev => ({
      ...prev,
      [dni]: !prev[dni]
    }));
  };

  const handleCopySelectedToClipboard = async () => {
    const selectedDnis = Object.keys(selectedForCopy).filter(dni => selectedForCopy[dni]);
    if (selectedDnis.length === 0) {
      alert('Por favor, selecciona al menos un vecino para copiar.');
      return;
    }

    const selectedConvocados = convocadosList
      .filter(item => selectedDnis.includes(item.vecino_id))
      .sort((a, b) => (a.horario_bloque_asignado || '').localeCompare(b.horario_bloque_asignado || ''));

    const textToCopy = selectedConvocados
      .map(item => `*${item.vecino?.nombre || ''} ${item.vecino?.apellido || ''}* - ${item.horario_bloque_asignado || 'Sin hora'}\nTema: ${item.tema_previo || 'Sin tema'}`)
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(textToCopy);
      alert(`¡Copiado al portapapeles (${selectedDnis.length} vecinos)! Ya podés pegarlo en WhatsApp.`);
      setSelectedForCopy({});
    } catch (err) {
      console.error('Error al copiar al portapapeles:', err);
      alert('No se pudo copiar al portapapeles. Por favor, inténtalo de nuevo.');
    }
  };

  // Handlers para cambios de dropdowns superiores
  const handleEstimatedStartChange = async (val) => {
    if (!val) return;
    setEstimatedStart(val);
    // Asegurar que fin estimado sea posterior
    let newEnd = estimatedEnd;
    if (val >= estimatedEnd) {
      const [h, m] = val.split(':').map(Number);
      const endM = (h + 2) * 60 + m; // 2 horas después
      const finalH = Math.min(23, Math.floor(endM / 60)).toString().padStart(2, '0');
      const finalM = (endM % 60).toString().padStart(2, '0');
      newEnd = `${finalH}:${finalM}`;
      setEstimatedEnd(newEnd);
    }
    await saveUnoAUnoConfig(val, newEnd, timeRecords, serializeActiveTimers(activeTimers));
  };

  const handleEstimatedEndChange = async (val) => {
    if (!val) return;
    setEstimatedEnd(val);
    await saveUnoAUnoConfig(estimatedStart, val, timeRecords, serializeActiveTimers(activeTimers));
  };

  // Cálculo de hora de citación (Bloque de turno - 15 minutos redondeado al bloque de 15 minutos anterior)
  const calculateCitationTime = (slotStr) => {
    if (!slotStr || slotStr === 'Sin asignar') return '-';
    const startPart = slotStr.split('-')[0].trim(); // e.g. "17:05"
    if (!startPart.includes(':')) return '-';
    const [h, m] = startPart.split(':').map(Number);
    const totalMinutes = h * 60 + m;

    // Redondear hacia abajo al bloque de 15 minutos más cercano
    const blockStartMinutes = Math.floor(totalMinutes / 15) * 15;

    // Restar 15 minutos
    const citationMinutes = blockStartMinutes - 15;

    // Formatear
    const finalMinutes = citationMinutes < 0 ? (citationMinutes + 24 * 60) : citationMinutes;
    const newH = Math.floor(finalMinutes / 60);
    const newM = finalMinutes % 60;
    return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')} hs`;
  };

  // Efecto que corre el segundero en vivo para todos los timers activos
  useEffect(() => {
    const timerKeys = Object.keys(activeTimers);
    if (timerKeys.length === 0) return;

    const interval = setInterval(() => {
      setActiveTimers(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(dni => {
          const entry = next[dni];
          if (entry.isRunning) {
            next[dni] = {
              ...entry,
              elapsedSecs: Math.floor((Date.now() - entry.startMs) / 1000)
            };
          }
        });
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTimers]);

  // Helper para auto-calcular horarios reales (primer ingreso y última salida)
  const computeAutoTimes = (records, timers) => {
    let autoStart = null;
    let autoEnd = null;

    const allIngresos = [];
    Object.values(records || {}).forEach(r => {
      if (r?.horaIngreso) allIngresos.push(r.horaIngreso);
    });
    Object.values(timers || {}).forEach(t => {
      if (t?.horaIngreso) allIngresos.push(t.horaIngreso);
    });

    if (allIngresos.length > 0) {
      allIngresos.sort();
      autoStart = allIngresos[0].substring(0, 5);
    }

    const allSalidas = [];
    Object.values(records || {}).forEach(r => {
      if (r?.horaSalida) allSalidas.push(r.horaSalida);
    });

    if (allSalidas.length > 0) {
      allSalidas.sort();
      autoEnd = allSalidas[allSalidas.length - 1].substring(0, 5);
    } else if (timers && Object.keys(timers).length > 0) {
      const now = new Date();
      autoEnd = now.toTimeString().substring(0, 5);
    }

    return { autoStart, autoEnd };
  };

  // Iniciar atención (Play)
  const handleStartTimer = async (vecinoDni) => {
    const now = new Date();
    const horaIngresoStr = now.toTimeString().split(' ')[0]; // "HH:MM:SS"

    // Actualización optimista local
    setAsistencias(prev => prev.map(a => a.vecino_id === vecinoDni ? { ...a, asistio: true } : a));
    
    // Guardar asistencia en Supabase
    await guardarAsistencia(reunion.id, vecinoDni, true);

    const newActiveTimers = {
      ...activeTimers,
      [vecinoDni]: {
        startMs: Date.now(),
        elapsedSecs: 0,
        isRunning: true,
        horaIngreso: horaIngresoStr
      }
    };
    setActiveTimers(newActiveTimers);

    const newRecords = {
      ...timeRecords,
      [vecinoDni]: {
        ...timeRecords[vecinoDni],
        horaIngreso: horaIngresoStr,
        horaSalida: null,
        duracion: null
      }
    };
    setTimeRecords(newRecords);

    // Auto-actualizar horario de inicio/fin
    const { autoStart, autoEnd } = computeAutoTimes(newRecords, newActiveTimers);
    const updatedStart = autoStart || estimatedStart;
    const updatedEnd = autoEnd || estimatedEnd;
    if (autoStart && autoStart !== estimatedStart) setEstimatedStart(autoStart);
    if (autoEnd && autoEnd !== estimatedEnd) setEstimatedEnd(autoEnd);

    await saveUnoAUnoConfig(updatedStart, updatedEnd, newRecords, serializeActiveTimers(newActiveTimers));
    onUpdate();
  };

  // Finalizar atención (Stop / Guardar)
  const handleStopTimer = async (vecinoDni) => {
    const timer = activeTimers[vecinoDni];
    if (!timer) return;

    const now = new Date();
    const horaSalidaStr = now.toTimeString().split(' ')[0]; // "HH:MM:SS"

    const totalSecs = timer.elapsedSecs;
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const duracionStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} min`;

    await guardarAsistencia(reunion.id, vecinoDni, true);

    const newActiveTimers = { ...activeTimers };
    delete newActiveTimers[vecinoDni];
    setActiveTimers(newActiveTimers);

    const newRecords = {
      ...timeRecords,
      [vecinoDni]: {
        ...timeRecords[vecinoDni],
        horaSalida: horaSalidaStr,
        duracion: duracionStr
      }
    };
    setTimeRecords(newRecords);

    // Auto-actualizar horario de inicio/fin
    const { autoStart, autoEnd } = computeAutoTimes(newRecords, newActiveTimers);
    const updatedStart = autoStart || estimatedStart;
    const updatedEnd = autoEnd || estimatedEnd;
    if (autoStart && autoStart !== estimatedStart) setEstimatedStart(autoStart);
    if (autoEnd && autoEnd !== estimatedEnd) setEstimatedEnd(autoEnd);

    await saveUnoAUnoConfig(updatedStart, updatedEnd, newRecords, serializeActiveTimers(newActiveTimers));
    onUpdate();
  };

  // Eliminar un registro de tiempo y reiniciar estado del vecino
  const handleResetTimerRecord = async (vecinoDni) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar el registro de tiempo y asistencia de este vecino? Volverá a estar en la lista como "Citado" sin marcas de tiempo.')) {
      return;
    }

    // Actualización optimista local
    setAsistencias(prev => prev.map(a => a.vecino_id === vecinoDni ? { ...a, asistio: false } : a));

    await guardarAsistencia(reunion.id, vecinoDni, false);

    const newActiveTimers = { ...activeTimers };
    delete newActiveTimers[vecinoDni];
    setActiveTimers(newActiveTimers);

    const newRecords = { ...timeRecords };
    delete newRecords[vecinoDni];
    setTimeRecords(newRecords);

    await saveUnoAUnoConfig(estimatedStart, estimatedEnd, newRecords, serializeActiveTimers(newActiveTimers));
    onUpdate();
  };

  // Citar a un vecino de la piscina
  const handleCitarVecino = async (vecinoDni) => {
    // Si no tiene bloque seleccionado, buscar el primero disponible
    const blockTime = selectedBlocks[vecinoDni] || HORAS_BLOQUE[0] || '17:00 - 17:05';
    try {
      await guardarAsistencia(reunion.id, vecinoDni, false, {
        estado_convocatoria: 'citado',
        horario_bloque_asignado: blockTime
      });
      onUpdate();
    } catch (err) {
      console.error('Error al citar vecino:', err);
    }
  };

  // Quitar de lista citada
  const handleQuitarDeLista = async (vecinoDni) => {
    if (!window.confirm('¿Estás seguro de que deseas quitar a este vecino de la lista de atención? Volverá a la piscina general de inscriptos.')) {
      return;
    }
    try {
      await guardarAsistencia(reunion.id, vecinoDni, false, {
        estado_convocatoria: 'seleccionado_uno_a_uno',
        horario_bloque_asignado: null
      });

      // Limpiar marcas de tiempo
      const newActiveTimers = { ...activeTimers };
      delete newActiveTimers[vecinoDni];
      setActiveTimers(newActiveTimers);

      const newRecords = { ...timeRecords };
      delete newRecords[vecinoDni];
      setTimeRecords(newRecords);

      await saveUnoAUnoConfig(estimatedStart, estimatedEnd, newRecords, serializeActiveTimers(newActiveTimers));
      onUpdate();
    } catch (err) {
      console.error('Error al quitar de la lista:', err);
    }
  };

  // Carga manual "Por la ventana"
  const handleSaveVentana = async (e) => {
    e.preventDefault();
    if (!vetDni || !vetNombre || !vetApellido) {
      alert('DNI, Nombre y Apellido son obligatorios.');
      return;
    }

    const { data: vecino, error: errVecino } = await upsertVecino({
      dni: vetDni,
      nombre: vetNombre,
      apellido: vetApellido,
      celular: vetCelular,
      email: vetEmail,
      barrio: reunion.barrio || '',
      comuna: reunion.comuna || ''
    });

    if (errVecino || !vecino) {
      alert(`Error al guardar vecino: ${errVecino?.message || 'Verifica la conexión'}`);
      return;
    }

    const selectedBlock = vetBloque || HORAS_BLOQUE[0] || '17:00 - 17:05';

    // Registrar en la base de datos como citado (asistio = false), con estado walk_in
    await guardarAsistencia(reunion.id, vecino.dni, false, {
      estado_convocatoria: 'walk_in',
      horario_bloque_asignado: selectedBlock
    });

    setVetDni('');
    setVetNombre('');
    setVetApellido('');
    setVetCelular('');
    setVetEmail('');
    setVetBloque('');
    setShowVentanaModal(false);
    setActiveTab1a1('atencion');

    onUpdate();
    alert('¡Vecino registrado por la ventana y agregado a la Lista de Atención!');
  };

  // Particionar datos
  const inscriptosPool = asistencias.filter(item => {
    const estado = item.estado_convocatoria;
    return estado !== 'citado' && estado !== 'walk_in';
  });

  const convocadosList = asistencias.filter(item => {
    const estado = item.estado_convocatoria;
    return estado === 'citado' || estado === 'walk_in';
  });

  // Dividir los convocados en:
  // 1. Cola de atención: citados/walk_in que asistieron pero no terminaron
  const listAtencion = convocadosList.filter(item => item.asistio && !timeRecords[item.vecino_id]?.horaSalida);
  // 2. Convocados confirmados: citados/walk_in marcados como confirmados
  const listConfirmados = convocadosList.filter(item => item.confirmado);
  // 3. Ya Atendidos: citados/walk_in que ya tienen hora de salida registrada
  const listAtendidos = convocadosList.filter(item => timeRecords[item.vecino_id]?.horaSalida);
  // 4. No asistieron: citados/walk_in que no asistieron (y no tienen hora de salida)
  const listNoAsistieron = convocadosList.filter(item => !item.asistio && !timeRecords[item.vecino_id]?.horaSalida);

  // Filtrados
  const filterBySearch = (list) => list.filter(item => {
    const term = searchQuery.toLowerCase();
    const nombreCompleto = `${item.vecino?.nombre} ${item.vecino?.apellido}`.toLowerCase();
    return (
      item.vecino_id.includes(term) ||
      nombreCompleto.includes(term) ||
      (item.horario_bloque_asignado || '').toLowerCase().includes(term)
    );
  }).sort((a, b) => (a.horario_bloque_asignado || '').localeCompare(b.horario_bloque_asignado || ''));

  const filteredConvocados = filterBySearch(listAtencion);
  const filteredTodosConvocados = filterBySearch(convocadosList);
  const filteredConfirmados = filterBySearch(listConfirmados);
  const filteredAtendidos = filterBySearch(listAtendidos);
  const filteredNoAsistieron = filterBySearch(listNoAsistieron);

  const currentDisplayList = 
    activeTab1a1 === 'atencion' 
      ? filteredConvocados 
      : (activeTab1a1 === 'convocados'
          ? filteredTodosConvocados
          : (activeTab1a1 === 'confirmados'
              ? filteredConfirmados
              : (activeTab1a1 === 'atendidos' ? filteredAtendidos : filteredNoAsistieron)));

  // Formatear segundos a MM:SS
  const formatSeconds = (totalSecs) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // EXPORTACIONES

  // 1. Exportar a Excel con diseño de tabla estilizada (Azul Pastel encabezado, Rojo Pastel ausentes)
  const handleExportExcel = () => {
    const exportList = [...convocadosList]
      .filter(item => {
        if (!searchQuery) return true;
        const term = searchQuery.toLowerCase();
        const nombreCompleto = `${item.vecino?.nombre} ${item.vecino?.apellido}`.toLowerCase();
        return (
          item.vecino_id.includes(term) ||
          nombreCompleto.includes(term) ||
          (item.horario_bloque_asignado || '').toLowerCase().includes(term)
        );
      })
      .sort((a, b) => (a.horario_bloque_asignado || '').localeCompare(b.horario_bloque_asignado || ''));

    if (exportList.length === 0) {
      alert('No hay vecinos citados para exportar.');
      return;
    }

    const dataRows = exportList.map(item => {
      const slot = item.horario_bloque_asignado || 'Sin asignar';
      const record = timeRecords[item.vecino_id] || {};
      const timer = activeTimers[item.vecino_id];

      let estadoAsistencia = 'NO';
      if (record.horaSalida) {
        estadoAsistencia = 'SÍ (Atendido)';
      } else if (item.asistio) {
        estadoAsistencia = 'SÍ (En espera)';
      }

      return {
        isNo: estadoAsistencia === 'NO',
        asistio: estadoAsistencia,
        slot: slot,
        vecinoDni: `${item.vecino?.nombre || ''} ${item.vecino?.apellido || ''} (DNI: ${item.vecino_id})`,
        nombre: item.vecino?.nombre || '',
        apellido: item.vecino?.apellido || '',
        dni: item.vecino_id,
        tema: item.tema_previo || 'Sin tema',
        horaIngreso: record.horaIngreso || (timer ? timer.horaIngreso : '-'),
        horaSalida: record.horaSalida || '-',
        duracion: record.duracion || (timer ? `${Math.floor(timer.elapsedSecs / 60)} min` : '-')
      };
    });

    // Calcular promedio de duración de vecinos atendidos
    let totalSecs = 0;
    let countAtendidos = 0;
    exportList.forEach(item => {
      const dur = timeRecords[item.vecino_id]?.duracion;
      if (dur) {
        const cleanDur = dur.replace(' min', '').trim();
        if (cleanDur.includes(':')) {
          const [m, s] = cleanDur.split(':').map(Number);
          if (!isNaN(m) && !isNaN(s)) { totalSecs += m * 60 + s; countAtendidos++; }
        } else {
          const m = parseInt(cleanDur, 10);
          if (!isNaN(m)) { totalSecs += m * 60; countAtendidos++; }
        }
      }
    });

    const avgSecs = countAtendidos > 0 ? Math.round(totalSecs / countAtendidos) : 0;
    const mStr = Math.floor(avgSecs / 60).toString().padStart(2, '0');
    const sStr = (avgSecs % 60).toString().padStart(2, '0');
    const displayAvgTime = countAtendidos > 0 ? `${mStr}:${sStr} min` : '-';

    const headers = [
      '¿Asistió?', 'Bloque Horario', 'Vecino (Nombre y DNI)', 'Nombre',
      'Apellido', 'DNI', 'Tema', 'Hora Ingreso', 'Hora Salida', 'Duración'
    ];

    const tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Vecinos 1a1</x:Name>
                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          th { background-color: #B8CCE4; color: #000000; font-weight: bold; font-family: Arial, sans-serif; border: 1px solid #7F7F7F; padding: 6px 10px; text-align: center; }
          td { border: 1px solid #7F7F7F; padding: 6px 10px; font-family: Arial, sans-serif; font-size: 10pt; vertical-align: middle; }
          .row-no { background-color: #E6B8B8; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
        </style>
      </head>
      <body>
        <table border="1" style="border-collapse: collapse;">
          <thead>
            <tr>
              ${headers.map(h => `<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${dataRows.map(r => `
              <tr ${r.isNo ? 'class="row-no"' : ''}>
                <td class="center">${r.asistio}</td>
                <td class="center">${r.slot}</td>
                <td>${r.vecinoDni}</td>
                <td>${r.nombre}</td>
                <td>${r.apellido}</td>
                <td class="center">${r.dni}</td>
                <td>${r.tema}</td>
                <td class="center">${r.horaIngreso}</td>
                <td class="center">${r.horaSalida}</td>
                <td class="center">${r.duracion}</td>
              </tr>
            `).join('')}
            <!-- Fila separadora vacía -->
            <tr>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
            </tr>
            <!-- Fila de Promedio -->
            <tr>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
              <td style="border: none;"></td>
              <td class="center bold" style="border: 1px solid #7F7F7F; background-color: #F2F2F2;">Promedio</td>
              <td class="center bold" style="border: 1px solid #7F7F7F; background-color: #F2F2F2;">${displayAvgTime}</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const cleanName = (reunion.nombre || 'Reunion_1a1').replace(/[^a-zA-Z0-9]/g, '_');
    link.href = url;
    link.download = `Planilla_1a1_${cleanName}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 2. Imprimir PDF (diseño limpio y profesional en formato horizontal)
  const handlePrintPDF = () => {
    const exportList = [...convocadosList]
      .filter(item => {
        if (!searchQuery) return true;
        const term = searchQuery.toLowerCase();
        const nombreCompleto = `${item.vecino?.nombre} ${item.vecino?.apellido}`.toLowerCase();
        return (
          item.vecino_id.includes(term) ||
          nombreCompleto.includes(term) ||
          (item.horario_bloque_asignado || '').toLowerCase().includes(term)
        );
      })
      .sort((a, b) => (a.horario_bloque_asignado || '').localeCompare(b.horario_bloque_asignado || ''));

    if (exportList.length === 0) {
      alert('No hay vecinos citados para imprimir.');
      return;
    }

    const printWindow = window.open('', '_blank');
    const rows = exportList.map(item => {
      const slot = item.horario_bloque_asignado || 'Sin asignar';
      const citation = calculateCitationTime(slot);
      const displayCitationTime = citationOverrides[item.vecino_id] || citation;
      const record = timeRecords[item.vecino_id] || {};
      const timer = activeTimers[item.vecino_id];
      const hasConfirmed = item.confirmado
        ? '<span style="color: #10b981; font-weight: bold; font-size: 0.85rem;">SÍ</span>'
        : '<span style="color: #94a3b8; font-size: 0.85rem;">NO</span>';

      return `
        <tr>
          <td style="font-family: monospace; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: center; color: #0c2333;">${displayCitationTime}</td>
          <td style="font-family: Arial; padding: 10px; border: 1px solid #cbd5e1; text-align: center;">${hasConfirmed}</td>
          <td style="font-family: monospace; padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: 600;">${slot} hs</td>
          <td style="padding: 10px; border: 1px solid #cbd5e1;">
            <div style="font-weight: 700; color: #1e293b;">${item.vecino?.nombre} ${item.vecino?.apellido}</div>
            <div style="font-size: 0.75rem; color: #64748b;">DNI: ${item.vecino_id}</div>
          </td>
          <td style="padding: 10px; border: 1px solid #cbd5e1; font-size: 0.85rem; color: #334155;">${item.tema_previo || '-'}</td>
          <td style="font-family: monospace; padding: 10px; border: 1px solid #cbd5e1; text-align: center;">${record.horaIngreso || (timer ? timer.horaIngreso : '-')}</td>
          <td style="font-family: monospace; padding: 10px; border: 1px solid #cbd5e1; text-align: center;">${record.horaSalida || '-'}</td>
          <td style="font-family: monospace; padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: 600; color: #0f766e;">${record.duracion || (timer ? `${Math.floor(timer.elapsedSecs / 60)} min` : '-')}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <html>
        <head>
          <title>Planilla de Atención Uno a Uno</title>
          <style>
            @media print {
              body { margin: 0; padding: 10mm; }
              .no-print { display: none; }
            }
            @page {
              size: A4 landscape;
              margin: 10mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #334155; line-height: 1.5; padding: 10px; background-color: #fff; }
            
            /* Banner de cabecera que emula el template del usuario */
            .banner {
              display: flex;
              justify-content: space-between;
              align-items: center;
              background-color: #0c2333; /* Azul oscuro banner */
              height: 65px;
              border-top-left-radius: 8px;
              border-bottom-left-radius: 8px;
              padding-left: 24px;
              position: relative;
              overflow: hidden;
              margin-bottom: 20px;
            }
            .banner-title {
              font-size: 20px;
              font-weight: 700;
              color: #8ce4df; /* Color Titulo cyan claro */
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .banner-decor {
              display: flex;
              height: 100%;
              align-items: stretch;
            }
            .decor-teal {
              background-color: #8ce4df; /* Cyan stripe */
              width: 25px;
              border-top-left-radius: 12px;
              border-bottom-left-radius: 12px;
              margin-left: 10px;
            }
            .decor-yellow {
              background-color: #fec315; /* Yellow stripe */
              width: 25px;
              border-top-left-radius: 12px;
              border-bottom-left-radius: 12px;
              margin-left: 5px;
            }

            .reunion-info {
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 12px 16px;
              font-size: 0.9rem;
              color: #334155;
              margin-bottom: 20px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            table.report-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            table.report-table th { background-color: #f1f5f9; color: #475569; font-weight: bold; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; padding: 12px 10px; border: 1px solid #cbd5e1; text-align: left; }
            table.report-table th.center { text-align: center; }
            table.report-table td { border: 1px solid #cbd5e1; }
            tr:nth-child(even) { background-color: #f8fafc; }
          </style>
        </head>
        <body>
          <div class="banner">
            <div class="banner-title">Planilla de Atención Uno a Uno</div>
            <div class="banner-decor">
              <div class="decor-teal"></div>
              <div class="decor-yellow"></div>
            </div>
          </div>

          <div class="reunion-info">
            <div>
              <strong>Reunión:</strong> ${reunion.nombre}<br/>
              <strong>Funcionario:</strong> ${reunion.funcionario || 'No asignado'}
            </div>
            <div style="text-align: right;">
              <strong>Fecha:</strong> ${reunion.fecha || '-'}<br/>
              <span style="font-size: 0.8rem; color: #64748b;">Impreso el: ${new Date().toLocaleDateString()}</span>
            </div>
          </div>

          <table class="report-table">
            <thead>
              <tr>
                <th class="center" style="width: 110px;">CITADOS</th>
                <th class="center" style="width: 100px;">¿Confirmó?</th>
                <th class="center" style="width: 140px;">Horario Turno</th>
                <th>Vecino (Nombre y DNI)</th>
                <th>Tema</th>
                <th class="center" style="width: 100px;">Ingreso</th>
                <th class="center" style="width: 100px;">Salida</th>
                <th class="center" style="width: 100px;">Duración</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleCopyInformeWhatsAppLocal = () => {
    try {
      let displayFecha = '';
      let displayHora = (estimatedStart || reunion.hora_inicio_real) ? `${estimatedStart || reunion.hora_inicio_real} hs` : '17 hs';
      if (reunion.fecha) {
        const parts = reunion.fecha.split('-');
        if (parts.length === 3) {
          displayFecha = `${parts[2]}/${parts[1]}`;
        }
      }
      
      if (!estimatedStart && !reunion.hora_inicio_real && reunion.nombre && reunion.nombre.includes('-')) {
        const nameParts = reunion.nombre.split('-');
        const lastPart = nameParts[nameParts.length - 1].trim();
        if (lastPart.toLowerCase().includes('hs') || lastPart.toLowerCase().includes('h')) {
          displayHora = lastPart.toLowerCase().replace('hs', ' hs').replace('h', ' hs');
        }
      }

      const totalInscriptos = asistencias.filter(item => item.estado_convocatoria !== 'citado' && item.estado_convocatoria !== 'walk_in').length;
      const presentesCount = asistencias.filter(a => a.asistio).length;

      const cited = asistencias.filter(item => item.estado_convocatoria === 'citado' || item.estado_convocatoria === 'walk_in');
      const ratioAsistencia = cited.length > 0 ? Math.round((presentesCount / cited.length) * 100) : 0;
      const atendidos = cited.filter(item => timeRecords[item.vecino_id]?.horaSalida);

      let totalSeconds = 0;
      let finishedCount = 0;
      Object.keys(timeRecords).forEach(k => {
        const dur = timeRecords[k]?.duracion;
        if (dur) {
          const cleanDur = dur.replace(' min', '').trim();
          if (cleanDur.includes(':')) {
            const [mins, secs] = cleanDur.split(':').map(Number);
            if (!isNaN(mins) && !isNaN(secs)) {
              totalSeconds += mins * 60 + secs;
              finishedCount++;
            }
          }
        }
      });
      const averageSeconds = finishedCount > 0 ? Math.round(totalSeconds / finishedCount) : 0;
      const avgMins = Math.floor(averageSeconds / 60);
      const avgSecs = averageSeconds % 60;
      const displayAvg = `${avgMins.toString().padStart(2, '0')}:${avgSecs.toString().padStart(2, '0')} min`;

      const sortedCited = [...cited].sort((a, b) => (a.horario_bloque_asignado || '').localeCompare(b.horario_bloque_asignado || ''));

      const txt = `👨‍👩‍👧‍👦 1a1 | *${reunion.funcionario || reunion.nombre}* - ${reunion.comuna}
📅 ${displayFecha || 'Fecha'} | 🕠 ${displayHora}
⏰ Inicio: ${estimatedStart} hs | Finalizó: ${estimatedEnd} hs

📋 Inscriptos totales: ${totalInscriptos}
⏰ Vecinos citados: ${cited.length}
👥 Vecinos presentes: ${presentesCount} (${ratioAsistencia}%)
🎤 Vecinos atendidos: ${atendidos.length}
⏱️ Tiempo de atención prom: ${displayAvg}

🔥 Clima ${CLIMA_MAP[reunion.clima]?.waLabel || reunion.clima || 'bajo'}
🚦 Semáforo político: ${SEMAFORO_MAP[reunion.semaforo_politico]?.waLabel || reunion.semaforo_politico || 'verde'}

*📝 Síntesis cualitativa:*
${(reunion.sintesis_cualitativa || '').trim() || 'La reunión se desarrolló con normalidad.'}

*🏛️ Gestión presente:*
${(reunion.gestion_presente || '').trim() || '- ' + (reunion.funcionario || 'Funcionario')}

*🏛️ Minutas de los Vecinos:*
${sortedCited.length > 0 
  ? sortedCited.map((c, idx) => {
      const status = timeRecords[c.vecino_id]?.horaSalida 
        ? `✅ Atendido (${timeRecords[c.vecino_id].duracion})` 
        : (c.asistio ? '⏳ En espera (Presente)' : '❌ Ausente');
      return `${idx + 1}. *${c.vecino?.nombre || ''} ${c.vecino?.apellido || ''}* - ${c.horario_bloque_asignado || 'Sin hora'}\nTema: ${c.tema_previo || 'Sin tema registrado.'}\nEstado: ${status}`;
    }).join('\n\n')
  : 'No se registraron vecinos citados.'
}`;

      navigator.clipboard.writeText(txt);
      alert('¡Resumen de WhatsApp copiado con éxito al portapapeles!');
    } catch (err) {
      console.error(err);
      alert('No se pudo copiar automáticamente.');
    }
  };

  return (
    <div className="container">
      
      {/* Botón Volver al Tablero */}
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '8px' }} className="hide-on-print">
        <button className="btn btn-secondary btn-sm" onClick={onBack}>
          ← Volver al Tablero
        </button>
      </div>

      <div className="card">
        {/* Cabecera Principal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={20} style={{ color: 'var(--color-highlight)' }} />
              Reunión 1 a 1: {reunion.nombre}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              Planificación y cronometraje de turnos de 5 minutos por vecino.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }} className="hide-on-print">
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => setShowInformeModal(true)} 
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid var(--color-highlight)', color: 'var(--color-primary)' }}
            >
              <Activity size={14} style={{ color: 'var(--color-highlight)' }} /> Informe Final
            </button>
            <button className="btn btn-highlight btn-sm" onClick={() => setShowVentanaModal(true)}>
              <UserPlus size={16} /> Entra "Por la Ventana"
            </button>
          </div>
        </div>

        {/* Horarios Estimados Dropdowns (Requisito Nuevo) */}
        <div style={{
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          backgroundColor: '#F8FAFC',
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
          marginBottom: '1.5rem',
          flexWrap: 'wrap'
        }} className="hide-on-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--color-primary)' }}>⏰ Horario Inicio Estimado:</span>
            <input
              type="time"
              value={estimatedStart}
              onChange={(e) => handleEstimatedStartChange(e.target.value)}
              className="form-control"
              style={{ width: '120px', padding: '4px 8px', fontSize: '0.85rem', height: '34px', borderRadius: '6px', border: '1px solid var(--color-border)' }}
            />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--color-primary)' }}>⏰ Horario Fin Estimado:</span>
            <input
              type="time"
              value={estimatedEnd}
              onChange={(e) => handleEstimatedEndChange(e.target.value)}
              className="form-control"
              style={{ width: '120px', padding: '4px 8px', fontSize: '0.85rem', height: '34px', borderRadius: '6px', border: '1px solid var(--color-border)' }}
            />
          </div>
          
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            * Al cambiar estos horarios se generarán los turnos escalonados cada 5 minutos.
          </span>
        </div>

        {/* KPI Cards de Resumen para Mano a Mano */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '1.25rem' }} className="hide-on-print">
          <div className="card" style={{ margin: 0, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#F8FAFC', border: '1px solid var(--color-border)' }}>
            <div style={{ padding: '6px', borderRadius: '6px', backgroundColor: '#E2E8F0', color: '#334155' }}>
              <Users size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Insc. Base</div>
              <div style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--color-primary)' }}>{asistencias.length}</div>
            </div>
          </div>

          <div 
            className="card" 
            onClick={() => setActiveTab1a1('convocados')}
            style={{ margin: 0, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', cursor: 'pointer' }}
            title="Ver todos los vecinos convocados / citados"
          >
            <div style={{ padding: '6px', borderRadius: '6px', backgroundColor: '#DBEAFE', color: '#1D4ED8' }}>
              <Clock size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#1E40AF', fontWeight: '600', textTransform: 'uppercase' }}>Convocados</div>
              <div style={{ fontSize: '1.15rem', fontWeight: '700', color: '#1E3A8A' }}>{convocadosList.length}</div>
            </div>
          </div>

          <div 
            className="card" 
            onClick={() => setActiveTab1a1('confirmados')}
            style={{ margin: 0, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', cursor: 'pointer' }}
            title="Ver vecinos que confirmaron asistencia"
          >
            <div style={{ padding: '6px', borderRadius: '6px', backgroundColor: '#D1FAE5', color: '#047857' }}>
              <PhoneCall size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#065F46', fontWeight: '600', textTransform: 'uppercase' }}>Confirmados</div>
              <div style={{ fontSize: '1.15rem', fontWeight: '700', color: '#047857' }}>{listConfirmados.length}</div>
            </div>
          </div>

          <div 
            className="card" 
            onClick={() => setActiveTab1a1('atencion')}
            style={{ margin: 0, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', cursor: 'pointer' }}
            title="Ver vecinos presentes en espera"
          >
            <div style={{ padding: '6px', borderRadius: '6px', backgroundColor: '#FDE68A', color: '#B45309' }}>
              <UserCheck size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#92400E', fontWeight: '600', textTransform: 'uppercase' }}>Presentes</div>
              <div style={{ fontSize: '1.15rem', fontWeight: '700', color: '#B45309' }}>{convocadosList.filter(c => c.asistio).length}</div>
            </div>
          </div>

          <div 
            className="card" 
            onClick={() => setActiveTab1a1('atendidos')}
            style={{ margin: 0, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#F1F5F9', border: '1px solid var(--color-border)', cursor: 'pointer' }}
            title="Ver vecinos ya atendidos"
          >
            <div style={{ padding: '6px', borderRadius: '6px', backgroundColor: '#E2E8F0', color: '#475569' }}>
              <CheckCircle2 size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Atendidos</div>
              <div style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--color-primary)' }}>{listAtendidos.length}</div>
            </div>
          </div>
        </div>

        {/* Solapas internas de Moderación */}
        <div className="tabs" style={{ marginBottom: '1.5rem', borderBottom: '2px solid var(--color-border)', flexWrap: 'wrap' }}>
          <div 
            className={`tab ${activeTab1a1 === 'atencion' ? 'active' : ''}`}
            onClick={() => setActiveTab1a1('atencion')}
            style={{ padding: '10px 16px', fontWeight: '600' }}
          >
            📋 Cola de atención ({listAtencion.length})
          </div>
          <div 
            className={`tab ${activeTab1a1 === 'convocados' ? 'active' : ''}`}
            onClick={() => setActiveTab1a1('convocados')}
            style={{ padding: '10px 16px', fontWeight: '600', backgroundColor: activeTab1a1 === 'convocados' ? '#EFF6FF' : 'transparent', color: activeTab1a1 === 'convocados' ? '#1D4ED8' : 'inherit' }}
          >
            👥 Convocados ({convocadosList.length})
          </div>
          <div 
            className={`tab ${activeTab1a1 === 'confirmados' ? 'active' : ''}`}
            onClick={() => setActiveTab1a1('confirmados')}
            style={{ padding: '10px 16px', fontWeight: '600', backgroundColor: activeTab1a1 === 'confirmados' ? '#ECFDF5' : 'transparent', color: activeTab1a1 === 'confirmados' ? '#047857' : 'inherit' }}
          >
            📞 Confirmados ({listConfirmados.length})
          </div>
          <div 
            className={`tab ${activeTab1a1 === 'atendidos' ? 'active' : ''}`}
            onClick={() => setActiveTab1a1('atendidos')}
            style={{ padding: '10px 16px', fontWeight: '600' }}
          >
            ✅ Ya Atendidos ({listAtendidos.length})
          </div>
          <div 
            className={`tab ${activeTab1a1 === 'no_asistieron' ? 'active' : ''}`}
            onClick={() => setActiveTab1a1('no_asistieron')}
            style={{ padding: '10px 16px', fontWeight: '600' }}
          >
            ❌ No asistieron ({listNoAsistieron.length})
          </div>
          <div 
            className={`tab ${activeTab1a1 === 'vista' ? 'active' : ''}`}
            onClick={() => setActiveTab1a1('vista')}
            style={{ padding: '10px 16px', fontWeight: '600', backgroundColor: activeTab1a1 === 'vista' ? '#ECFDF5' : 'transparent', color: activeTab1a1 === 'vista' ? '#047857' : 'inherit' }}
          >
            👁️ Vista Directora ({convocadosList.length})
          </div>
        </div>

        {/* CONTENEDOR DE TABLA DE ATENCIÓN Y REPORTES */}
        <>
            {/* Controles de búsqueda y Exportaciones */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }} className="hide-on-print">
              <div className="search-container" style={{ maxWidth: '400px', flexGrow: 1 }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Buscar citados por DNI, Nombre o Turno..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Cartel de tiempo promedio para Ya Atendidos y Vista Directora */}
              {(activeTab1a1 === 'atendidos' || activeTab1a1 === 'vista') && (() => {
                let totalSecs = 0;
                let count = 0;
                listAtendidos.forEach(item => {
                  const dur = timeRecords[item.vecino_id]?.duracion;
                  if (dur) {
                    const cleanDur = dur.replace(' min', '').trim();
                    if (cleanDur.includes(':')) {
                      const [m, s] = cleanDur.split(':').map(Number);
                      if (!isNaN(m) && !isNaN(s)) { totalSecs += m * 60 + s; count++; }
                    } else {
                      const m = parseInt(cleanDur, 10);
                      if (!isNaN(m)) { totalSecs += m * 60; count++; }
                    }
                  }
                });
                const avgSecs = count > 0 ? Math.round(totalSecs / count) : 0;
                const mStr = Math.floor(avgSecs / 60).toString().padStart(2, '0');
                const sStr = (avgSecs % 60).toString().padStart(2, '0');
                const displayAvgTime = count > 0 ? `${mStr}:${sStr} min` : '--:-- min';

                return (
                  <div style={{
                    padding: '8px 16px',
                    backgroundColor: '#EFF6FF',
                    color: '#1E40AF',
                    borderRadius: '8px',
                    border: '1px solid #BFDBFE',
                    fontWeight: '700',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <Clock size={16} style={{ color: '#2563EB' }} />
                    Tiempo Promedio: <span style={{ fontSize: '0.95rem', color: '#1E3A8A' }}>{displayAvgTime}</span>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                  className="btn btn-sm" 
                  onClick={handleManualRefresh} 
                  disabled={syncing}
                  style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '6px', 
                    backgroundColor: '#DCFCE7', 
                    color: '#15803D', 
                    borderColor: '#86EFAC', 
                    fontWeight: '700',
                    padding: '6px 12px',
                    opacity: syncing ? 0.7 : 1,
                    cursor: syncing ? 'wait' : 'pointer'
                  }}
                  title="Sincronizar datos y actualizar la vista desde la base de datos"
                >
                  <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Sincronizando...' : 'Sincronizar'}
                </button>
                <button 
                  className="btn btn-primary btn-sm" 
                  onClick={handleCopySelectedToClipboard} 
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#2563EB', borderColor: '#2563EB' }}
                >
                  <Copy size={14} /> Copiar WhatsApp {Object.keys(selectedForCopy).filter(k => selectedForCopy[k]).length > 0 && `(${Object.keys(selectedForCopy).filter(k => selectedForCopy[k]).length})`}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleExportExcel} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Download size={14} /> Exportar Excel
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handlePrintPDF} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <FileText size={14} /> Imprimir PDF
                </button>
              </div>
            </div>

            {activeTab1a1 === 'vista' ? (
              <div className="table-responsive" style={{ maxHeight: '65vh', overflowY: 'auto', borderRadius: '8px', border: '1px solid var(--color-border)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#1E293B', color: '#FFFFFF' }}>
                      <th style={{ padding: '12px 14px', width: '150px', textAlign: 'center', backgroundColor: '#1E293B', color: '#FFFFFF', position: 'sticky', top: 0, zIndex: 10 }}>Estado / Asistió</th>
                      <th style={{ padding: '12px 14px', width: '140px', backgroundColor: '#1E293B', color: '#FFFFFF', position: 'sticky', top: 0, zIndex: 10 }}>Bloque Horario</th>
                      <th style={{ padding: '12px 14px', backgroundColor: '#1E293B', color: '#FFFFFF', position: 'sticky', top: 0, zIndex: 10 }}>Nombre y Apellido</th>
                      <th style={{ padding: '12px 14px', backgroundColor: '#1E293B', color: '#FFFFFF', position: 'sticky', top: 0, zIndex: 10 }}>Tema</th>
                      <th style={{ padding: '12px 14px', width: '130px', backgroundColor: '#1E293B', color: '#FFFFFF', position: 'sticky', top: 0, zIndex: 10 }}>Duración</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const sortedVistaList = [...convocadosList]
                        .filter(item => {
                          if (!searchQuery) return true;
                          const term = searchQuery.toLowerCase();
                          const nombreCompleto = `${item.vecino?.nombre} ${item.vecino?.apellido}`.toLowerCase();
                          return (
                            item.vecino_id.includes(term) ||
                            nombreCompleto.includes(term) ||
                            (item.horario_bloque_asignado || '').toLowerCase().includes(term)
                          );
                        })
                        .sort((a, b) => (a.horario_bloque_asignado || '').localeCompare(b.horario_bloque_asignado || ''));

                      if (sortedVistaList.length === 0) {
                        return (
                          <tr>
                            <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                              No hay vecinos en la lista.
                            </td>
                          </tr>
                        );
                      }

                      return sortedVistaList.map(item => {
                        const record = timeRecords[item.vecino_id];
                        const timer = activeTimers[item.vecino_id];

                        const isNoAsistio = !item.asistio && !record?.horaSalida;
                        const isEnEspera = item.asistio && !record?.horaSalida;
                        const isYaAtendido = !!record?.horaSalida;

                        let rowBg = '#FEE2E2'; // rojo pastel
                        let rowBorder = '#FCA5A5';
                        let textColor = '#7F1D1D';
                        let badgeLabel = '❌ No asistió';
                        let badgeBg = '#FECACA';
                        let badgeColor = '#991B1B';

                        if (isEnEspera) {
                          rowBg = '#DCFCE7'; // verde pastel
                          rowBorder = '#86EFAC';
                          textColor = '#14532D';
                          badgeLabel = timer ? '🎤 En Atención' : '⏳ En espera';
                          badgeBg = '#BBF7D0';
                          badgeColor = '#166534';
                        } else if (isYaAtendido) {
                          rowBg = '#4ADE80'; // verde flúor
                          rowBorder = '#22C55E';
                          textColor = '#052E16';
                          badgeLabel = '✅ Atendido';
                          badgeBg = '#16A34A';
                          badgeColor = '#FFFFFF';
                        }

                        const durationStr = record?.duracion || (timer ? `${formatSeconds(timer.elapsedSecs)} min` : '-');

                        return (
                          <tr key={item.vecino_id} style={{ backgroundColor: rowBg, borderBottom: `2px solid ${rowBorder}`, color: textColor }}>
                            <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                              <span style={{ padding: '6px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: '700', backgroundColor: badgeBg, color: badgeColor, display: 'inline-block' }}>
                                {badgeLabel}
                              </span>
                            </td>
                            <td style={{ padding: '14px 12px', fontWeight: '700', fontFamily: 'monospace', fontSize: '1rem' }}>
                              {item.horario_bloque_asignado || 'Sin asignar'}
                            </td>
                            <td style={{ padding: '14px 12px' }}>
                              <div style={{ fontWeight: '700', fontSize: '1.05rem' }}>
                                {item.vecino?.nombre} {item.vecino?.apellido}
                              </div>
                              <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                                DNI: {item.vecino_id}
                              </div>
                            </td>
                            <td style={{ padding: '14px 12px', fontSize: '0.9rem', fontWeight: '600' }}>
                              {item.tema_previo || <span style={{ fontStyle: 'italic', opacity: 0.7 }}>Sin tema</span>}
                            </td>
                            <td style={{ padding: '14px 12px', fontFamily: 'monospace', fontWeight: '700', fontSize: '1rem' }}>
                              {durationStr}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            ) : (
            <div className="table-responsive" style={{ maxHeight: '60vh', overflowY: 'auto', position: 'relative' }}>
              <table className="table" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: '#FFFFFF', zIndex: 10, boxShadow: 'inset 0 -1px 0 var(--color-border)', width: '110px' }}>Citados</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: '#FFFFFF', zIndex: 10, boxShadow: 'inset 0 -1px 0 var(--color-border)', width: '100px', textAlign: 'center' }}>¿Confirmó?</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: '#FFFFFF', zIndex: 10, boxShadow: 'inset 0 -1px 0 var(--color-border)', width: '100px', textAlign: 'center' }}>¿Asistió?</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: '#FFFFFF', zIndex: 10, boxShadow: 'inset 0 -1px 0 var(--color-border)', width: '140px' }}>Bloque Horario</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: '#FFFFFF', zIndex: 10, boxShadow: 'inset 0 -1px 0 var(--color-border)' }}>Vecino (Nombre y DNI)</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: '#FFFFFF', zIndex: 10, boxShadow: 'inset 0 -1px 0 var(--color-border)' }}>Tema</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: '#FFFFFF', zIndex: 10, boxShadow: 'inset 0 -1px 0 var(--color-border)' }}>Hora Ingreso</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: '#FFFFFF', zIndex: 10, boxShadow: 'inset 0 -1px 0 var(--color-border)' }}>Hora Salida</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: '#FFFFFF', zIndex: 10, boxShadow: 'inset 0 -1px 0 var(--color-border)' }}>Duración</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: '#FFFFFF', zIndex: 10, boxShadow: 'inset 0 -1px 0 var(--color-border)', textAlign: 'right' }}>Acciones</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: '#FFFFFF', zIndex: 10, boxShadow: 'inset 0 -1px 0 var(--color-border)', width: '60px', textAlign: 'center' }}>Copiar</th>
                  </tr>
                </thead>
                <tbody>
                  {currentDisplayList.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                        {activeTab1a1 === 'atencion' 
                          ? 'No hay vecinos en la cola de atención (presentes en espera). Podés marcar asistencia o agregarlos "Por la Ventana".'
                          : (activeTab1a1 === 'convocados'
                              ? 'No hay vecinos convocados / citados en esta reunión.'
                              : (activeTab1a1 === 'confirmados'
                                  ? 'Aún no hay vecinos marcados como confirmados.'
                                  : (activeTab1a1 === 'atendidos'
                                      ? 'No hay vecinos atendidos todavía en esta reunión.'
                                      : 'No hay vecinos registrados en esta categoría.')))}
                      </td>
                    </tr>
                  ) : (
                    currentDisplayList.map(item => {
                      const timer = activeTimers[item.vecino_id];
                      const record = timeRecords[item.vecino_id] || {};
                      const isRunning = timer?.isRunning;
                      
                      const slot = item.horario_bloque_asignado || '';
                      const citationTime = calculateCitationTime(slot);
                      const displayCitationTime = citationOverrides[item.vecino_id] || citationTime;

                      return (
                        <tr key={item.id} style={{
                          backgroundColor: isRunning ? '#F0FDF4' : (item.asistio && !isRunning ? '#F8FAFC' : 'inherit')
                        }}>
                          {/* Columna Citados (Calculado o Personalizado) */}
                          <td>
                            {editingCitationDni === item.vecino_id ? (
                              <input
                                type="text"
                                value={tempCitationVal}
                                onChange={(e) => setTempCitationVal(e.target.value)}
                                onBlur={() => handleSaveCitationOverride(item.vecino_id, tempCitationVal)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveCitationOverride(item.vecino_id, tempCitationVal);
                                  if (e.key === 'Escape') setEditingCitationDni(null);
                                }}
                                className="form-control"
                                style={{ width: '80px', padding: '2px 4px', fontSize: '0.8rem', display: 'inline-block' }}
                                autoFocus
                              />
                            ) : (
                              <span 
                                className="badge" 
                                onClick={() => {
                                  setEditingCitationDni(item.vecino_id);
                                  setTempCitationVal(displayCitationTime.replace(' hs', ''));
                                }}
                                title="Haga clic para editar el horario de citación"
                                style={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.8rem',
                                  backgroundColor: '#E2E8F0',
                                  color: '#1E293B',
                                  border: '1px solid #CBD5E1',
                                  cursor: 'pointer'
                                }}
                              >
                                {displayCitationTime}
                              </span>
                            )}
                          </td>
                          {/* Columna ¿Confirmó? (WhatsApp) */}
                          <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={!!item.confirmado}
                                onChange={() => handleToggleReconfirmado(item.vecino_id, item.confirmado, item.asistio)}
                                style={{
                                  width: '18px',
                                  height: '18px',
                                  accentColor: '#10B981',
                                  cursor: 'pointer'
                                }}
                                title="Confirmación de asistencia vía WhatsApp"
                              />
                            </label>
                          </td>
                          {/* Columna ¿Asistió? (Presencial / Manual) */}
                          <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={!!item.asistio}
                                onChange={() => handleToggleAsistio(item.vecino_id, item.asistio)}
                                style={{
                                  width: '18px',
                                  height: '18px',
                                  accentColor: '#2563EB',
                                  cursor: 'pointer'
                                }}
                                title="Marcar asistencia manual"
                              />
                            </label>
                          </td>
                          {/* Columna Bloque Horario */}
                          <td>
                            {editingSlotDni === item.vecino_id ? (
                              <>
                               <input
                                 type="text"
                                 list={`slots-list-${item.vecino_id}`}
                                 value={tempSlotVal}
                                 onChange={(e) => setTempSlotVal(e.target.value)}
                                 onBlur={() => handleSaveSlotChange(item.vecino_id, tempSlotVal)}
                                 onKeyDown={(e) => {
                                   if (e.key === 'Enter') handleSaveSlotChange(item.vecino_id, tempSlotVal);
                                   if (e.key === 'Escape') setEditingSlotDni(null);
                                 }}
                                 className="form-control"
                                 style={{ width: '130px', padding: '2px 4px', fontSize: '0.8rem', display: 'inline-block' }}
                                 autoFocus
                               />
                               <datalist id={`slots-list-${item.vecino_id}`}>
                                 {HORAS_BLOQUE.map(h => (
                                   <option key={h} value={h} />
                                 ))}
                               </datalist>
                              </>
                            ) : (
                              <span 
                                className="badge badge-info" 
                                onClick={() => {
                                  setEditingSlotDni(item.vecino_id);
                                  setTempSlotVal(slot);
                                }}
                                title="Haga clic para editar el turno"
                                style={{ fontFamily: 'monospace', fontSize: '0.85rem', cursor: 'pointer' }}
                              >
                                ⏰ {slot || 'Sin asignar'}
                              </span>
                            )}
                          </td>
                          {/* Columna Vecino */}
                          <td>
                            <div style={{ fontWeight: '600' }}>
                              {item.vecino?.nombre} {item.vecino?.apellido}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                              DNI: {item.vecino_id} 
                            </div>
                          </td>
                           {/* Columna Tema */}
                           <td style={{ fontSize: '0.85rem', maxWidth: '180px' }}>
                             {editingTemaDni === item.vecino_id ? (
                               <input
                                 type="text"
                                 value={tempTemaVal}
                                 onChange={(e) => setTempTemaVal(e.target.value)}
                                 onBlur={() => handleSaveTemaChange(item.vecino_id, tempTemaVal, item.asistio)}
                                 onKeyDown={(e) => {
                                   if (e.key === 'Enter') handleSaveTemaChange(item.vecino_id, tempTemaVal, item.asistio);
                                   if (e.key === 'Escape') setEditingTemaDni(null);
                                 }}
                                 className="form-control"
                                 style={{ width: '100%', padding: '2px 4px', fontSize: '0.8rem' }}
                                 autoFocus
                               />
                             ) : (
                               <span 
                                 onClick={() => {
                                   setEditingTemaDni(item.vecino_id);
                                   setTempTemaVal(item.tema_previo || '');
                                 }}
                                 title="Haga clic para editar el tema"
                                 style={{ cursor: 'pointer', display: 'block', minHeight: '20px' }}
                               >
                                 {item.tema_previo || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin tema (clic para editar)</span>}
                               </span>
                             )}
                           </td>
                          {/* Columna Hora Ingreso */}
                          <td style={{ fontFamily: 'monospace' }}>
                            {record.horaIngreso || (timer ? timer.horaIngreso : '-')}
                          </td>
                          {/* Columna Hora Salida */}
                          <td style={{ fontFamily: 'monospace' }}>
                            {record.horaSalida || '-'}
                          </td>
                          {/* Columna Duración */}
                          <td style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                             {isRunning ? (
                               <span style={{ color: 'var(--color-success)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                 <span className="status-dot animate-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-success)' }}></span>
                                 {formatSeconds(timer.elapsedSecs)}
                               </span>
                             ) : record.duracion ? (
                               editingDurationDni === item.vecino_id ? (
                                 <input
                                   type="text"
                                   value={tempDurationVal}
                                   onChange={(e) => setTempDurationVal(e.target.value)}
                                   onBlur={() => handleSaveDurationChange(item.vecino_id, tempDurationVal)}
                                   onKeyDown={(e) => {
                                     if (e.key === 'Enter') handleSaveDurationChange(item.vecino_id, tempDurationVal);
                                     if (e.key === 'Escape') setEditingDurationDni(null);
                                   }}
                                   className="form-control"
                                   style={{ width: '85px', padding: '2px 4px', fontSize: '0.8rem', display: 'inline-block', height: '24px' }}
                                   autoFocus
                                 />
                               ) : (
                                 <span 
                                   onClick={() => {
                                     setEditingDurationDni(item.vecino_id);
                                     setTempDurationVal(record.duracion.replace(' min', '').trim());
                                   }}
                                   title="Haga clic para editar la duración manualmente"
                                   style={{ color: '#0F766E', cursor: 'pointer', borderBottom: '1px dashed #0F766E' }}
                                 >
                                   {record.duracion}
                                 </span>
                               )
                             ) : (
                               '-'
                             )}
                          </td>
                          {/* Columna Acciones */}
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                              
                              {/* Iniciar atención */}
                              {!record.horaIngreso && !isRunning && (
                                <>
                                  <button 
                                    className="btn btn-primary btn-sm"
                                    onClick={() => handleStartTimer(item.vecino_id)}
                                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                  >
                                    <Play size={12} /> Ingreso
                                  </button>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleQuitarDeLista(item.vecino_id)}
                                    style={{ padding: '6px', color: '#EF4444', border: '1px solid #FCA5A5' }}
                                    title="Quitar de lista de atención"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                              
                              {/* Registrar Salida */}
                              {isRunning && (
                                <>
                                  <button 
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleStopTimer(item.vecino_id)}
                                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                  >
                                    <Square size={12} /> Registrar Salida
                                  </button>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleResetTimerRecord(item.vecino_id)}
                                    style={{ padding: '6px', color: '#E11D48', border: '1px solid #FDA4AF' }}
                                    title="Reiniciar/Eliminar registro de tiempo"
                                  >
                                    <RotateCcw size={14} />
                                  </button>
                                </>
                              )}

                              {/* Atendido */}
                              {record.horaSalida && !isRunning && (
                                <>
                                  <span style={{ fontSize: '0.85rem', color: 'var(--color-success)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <CheckCircle2 size={14} /> Atendido
                                  </span>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleResetTimerRecord(item.vecino_id)}
                                    style={{ padding: '6px', color: '#E11D48', border: '1px solid #FDA4AF' }}
                                    title="Reiniciar/Eliminar registro de tiempo"
                                  >
                                    <RotateCcw size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                          {/* Columna Copiar (WhatsApp) */}
                          <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={!!selectedForCopy[item.vecino_id]}
                                onChange={() => handleToggleCopySelection(item.vecino_id)}
                                style={{
                                  width: '18px',
                                  height: '18px',
                                  accentColor: 'var(--color-primary)',
                                  cursor: 'pointer'
                                }}
                                title="Seleccionar para copiar a WhatsApp"
                              />
                            </label>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
          
          {/* Formulario de Síntesis y Variables Cualitativas (oculto en Vista Directora) */}
          {activeTab1a1 !== 'vista' && (
            <div style={{ 
              marginTop: '2rem', 
              paddingTop: '1.5rem', 
              borderTop: '2px solid var(--color-border)' 
            }} className="hide-on-print">
              <h4 style={{ fontSize: '1.1rem', color: 'var(--color-primary)', marginTop: 0, marginBottom: '1rem', fontWeight: '700' }}>
                ✏️ Síntesis Cualitativa y Clima de la Reunión
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Clima de la Reunión</label>
                  <select 
                    className="form-control" 
                    value={localClima} 
                    onChange={(e) => setLocalClima(e.target.value)}
                    style={{ height: '38px' }}
                  >
                    <option value="bajo">🔥 Clima bajo</option>
                    <option value="medio">🔥 Clima medio</option>
                    <option value="alto">🔥 Clima caliente</option>
                  </select>
                </div>
                
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Semáforo Político</label>
                  <select 
                    className="form-control" 
                    value={localSemaforo} 
                    onChange={(e) => setLocalSemaforo(e.target.value)}
                    style={{ height: '38px' }}
                  >
                    <option value="verde">🟢 Verde (Favorable)</option>
                    <option value="amarillo">🟡 Amarillo (Neutral/Mixto)</option>
                    <option value="rojo">🔴 Rojo (Tenso/Reclamos)</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Síntesis Cualitativa de la Reunión</label>
                <textarea
                  className="form-control"
                  rows={4}
                  placeholder="Escribe un breve resumen de los temas conversados, reclamos principales y conclusiones generales..."
                  value={localSintesis}
                  onChange={(e) => setLocalSintesis(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)', resize: 'vertical' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Gestión Presente</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Listado de funcionarios e integrantes de gestión presentes..."
                  value={localGestionPresente}
                  onChange={(e) => setLocalGestionPresente(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  className="btn btn-primary"
                  onClick={() => handleSaveReunionQualitative(localSintesis, localClima, localSemaforo, localGestionPresente)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--color-success)', borderColor: 'var(--color-success)' }}
                >
                  Guardar Síntesis y Variables
                </button>
              </div>
            </div>
          )}
      </div>

      {/* MODAL ENTRA POR LA VENTANA */}
      {showVentanaModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ marginBottom: '1.25rem', color: 'var(--color-primary)' }}>Registro Excepcional ("Por la Ventana")</h3>
            <form onSubmit={handleSaveVentana}>
              <div className="form-group">
                <label>DNI *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="DNI del vecino"
                  value={vetDni}
                  onChange={(e) => setVetDni(e.target.value)}
                  required
                />
              </div>

              <div className="grid-2" style={{ gap: '1rem' }}>
                <div className="form-group">
                  <label>Nombre *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={vetNombre}
                    onChange={(e) => setVetNombre(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Apellido *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={vetApellido}
                    onChange={(e) => setVetApellido(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Contacto Telefónico</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ej: 11223344"
                  value={vetCelular}
                  onChange={(e) => setVetCelular(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="ejemplo@correo.com"
                  value={vetEmail}
                  onChange={(e) => setVetEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Turno Asignado Temporal</label>
                <select
                  value={vetBloque || HORAS_BLOQUE[0] || '17:00 - 17:05'}
                  onChange={(e) => setVetBloque(e.target.value)}
                  className="form-control"
                >
                  {HORAS_BLOQUE.map(h => (
                    <option key={h} value={h}>{h} hs</option>
                  ))}
                  {HORAS_BLOQUE.length === 0 && (
                    <option value="17:00 - 17:05">17:00 - 17:05 hs</option>
                  )}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowVentanaModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-highlight">
                  Iniciar Atención Inmediata
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL INFORME FINAL (Cercanía/Gerencia) */}
      {showInformeModal && (
        <div className="modal-overlay" style={{ zIndex: 99999 }}>
          <div className="modal-content" style={{ maxWidth: '850px', width: '95%', borderTop: '4px solid var(--color-highlight)', backgroundColor: '#FFFFFF', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={20} style={{ color: 'var(--color-highlight)' }} />
                Informe de Reunión: {reunion.nombre}
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={handleCopyInformeWhatsAppLocal}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <MessageSquare size={14} /> Copiar WhatsApp
                </button>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => setShowInformeModal(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px' }}>
              
              {/* 1. VARIABLES CUANTITATIVAS */}
              <div className="card" style={{ margin: '0 0 1.25rem 0', padding: '1.25rem', backgroundColor: '#F8FAFC' }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--color-primary)', marginTop: 0, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px', fontWeight: '700' }}>
                  1. Variables Cuantitativas
                </h4>
                {(() => {
                  const totalInscriptos = asistencias.filter(item => item.estado_convocatoria !== 'citado' && item.estado_convocatoria !== 'walk_in').length;
                  const presentesCount = asistencias.filter(a => a.asistio).length;
                  const cited = asistencias.filter(item => item.estado_convocatoria === 'citado' || item.estado_convocatoria === 'walk_in');
                  const ratioAsistencia = cited.length > 0 ? Math.round((presentesCount / cited.length) * 100) : 0;
                  const atendidosCount = cited.filter(item => timeRecords[item.vecino_id]?.horaSalida).length;

                  let totalSeconds = 0;
                  let finishedCount = 0;
                  Object.keys(timeRecords).forEach(k => {
                    const dur = timeRecords[k]?.duracion;
                    if (dur) {
                      const cleanDur = dur.replace(' min', '').trim();
                      if (cleanDur.includes(':')) {
                        const [mins, secs] = cleanDur.split(':').map(Number);
                        if (!isNaN(mins) && !isNaN(secs)) {
                          totalSeconds += mins * 60 + secs;
                          finishedCount++;
                        }
                      }
                    }
                  });
                  const averageSeconds = finishedCount > 0 ? Math.round(totalSeconds / finishedCount) : 0;
                  const avgMins = Math.floor(averageSeconds / 60);
                  const avgSecs = averageSeconds % 60;
                  const displayAvg = `${avgMins.toString().padStart(2, '0')}:${avgSecs.toString().padStart(2, '0')}`;

                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                      <div style={{ backgroundColor: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: '600', marginBottom: '4px' }}>Inscriptos Totales</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--color-primary)' }}>{totalInscriptos}</div>
                      </div>
                      <div style={{ backgroundColor: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: '600', marginBottom: '4px' }}>Asistencia</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--color-success)' }}>
                          {presentesCount} <span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: 'var(--color-text-muted)' }}>({ratioAsistencia}%)</span>
                        </div>
                      </div>
                      <div style={{ backgroundColor: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: '600', marginBottom: '4px' }}>Vecinos Citados</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--color-primary)' }}>{cited.length}</div>
                      </div>
                      <div style={{ backgroundColor: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: '600', marginBottom: '4px' }}>Vecinos Atendidos</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--color-success)' }}>{atendidosCount}</div>
                      </div>
                      <div style={{ backgroundColor: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: '600', marginBottom: '4px' }}>Tiempos de Atención (Prom)</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--color-highlight)' }}>{displayAvg}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* 2. VARIABLES CUALITATIVAS */}
              <div className="card" style={{ margin: '0 0 1.25rem 0', padding: '1.25rem' }}>
                <h4 style={{ fontSize: '1rem', color: 'var(--color-primary)', marginTop: 0, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px', fontWeight: '700' }}>
                  2. Variables Cualitativas
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: '600', display: 'block', marginBottom: '2px' }}>Inicio Real</span>
                    <strong style={{ fontSize: '0.9rem' }}>{estimatedStart || '--:--'} hs</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: '600', display: 'block', marginBottom: '2px' }}>Cierre Real</span>
                    <strong style={{ fontSize: '0.9rem' }}>{estimatedEnd || '--:--'} hs</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: '600', display: 'block', marginBottom: '2px' }}>Clima de la Reunión</span>
                    <strong style={{ fontSize: '0.9rem' }}>{CLIMA_MAP[reunion.clima]?.label || 'Bajo'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: '600', display: 'block', marginBottom: '2px' }}>Semáforo Político</span>
                    <strong style={{ fontSize: '0.9rem' }}>{SEMAFORO_MAP[reunion.semaforo_politico]?.label || 'Verde'}</strong>
                  </div>
                </div>

                <div style={{ marginBottom: '1rem', padding: '10px', backgroundColor: '#F1F5F9', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Síntesis Cualitativa</span>
                  <p style={{ margin: 0, fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                    {reunion.sintesis_cualitativa || 'No se cargó síntesis cualitativa.'}
                  </p>
                </div>
                
                <div style={{ padding: '10px', backgroundColor: '#F1F5F9', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Gestión Presente</span>
                  <p style={{ margin: 0, fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                    {reunion.gestion_presente || reunion.funcionario || 'No asignado'}
                  </p>
                </div>
              </div>

              {/* 3. MINUTAS DE LOS VECINOS CITADOS */}
              {(() => {
                const cited = asistencias.filter(item => item.estado_convocatoria === 'citado' || item.estado_convocatoria === 'walk_in');

                return (
                  <div className="card" style={{ margin: 0, padding: '1.25rem' }}>
                    <h4 style={{ fontSize: '1rem', color: 'var(--color-primary)', marginTop: 0, marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px', fontWeight: '700' }}>
                      3. Minutas de los Vecinos Citados (Uno a Uno)
                    </h4>

                    {cited.length === 0 ? (
                      <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                        No se registraron vecinos citados en esta reunión.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {cited.map((c, idx) => {
                          const record = timeRecords[c.vecino_id];
                          const status = record?.horaSalida 
                            ? `✅ Atendido (${record.duracion})` 
                            : (c.asistio ? '⏳ En espera (Presente)' : '❌ Ausente');
                          
                          return (
                            <div key={c.id} style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '10px', backgroundColor: record?.horaSalida ? '#F0FDF4' : 'inherit' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px', marginBottom: '6px' }}>
                                  <strong>{idx + 1}. {c.vecino?.nombre} {c.vecino?.apellido} ({c.vecino_id})</strong>
                                  <span className="badge" style={{ 
                                    fontSize: '0.75rem', 
                                    backgroundColor: record?.horaSalida ? 'var(--color-success)' : (c.asistio ? 'var(--color-highlight)' : '#E2E8F0'), 
                                    color: record?.horaSalida ? '#FFFFFF' : 'var(--color-primary)', 
                                    fontWeight: 'bold',
                                    padding: '2px 8px',
                                    borderRadius: '4px'
                                  }}>
                                    {status}
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-primary)' }}>
                                  <strong>Consulta/Tema:</strong> {c.tema_previo || 'Sin tema registrado.'}
                                </div>
                                {record?.horaIngreso && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                    ⏰ Horario de atención: {record.horaIngreso} hs - {record.horaSalida || '--:--'} hs
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
