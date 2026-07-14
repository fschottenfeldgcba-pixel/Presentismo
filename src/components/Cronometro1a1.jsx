import React, { useState, useEffect } from 'react';
import { Play, Square, UserPlus, Clock, Trash2, CheckCircle2, UserCheck, RotateCcw, FileText, Download, Copy, Activity, MessageSquare } from 'lucide-react';
import { guardarAsistencia, upsertVecino } from '../services/supabaseService';
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

  // Formulario para registro "Por la ventana" (Walk-In excepcional)
  const [showVentanaModal, setShowVentanaModal] = useState(false);
  const [showInformeModal, setShowInformeModal] = useState(false);
  const [vetDni, setVetDni] = useState('');
  
  // Variables cualitativas editables locales
  const [localSintesis, setLocalSintesis] = useState(reunion.sintesis_cualitativa || '');
  const [localClima, setLocalClima] = useState(reunion.clima || 'bajo');
  const [localSemaforo, setLocalSemaforo] = useState(reunion.semaforo_politico || 'verde');

  useEffect(() => {
    setLocalSintesis(reunion.sintesis_cualitativa || '');
    setLocalClima(reunion.clima || 'bajo');
    setLocalSemaforo(reunion.semaforo_politico || 'verde');
  }, [reunion.sintesis_cualitativa, reunion.clima, reunion.semaforo_politico]);
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
      } catch (err) {
        console.warn('Error parsing Uno a Uno config:', err);
      }
    }
  }, [reunion.config_uno_a_uno, reunion.gestion_presente]);

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

  const handleSaveReunionQualitative = async (newSintesis, newClima, newSemaforo) => {
    try {
      const { error } = await supabase
        .from('reuniones')
        .update({
          sintesis_cualitativa: newSintesis,
          clima: newClima,
          semaforo_politico: newSemaforo
        })
        .eq('id', reunion.id);
      if (error) throw error;
      onUpdate();
      alert('¡Síntesis y variables cualitativas guardadas con éxito!');
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

    const selectedConvocados = convocadosList.filter(item => selectedDnis.includes(item.vecino_id));

    const textToCopy = selectedConvocados
      .map(item => `*${item.vecino?.nombre} ${item.vecino?.apellido}*\n${item.tema_previo || 'Sin tema'}`)
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

    await saveUnoAUnoConfig(estimatedStart, estimatedEnd, newRecords, serializeActiveTimers(newActiveTimers));
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

    await saveUnoAUnoConfig(estimatedStart, estimatedEnd, newRecords, serializeActiveTimers(newActiveTimers));
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
  // 2. Ya Atendidos: citados/walk_in que ya tienen hora de salida registrada
  const listAtendidos = convocadosList.filter(item => timeRecords[item.vecino_id]?.horaSalida);
  // 3. No asistieron: citados/walk_in que no asistieron (y no tienen hora de salida)
  const listNoAsistieron = convocadosList.filter(item => !item.asistio && !timeRecords[item.vecino_id]?.horaSalida);

  // Filtrados
  const filteredConvocados = listAtencion.filter(item => {
    const term = searchQuery.toLowerCase();
    const nombreCompleto = `${item.vecino?.nombre} ${item.vecino?.apellido}`.toLowerCase();
    return (
      item.vecino_id.includes(term) ||
      nombreCompleto.includes(term) ||
      (item.horario_bloque_asignado || '').toLowerCase().includes(term)
    );
  }).sort((a, b) => {
    return (a.horario_bloque_asignado || '').localeCompare(b.horario_bloque_asignado || '');
  });

  const filteredAtendidos = listAtendidos.filter(item => {
    const term = searchQuery.toLowerCase();
    const nombreCompleto = `${item.vecino?.nombre} ${item.vecino?.apellido}`.toLowerCase();
    return (
      item.vecino_id.includes(term) ||
      nombreCompleto.includes(term) ||
      (item.horario_bloque_asignado || '').toLowerCase().includes(term)
    );
  }).sort((a, b) => {
    return (a.horario_bloque_asignado || '').localeCompare(b.horario_bloque_asignado || '');
  });

  const filteredNoAsistieron = listNoAsistieron.filter(item => {
    const term = searchQuery.toLowerCase();
    const nombreCompleto = `${item.vecino?.nombre} ${item.vecino?.apellido}`.toLowerCase();
    return (
      item.vecino_id.includes(term) ||
      nombreCompleto.includes(term) ||
      (item.horario_bloque_asignado || '').toLowerCase().includes(term)
    );
  }).sort((a, b) => {
    return (a.horario_bloque_asignado || '').localeCompare(b.horario_bloque_asignado || '');
  });

  const currentDisplayList = 
    activeTab1a1 === 'atencion' 
      ? filteredConvocados 
      : (activeTab1a1 === 'atendidos' ? filteredAtendidos : filteredNoAsistieron);

  // Formatear segundos a MM:SS
  const formatSeconds = (totalSecs) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // EXPORTACIONES

  // 1. Exportar a Excel (XLSX)
  const handleExportExcel = () => {
    if (filteredConvocados.length === 0) {
      alert('No hay vecinos citados para exportar.');
      return;
    }

    const rows = filteredConvocados.map(item => {
      const slot = item.horario_bloque_asignado || 'Sin asignar';
      const citation = calculateCitationTime(slot);
      const record = timeRecords[item.vecino_id] || {};
      const timer = activeTimers[item.vecino_id];

      return {
        'Citados': citation,
        'Confirmó': item.confirmado ? 'SÍ' : 'NO',
        'Horario Turno': slot,
        'Vecino (Nombre)': `${item.vecino?.nombre} ${item.vecino?.apellido}`,
        'DNI': item.vecino_id,
        'Tema': item.tema_previo || 'No cargado',
        'Hora Ingreso': record.horaIngreso || (timer ? timer.horaIngreso : '-'),
        'Hora Salida': record.horaSalida || '-',
        'Duración': record.duracion || (timer ? `${Math.floor(timer.elapsedSecs / 60)} min` : '-')
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Lista de Atención');
    XLSX.writeFile(workbook, `Lista_de_Atencion_${reunion.nombre.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
  };

  // 2. Imprimir PDF (diseño limpio y profesional en formato horizontal)
  const handlePrintPDF = () => {
    if (filteredConvocados.length === 0) {
      alert('No hay vecinos citados para imprimir.');
      return;
    }

    const printWindow = window.open('', '_blank');
    const rows = filteredConvocados.map(item => {
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

*🏛️ Minutas de los Vecinos:*
${cited.length > 0 
  ? cited.map((c, idx) => {
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

        {/* Solapas internas de Moderación */}
        <div className="tabs" style={{ marginBottom: '1.5rem', borderBottom: '2px solid var(--color-border)' }}>
          <div 
            className={`tab ${activeTab1a1 === 'atencion' ? 'active' : ''}`}
            onClick={() => setActiveTab1a1('atencion')}
            style={{ padding: '10px 16px', fontWeight: '600' }}
          >
            📋 Cola de atención ({listAtencion.length})
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

              <div style={{ display: 'flex', gap: '8px' }}>
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
                          ? 'No hay vecinos en la lista de atención. Ve a la solapa "Piscina de Inscriptos" para citar vecinos o agrégalos "Por la Ventana".'
                          : 'No hay vecinos atendidos todavía en esta reunión.'}
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
          </>
          
          {/* Formulario de Síntesis y Variables Cualitativas */}
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

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-primary"
                onClick={() => handleSaveReunionQualitative(localSintesis, localClima, localSemaforo)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--color-success)', borderColor: 'var(--color-success)' }}
              >
                Guardar Síntesis y Variables
              </button>
            </div>
          </div>
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
                    {reunion.funcionario || 'No asignado'}
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
