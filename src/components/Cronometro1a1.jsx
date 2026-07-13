import React, { useState, useEffect } from 'react';
import { Play, Square, UserPlus, Clock, Trash2, CheckCircle2, UserCheck, RotateCcw, FileText, Download } from 'lucide-react';
import { guardarAsistencia, upsertVecino } from '../services/supabaseService';
import { supabase } from '../lib/supabaseClient';
import * as XLSX from 'xlsx';

export default function Cronometro1a1({ reunion, initialAsistencias, onUpdate, onBack }) {
  const [asistencias, setAsistencias] = useState([]);
  const [activeTab1a1, setActiveTab1a1] = useState('piscina'); // 'piscina' | 'atencion'
  const [searchQuery, setSearchQuery] = useState('');
  const [piscinaSearch, setPiscinaSearch] = useState('');

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

  // Edición inline de Citados, Bloques y Tema
  const [editingCitationDni, setEditingCitationDni] = useState(null);
  const [editingSlotDni, setEditingSlotDni] = useState(null);
  const [editingTemaDni, setEditingTemaDni] = useState(null);
  const [tempCitationVal, setTempCitationVal] = useState('');
  const [tempSlotVal, setTempSlotVal] = useState('');
  const [tempTemaVal, setTempTemaVal] = useState('');
  const [citationOverrides, setCitationOverrides] = useState({});

  // Formulario para registro "Por la ventana" (Walk-In excepcional)
  const [showVentanaModal, setShowVentanaModal] = useState(false);
  const [vetDni, setVetDni] = useState('');
  const [vetNombre, setVetNombre] = useState('');
  const [vetApellido, setVetApellido] = useState('');
  const [vetCelular, setVetCelular] = useState('');
  const [vetEmail, setVetEmail] = useState('');
  const [vetBloque, setVetBloque] = useState('17:00');

  // Cargar asistencias iniciales
  useEffect(() => {
    setAsistencias(initialAsistencias);
  }, [initialAsistencias]);

  // Cargar configuración de Uno a Uno (horarios estimados, registros de tiempo y timers activos) desde gestion_presente
  useEffect(() => {
    if (reunion.gestion_presente) {
      try {
        const config = JSON.parse(reunion.gestion_presente);
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
        console.warn('Error parsing gestion_presente:', err);
      }
    }
  }, [reunion.gestion_presente]);

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

  // Guardar configuración general en reuniones.gestion_presente
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
        .update({ gestion_presente: JSON.stringify(payload) })
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

  // Handlers para cambios de dropdowns superiores
  const handleEstimatedStartChange = async (val) => {
    setEstimatedStart(val);
    // Asegurar que fin estimado sea posterior
    let newEnd = estimatedEnd;
    if (val >= estimatedEnd) {
      const [h, m] = val.split(':').map(Number);
      const endM = (h + 2) * 60 + m; // 2 horas después
      const finalH = Math.min(22, Math.floor(endM / 60)).toString().padStart(2, '0');
      const finalM = (endM % 60).toString().padStart(2, '0');
      newEnd = `${finalH}:${finalM}`;
      setEstimatedEnd(newEnd);
    }
    await saveUnoAUnoConfig(val, newEnd, timeRecords, serializeActiveTimers(activeTimers));
  };

  const handleEstimatedEndChange = async (val) => {
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

    const horaIngresoStr = new Date().toTimeString().split(' ')[0];

    await guardarAsistencia(reunion.id, vecino.dni, true, {
      estado_convocatoria: 'walk_in',
      horario_bloque_asignado: vetBloque
    });

    const newActiveTimers = {
      ...activeTimers,
      [vecino.dni]: {
        startMs: Date.now(),
        elapsedSecs: 0,
        isRunning: true,
        horaIngreso: horaIngresoStr
      }
    };
    setActiveTimers(newActiveTimers);

    const newRecords = {
      ...timeRecords,
      [vecino.dni]: {
        horaIngreso: horaIngresoStr,
        horaSalida: null,
        duracion: null
      }
    };
    setTimeRecords(newRecords);

    await saveUnoAUnoConfig(estimatedStart, estimatedEnd, newRecords, serializeActiveTimers(newActiveTimers));

    setVetDni('');
    setVetNombre('');
    setVetApellido('');
    setVetCelular('');
    setVetEmail('');
    setShowVentanaModal(false);

    onUpdate();
    alert('¡Vecino registrado por la ventana e inicio de cronómetro!');
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

  // Filtrados
  const filteredPool = inscriptosPool.filter(item => {
    const term = piscinaSearch.toLowerCase();
    const nombreCompleto = `${item.vecino?.nombre} ${item.vecino?.apellido}`.toLowerCase();
    return (
      item.vecino_id.includes(term) ||
      nombreCompleto.includes(term)
    );
  });

  const filteredConvocados = convocadosList.filter(item => {
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

      return `
        <tr>
          <td style="font-family: monospace; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; text-align: center; color: #0c2333;">${displayCitationTime}</td>
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
            <select
              value={estimatedStart}
              onChange={(e) => handleEstimatedStartChange(e.target.value)}
              className="form-control"
              style={{ width: '100px', padding: '4px 8px', fontSize: '0.85rem' }}
            >
              {generateTimeOptions().map(opt => (
                <option key={opt} value={opt}>{opt} hs</option>
              ))}
            </select>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--color-primary)' }}>⏰ Horario Fin Estimado:</span>
            <select
              value={estimatedEnd}
              onChange={(e) => handleEstimatedEndChange(e.target.value)}
              className="form-control"
              style={{ width: '100px', padding: '4px 8px', fontSize: '0.85rem' }}
            >
              {generateTimeOptions().filter(opt => opt > estimatedStart).map(opt => (
                <option key={opt} value={opt}>{opt} hs</option>
              ))}
            </select>
          </div>
          
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            * Al cambiar estos horarios se generarán los turnos escalonados cada 5 minutos.
          </span>
        </div>

        {/* Solapas internas: Piscina de Inscriptos (1º) vs Lista de Atención (2º) */}
        <div className="tabs" style={{ marginBottom: '1.5rem', borderBottom: '2px solid var(--color-border)' }}>
          <div 
            className={`tab ${activeTab1a1 === 'piscina' ? 'active' : ''}`}
            onClick={() => setActiveTab1a1('piscina')}
            style={{ padding: '10px 16px', fontWeight: '600' }}
          >
            🌊 Piscina de Inscriptos ({inscriptosPool.length})
          </div>
          <div 
            className={`tab ${activeTab1a1 === 'atencion' ? 'active' : ''}`}
            onClick={() => setActiveTab1a1('atencion')}
            style={{ padding: '10px 16px', fontWeight: '600' }}
          >
            📋 Lista de Atención ({convocadosList.length})
          </div>
        </div>

        {/* VISTA 1: PISCINA DE INSCRIPTOS */}
        {activeTab1a1 === 'piscina' && (
          <>
            <div className="search-container" style={{ maxWidth: '400px', marginBottom: '1.5rem' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Buscar inscriptos por DNI o Nombre..."
                value={piscinaSearch}
                onChange={(e) => setPiscinaSearch(e.target.value)}
              />
            </div>

            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Vecino (Nombre y DNI)</th>
                    <th>Contacto</th>
                    <th>Bloque Horario de Atención</th>
                    <th style={{ textAlign: 'right' }}>Acciones de Citación</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPool.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                        No hay vecinos inscriptos pendientes en la piscina.
                      </td>
                    </tr>
                  ) : (
                    filteredPool.map(item => {
                      const currentBlock = selectedBlocks[item.vecino_id] || HORAS_BLOQUE[0] || '17:00 - 17:05';
                      return (
                        <tr key={item.id}>
                          <td>
                            <div style={{ fontWeight: '600' }}>
                              {item.vecino?.nombre} {item.vecino?.apellido}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                              DNI: {item.vecino_id}
                            </div>
                          </td>
                          <td style={{ fontSize: '0.85rem' }}>
                            <div>📞 {item.vecino?.celular || '-'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{item.vecino?.email || '-'}</div>
                          </td>
                          <td>
                            <select
                              value={currentBlock}
                              onChange={(e) => setSelectedBlocks(prev => ({
                                ...prev,
                                [item.vecino_id]: e.target.value
                              }))}
                              className="form-control"
                              style={{ width: '180px', padding: '4px 8px', fontSize: '0.85rem', display: 'inline-block' }}
                            >
                              {HORAS_BLOQUE.map(h => (
                                <option key={h} value={h}>{h} hs</option>
                              ))}
                              {HORAS_BLOQUE.length === 0 && (
                                <option value="17:00 - 17:05">17:00 - 17:05 hs</option>
                              )}
                            </select>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleCitarVecino(item.vecino_id)}
                              style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <UserCheck size={14} /> Citar al 1 a 1
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* VISTA 2: LISTA DE ATENCIÓN */}
        {activeTab1a1 === 'atencion' && (
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
                <button className="btn btn-secondary btn-sm" onClick={handleExportExcel} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Download size={14} /> Exportar Excel
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handlePrintPDF} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <FileText size={14} /> Imprimir PDF
                </button>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '110px' }}>Citados</th>
                    <th style={{ width: '140px' }}>Bloque Horario</th>
                    <th>Vecino (Nombre y DNI)</th>
                    <th>Tema</th>
                    <th>Hora Ingreso</th>
                    <th>Hora Salida</th>
                    <th>Duración</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConvocados.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                        No hay vecinos en la lista de atención. Ve a la solapa "Piscina de Inscriptos" para citar vecinos o agrégalos "Por la Ventana".
                      </td>
                    </tr>
                  ) : (
                    filteredConvocados.map(item => {
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
                          {/* Columna Bloque Horario */}
                          <td>
                            {editingSlotDni === item.vecino_id ? (
                              <select
                                value={tempSlotVal}
                                onChange={(e) => {
                                  if (e.target.value === 'custom') {
                                    const customVal = prompt('Ingrese el bloque horario personalizado:', tempSlotVal);
                                    if (customVal !== null) {
                                      handleSaveSlotChange(item.vecino_id, customVal);
                                    }
                                  } else {
                                    handleSaveSlotChange(item.vecino_id, e.target.value);
                                  }
                                }}
                                onBlur={() => setEditingSlotDni(null)}
                                className="form-control"
                                style={{ width: '150px', padding: '2px 4px', fontSize: '0.8rem', display: 'inline-block' }}
                                autoFocus
                              >
                                {HORAS_BLOQUE.map(h => (
                                  <option key={h} value={h}>{h} hs</option>
                                ))}
                                <option value="custom">✍️ Personalizado...</option>
                              </select>
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
                            {item.estado_convocatoria === 'walk_in' && (
                              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--color-warning)', fontWeight: 'bold', marginTop: '2px' }}>Espontáneo</span>
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
                              <span style={{ color: '#0F766E' }}>{record.duracion}</span>
                            ) : (
                              '-'
                            )}
                          </td>
                          {/* Columna Acciones */}
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                              
                              {/* Iniciar atención */}
                              {!item.asistio && !isRunning && (
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
                              {item.asistio && !isRunning && (
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
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
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
                  value={vetBloque}
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
    </div>
  );
}
