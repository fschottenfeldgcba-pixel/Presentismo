import React, { useState, useRef, useEffect } from 'react';
import { Calendar, MapPin, User, FileText, Upload, AlertCircle, ArrowLeft, Check, FileSpreadsheet } from 'lucide-react';
import { TIPOS_REUNION } from '../data/mockData';
import { createReunion, upsertVecino, guardarAsistencia, bulkUpsertVecinos, bulkGuardarAsistencias, normalizeComuna, normalizeCanalDifusion, cachedQuery, getEquipoCercania, getAgentesTerritorio, DEFAULT_EQUIPO_CERCANIA, DEFAULT_AGENTES_TERRITORIO } from '../services/supabaseService';
import { supabase } from '../lib/supabaseClient';
import * as XLSX from 'xlsx';

const COMUNAS = [
  "Comuna 1",
  "Comuna 1 Norte",
  "Comuna 1 Sur",
  "Comuna 2",
  "Comuna 3",
  "Comuna 4",
  "Comuna 5",
  "Comuna 6",
  "Comuna 7",
  "Comuna 8",
  "Comuna 9",
  "Comuna 10",
  "Comuna 11",
  "Comuna 12",
  "Comuna 13",
  "Comuna 14",
  "Comuna 15"
];

const EJES = [
  "Eje Norte",
  "Eje Sur",
  "Eje Este",
  "Eje Oeste",
  "Movilidad"
];

const BARRIOS = [
  "Convocatoria Comunal",
  "Agronomía",
  "Almagro",
  "Balvanera",
  "Barracas",
  "Belgrano",
  "Boedo",
  "Caballito",
  "Chacarita",
  "Coghlan",
  "Colegiales",
  "Constitución",
  "Flores",
  "Floresta",
  "La Boca",
  "Liniers",
  "Mataderos",
  "Monte Castro",
  "Montserrat",
  "Nueva Pompeya",
  "Núñez",
  "Palermo",
  "Parque Avellaneda",
  "Parque Chacabuco",
  "Parque Chas",
  "Parque Patricios",
  "Paternal",
  "Puerto Madero",
  "Recoleta",
  "Retiro",
  "Saavedra",
  "San Cristóbal",
  "San Nicolás",
  "San Telmo",
  "Vélez Sarsfield",
  "Versalles",
  "Villa Crespo",
  "Villa del Parque",
  "Villa Devoto",
  "Villa General Mitre",
  "Villa Lugano",
  "Villa Luro",
  "Villa Ortúzar",
  "Villa Pueyrredón",
  "Villa Real",
  "Villa Riachuelo",
  "Villa Santa Rita",
  "Villa Soldati",
  "Villa Urquiza"
];

export default function ABMReuniones({ onBack, onSaveSuccess }) {
  const [nombre, setNombre] = useState('');
  const [fecha, setFecha] = useState('');
  const [lugar, setLugar] = useState('');
  const [comuna, setComuna] = useState('Comuna 1');
  const [selectedComunas, setSelectedComunas] = useState([]);
  const [showComunaDropdown, setShowComunaDropdown] = useState(false);
  const dropdownComunaRef = useRef(null);
  const calculateEndTime = (timeStr, minutesToAdd = 90) => {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length < 2) return '';
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return '';
    const totalMins = h * 60 + m + minutesToAdd;
    const newH = Math.floor(totalMins / 60) % 24;
    const newM = totalMins % 60;
    return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
  };

  const [barrioEvento, setBarrioEvento] = useState('');
  const [barrio, setBarrio] = useState('Convocatoria Comunal');
  const [funcionario, setFuncionario] = useState('');
  const [tipoReunion, setTipoReunion] = useState(TIPOS_REUNION.ENCUENTRO);
  const [arreglo1, setArreglo1] = useState('');
  const [tema, setTema] = useState('');
  const [horaInicio, setHoraInicio] = useState('17:00');
  const [horaFin, setHoraFin] = useState('18:30');

  const handleHoraInicioChange = (val) => {
    setHoraInicio(val);
    if (val) {
      setHoraFin(calculateEndTime(val, 90));
    }
  };
  
  // Estados para funcionarios y autocompletado
  const [funcionariosList, setFuncionariosList] = useState([]);
  const [selectedFuncionarios, setSelectedFuncionarios] = useState([]);
  const [showFuncDropdown, setShowFuncDropdown] = useState(false);
  const [funcSearchTerm, setFuncSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  // Nuevos campos para Planificación y Cobertura (Reunión de Mañana)
  const [funcionariosAcompanantes, setFuncionariosAcompanantes] = useState('');

  const [selectedEquipoCercania, setSelectedEquipoCercania] = useState([]);
  const [showCercaniaDropdown, setShowCercaniaDropdown] = useState(false);
  const [cercaniaSearchTerm, setCercaniaSearchTerm] = useState('');
  const [equipoCercaniaList, setEquipoCercaniaList] = useState(DEFAULT_EQUIPO_CERCANIA);
  const dropdownCercaniaRef = useRef(null);

  const [selectedIntegrantes, setSelectedIntegrantes] = useState([]);
  const [showIntegrantesDropdown, setShowIntegrantesDropdown] = useState(false);
  const [integrantesSearchTerm, setIntegrantesSearchTerm] = useState('');
  const [agentesList, setAgentesList] = useState(DEFAULT_AGENTES_TERRITORIO);
  const dropdownIntegrantesRef = useRef(null);

  const [observacionesPreparacion, setObservacionesPreparacion] = useState('');

  // Cargar funcionarios, equipo cercania y agentes territorio de Supabase
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [resFunc, resCercania, resAgentes] = await Promise.all([
          cachedQuery('funcionarios', async () => {
            return await supabase
              .from('funcionarios')
              .select('id, nombre_completo, cargo')
              .order('nombre_completo', { ascending: true });
          }),
          getEquipoCercania(),
          getAgentesTerritorio()
        ]);

        if (resFunc?.data) setFuncionariosList(resFunc.data);
        if (resCercania?.data) setEquipoCercaniaList(resCercania.data);
        if (resAgentes?.data) setAgentesList(resAgentes.data);
      } catch (err) {
        console.error('Error cargando dropdowns:', err);
      }
    };
    fetchDropdownData();
  }, []);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowFuncDropdown(false);
      }
      if (dropdownComunaRef.current && !dropdownComunaRef.current.contains(event.target)) {
        setShowComunaDropdown(false);
      }
      if (dropdownCercaniaRef.current && !dropdownCercaniaRef.current.contains(event.target)) {
        setShowCercaniaDropdown(false);
      }
      if (dropdownIntegrantesRef.current && !dropdownIntegrantesRef.current.contains(event.target)) {
        setShowIntegrantesDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Limpiar comuna si se cambia el tipo
  useEffect(() => {
    if (tipoReunion === TIPOS_REUNION.TEMATICA && !EJES.includes(comuna)) {
      setComuna(EJES[0]);
    } else if (tipoReunion !== TIPOS_REUNION.TEMATICA && !COMUNAS.includes(comuna)) {
      setComuna(COMUNAS[0]);
    }
  }, [tipoReunion, comuna]);

  // Autocompletar el nombre de la reunión
  useEffect(() => {
    const displayFecha = fecha ? fecha.split('-').reverse().join('/') : '';
    const displayTipo = tipoReunion || '';
    
    // Unir nombres de funcionarios seleccionados
    const displayFuncionarios = selectedFuncionarios.length > 0 
      ? selectedFuncionarios.map(f => f.nombre_completo).join(' / ') 
      : '';
      
    const isProcesos = tipoReunion === TIPOS_REUNION.PROCESOS_CO_CREACION || tipoReunion === TIPOS_REUNION.PROCESOS_INFORMATIVA;
    
    let displayComuna = comuna;
    if (isProcesos && selectedComunas.length > 0) {
      displayComuna = selectedComunas.join(', ');
    } else if (tipoReunion === TIPOS_REUNION.TEMATICA) {
      displayComuna = comuna;
    }

    const displayComunaBarrio = barrio && barrio !== 'Convocatoria Comunal'
      ? `${displayComuna} - ${barrio}`
      : displayComuna;

    // Si tiene tema/famoso y es Temática, Procesos Participativos o Primera Persona, lo anexamos al tipo
    const displayTipoConTema = tema && (tipoReunion === TIPOS_REUNION.TEMATICA || tipoReunion === TIPOS_REUNION.PROCESOS_CO_CREACION || tipoReunion === TIPOS_REUNION.PROCESOS_INFORMATIVA || tipoReunion === TIPOS_REUNION.PRIMERA_PERSONA)
      ? `${displayTipo} (${tema})`
      : displayTipo;

    const parts = [displayFecha, displayTipoConTema, displayFuncionarios, displayComunaBarrio].filter(Boolean);
    const autocompletedName = parts.join(' - ');
    setNombre(autocompletedName);
    setFuncionario(displayFuncionarios);
  }, [fecha, tipoReunion, selectedFuncionarios, comuna, barrio, tema]);
  
  // Estados para importación de Orión (Real + Drag and Drop)
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [importedNeighbors, setImportedNeighbors] = useState([]);
  const [importStatus, setImportStatus] = useState(''); // '', 'loading', 'success', 'error'
  const [importedCount, setImportedCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [tempDniCount, setTempDniCount] = useState(0);
  const fileInputRef = useRef(null);
  const [saving, setSaving] = useState(false);

  // Datos mock de respaldo por si el usuario prefiere simular la carga
  const orionMockInscriptos = [
    { dni: '95123456', nombre: 'Eduardo', apellido: 'Gutiérrez', celular: '1188887777', email: 'edu.guti@orion.com', barrio: 'Saavedra', comuna: 'Comuna 12' },
    { dni: '95456789', nombre: 'Patricia', apellido: 'Méndez', celular: '1199990000', email: 'patricia.m@orion.com', barrio: 'Coghlan', comuna: 'Comuna 12' },
    { dni: '95123987', nombre: 'Gustavo', apellido: 'Paz', celular: '1122223333', email: 'gustavopaz@orion.com', barrio: 'Villa Urquiza', comuna: 'Comuna 12' },
    { dni: '32123456', nombre: 'Juan Carlos', apellido: 'Gómez', celular: '1155551234', email: 'jc.gomez@mail.com', barrio: 'Palermo', comuna: 'Comuna 14' },
    { dni: '95897654', nombre: 'Estela', apellido: 'Ortiz', celular: '1144441111', email: 'estela.ortiz@orion.com', barrio: 'Villa Pueyrredón', comuna: 'Comuna 12' }
  ];

  const handleSimulateImport = () => {
    setImportStatus('loading');
    setTimeout(() => {
      setImportStatus('success');
      setFileName('Convocados_Orion_Simulado.csv');
      setImportedNeighbors(orionMockInscriptos);
      setImportedCount(orionMockInscriptos.length);
    }, 1200);
  };

  // Procesar archivo CSV o Excel
  const processFile = (file) => {
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isCsvOrTxt = file.name.endsWith('.csv') || file.name.endsWith('.txt');
    if (!isExcel && !isCsvOrTxt) {
      alert('Por favor selecciona un archivo con formato .xlsx, .xls, .csv o .txt.');
      return;
    }

    setFileName(file.name);
    setImportStatus('loading');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let rows = [];
        if (isExcel) {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        } else {
          const text = e.target.result;
          const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
          if (lines.length === 0) throw new Error('El archivo está vacío.');

          const headerLine = lines[0];
          let separator = ',';
          if (headerLine.includes(';')) separator = ';';
          else if (headerLine.includes('\t')) separator = '\t';

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let cols = [];
            let currentVal = '';
            let inQuotes = false;

            for (let c = 0; c < line.length; c++) {
              const char = line[c];
              if (char === '"' || char === "'") {
                inQuotes = !inQuotes;
              } else if (char === separator && !inQuotes) {
                cols.push(currentVal.trim());
                currentVal = '';
              } else {
                currentVal += char;
              }
            }
            cols.push(currentVal.trim());
            rows.push(cols);
          }
        }

        if (rows.length === 0) {
          throw new Error('El archivo parece estar vacío.');
        }

        // Parsear filas
        const { parsedData, dupCount, tempDniCount: tdCount } = parseRows2D(rows);
        
        if (parsedData.length === 0) {
          throw new Error('No se encontraron vecinos válidos en las filas.');
        }

        setImportedNeighbors(parsedData);
        setImportedCount(parsedData.length);
        setDuplicateCount(dupCount);
        setTempDniCount(tdCount);
        setImportStatus('success');
      } catch (err) {
        console.error(err);
        setImportStatus('error');
        alert(`Error al procesar el archivo: ${err.message || 'Verifica el formato del archivo'}`);
      }
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
  };

  // Parser robusto de filas 2D (sea de CSV o Excel)
  const parseRows2D = (rows) => {
    if (rows.length === 0) return [];
    
    // Normalizar encabezados de la fila 0
    const headers = rows[0].map(h => 
      (h || '').toString().trim().replace(/^["']|["']$/g, '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    );

    const findIndex = (keys) => {
      return headers.findIndex(h => keys.some(key => h.includes(key)));
    };

    const idxDni = findIndex(['dni', 'documento', 'identificacion', 'document', 'nro_doc', 'nro doc']);
    const idxNombre = findIndex(['nombre', 'first name', 'first_name']);
    const idxApellido = findIndex(['apellido', 'last name', 'last_name']);
    const idxCelular = findIndex(['celular', 'telefono', 'phone', 'cel']);
    const idxEmail = findIndex(['email', 'correo', 'mail']);
    const idxBarrio = findIndex(['barrio', 'neighborhood']);
    const idxComuna = findIndex(['comuna', 'zone']);
    const idxBloque = findIndex(['bloque', 'horario', 'turno', 'slot']);
    const idxComoEntero = findIndex(['como se entero', 'difusion', 'canal', 'origen']);
    const idxInvitadoPor = findIndex(['invitado por', 'invitado', 'convocador']);
    const idxTemaPrevio = findIndex(['tema', 'reclamo', 'consulta', 'observacion']);
    const idxAccesibilidad = findIndex(['accesibilidad', 'acceso', 'discapacidad']);

    const parsedData = [];
    const seenDnis = {}; // { [dni]: { nombre, apellido, count } }
    let dupCount = 0;
    let tempDniCount = 0;

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      if (!cols || cols.length < 2) continue;

      const getValue = (idx) => {
        if (idx === -1 || idx === undefined || cols[idx] === undefined || cols[idx] === null) return null;
        const val = cols[idx].toString().replace(/^["']|["']$/g, '').trim();
        return val === '' ? null : val;
      };

      const vNombre = getValue(idxNombre) || 'Vecino';
      const vApellido = getValue(idxApellido) || 'Desconocido';

      let dni = getValue(idxDni);
      let isTemp = false;

      if (!dni) {
        isTemp = true;
        const randomId = Math.floor(1000 + Math.random() * 9000);
        dni = `SIN-DNI-${i}-${randomId}`;
      }

      if (seenDnis[dni]) {
        const prev = seenDnis[dni];
        if (prev.nombre === vNombre && prev.apellido === vApellido) {
          dupCount++;
          continue;
        } else {
          isTemp = true;
          prev.count = (prev.count || 0) + 1;
          dni = `${dni}-TEMP-${prev.count}`;
        }
      } else {
        seenDnis[dni] = { nombre: vNombre, apellido: vApellido, count: 0 };
      }

      if (isTemp) {
        tempDniCount++;
      }

      parsedData.push({
        dni,
        nombre: vNombre,
        apellido: vApellido,
        celular: getValue(idxCelular),
        email: getValue(idxEmail),
        barrio: getValue(idxBarrio) || (barrio !== 'Convocatoria Comunal' ? barrio : null),
        comuna: getValue(idxComuna) || comuna || null,
        horario_bloque_asignado: getValue(idxBloque),
        como_se_entero: getValue(idxComoEntero),
        invitado_por: getValue(idxInvitadoPor),
        tema_previo: getValue(idxTemaPrevio),
        necesita_accesibilidad: getValue(idxAccesibilidad)
      });
    }

    return { parsedData, dupCount, tempDniCount };
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!nombre || !fecha) {
      alert('Por favor complete los campos obligatorios: Nombre y Fecha.');
      return;
    }

    setSaving(true);

    // Guardar la reunión
    const { data: created, error: createError } = await createReunion({
      nombre: nombre.trim(),
      fecha,
      lugar: lugar.trim() || 'No especificado',
      comuna: (tipoReunion === TIPOS_REUNION.PROCESOS_CO_CREACION || tipoReunion === TIPOS_REUNION.PROCESOS_INFORMATIVA) 
               ? (selectedComunas.length > 0 ? selectedComunas.join(', ') : comuna)
               : comuna,
      barrio_evento: barrioEvento.trim() || null,
      barrio: barrio === 'Convocatoria Comunal' ? null : barrio,
      funcionario: funcionario.trim() || null,
      tipo_reunion: tipoReunion,
      tema: (tipoReunion === TIPOS_REUNION.TEMATICA || tipoReunion === TIPOS_REUNION.PROCESOS_CO_CREACION || tipoReunion === TIPOS_REUNION.PROCESOS_INFORMATIVA || tipoReunion === TIPOS_REUNION.PRIMERA_PERSONA) ? tema.trim() : null,
      arreglo_1: arreglo1.trim() || null,
      hora_inicio_real: horaInicio ? horaInicio.trim() : '17:00',
      hora_fin_real: horaFin ? horaFin.trim() : '18:30',
      funcionario_inicio: null,
      funcionario_cierre: null,
      funcionario_interrupciones_minutos: 0,
      duracion_total_minutos: null,
      funcionarios_acompanantes: funcionariosAcompanantes.trim() ? [funcionariosAcompanantes.trim()] : null,
      responsable_cercania_id: selectedEquipoCercania.length > 0 ? selectedEquipoCercania[0].id : null,
      integrantes_asignados: selectedIntegrantes.length > 0 ? selectedIntegrantes.map(a => a.nombre_completo) : null,
      observaciones_preparacion: observacionesPreparacion.trim() || null
    });

    if (createError) {
      alert(`Error al guardar la reunión: ${createError.message || 'Verifica la conexión'}`);
      setSaving(false);
      return;
    }

    // Si se cargaron vecinos (desde archivo real o simulador)
    if (importStatus === 'success' && importedNeighbors.length > 0 && created) {
      try {
        const vecinosPayload = importedNeighbors.map(vecino => ({
          dni: vecino.dni,
          nombre: vecino.nombre,
          apellido: vecino.apellido,
          celular: vecino.celular || null,
          email: vecino.email || null,
          barrio: vecino.barrio || (barrio !== 'Convocatoria Comunal' ? barrio : null),
          comuna: normalizeComuna(vecino.comuna || comuna)
        }));

        const asistenciasPayload = importedNeighbors.map((vecino, idx) => {
          const estadoConvocatoria = tipoReunion === TIPOS_REUNION.UNO_A_UNO 
            ? 'seleccionado_uno_a_uno' 
            : (vecino.estado_convocatoria || 'inscripto');

          const block = tipoReunion === TIPOS_REUNION.UNO_A_UNO 
            ? (vecino.horario_bloque_asignado || `11:${idx * 15} - 11:${(idx * 15) + 15}`)
            : null;

          return {
            reunion_id: created.id,
            vecino_id: vecino.dni,
            asistio: false,
            estado_convocatoria: estadoConvocatoria,
            horario_bloque_asignado: block,
            como_se_entero: normalizeCanalDifusion(vecino.como_se_entero),
            invitado_por: vecino.invitado_por || null,
            tema_previo: vecino.tema_previo || null,
            necesita_accesibilidad: vecino.necesita_accesibilidad || null
          };
        });

        // Guardado masivo por lotes (chunk de 500)
        await bulkUpsertVecinos(vecinosPayload);
        await bulkGuardarAsistencias(asistenciasPayload);
      } catch (saveError) {
        console.error('Error al guardar vecinos:', saveError);
        alert('Hubo un error al guardar la lista de vecinos importada. Algunos registros podrían no haberse completado.');
      }
    }

    setSaving(false);
    alert('¡Reunión guardada exitosamente y padrón asociado!');
    onSaveSuccess();
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '1.5rem' }}>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>
          <ArrowLeft size={16} /> Volver al Tablero
        </button>
      </div>

      <div style={{ position: 'relative' }}>
        <div className="decor-tabs-container">
          <div className="decor-tab-mint"></div>
          <div className="decor-tab-yellow"></div>
        </div>

        <div className="card">
          <h2 className="section-title">Alta de Reunión y Carga de Orión</h2>
          
          <form onSubmit={handleSave}>
            <div className="grid-2">
              <div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px' }}>
                  Datos Logísticos de la Reunión
                </h3>

                <div className="grid-3" style={{ gap: '1rem' }}>
                  <div className="form-group">
                    <label htmlFor="fecha">Fecha *</label>
                    <input
                      type="date"
                      id="fecha"
                      className="form-control"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="horaInicio">Horario Previsto Inicio *</label>
                    <input
                      type="time"
                      id="horaInicio"
                      className="form-control"
                      value={horaInicio}
                      onChange={(e) => handleHoraInicioChange(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="horaFin">Horario Previsto Fin (+90m)</label>
                    <input
                      type="time"
                      id="horaFin"
                      className="form-control"
                      value={horaFin}
                      onChange={(e) => setHoraFin(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="tipo">Tipo de Evento *</label>
                    <select
                      id="tipo"
                      className="form-control"
                      value={tipoReunion}
                      onChange={(e) => setTipoReunion(e.target.value)}
                    >
                      {Object.values(TIPOS_REUNION).map(val => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {tipoReunion === TIPOS_REUNION.TEMATICA && (
                  <div className="form-group">
                    <label htmlFor="tema">Tema de la Reunión *</label>
                    <select
                      id="tema"
                      className="form-control"
                      value={tema}
                      onChange={(e) => setTema(e.target.value)}
                      required
                    >
                      <option value="">-- Seleccionar Tema --</option>
                      <option value="Seguridad">Seguridad</option>
                      <option value="Educacion">Educacion</option>
                      <option value="Salud">Salud</option>
                      <option value="Ciudad Atractiva">Ciudad Atractiva</option>
                      <option value="Movilidad">Movilidad</option>
                    </select>
                  </div>
                )}

                {(tipoReunion === TIPOS_REUNION.PROCESOS_CO_CREACION || tipoReunion === TIPOS_REUNION.PROCESOS_INFORMATIVA) && (
                  <div className="form-group">
                    <label htmlFor="tema">Tema de la Reunión (Campo Libre) *</label>
                    <input
                      type="text"
                      id="tema"
                      className="form-control"
                      placeholder="Ej: Presupuesto Participativo, Plan de Obras..."
                      value={tema}
                      onChange={(e) => setTema(e.target.value)}
                      required
                    />
                  </div>
                )}

                {tipoReunion === TIPOS_REUNION.PRIMERA_PERSONA && (
                  <div className="form-group">
                    <label htmlFor="tema">Nombre del Famoso / Invitado *</label>
                    <input
                      type="text"
                      id="tema"
                      className="form-control"
                      placeholder="Ej: Guillermo Francella, Mirtha Legrand..."
                      value={tema}
                      onChange={(e) => setTema(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="lugar">Lugar de Encuentro</label>
                  <input
                    type="text"
                    id="lugar"
                    className="form-control"
                    placeholder="Ej: Biblioteca Popular (Dirección 123)"
                    value={lugar}
                    onChange={(e) => setLugar(e.target.value)}
                  />
                </div>

                <div className="grid-2" style={{ gap: '1rem' }}>
                  <div className="form-group" ref={dropdownComunaRef}>
                    <label htmlFor="comuna">{tipoReunion === TIPOS_REUNION.TEMATICA ? 'Eje' : 'Comuna'}</label>
                    {tipoReunion === TIPOS_REUNION.PROCESOS_CO_CREACION || tipoReunion === TIPOS_REUNION.PROCESOS_INFORMATIVA ? (
                      <div style={{ position: 'relative' }}>
                        <div 
                          className="form-control" 
                          onClick={() => setShowComunaDropdown(!showComunaDropdown)}
                          style={{ 
                            minHeight: '38px', height: 'auto', cursor: 'pointer', display: 'flex', 
                            flexWrap: 'wrap', gap: '4px', alignItems: 'center', backgroundColor: '#FFFFFF',
                            padding: '4px 8px'
                          }}
                        >
                          {selectedComunas.length === 0 ? (
                            <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Seleccioná una o más comunas...</span>
                          ) : (
                            selectedComunas.map(c => (
                              <span key={c} style={{ backgroundColor: '#E0F2FE', color: '#0369A1', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center' }} onClick={(e) => { e.stopPropagation(); setSelectedComunas(prev => prev.filter(x => x !== c)); }}>
                                {c} <span style={{ marginLeft: '4px', fontWeight: 'bold' }}>×</span>
                              </span>
                            ))
                          )}
                        </div>
                        {showComunaDropdown && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#FFF', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius)', zIndex: 50, maxHeight: '180px', overflowY: 'auto', marginTop: '4px' }}>
                            {COMUNAS.map(c => (
                              <div key={c} onClick={() => {
                                if (selectedComunas.includes(c)) setSelectedComunas(prev => prev.filter(x => x !== c));
                                else setSelectedComunas(prev => [...prev, c]);
                              }} style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', backgroundColor: selectedComunas.includes(c) ? '#F0F9FF' : 'transparent', borderBottom: '1px solid #F1F5F9', fontSize: '0.85rem' }}>
                                <span>{c}</span>
                                <input type="checkbox" checked={selectedComunas.includes(c)} readOnly style={{cursor: 'pointer'}} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <select
                        id="comuna"
                        className="form-control"
                        value={comuna}
                        onChange={(e) => setComuna(e.target.value)}
                      >
                        {(tipoReunion === TIPOS_REUNION.TEMATICA ? EJES : COMUNAS).map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="barrioEvento">Barrio del Evento (Lugar Físico)</label>
                    <select
                      id="barrioEvento"
                      className="form-control"
                      value={barrioEvento}
                      onChange={(e) => setBarrioEvento(e.target.value)}
                    >
                      <option value="">-- Seleccionar Barrio Físico del Evento --</option>
                      {BARRIOS.filter(b => b !== 'Convocatoria Comunal').map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="barrio">Barrio Visitado / Convocatoria</label>
                    <select
                      id="barrio"
                      className="form-control"
                      value={barrio}
                      onChange={(e) => setBarrio(e.target.value)}
                    >
                      {BARRIOS.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Campo desplegable con Selección Múltiple de Funcionarios */}
                <div className="form-group" style={{ position: 'relative' }} ref={dropdownRef}>
                  <label>Funcionario/s a Cargo (Selección Múltiple)</label>
                  <div 
                    className="form-control" 
                    onClick={() => setShowFuncDropdown(!showFuncDropdown)}
                    style={{ 
                      minHeight: '38px', 
                      height: 'auto', 
                      cursor: 'pointer', 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: '4px', 
                      alignItems: 'center',
                      padding: '4px 8px',
                      backgroundColor: '#FFFFFF'
                    }}
                  >
                    {selectedFuncionarios.length === 0 ? (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Seleccioná uno o más funcionarios...</span>
                    ) : (
                      selectedFuncionarios.map(f => (
                        <span 
                          key={f.id} 
                          style={{ 
                            backgroundColor: '#E0F2FE', 
                            color: '#0369A1', 
                            padding: '2px 8px', 
                            borderRadius: '12px', 
                            fontSize: '0.75rem', 
                            fontWeight: '600', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px' 
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFuncionarios(prev => prev.filter(x => x.id !== f.id));
                          }}
                        >
                          {f.nombre_completo}
                          <span style={{ cursor: 'pointer', marginLeft: '2px', fontWeight: 'bold' }}>×</span>
                        </span>
                      ))
                    )}
                  </div>
                  
                  {showFuncDropdown && (
                    <div 
                      style={{ 
                        position: 'absolute', 
                        top: '100%', 
                        left: 0, 
                        right: 0, 
                        backgroundColor: '#FFFFFF', 
                        border: '1px solid var(--color-border)', 
                        borderRadius: 'var(--border-radius)', 
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)', 
                        zIndex: 50, 
                        maxHeight: '220px', 
                        overflowY: 'auto',
                        marginTop: '4px',
                        padding: '4px'
                      }}
                    >
                      <div style={{ padding: '4px', borderBottom: '1px solid var(--color-border)', backgroundColor: '#F8FAFC' }}>
                        <input
                          type="text"
                          placeholder="🔍 Buscar funcionario por nombre..."
                          value={funcSearchTerm}
                          onChange={(e) => setFuncSearchTerm(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            fontSize: '0.85rem',
                            border: '1px solid var(--color-border)',
                            borderRadius: '4px',
                            outline: 'none'
                          }}
                        />
                      </div>
                      {funcionariosList.filter(f => f.nombre_completo?.toLowerCase().includes(funcSearchTerm.toLowerCase())).length === 0 ? (
                        <div style={{ padding: '10px', fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                          No se encontraron funcionarios
                        </div>
                      ) : (
                        funcionariosList
                          .filter(f => f.nombre_completo?.toLowerCase().includes(funcSearchTerm.toLowerCase()))
                          .map(f => {
                            const isSelected = selectedFuncionarios.some(x => x.id === f.id);
                            return (
                              <div 
                                key={f.id} 
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedFuncionarios(prev => prev.filter(x => x.id !== f.id));
                                  } else {
                                    setSelectedFuncionarios(prev => [...prev, f]);
                                  }
                                }}
                                style={{ 
                                  padding: '8px 12px', 
                                  cursor: 'pointer', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'space-between',
                                  backgroundColor: isSelected ? '#F0F9FF' : 'transparent',
                                  borderBottom: '1px solid #F1F5F9',
                                  fontSize: '0.85rem'
                                }}
                              >
                                <div>
                                  <strong>{f.nombre_completo}</strong>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: '6px' }}>
                                    ({f.cargo})
                                  </span>
                                </div>
                                <input 
                                  type="checkbox" 
                                  checked={isSelected} 
                                  readOnly 
                                  style={{ cursor: 'pointer' }}
                                />
                              </div>
                            );
                          })
                      )}
                    </div>
                  )}
                </div>

                {/* --- SECCIÓN COBERTURA Y PLANIFICACIÓN (REUNIÓN DE MAÑANA) --- */}
                <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem', padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <h4 style={{ margin: '0 0 14px 0', fontSize: '0.95rem', color: 'var(--color-primary)', fontWeight: '700', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>
                    📋 Planificación y Cobertura (Reunión de Mañana / Ficha Técnica)
                  </h4>

                  {/* 1. Funcionarios Acompañantes (Texto Libre) */}
                  <div className="form-group">
                    <label style={{ fontWeight: '600' }}>Funcionarios Acompañantes</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Ingresá o pegá funcionarios acompañantes de cualquier jerarquía..."
                      value={funcionariosAcompanantes}
                      onChange={(e) => setFuncionariosAcompanantes(e.target.value)}
                    />
                  </div>

                  {/* 2. Responsable / Equipo de Cercanía (Multi-select) */}
                  <div className="form-group" style={{ position: 'relative' }} ref={dropdownCercaniaRef}>
                    <label style={{ fontWeight: '600' }}>Responsable del Equipo (Cercanía)</label>
                    <div 
                      onClick={() => setShowCercaniaDropdown(!showCercaniaDropdown)}
                      style={{ 
                        border: '1px solid var(--color-border)', 
                        borderRadius: 'var(--border-radius)', 
                        minHeight: '38px', 
                        cursor: 'pointer',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        alignItems: 'center',
                        padding: '4px 8px',
                        backgroundColor: '#FFFFFF'
                      }}
                    >
                      {selectedEquipoCercania.length === 0 ? (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Seleccioná integrantes de Cercanía...</span>
                      ) : (
                        selectedEquipoCercania.map(r => (
                          <span 
                            key={r.id} 
                            style={{ 
                              backgroundColor: '#EFF6FF', 
                              color: '#1D4ED8', 
                              border: '1px solid #BFDBFE',
                              padding: '2px 8px', 
                              borderRadius: '12px', 
                              fontSize: '0.75rem', 
                              fontWeight: '600', 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '4px' 
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEquipoCercania(prev => prev.filter(x => x.id !== r.id));
                            }}
                          >
                            {r.nombre_completo} {r.telefono ? `(${r.telefono})` : ''}
                            <span style={{ cursor: 'pointer', marginLeft: '2px', fontWeight: 'bold' }}>×</span>
                          </span>
                        ))
                      )}
                    </div>
                    
                    {showCercaniaDropdown && (
                      <div 
                        style={{ 
                          position: 'absolute', 
                          top: '100%', 
                          left: 0, 
                          right: 0, 
                          backgroundColor: '#FFFFFF', 
                          border: '1px solid var(--color-border)', 
                          borderRadius: 'var(--border-radius)', 
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)', 
                          zIndex: 50, 
                          maxHeight: '200px', 
                          overflowY: 'auto',
                          marginTop: '4px',
                          padding: '4px'
                        }}
                      >
                        <div style={{ padding: '4px', borderBottom: '1px solid var(--color-border)', backgroundColor: '#F8FAFC' }}>
                          <input
                            type="text"
                            placeholder="🔍 Buscar integrante de Cercanía..."
                            value={cercaniaSearchTerm}
                            onChange={(e) => setCercaniaSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem', border: '1px solid var(--color-border)', borderRadius: '4px', outline: 'none' }}
                          />
                        </div>
                        {equipoCercaniaList.filter(r => r.nombre_completo?.toLowerCase().includes(cercaniaSearchTerm.toLowerCase())).map(r => {
                          const isSelected = selectedEquipoCercania.some(x => x.id === r.id);
                          return (
                            <div 
                              key={r.id} 
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedEquipoCercania(prev => prev.filter(x => x.id !== r.id));
                                } else {
                                  setSelectedEquipoCercania(prev => [...prev, r]);
                                }
                              }}
                              style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isSelected ? '#F0F9FF' : 'transparent', borderBottom: '1px solid #F1F5F9', fontSize: '0.85rem' }}
                            >
                              <span>{r.nombre_completo} {r.telefono ? <small style={{ color: '#64748B' }}>({r.telefono})</small> : ''}</span>
                              <input type="checkbox" checked={isSelected} readOnly />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 3. Integrantes Asignados (Multi-select / Buscador) */}
                  <div className="form-group" style={{ position: 'relative' }} ref={dropdownIntegrantesRef}>
                    <label style={{ fontWeight: '600' }}>Integrantes Asignados (Agentes de Territorio)</label>
                    <div 
                      onClick={() => setShowIntegrantesDropdown(!showIntegrantesDropdown)}
                      style={{ 
                        border: '1px solid var(--color-border)', 
                        borderRadius: 'var(--border-radius)', 
                        minHeight: '38px', 
                        cursor: 'pointer',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        alignItems: 'center',
                        padding: '4px 8px',
                        backgroundColor: '#FFFFFF'
                      }}
                    >
                      {selectedIntegrantes.length === 0 ? (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Seleccioná integrantes asignados...</span>
                      ) : (
                        selectedIntegrantes.map(a => (
                          <span 
                            key={a.id} 
                            style={{ 
                              backgroundColor: '#FEF3C7', 
                              color: '#92400E', 
                              border: '1px solid #FDE68A',
                              padding: '2px 8px', 
                              borderRadius: '12px', 
                              fontSize: '0.75rem', 
                              fontWeight: '600', 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '4px' 
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedIntegrantes(prev => prev.filter(x => x.id !== a.id));
                            }}
                          >
                            {a.nombre_completo}
                            <span style={{ cursor: 'pointer', marginLeft: '2px', fontWeight: 'bold' }}>×</span>
                          </span>
                        ))
                      )}
                    </div>
                    
                    {showIntegrantesDropdown && (
                      <div 
                        style={{ 
                          position: 'absolute', 
                          top: '100%', 
                          left: 0, 
                          right: 0, 
                          backgroundColor: '#FFFFFF', 
                          border: '1px solid var(--color-border)', 
                          borderRadius: 'var(--border-radius)', 
                          boxShadow: '0 4px 6px rgba(0,0,0,0.1)', 
                          zIndex: 50, 
                          maxHeight: '200px', 
                          overflowY: 'auto',
                          marginTop: '4px',
                          padding: '4px'
                        }}
                      >
                        <div style={{ padding: '4px', borderBottom: '1px solid var(--color-border)', backgroundColor: '#F8FAFC' }}>
                          <input
                            type="text"
                            placeholder="🔍 Buscar integrante de territorio..."
                            value={integrantesSearchTerm}
                            onChange={(e) => setIntegrantesSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem', border: '1px solid var(--color-border)', borderRadius: '4px', outline: 'none' }}
                          />
                        </div>
                        {agentesList.filter(a => a.nombre_completo?.toLowerCase().includes(integrantesSearchTerm.toLowerCase())).map(a => {
                          const isSelected = selectedIntegrantes.some(x => x.id === a.id);
                          return (
                            <div 
                              key={a.id} 
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedIntegrantes(prev => prev.filter(x => x.id !== a.id));
                                } else {
                                  setSelectedIntegrantes(prev => [...prev, a]);
                                }
                              }}
                              style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isSelected ? '#FEF3C7' : 'transparent', borderBottom: '1px solid #F1F5F9', fontSize: '0.85rem' }}
                            >
                              <span>{a.nombre_completo} {a.equipo ? <small style={{ color: '#64748B' }}>({a.equipo})</small> : ''}</span>
                              <input type="checkbox" checked={isSelected} readOnly />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 4. Estado / Observaciones de Preparación */}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontWeight: '600' }}>📅 Cierre de Inscripción / Observaciones de Preparación</label>
                    <textarea
                      className="form-control"
                      rows="2"
                      placeholder="Ej: Formulario de inscripción cierra el Jueves 12/08 a las 12:00 hs. Anotaciones previas..."
                      value={observacionesPreparacion}
                      onChange={(e) => setObservacionesPreparacion(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="observaciones">Observaciones / Arreglo Histórico</label>
                  <textarea
                    id="observaciones"
                    className="form-control"
                    rows="2"
                    placeholder="Notas internas y agenda histórica de coordinación..."
                    value={arreglo1}
                    onChange={(e) => setArreglo1(e.target.value)}
                  />
                </div>

                {/* Nombre de la reunión abajo de todo, autocompletado */}
                <div className="form-group">
                  <label htmlFor="nombre" style={{ fontWeight: '600', color: 'var(--color-primary)' }}>Nombre de la Reunión (Autocompletado) *</label>
                  <input
                    type="text"
                    id="nombre"
                    className="form-control"
                    placeholder="Se autocompleta con los campos de arriba..."
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    required
                    style={{ backgroundColor: '#F8FAFC', fontWeight: '600', color: 'var(--color-primary)' }}
                  />
                </div>
              </div>

              {/* Sección de Carga Orión (Drag and Drop Real) */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px' }}>
                  Integración con Sistema Orión
                </h3>

                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  style={{
                    border: '2px dashed var(--color-border)',
                    borderRadius: 'var(--border-radius)',
                    padding: '2rem 1.5rem',
                    textAlign: 'center',
                    backgroundColor: isDragging ? '#ECFDF5' : '#F8FAFC',
                    borderColor: isDragging ? 'var(--color-highlight)' : 'var(--color-border)',
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.2s ease-in-out',
                    cursor: 'pointer'
                  }}
                  onClick={triggerFileSelect}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".csv,.txt,.xls,.xlsx"
                    style={{ display: 'none' }}
                  />

                  {importStatus === 'success' ? (
                    <FileSpreadsheet size={40} style={{ color: 'var(--color-success)' }} />
                  ) : (
                    <Upload size={40} style={{ color: isDragging ? 'var(--color-highlight)' : 'var(--color-text-muted)' }} />
                  )}

                  <div>
                    <h4 style={{ fontSize: '1rem', color: 'var(--color-primary)' }}>
                      {importStatus === 'success' ? 'Planilla Lista' : 'Importar Planilla de Orión'}
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '4px', maxWidth: '300px', margin: '4px auto 0 auto' }}>
                      {importStatus === 'success' 
                        ? `Archivo: ${fileName}`
                        : 'Arrastrá el archivo Excel o CSV de inscriptos directamente acá o hacé clic para seleccionarlo.'
                      }
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={triggerFileSelect}
                    >
                      Seleccionar Archivo
                    </button>
                  </div>

                  {importStatus === 'loading' && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                      Analizando columnas, mapeando campos y depurando duplicados de DNI...
                    </div>
                  )}

                  {importStatus === 'success' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: '#DEF7EC',
                        color: '#03543F',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        fontWeight: '600'
                      }}>
                        <Check size={16} /> ¡Cargados {importedCount} vecinos únicos del archivo!
                      </div>
                      {duplicateCount > 0 && (
                        <div style={{
                          fontSize: '0.75rem',
                          color: '#B91C1C',
                          backgroundColor: '#FEF2F2',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid #FCA5A5',
                          fontWeight: '500'
                        }}>
                          ⚠️ Se omitieron {duplicateCount} filas duplicadas idénticas.
                        </div>
                      )}
                      {tempDniCount > 0 && (
                        <div style={{
                          fontSize: '0.75rem',
                          color: '#B45309',
                          backgroundColor: '#FFFBEB',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid #FCD34D',
                          fontWeight: '500'
                        }}>
                          ℹ️ Se generaron {tempDniCount} DNI temporales (ausentes o con DNI compartido del agente).
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginTop: '1.5rem',
                  fontSize: '0.8rem',
                  color: '#1E40AF',
                  display: 'flex',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Columnas Mapeadas:</strong> Buscamos de forma flexible columnas de DNI/Documento, Nombre, Apellido, Celular, Email, Barrio, Comuna, y Bloque Horario para armar la agenda de presentismo.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '2rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onBack}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-highlight" disabled={importStatus === 'loading' || saving}>
                {saving ? 'Guardando reunión...' : 'Guardar Reunión y Vincular Vecinos'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
