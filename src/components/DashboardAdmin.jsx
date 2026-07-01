import React, { useState, useEffect } from 'react';
import { BarChart3, Plus, Download, Calendar, MapPin, Users, Award, ChevronRight, FileSpreadsheet, Settings, Search, Edit3, Save, Activity, Mic, MessageSquare, Check, TrendingUp, AlertTriangle, Trash2 } from 'lucide-react';
import { getReuniones, getAsistentesPorReunion, getOradores, upsertVecino, normalizeComuna, normalizeCanalDifusion, guardarAsistencia, registrarOrador } from '../services/supabaseService';
import { supabase } from '../lib/supabaseClient';
import * as XLSX from 'xlsx';
import EstadisticasFuncionario from './EstadisticasFuncionario';

const COMUNAS = Array.from({ length: 15 }, (_, i) => `Comuna ${i + 1}`);

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

export default function DashboardAdmin({ user, onSelectReunion, onManageReunion, onCreateMeetingClick }) {
  const [activeDashboardTab, setActiveDashboardTab] = useState('reuniones'); // 'reuniones' | 'padron'
  const [reuniones, setReuniones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estadísticas del Tablero
  const [stats, setStats] = useState({
    totalReuniones: 0,
    totalInscriptos: 0,
    totalAsistentes: 0,
    promedioAsistencia: 0,
    walkIns: 0
  });

  // Estados de Búsqueda y Edición de Padrón Central
  const [padronSearch, setPadronSearch] = useState('');
  const [searchingPadron, setSearchingPadron] = useState(false);
  const [padronResults, setPadronResults] = useState([]);
  const [selectedVecino, setSelectedVecino] = useState(null);

  // Formulario del Vecino en Padrón Central
  const [vDni, setVDni] = useState('');
  const [vNombre, setVNombre] = useState('');
  const [vApellido, setVApellido] = useState('');
  const [vCelular, setVCelular] = useState('');
  const [vEmail, setVEmail] = useState('');
  const [vBarrio, setVBarrio] = useState('Convocatoria Comunal');
  const [vComuna, setVComuna] = useState('Comuna 1');
  const [savingVecino, setSavingVecino] = useState(false);
  const [radiografia, setRadiografia] = useState([]);
  const [loadingRadiografia, setLoadingRadiografia] = useState(false);

  // Estados para Modal de Inscriptos (Requisito 6)
  const [showInscriptosModal, setShowInscriptosModal] = useState(false);
  const [selectedReunionInscriptos, setSelectedReunionInscriptos] = useState(null);
  const [inscriptosList, setInscriptosList] = useState([]);
  const [loadingInscriptos, setLoadingInscriptos] = useState(false);
  const [inscriptosSearch, setInscriptosSearch] = useState('');
  
  // Estados para importación masiva en modal (Requisito 7)
  const [showImportArea, setShowImportArea] = useState(false);
  const [modalFileName, setModalFileName] = useState('');
  const [modalImportedNeighbors, setModalImportedNeighbors] = useState([]);
  const [modalImportStatus, setModalImportStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'saving'

  // Estados para Acreditación Masiva de Asistencia y Oradores (Paso 6 - Refactorizado en 2 Pasos)
  const [processedMeetings, setProcessedMeetings] = useState([]);
  const [showProcessedMeetings, setShowProcessedMeetings] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState('');

  // Paso 1: Asistentes
  const [massAsistFileName, setMassAsistFileName] = useState('');
  const [massAsistStatus, setMassAsistStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'saving'
  const [massAsistNeighbors, setMassAsistNeighbors] = useState([]);
  const [massAsistProgress, setMassAsistProgress] = useState(0);
  const [massAsistStats, setMassAsistStats] = useState({ present: 0 });

  // Paso 2: Oradores (WhatsApp Parser con previsualización)
  const [massOradoresStatus, setMassOradoresStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'saving'
  const [massOradoresProgress, setMassOradoresProgress] = useState(0);
  const [massOradoresStats, setMassOradoresStats] = useState({ oradores: 0, omittedCount: 0 });
  const [massOradoresOmittedList, setMassOradoresOmittedList] = useState([]);
  const [massOradoresText, setMassOradoresText] = useState('');
  const [parsedOradoresPreview, setParsedOradoresPreview] = useState([]);
  const [meetingAsistentes, setMeetingAsistentes] = useState([]);

  const isCercaniaOrGerencia = user && (user.rol === 'gerencia' || user.rol === 'cercania');

  const loadAllData = async () => {
    setLoading(true);
    const { data: list, error: errReuniones } = await getReuniones();
    if (errReuniones) {
      console.error('Error al cargar reuniones:', errReuniones);
      setLoading(false);
      return;
    }

    let totalInsc = 0;
    let totalAsis = 0;
    let walkInCount = 0;
    const reunionesConAsistencias = [];

    if (list && list.length > 0) {
      try {
        // Consultar las asistencias de todas las reuniones y oradores en paralelo
        const asistenciasPromises = list.map(r => getAsistentesPorReunion(r.id));
        const oradoresPromises = list.map(r => getOradores(r.id));

        const [resultsAsis, resultsOrad] = await Promise.all([
          Promise.all(asistenciasPromises),
          Promise.all(oradoresPromises)
        ]);

        list.forEach((r, idx) => {
          const { data: asistencias } = resultsAsis[idx];
          const { data: oradores } = resultsOrad[idx];
          const listAsis = asistencias || [];
          const listOrad = oradores || [];
          totalInsc += listAsis.length;
          
          let presentes = 0;
          listAsis.forEach(a => {
            if (a.asistio) {
              presentes++;
              totalAsis++;
              if (a.estado_convocatoria === 'walk_in') {
                walkInCount++;
              }
            }
          });

          // Contar oradores con estado 'hablo' (efectivos) y 'en_espera' (anotados)
          const oradoresEfectivos = listOrad.filter(o => o.estado === 'hablo').length;
          const oradoresEnEspera = listOrad.filter(o => o.estado === 'en_espera').length;

          reunionesConAsistencias.push({
            ...r,
            totalInscriptos: listAsis.length,
            totalPresentes: presentes,
            totalOradoresEfectivos: oradoresEfectivos,
            totalOradoresEnEspera: oradoresEnEspera
          });
        });
      } catch (err) {
        console.error('Error procesando asistencias de reuniones:', err);
      }
    }

    setReuniones(reunionesConAsistencias.length > 0 ? reunionesConAsistencias : (list || []));

    const promedio = totalInsc > 0 ? Math.round((totalAsis / totalInsc) * 100) : 0;

    setStats({
      totalReuniones: list ? list.length : 0,
      totalInscriptos: totalInsc,
      totalAsistentes: totalAsis,
      promedioAsistencia: promedio,
      walkIns: walkInCount
    });
    setLoading(false);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Exportar lista de presentismo a un archivo CSV enriquecido
  const handleExportCSV = async (reunion) => {
    const { data, error } = await getAsistentesPorReunion(reunion.id);
    if (error || !data || data.length === 0) {
      alert('No hay registros de inscriptos ni asistencia para esta reunión.');
      return;
    }

    // Consultar oradores de la reunión
    const { data: oradoresData } = await getOradores(reunion.id);

    // Encabezados del CSV basados en las columnas requeridas
    const headers = [
      'Reunion ID', 'Reunion Nombre', 'Tipo Reunion', 'DNI Vecino', 'Nombre', 'Apellido', 
      'Celular', 'Email', 'Barrio', 'Comuna', 'Asistio', 'Tipo Convocatoria', 
      'Pregunta Puerta', 'Como se Entero', 'Invitado Por',
      'Orador', 'Estado Orador', 'Tema Efectivo'
    ];

    const rows = data.map(item => {
      const orad = oradoresData?.find(o => o.vecino_id === item.vecino_id);
      
      const isOrador = orad ? 'SI' : 'NO';
      const estadoOrador = orad 
        ? (orad.estado === 'hablo' ? 'Efectivo' : orad.estado === 'en_espera' ? 'Anotado' : 'Se bajó') 
        : '-';
      const temaEfectivo = orad 
        ? (orad.tema_efectivo || orad.tema_original || '')
        : '';

      return [
        reunion.id,
        `"${reunion.nombre.replace(/"/g, '""')}"`,
        `"${reunion.tipo_reunion}"`,
        item.vecino_id,
        `"${item.vecino?.nombre?.replace(/"/g, '""') || ''}"`,
        `"${item.vecino?.apellido?.replace(/"/g, '""') || ''}"`,
        item.vecino?.celular || '',
        item.vecino?.email || '',
        item.vecino?.barrio || '',
        item.vecino?.comuna || '',
        item.asistio ? 'SI' : 'NO',
        item.estado_convocatoria,
        item.pregunta_puerta ? `"${item.pregunta_puerta.replace(/"/g, '""')}"` : '',
        `"${item.como_se_entero?.replace(/"/g, '""') || ''}"`,
        `"${item.invitado_por?.replace(/"/g, '""') || ''}"`,
        isOrador,
        estadoOrador,
        `"${temaEfectivo.replace(/"/g, '""')}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Presentismo_${reunion.nombre.replace(/[^a-z0-9]/gi, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Búsqueda en el Padrón Central
  const handleSearchPadron = async (e) => {
    e.preventDefault();
    if (!padronSearch.trim()) {
      alert('Ingresá un DNI o Apellido para buscar en el padrón.');
      return;
    }

    setSearchingPadron(true);
    setSelectedVecino(null);
    try {
      const q = padronSearch.trim();
      const { data, error } = await supabase
        .from('vecinos')
        .select('*')
        .or(`dni.eq.${q},apellido.ilike.%${q}%,celular.ilike.%${q}%`)
        .order('apellido', { ascending: true });

      if (error) throw error;
      setPadronResults(data || []);
    } catch (err) {
      console.error(err);
      alert('Error de conexión al consultar el padrón.');
    } finally {
      setSearchingPadron(false);
    }
  };

  // Cargar Radiografía (timeline completo del vecino)
  const loadRadiografia = async (dni) => {
    setLoadingRadiografia(true);
    setRadiografia([]);
    try {
      const { data: asistencias, error: errAsist } = await supabase
        .from('inscripciones_asistencias')
        .select('*, reunion:reuniones(*)')
        .eq('vecino_id', dni);

      if (errAsist) throw errAsist;

      const { data: oradores, error: errOradores } = await supabase
        .from('oradores')
        .select('*, reunion:reuniones(*)')
        .eq('vecino_id', dni);

      if (errOradores) throw errOradores;

      const { data: preguntas, error: errPreguntas } = await supabase
        .from('preguntas_qr')
        .select('*, reunion:reuniones(*)')
        .eq('vecino_id', dni);

      if (errPreguntas) throw errPreguntas;

      const timelineMap = {};

      asistencias?.forEach(asis => {
        if (!asis.reunion) return;
        timelineMap[asis.reunion_id] = {
          reunion: asis.reunion,
          asistio: asis.asistio,
          estado_convocatoria: asis.estado_convocatoria,
          como_se_entero: asis.como_se_entero,
          pregunta_puerta: asis.pregunta_puerta,
          hora_marcado: asis.hora_marcado,
          orador: null,
          pregunta_qr: null
        };
      });

      oradores?.forEach(orad => {
        if (!orad.reunion) return;
        if (!timelineMap[orad.reunion_id]) {
          timelineMap[orad.reunion_id] = {
            reunion: orad.reunion,
            asistio: false,
            estado_convocatoria: '-',
            como_se_entero: null,
            pregunta_puerta: null,
            hora_marcado: null,
            orador: null,
            pregunta_qr: null
          };
        }
        timelineMap[orad.reunion_id].orador = {
          estado: orad.estado,
          tema_original: orad.tema_original,
          tema_efectivo: orad.tema_efectivo
        };
      });

      preguntas?.forEach(preg => {
        if (!preg.reunion) return;
        if (!timelineMap[preg.reunion_id]) {
          timelineMap[preg.reunion_id] = {
            reunion: preg.reunion,
            asistio: false,
            estado_convocatoria: '-',
            como_se_entero: null,
            pregunta_puerta: null,
            hora_marcado: null,
            orador: null,
            pregunta_qr: null
          };
        }
        timelineMap[preg.reunion_id].pregunta_qr = preg.pregunta;
      });

      const sortedTimeline = Object.values(timelineMap).sort((a, b) => {
        return new Date(b.reunion.fecha) - new Date(a.reunion.fecha);
      });

      setRadiografia(sortedTimeline);
    } catch (err) {
      console.error('Error al cargar la radiografía:', err);
    } finally {
      setLoadingRadiografia(false);
    }
  };

  // Cargar perfil del vecino seleccionado en el Editor
  const handleSelectVecino = (vecino) => {
    setSelectedVecino(vecino);
    setVDni(vecino.dni);
    setVNombre(vecino.nombre || '');
    setVApellido(vecino.apellido || '');
    setVCelular(vecino.celular || '');
    setVEmail(vecino.email || '');
    setVBarrio(vecino.barrio || 'Convocatoria Comunal');
    setVComuna(vecino.comuna || 'Comuna 1');
    loadRadiografia(vecino.dni);
  };

  // Abrir Modal de Inscriptos y cargar datos
  const handleOpenInscriptos = async (reunion) => {
    setSelectedReunionInscriptos(reunion);
    setShowInscriptosModal(true);
    setLoadingInscriptos(true);
    setInscriptosList([]);
    setInscriptosSearch('');
    
    const { data, error } = await getAsistentesPorReunion(reunion.id);
    setLoadingInscriptos(false);
    if (!error && data) {
      setInscriptosList(data);
    } else {
      console.error(error);
      alert('Error al cargar la lista de inscriptos.');
    }
  };

  // Procesar archivo CSV o Excel subido dentro del modal
  const handleModalFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isCsvOrTxt = file.name.endsWith('.csv') || file.name.endsWith('.txt');
    if (!isExcel && !isCsvOrTxt) {
      alert('Por favor selecciona un archivo con formato .xlsx, .xls, .csv o .txt.');
      return;
    }

    setModalFileName(file.name);
    setModalImportStatus('loading');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        let rows = [];
        if (isExcel) {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        } else {
          const text = evt.target.result;
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

        // Mapeo flexible
        const headers = rows[0].map(h => 
          (h || '').toString().trim().replace(/^["']|["']$/g, '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        );

        const findIndex = (keys) => headers.findIndex(h => keys.some(key => h.includes(key)));

        const idxDni = findIndex(['dni', 'documento', 'identificacion', 'document', 'nro_doc', 'nro doc']);
        const idxNombre = findIndex(['nombre', 'first name', 'first_name']);
        const idxApellido = findIndex(['apellido', 'last name', 'last_name']);
        const idxCelular = findIndex(['celular', 'telefono', 'phone', 'cel']);
        const idxEmail = findIndex(['email', 'correo', 'mail']);
        const idxBarrio = findIndex(['barrio', 'neighborhood']);
        const idxComuna = findIndex(['comuna', 'zone']);
        const idxComoEntero = findIndex(['como se entero', 'difusion', 'canal', 'origen']);
        const idxInvitadoPor = findIndex(['invitado por', 'invitado', 'convocador']);
        const idxTemaPrevio = findIndex(['tema', 'reclamo', 'consulta', 'observacion']);
        const idxAccesibilidad = findIndex(['accesibilidad', 'acceso', 'discapacidad']);

        const parsedData = [];

        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i];
          if (!cols || cols.length < 2) continue;

          const getValue = (idx) => {
            if (idx === -1 || idx === undefined || cols[idx] === undefined || cols[idx] === null) return null;
            const val = cols[idx].toString().replace(/^["']|["']$/g, '').trim();
            return val === '' ? null : val;
          };

          const dni = getValue(idxDni);
          if (!dni) continue;

          parsedData.push({
            dni,
            nombre: getValue(idxNombre) || 'Vecino',
            apellido: getValue(idxApellido) || 'Desconocido',
            celular: getValue(idxCelular),
            email: getValue(idxEmail),
            barrio: getValue(idxBarrio) || (selectedReunionInscriptos.barrio !== 'Convocatoria Comunal' ? selectedReunionInscriptos.barrio : null),
            comuna: getValue(idxComuna) || selectedReunionInscriptos.comuna || null,
            como_se_entero: getValue(idxComoEntero),
            invitado_por: getValue(idxInvitadoPor),
            tema_previo: getValue(idxTemaPrevio),
            necesita_accesibilidad: getValue(idxAccesibilidad)
          });
        }

        if (parsedData.length === 0) {
          throw new Error('No se encontraron vecinos válidos en las filas.');
        }

        setModalImportedNeighbors(parsedData);
        setModalImportStatus('success');
      } catch (err) {
        console.error(err);
        setModalImportStatus('error');
        alert(`Error al procesar el archivo: ${err.message}`);
      }
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
  };

  // Confirmar y guardar la importación desde el modal
  const handleConfirmModalImport = async () => {
    if (modalImportedNeighbors.length === 0 || !selectedReunionInscriptos) return;
    setModalImportStatus('saving');

    try {
      for (let idx = 0; idx < modalImportedNeighbors.length; idx++) {
        const vecino = modalImportedNeighbors[idx];

        // 1. Alta en padrón central
        await upsertVecino({
          dni: vecino.dni,
          nombre: vecino.nombre,
          apellido: vecino.apellido,
          celular: vecino.celular || null,
          email: vecino.email || null,
          barrio: vecino.barrio,
          comuna: normalizeComuna(vecino.comuna || selectedReunionInscriptos.comuna)
        });

        // 2. Alta en inscripción
        await guardarAsistencia(selectedReunionInscriptos.id, vecino.dni, false, {
          estado_convocatoria: 'inscripto',
          como_se_entero: normalizeCanalDifusion(vecino.como_se_entero),
          invitado_por: vecino.invitado_por || null,
          tema_previo: vecino.tema_previo || null,
          necesita_accesibilidad: vecino.necesita_accesibilidad || null
        });
      }

      alert(`¡${modalImportedNeighbors.length} vecinos importados e inscriptos con éxito!`);
      
      // Recargar lista de inscriptos en el modal
      const { data, error } = await getAsistentesPorReunion(selectedReunionInscriptos.id);
      if (!error && data) {
        setInscriptosList(data);
      }
      
      // Recargar tablero completo para actualizar métricas de la grilla
      loadAllData();

      // Resetear estados del importador
      setShowImportArea(false);
      setModalImportedNeighbors([]);
      setModalImportStatus('idle');
      setModalFileName('');
    } catch (saveError) {
      console.error(saveError);
      alert('Ocurrió un error al guardar los inscriptos.');
      setModalImportStatus('success');
    }
  };

  // Filtrar reuniones disponibles para la Acreditación Masiva
  const availableMeetingsForMassAcreditacion = reuniones.filter(r => {
    if (showProcessedMeetings) return true;
    return !processedMeetings.includes(r.id);
  });

  // Auto-seleccionar la primera reunión disponible al cargar o cambiar filtro
  useEffect(() => {
    if (availableMeetingsForMassAcreditacion.length > 0) {
      const currentExists = availableMeetingsForMassAcreditacion.some(r => r.id === selectedMeetingId);
      if (!currentExists) {
        setSelectedMeetingId(availableMeetingsForMassAcreditacion[0].id);
      }
    } else {
      setSelectedMeetingId('');
    }
  }, [reuniones, processedMeetings, showProcessedMeetings]);

  // Normalización de Teléfonos de Argentina: extraer los últimos 10 u 8 dígitos
  const cleanAndGetPhoneSuffix = (phone) => {
    if (!phone) return '';
    const digits = phone.toString().replace(/\D/g, '');
    if (digits.length >= 10) {
      return digits.slice(-10); // Últimos 10 dígitos (ej: 1155554444)
    }
    if (digits.length >= 8) {
      return digits.slice(-8); // Últimos 8 dígitos (ej: 55554444)
    }
    return digits;
  };

  // Procesar archivo CSV o Excel subido para Acreditación Masiva - Paso 1: Asistentes
  const handleMassAsistFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isCsvOrTxt = file.name.endsWith('.csv') || file.name.endsWith('.txt');
    if (!isExcel && !isCsvOrTxt) {
      alert('Por favor selecciona un archivo con formato .xlsx, .xls, .csv o .txt.');
      return;
    }

    setMassAsistFileName(file.name);
    setMassAsistStatus('loading');
    setMassAsistProgress(0);
    setMassAsistStats({ present: 0 });

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        let rows = [];
        if (isExcel) {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        } else {
          const text = evt.target.result;
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

        // Normalizar encabezados eliminando tildes y caracteres extra
        const normalizeHeader = (h) => {
          return (h || '').toString().trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s()/\-_]/g, "");
        };

        const headers = rows[0].map(normalizeHeader);
        const findIndex = (keys) => headers.findIndex(h => keys.some(key => h.includes(key)));

        const idxDni = findIndex(['dni', 'documento', 'identificacion', 'nro_doc', 'nro doc']);
        const idxNombre = findIndex(['nombre', 'first name', 'first_name']);
        const idxApellido = findIndex(['apellido', 'last name', 'last_name']);
        const idxMail = findIndex(['mail', 'email', 'correo']);
        const idxTelefono = findIndex(['telefono', 'phone', 'celular', 'cel']);
        const idxComuna = findIndex(['comuna', 'zone']);

        if (idxDni === -1) {
          throw new Error('No se pudo encontrar la columna "Dni" en los encabezados.');
        }

        const parsedData = [];

        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i];
          if (!cols || cols.length < 2) continue;

          const getValue = (idx) => {
            if (idx === -1 || idx === undefined || cols[idx] === undefined || cols[idx] === null) return null;
            const val = cols[idx].toString().replace(/^["']|["']$/g, '').trim();
            return val === '' ? null : val;
          };

          const rawDni = getValue(idxDni);
          
          // Regla de Exclusión de Documento: Si Dni es vacío, nulo o no numérico, se saltea la fila
          if (!rawDni || isNaN(rawDni.toString().replace(/\D/g, '')) || rawDni.toString().trim() === '') {
            console.warn(`[Paso 1] Fila ${i} salteada: DNI no numérico o vacío (${rawDni})`);
            continue;
          }

          const dni = rawDni.toString().replace(/\D/g, '');
          if (!dni) {
            console.warn(`[Paso 1] Fila ${i} salteada: DNI vacío tras limpieza`);
            continue;
          }

          parsedData.push({
            dni,
            nombre: getValue(idxNombre) || 'Vecino',
            apellido: getValue(idxApellido) || 'Desconocido',
            mail: getValue(idxMail),
            telefono: getValue(idxTelefono),
            comuna: getValue(idxComuna)
          });
        }

        if (parsedData.length === 0) {
          throw new Error('No se encontraron vecinos con DNI válidos en las filas.');
        }

        setMassAsistNeighbors(parsedData);
        setMassAsistStatus('success');
      } catch (err) {
        console.error(err);
        setMassAsistStatus('error');
        alert(`Error al procesar el archivo de asistentes: ${err.message}`);
      }
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
  };

  // Guardar en caliente los asistentes de la reunión seleccionada (Paso 1)
  const handleConfirmMassAsist = async () => {
    if (massAsistNeighbors.length === 0 || !selectedMeetingId) return;
    setMassAsistStatus('saving');

    const total = massAsistNeighbors.length;
    let registeredPresent = 0;

    for (let idx = 0; idx < total; idx++) {
      const row = massAsistNeighbors[idx];
      try {
        // Optimización de Red: buscar coincidencia en una sola petición a Supabase
        let orParts = [`dni.eq.${row.dni}`];
        
        if (row.telefono) {
          const cleanedPhone = row.telefono.toString().replace(/\D/g, '');
          if (cleanedPhone) {
            orParts.push(`celular.eq.${cleanedPhone}`);
            const suffix = cleanAndGetPhoneSuffix(row.telefono);
            if (suffix) {
              orParts.push(`celular.like.%${suffix}`);
            }
          }
        }
        
        if (row.mail) {
          const cleanMail = row.mail.toString().trim();
          if (cleanMail) {
            orParts.push(`email.eq.${cleanMail}`);
          }
        }
        
        if (row.nombre && row.apellido) {
          const cleanNombre = row.nombre.toString().trim().replace(/,/g, '');
          const cleanApellido = row.apellido.toString().trim().replace(/,/g, '');
          if (cleanNombre && cleanApellido) {
            orParts.push(`and(apellido.ilike.${cleanApellido},nombre.ilike.${cleanNombre})`);
          }
        }

        const { data: matchedVecinos, error: errMatch } = await supabase
          .from('vecinos')
          .select('*')
          .or(orParts.join(','));

        if (errMatch) throw errMatch;

        let finalDni = row.dni;

        if (matchedVecinos && matchedVecinos.length > 0) {
          // Adoptar DNI real del vecino encontrado
          const existingVecino = matchedVecinos[0];
          finalDni = existingVecino.dni;

          // Actualizar sus datos en caliente
          await upsertVecino({
            dni: finalDni,
            nombre: row.nombre || existingVecino.nombre,
            apellido: row.apellido || existingVecino.apellido,
            celular: row.telefono || existingVecino.celular,
            email: row.mail || existingVecino.email,
            comuna: normalizeComuna(row.comuna || existingVecino.comuna)
          });
        } else {
          // Vecino nuevo absoluto
          await upsertVecino({
            dni: finalDni,
            nombre: row.nombre,
            apellido: row.apellido,
            celular: row.telefono || null,
            email: row.mail || null,
            comuna: normalizeComuna(row.comuna)
          });
        }

        // Registrar asistencia (Presente)
        await guardarAsistencia(selectedMeetingId, finalDni, true, {
          estado_convocatoria: 'walk_in',
          como_se_entero: 'Otro'
        });
        registeredPresent++;
      } catch (rowError) {
        console.error(`[Paso 1] Error procesando asistente en index ${idx} (DNI ${row.dni}):`, rowError);
      }
      setMassAsistProgress(Math.round(((idx + 1) / total) * 100));
      setMassAsistStats({ present: registeredPresent });
    }

    alert(`¡Carga de Asistentes completada!\n- Vecinos presentes acreditados: ${registeredPresent}`);

    // Descartar reunión del desplegable
    setProcessedMeetings(prev => [...prev, selectedMeetingId]);

    // Seleccionar automáticamente la siguiente reunión
    const nextAvailable = availableMeetingsForMassAcreditacion.find(r => r.id !== selectedMeetingId);
    if (nextAvailable) {
      setSelectedMeetingId(nextAvailable.id);
    } else {
      setSelectedMeetingId('');
    }

    // Refrescar estadísticas generales y grilla
    await loadAllData();

    // Resetear estados del Paso 1
    setMassAsistNeighbors([]);
    setMassAsistStatus('idle');
    setMassAsistFileName('');
    setMassAsistProgress(0);
  };

  // Normalización de texto para matching (quitar tildes y caracteres especiales)
  const normalizeString = (str) => {
    if (!str) return '';
    return str.toString().toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, '')
      .trim();
  };

  // Detección automática de estado inicial y limpieza de texto para oradores
  const detectOradorStateAndMinuta = (minutaText) => {
    const cleanText = (minutaText || '').trim();
    if (cleanText === '') {
      return { estado: 'en_espera', minuta: '' };
    }

    const normalized = cleanText.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    // Palabras gatillo para configurarlo como 'se_bajo'
    const triggersSeBajo = ['no esta', 'se bajo', 'no asistio', 'no hablo'];
    const shouldSeBajo = triggersSeBajo.some(trigger => normalized.includes(trigger));

    if (shouldSeBajo) {
      return { estado: 'se_bajo', minuta: '' };
    }

    return { estado: 'hablo', minuta: cleanText };
  };

  // Analizar volcado de WhatsApp en textarea (Paso 2)
  const handleAnalyzeOradores = async () => {
    if (!massOradoresText.trim()) {
      alert('Por favor pegá el texto de oradores de WhatsApp.');
      return;
    }
    if (!selectedMeetingId) {
      alert('Por favor seleccioná una reunión activa primero.');
      return;
    }

    setMassOradoresStatus('loading');
    setParsedOradoresPreview([]);

    try {
      // 1. Obtener la lista de asistentes reales de Supabase de la reunión seleccionada
      const { data: asistentes, error } = await getAsistentesPorReunion(selectedMeetingId);
      if (error) throw error;

      // Filtrar asistentes válidos
      const validAsistentes = (asistentes || []).filter(a => a.vecio || a.vecino);
      setMeetingAsistentes(validAsistentes);

      // Helper para extraer los últimos 8 dígitos del teléfono
      const get8DigitSuffix = (phone) => {
        if (!phone) return '';
        const digits = phone.toString().replace(/\D/g, '');
        return digits.slice(-8);
      };

      // 2. Parsear el texto por líneas/párrafos
      const lines = massOradoresText.split('\n');
      const parsedOradores = [];
      let currentOrador = null;

      // Buscar patrón de teléfono (entre 8 y 11 dígitos)
      const phonePattern = /(?:\D|^)(\d[\d\s-]{6,14}\d)(?:\D|$)/;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') continue;

        const match = line.match(phonePattern);
        if (match) {
          if (currentOrador) {
            parsedOradores.push(currentOrador);
          }

          const rawPhone = match[1];
          const phoneDigits = rawPhone.replace(/\D/g, '');

          // Extraer nombre y minuta
          const phoneIndex = line.indexOf(rawPhone);
          let namePart = line.substring(0, phoneIndex).trim();
          namePart = namePart.replace(/[-\s–—:]+$/, '').trim();

          let minutaPart = line.substring(phoneIndex + rawPhone.length).trim();
          minutaPart = minutaPart.replace(/^[:\s–—-]+/, '').trim();

          currentOrador = {
            nombreRaw: namePart,
            telefono: phoneDigits,
            minutaLines: minutaPart ? [minutaPart] : []
          };
        } else {
          if (currentOrador) {
            currentOrador.minutaLines.push(line);
          }
        }
      }
      if (currentOrador) {
        parsedOradores.push(currentOrador);
      }

      // 3. Procesar y emparejar cada uno contra asistentes
      const previewList = parsedOradores.map((orador, idx) => {
        const fullMinuta = orador.minutaLines.join('\n').trim();
        const { estado, minuta } = detectOradorStateAndMinuta(fullMinuta);

        let matchedAsistente = null;
        const oradorPhone8 = get8DigitSuffix(orador.telefono);

        // A. Buscar por coincidencia de sufijo de 8 dígitos
        if (oradorPhone8) {
          matchedAsistente = validAsistentes.find(a => {
            const asistPhone8 = get8DigitSuffix(a.vecino?.celular);
            return asistPhone8 && asistPhone8 === oradorPhone8;
          });
        }

        // B. Si no, buscar por coincidencia de Nombre y Apellido
        if (!matchedAsistente) {
          const normOradorName = normalizeString(orador.nombreRaw);
          matchedAsistente = validAsistentes.find(a => {
            if (!a.vecino) return false;
            const fullName1 = normalizeString(a.vecino.nombre + ' ' + a.vecino.apellido);
            const fullName2 = normalizeString(a.vecino.apellido + ' ' + a.vecino.nombre);
            return normOradorName === fullName1 || normOradorName === fullName2;
          });
        }

        return {
          key: idx,
          nombreRaw: orador.nombreRaw,
          telefono: orador.telefono,
          minuta: minuta,
          estado: estado,
          vecinoDni: matchedAsistente ? matchedAsistente.vecino.dni : '',
          vecinoNombreCompleto: matchedAsistente ? `${matchedAsistente.vecino.nombre} ${matchedAsistente.vecino.apellido}` : null,
          warning: !matchedAsistente
        };
      });

      if (previewList.length === 0) {
        throw new Error('No se detectaron bloques de oradores en el formato adecuado. Verificá que cada bloque incluya un número telefónico.');
      }

      setParsedOradoresPreview(previewList);
      setMassOradoresStatus('success');
    } catch (err) {
      console.error(err);
      setMassOradoresStatus('error');
      alert(`Error al analizar oradores: ${err.message}`);
    }
  };

  // Modificar celda de previsualización en Paso 2 (ej: edición manual de minuta o cambio de estado)
  const handleUpdatePreviewRow = (key, field, value) => {
    setParsedOradoresPreview(prev => prev.map(row => {
      if (row.key === key) {
        const updated = { ...row, [field]: value };
        if (field === 'vecinoDni') {
          if (value === 'CREATE_TEMP') {
            const tempDni = `TEMP_${row.telefono || Math.floor(Math.random() * 100000000)}`;
            updated.vecinoDni = tempDni;
            updated.vecinoNombreCompleto = `${row.nombreRaw} (Temporal)`;
            updated.warning = false;
            updated.createAsTemp = true;
          } else {
            const matched = meetingAsistentes.find(a => a.vecino?.dni === value);
            if (matched) {
              updated.vecinoNombreCompleto = `${matched.vecino.nombre} ${matched.vecino.apellido}`;
              updated.warning = false;
              updated.createAsTemp = false;
            } else {
              updated.vecinoNombreCompleto = null;
              updated.warning = true;
              updated.createAsTemp = false;
            }
          }
        }
        return updated;
      }
      return row;
    }));
  };

  // Eliminar fila de previsualización en Paso 2
  const handleDeletePreviewRow = (key) => {
    setParsedOradoresPreview(prev => prev.filter(row => row.key !== key));
  };

  // Confirmar y guardar la importación final de oradores en Supabase (Paso 2)
  const handleConfirmMassOradores = async () => {
    if (parsedOradoresPreview.length === 0 || !selectedMeetingId) return;

    const hasUnidentified = parsedOradoresPreview.some(row => row.warning);
    if (hasUnidentified) {
      if (!confirm('Hay algunos vecinos que no fueron identificados. ¿Querés continuar y guardar solo los oradores vinculados? (Los no vinculados se omitirán)')) {
        return;
      }
    }

    setMassOradoresStatus('saving');

    const total = parsedOradoresPreview.length;
    let registeredSpeakers = 0;
    let omitted = 0;
    const omittedList = [];

    for (let idx = 0; idx < total; idx++) {
      const row = parsedOradoresPreview[idx];
      if (row.warning || !row.vecinoDni) {
        omitted++;
        omittedList.push(`Fila ${idx + 1}: ${row.nombreRaw} (No identificado o desvinculado)`);
        continue;
      }

      try {
        // Si es vecino temporal sin DNI, creamos su ficha en el padrón y registramos asistencia primero
        if (row.createAsTemp) {
          const cleanName = row.nombreRaw.replace(/,/g, '').trim();
          const parts = cleanName.split(/\s+/);
          const nombre = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || 'Vecino';
          const apellido = parts.length > 1 ? parts[parts.length - 1] : 'Temporal';

          await upsertVecino({
            dni: row.vecinoDni,
            nombre: nombre,
            apellido: apellido,
            celular: row.telefono || null,
            comuna: 'Comuna 1' // Default comuna
          });

          // Registrar asistencia presencial (indispensable para vincular oradores)
          await guardarAsistencia(selectedMeetingId, row.vecinoDni, true, {
            estado_convocatoria: 'walk_in',
            como_se_entero: 'Otro'
          });
        }

        // 1. Verificar si ya existe en la cola de oradores de esta reunión
        const { data: existingOrador, error: errGet } = await supabase
          .from('oradores')
          .select('id, tema_original')
          .eq('reunion_id', selectedMeetingId)
          .eq('vecino_id', row.vecinoDni)
          .maybeSingle();

        if (errGet) throw errGet;

        if (existingOrador) {
          // 2. Si ya existe, actualizamos su minuta y estado, preservando su tema_original
          const { error: errUpdate } = await supabase
            .from('oradores')
            .update({
              tema_efectivo: row.minuta || null,
              estado: row.estado
            })
            .eq('id', existingOrador.id);

          if (errUpdate) throw errUpdate;
        } else {
          // 3. Si no existe, creamos un registro de orador nuevo
          await registrarOrador({
            reunion_id: selectedMeetingId,
            vecino_id: row.vecinoDni,
            tema_original: '', // Queda vacío para evitar duplicación visual en el historial
            tema_efectivo: row.minuta || null,
            estado: row.estado,
            orden: registeredSpeakers + 1
          });
        }
        registeredSpeakers++;
      } catch (rowError) {
        console.error(`[Paso 2] Error al registrar orador DNI ${row.vecinoDni}:`, rowError);
        omitted++;
        omittedList.push(`Fila ${idx + 1}: ${row.nombreRaw} (Error de base de datos)`);
      }

      setMassOradoresProgress(Math.round(((idx + 1) / total) * 100));
      setMassOradoresStats({ oradores: registeredSpeakers, omittedCount: omitted });
    }

    setMassOradoresOmittedList(omittedList);
    setMassOradoresStatus('idle');
    setParsedOradoresPreview([]);
    setMassOradoresText('');
    alert(`¡Carga de Oradores completada!\n- Oradores guardados con éxito: ${registeredSpeakers}\n- Omitidos o con error: ${omitted}`);

    await loadAllData();
  };



  // Guardar vecino de forma global en Padrón (Gerencia/Cercanía)
  const handleSaveVecinoPadron = async (e) => {
    e.preventDefault();
    if (!vNombre.trim() || !vApellido.trim()) {
      alert('Nombre y Apellido son campos obligatorios.');
      return;
    }

    setSavingVecino(true);
    try {
      const { error } = await upsertVecino({
        dni: vDni,
        nombre: vNombre.trim(),
        apellido: vApellido.trim(),
        celular: vCelular.trim() || null,
        email: vEmail.trim() || null,
        comuna: vComuna,
        barrio: vBarrio === 'Convocatoria Comunal' ? null : vBarrio
      });

      if (error) throw error;

      alert('¡Perfil del ciudadano actualizado permanentemente en el padrón!');
      
      // Actualizar listado local
      setPadronResults(prev => prev.map(v => v.dni === vDni ? {
        ...v,
        nombre: vNombre.trim(),
        apellido: vApellido.trim(),
        celular: vCelular.trim() || null,
        email: vEmail.trim() || null,
        comuna: vComuna,
        barrio: vBarrio === 'Convocatoria Comunal' ? null : vBarrio
      } : v));

    } catch (err) {
      console.error(err);
      alert(`Error al guardar datos del vecino: ${err.message}`);
    } finally {
      setSavingVecino(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '1rem' }}>
        <div className="spinner"></div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Cargando datos del servidor...</p>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Barra de Navegación de Tablero (Requisito 4) */}
      <div className="tabs" style={{ marginBottom: '2rem' }}>
        <div 
          className={`tab ${activeDashboardTab === 'reuniones' ? 'active' : ''}`}
          onClick={() => setActiveDashboardTab('reuniones')}
        >
          <Calendar size={16} /> Reuniones del Mes
        </div>
        <div 
          className={`tab ${activeDashboardTab === 'padron' ? 'active' : ''}`}
          onClick={() => setActiveDashboardTab('padron')}
        >
          <Users size={16} /> Padrón Central de Vecinos
        </div>
        <div 
          className={`tab ${activeDashboardTab === 'acreditacion_masiva' ? 'active' : ''}`}
          onClick={() => setActiveDashboardTab('acreditacion_masiva')}
        >
          <FileSpreadsheet size={16} /> Cierre Masivo de Asistencia
        </div>
        <div 
          className={`tab ${activeDashboardTab === 'estadisticas_funcionario' ? 'active' : ''}`}
          onClick={() => setActiveDashboardTab('estadisticas_funcionario')}
        >
          <TrendingUp size={16} /> Estadísticas por Funcionario
        </div>
      </div>

      {activeDashboardTab === 'reuniones' ? (
        /* VISTA DE REUNIONES */
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 className="section-title" style={{ marginBottom: '4px' }}>
                {isCercaniaOrGerencia ? 'Tablero de Control Zonal' : 'Reuniones de Vecinos'}
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>
                {isCercaniaOrGerencia 
                  ? 'Indicadores generales de convocatoria y asistencia en reuniones de vecinos.'
                  : 'Seleccioná la reunión asignada para iniciar el control de asistencia en territorio.'}
              </p>
            </div>
            {isCercaniaOrGerencia && (
              <button className="btn btn-highlight" onClick={onCreateMeetingClick}>
                <Plus size={18} /> Nueva Reunión
              </button>
            )}
          </div>

          {/* Cartas de Estadísticas */}
          {isCercaniaOrGerencia && (
            <div className="grid-4" style={{ marginBottom: '2.5rem' }}>
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: 0 }}>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#F1F5F9', color: 'var(--color-primary)' }}>
                  <Calendar size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: '600' }}>REUNIONES</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--color-primary)' }}>{stats.totalReuniones}</div>
                </div>
              </div>

              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: 0 }}>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#E1EFFE', color: '#1E429F' }}>
                  <Users size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: '600' }}>TOTAL CONVOCADOS</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--color-primary)' }}>{stats.totalInscriptos}</div>
                </div>
              </div>

              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: 0 }}>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#DEF7EC', color: '#03543F' }}>
                  <Award size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: '600' }}>ASISTENCIA EFECTIVA</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--color-primary)' }}>{stats.totalAsistentes}</div>
                </div>
              </div>

              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: 0 }}>
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#FEF3C7', color: '#92400E' }}>
                  <BarChart3 size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: '600' }}>PROMEDIO ASISTENCIA</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--color-primary)' }}>{stats.promedioAsistencia}%</div>
                </div>
              </div>
            </div>
          )}

          {/* Grilla de Reuniones con filtro libre */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={20} style={{ color: 'var(--color-highlight)' }} />
                Reuniones del Mes
              </h3>
              <input
                type="text"
                className="form-control"
                placeholder="Filtrar por funcionario, fecha, tipo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ maxWidth: '300px', fontSize: '0.85rem', padding: '6px 12px' }}
              />
            </div>

            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Reunión / Funcionario</th>
                    <th>Fecha y Lugar</th>
                    <th>Tipo de Evento</th>
                    <th>Comuna</th>
                    <th style={{ textAlign: 'center' }}>Asistencia</th>
                    <th style={{ textAlign: 'center' }}>Oradores</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {reuniones
                    .filter(r => {
                      const term = searchTerm.toLowerCase();
                      return (
                        (r.nombre && r.nombre.toLowerCase().includes(term)) ||
                        (r.funcionario && r.funcionario.toLowerCase().includes(term)) ||
                        (r.fecha && r.fecha.toLowerCase().includes(term)) ||
                        (r.tipo_reunion && r.tipo_reunion.toLowerCase().includes(term))
                      );
                    })
                    .map(r => {
                      const totalInscriptos = r.totalInscriptos || 0;
                      const presentes = r.totalPresentes || 0;
                      const ratio = totalInscriptos > 0 ? Math.round((presentes / totalInscriptos) * 100) : 0;
                      const oradoresEfectivos = r.totalOradoresEfectivos || 0;
                      const oradoresEnEspera = r.totalOradoresEnEspera || 0;
                      const isMicMeeting = r.tipo_reunion === 'Encuentro con Vecinos' || r.tipo_reunion === 'Cafe con Vecinos';
                      
                      return (
                        <tr key={r.id}>
                          <td>
                            <div style={{ fontWeight: '600', color: 'var(--color-primary)' }}>{r.nombre}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                              Cargo: {r.funcionario || 'No asignado'}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontSize: '0.9rem' }}>{r.fecha}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <MapPin size={12} /> {r.lugar}
                            </div>
                          </td>
                          <td>
                            <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                              {r.tipo_reunion}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: '500' }}>{r.comuna}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ fontWeight: '600' }}>{presentes} / {totalInscriptos}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>({ratio}%)</div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {isMicMeeting ? (
                              <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--color-primary)' }}>
                                <span style={{ color: 'var(--color-success)' }}>{oradoresEfectivos} ef.</span>
                                {oradoresEnEspera > 0 && <span style={{ color: 'var(--color-text-muted)', marginLeft: '4px' }}>/ {oradoresEnEspera} esp.</span>}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--color-text-muted)' }}>-</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '8px' }}>
                              <button 
                                className="btn btn-secondary btn-sm" 
                                onClick={() => handleOpenInscriptos(r)}
                                title="Ver lista completa de inscriptos"
                                style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                <Users size={14} style={{ color: 'var(--color-highlight)' }} /> Inscriptos
                              </button>
                              {isCercaniaOrGerencia && (
                                <>
                                  <button 
                                    className="btn btn-secondary btn-sm" 
                                    onClick={() => handleExportCSV(r)}
                                    title="Exportar planilla de asistencia para encuestas"
                                    style={{ padding: '6px 10px' }}
                                  >
                                    <FileSpreadsheet size={14} style={{ color: '#0F766E' }} /> CSV
                                  </button>
                                  <button 
                                    className="btn btn-secondary btn-sm" 
                                    onClick={() => onManageReunion(r)}
                                    title="Administrar reunión y cargar minuta"
                                    style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    <Settings size={14} style={{ color: 'var(--color-primary)' }} /> Administrar
                                  </button>
                                </>
                              )}
                              <button 
                                className="btn btn-primary btn-sm" 
                                onClick={() => onSelectReunion(r)}
                              >
                                Tomar Asistencia <ChevronRight size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeDashboardTab === 'padron' ? (
        /* VISTA DE PADRÓN CENTRAL DE VECINOS */
        <div style={{ position: 'relative' }}>
          <div className="decor-tabs-container">
            <div className="decor-tab-mint"></div>
            <div className="decor-tab-yellow"></div>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            {/* Buscador de Padrón y Resultados */}
            <div className="card" style={{ flex: '1 1 350px', margin: 0 }}>
              <h3 style={{ fontSize: '1.2rem', color: 'var(--color-primary)', marginBottom: '1rem' }}>
                Buscador del Padrón Histórico
              </h3>
              
              <form onSubmit={handleSearchPadron} style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem' }}>
                <div style={{ position: 'relative', flexGrow: 1 }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Buscar por DNI o Apellido..."
                    value={padronSearch}
                    onChange={(e) => setPadronSearch(e.target.value)}
                    style={{ paddingLeft: '2.5rem' }}
                  />
                  <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={searchingPadron}>
                  {searchingPadron ? 'Buscando...' : 'Buscar'}
                </button>
              </form>

              {searchingPadron ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <div className="spinner"></div>
                  <p style={{ marginTop: '0.75rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Consultando padrón global...</p>
                </div>
              ) : padronResults.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  No se han realizado búsquedas o no hay coincidencias.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                  {padronResults.map(v => (
                    <div 
                      key={v.dni}
                      onClick={() => handleSelectVecino(v)}
                      style={{
                        padding: '10px 14px',
                        border: selectedVecino?.dni === v.dni ? '1px solid var(--color-highlight)' : '1px solid var(--color-border)',
                        borderRadius: '8px',
                        backgroundColor: selectedVecino?.dni === v.dni ? '#F0FDF4' : '#FFFFFF',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div>
                        <strong style={{ color: 'var(--color-primary)', display: 'block' }}>{v.nombre} {v.apellido}</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>DNI: {v.dni}</span>
                      </div>
                      <ChevronRight size={16} style={{ color: selectedVecino?.dni === v.dni ? 'var(--color-highlight)' : '#CBD5E1' }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ficha del Vecino / Editor General y Radiografia (Requisito 5) */}
            <div style={{ flex: '2 1 450px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="card" style={{ margin: 0 }}>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--color-primary)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Edit3 size={18} style={{ color: 'var(--color-highlight)' }} />
                  Auditoría y Edición Central de Ficha
                </h3>

                {!selectedVecino ? (
                  <div style={{ padding: '4rem 2rem', textAlign: 'center', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px dashed var(--color-border)' }}>
                    <Users size={36} style={{ color: '#CBD5E1', marginBottom: '0.75rem' }} />
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: 0 }}>
                      Seleccioná un vecino de los resultados de búsqueda para editar sus datos de forma global y permanente en la base de datos central.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSaveVecinoPadron}>
                    <div className="form-group">
                      <label>DNI / Clave del Ciudadano (No Modificable)</label>
                      <input
                        type="text"
                        className="form-control"
                        value={vDni}
                        disabled
                        style={{ backgroundColor: '#F1F5F9' }}
                      />
                    </div>

                    <div className="grid-2" style={{ gap: '1rem' }}>
                      <div className="form-group">
                        <label htmlFor="v-nombre">Nombre *</label>
                        <input
                          type="text"
                          id="v-nombre"
                          className="form-control"
                          value={vNombre}
                          onChange={(e) => setVNombre(e.target.value)}
                          required
                          disabled={!isCercaniaOrGerencia}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="v-apellido">Apellido *</label>
                        <input
                          type="text"
                          id="v-apellido"
                          className="form-control"
                          value={vApellido}
                          onChange={(e) => setVApellido(e.target.value)}
                          required
                          disabled={!isCercaniaOrGerencia}
                        />
                      </div>
                    </div>

                    <div className="grid-2" style={{ gap: '1rem' }}>
                      <div className="form-group">
                        <label htmlFor="v-celular">Celular de Contacto</label>
                        <input
                          type="text"
                          id="v-celular"
                          className="form-control"
                          value={vCelular}
                          onChange={(e) => setVCelular(e.target.value)}
                          disabled={!isCercaniaOrGerencia}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="v-email">Correo Electrónico</label>
                        <input
                          type="email"
                          id="v-email"
                          className="form-control"
                          value={vEmail}
                          onChange={(e) => setVEmail(e.target.value)}
                          disabled={!isCercaniaOrGerencia}
                        />
                      </div>
                    </div>

                    <div className="grid-2" style={{ gap: '1rem' }}>
                      <div className="form-group">
                        <label htmlFor="v-comuna">Comuna Electoral</label>
                        <select
                          id="v-comuna"
                          className="form-control"
                          value={vComuna}
                          onChange={(e) => setVComuna(e.target.value)}
                          disabled={!isCercaniaOrGerencia}
                        >
                          {COMUNAS.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="v-barrio">Barrio Electoral</label>
                        <select
                          id="v-barrio"
                          className="form-control"
                          value={vBarrio}
                          onChange={(e) => setVBarrio(e.target.value)}
                          disabled={!isCercaniaOrGerencia}
                        >
                          {BARRIOS.map(b => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {isCercaniaOrGerencia ? (
                      <button 
                        type="submit" 
                        className="btn btn-primary" 
                        style={{ width: '100%', marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        disabled={savingVecino}
                      >
                        {savingVecino ? 'Guardando...' : <><Save size={18} /> Guardar Cambios en Padrón</>}
                      </button>
                    ) : (
                      <div style={{ backgroundColor: '#FFFDF5', border: '1px solid #FCD116', padding: '10px', borderRadius: '8px', marginTop: '1.5rem', fontSize: '0.8rem', color: '#92400E' }}>
                        🚫 Tu rol de usuario no cuenta con permisos para modificar la base de datos central de vecinos. Contactá a Gerencia o Cercanía.
                      </div>
                    )}
                  </form>
                )}
              </div>

              {/* TARJETA DE RADIOGRAFIA DEL VECINO */}
              {selectedVecino && (
                <div className="card" style={{ margin: 0, borderTop: '4px solid var(--color-mint)', backgroundColor: '#FFFFFF' }}>
                  <h3 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={20} style={{ color: 'var(--color-highlight)' }} />
                    Radiografía del Vecino: Historial de Participación
                  </h3>

                  {loadingRadiografia ? (
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                      <div className="spinner"></div>
                      <p style={{ marginTop: '0.75rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Cargando radiografía...</p>
                    </div>
                  ) : radiografia.length === 0 ? (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px dashed var(--color-border)', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                      Este ciudadano no registra asistencias ni oratorias previas en el sistema.
                    </div>
                  ) : (
                    <div>
                      {/* Resumen rápido de métricas */}
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                        <span className="badge badge-success" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                          Reuniones asistidas: {radiografia.filter(item => item.asistio).length}
                        </span>
                        <span className="badge badge-info" style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: '#DEF7EC', color: '#03543F' }}>
                          Veces orador: {radiografia.filter(item => item.orador && item.orador.estado === 'hablo').length}
                        </span>
                        {radiografia.filter(item => item.pregunta_qr).length > 0 && (
                          <span className="badge badge-warning" style={{ padding: '6px 12px', fontSize: '0.8rem', backgroundColor: '#FEF08A', color: '#854D0E' }}>
                            Preguntas QR: {radiografia.filter(item => item.pregunta_qr).length}
                          </span>
                        )}
                      </div>

                      {/* Lista cronológica */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', borderLeft: '2px solid var(--color-border)', paddingLeft: '1.25rem', marginLeft: '0.5rem' }}>
                        {radiografia.map((item, idx) => {
                          const hasOrador = item.orador !== null;
                          const hasPregunta = item.pregunta_qr !== null;

                          return (
                            <div key={idx} style={{ position: 'relative' }}>
                              {/* Punto de la línea de tiempo */}
                              <div style={{
                                position: 'absolute',
                                left: '-1.65rem',
                                top: '4px',
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                backgroundColor: item.asistio ? 'var(--color-success)' : '#CBD5E1',
                                border: '2px solid #FFFFFF'
                              }}></div>

                              {/* Título y Fecha */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                <span className="badge badge-info" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                                  {item.reunion.tipo_reunion}
                                </span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: '500' }}>
                                  {item.reunion.fecha}
                                </span>
                              </div>

                              <h4 style={{ fontSize: '0.95rem', color: 'var(--color-primary)', margin: '4px 0 8px 0', fontWeight: '600' }}>
                                {item.reunion.nombre}
                              </h4>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: 'var(--color-primary)' }}>
                                <div>
                                  <strong>Asistencia:</strong>{' '}
                                  <span style={{ 
                                    color: item.asistio ? 'var(--color-success)' : '#9B1C1C',
                                    fontWeight: '600'
                                  }}>
                                    {item.asistio ? 'Presente' : 'Ausente (Inscripto)'}
                                  </span>
                                  {item.como_se_entero && (
                                    <span style={{ color: 'var(--color-text-muted)', marginLeft: '8px' }}>
                                      (Convocado vía: {item.como_se_entero})
                                    </span>
                                  )}
                                </div>

                                {/* Problemática de seguridad */}
                                {item.pregunta_puerta && (
                                  <div style={{ backgroundColor: '#F8FAFC', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid #EF4444', fontStyle: 'italic', marginTop: '4px' }}>
                                    <strong>Reclamo en puerta (Seguridad):</strong> "{item.pregunta_puerta}"
                                  </div>
                                )}

                                {/* Datos de Micrófono */}
                                {hasOrador && (
                                  <div style={{ backgroundColor: '#F0FDF4', padding: '10px 12px', borderRadius: '8px', borderLeft: '3px solid var(--color-success)', marginTop: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#15803D', fontWeight: '600', marginBottom: '4px' }}>
                                      <Mic size={14} /> 
                                      <span>
                                        Orador - {item.orador.estado === 'hablo' ? 'Habló Efectivo' : item.orador.estado === 'se_bajo' ? 'Se bajó del micrófono' : 'Anotado en espera'}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      {item.orador.tema_original && (
                                        <div><strong>Tema solicitado:</strong> "{item.orador.tema_original}"</div>
                                      )}
                                      {item.orador.tema_efectivo && (
                                        <div style={{ color: 'var(--color-primary)', fontWeight: '500', marginTop: '2px' }}>
                                          <strong>Minuta del Micrófono:</strong> "{item.orador.tema_efectivo}"
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Pregunta QR */}
                                {hasPregunta && (
                                  <div style={{ backgroundColor: '#EFF6FF', padding: '10px 12px', borderRadius: '8px', borderLeft: '3px solid #3B82F6', marginTop: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1D4ED8', fontWeight: '600', marginBottom: '4px' }}>
                                      <MessageSquare size={14} />
                                      <span>Pregunta enviada por QR (Reunión Temática)</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>
                                      "{item.pregunta_qr}"
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeDashboardTab === 'acreditacion_masiva' ? (
        /* VISTA DE CIERRE MASIVO DE ASISTENCIA (Paso 6 - Refactorizado en 2 Pasos) */
        <div style={{ position: 'relative' }}>
          <div className="decor-tabs-container">
            <div className="decor-tab-mint"></div>
            <div className="decor-tab-yellow"></div>
          </div>

          <div style={{ display: 'flex', gap: '2rem', flexDirection: 'column', maxWidth: '800px', margin: '0 auto' }}>
            <div className="card" style={{ margin: 0, backgroundColor: '#FFFFFF' }}>
              <h2 className="section-title" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
                <FileSpreadsheet size={24} style={{ color: 'var(--color-highlight)' }} />
                Acreditación Masiva: Cierre de Eventos
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
                Cargá las planillas de asistentes y oradores de forma masiva y secuencial. Primero debés cargar los asistentes (Paso 1) y luego los oradores (Paso 2).
              </p>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 250px' }}>
                  <label htmlFor="reunion-select" style={{ fontWeight: '600', color: 'var(--color-primary)' }}>Seleccionar Reunión Activa</label>
                  <select
                    id="reunion-select"
                    className="form-control"
                    value={selectedMeetingId}
                    onChange={(e) => setSelectedMeetingId(e.target.value)}
                    disabled={massAsistStatus === 'saving' || massOradoresStatus === 'saving'}
                    style={{ marginTop: '6px' }}
                  >
                    {availableMeetingsForMassAcreditacion.length === 0 ? (
                      <option value="">No hay reuniones disponibles</option>
                    ) : (
                      availableMeetingsForMassAcreditacion.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.nombre} ({r.fecha})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-end', height: '38px' }}>
                  <input
                    type="checkbox"
                    id="show-processed"
                    checked={showProcessedMeetings}
                    onChange={(e) => setShowProcessedMeetings(e.target.checked)}
                    disabled={massAsistStatus === 'saving' || massOradoresStatus === 'saving'}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="show-processed" style={{ fontSize: '0.85rem', cursor: 'pointer', fontWeight: '500', userSelect: 'none', color: 'var(--color-primary)' }}>
                    Mostrar reuniones ya procesadas
                  </label>
                </div>
              </div>
            </div>

            {selectedMeetingId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                
                {/* PASO 1: CARGA DE ASISTENTES */}
                <div className="card" style={{ margin: 0, borderTop: '4px solid var(--color-highlight)', backgroundColor: '#FFFFFF' }}>
                  <h3 style={{ fontSize: '1.15rem', color: 'var(--color-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'var(--color-highlight)', color: '#FFFFFF', fontSize: '0.8rem', fontWeight: '700' }}>1</span>
                    Paso 1: Carga de Asistentes (Padrón de la Reunión)
                  </h3>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                    Sube el archivo (Excel/CSV) de participantes. Matching automático por DNI, Teléfono, Mail o Nombre/Apellido. Se omitirán filas sin DNI.
                  </p>

                  <div style={{ border: '1px dashed var(--color-border)', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', backgroundColor: '#F8FAFC', marginBottom: '1.25rem' }}>
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <Plus size={14} /> Seleccionar planilla de asistentes
                        <input
                          type="file"
                          accept=".csv,.txt,.xls,.xlsx"
                          onChange={handleMassAsistFileUpload}
                          disabled={massAsistStatus === 'saving' || massOradoresStatus === 'saving'}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </div>

                    {massAsistFileName && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--color-primary)', fontWeight: '600' }}>
                        Archivo: {massAsistFileName}
                      </div>
                    )}

                    {massAsistStatus === 'success' && massAsistNeighbors.length > 0 && (
                      <div style={{ marginTop: '0.75rem', padding: '8px', backgroundColor: '#DEF7EC', borderRadius: '8px', color: '#03543F', fontSize: '0.8rem', fontWeight: '500' }}>
                        ✓ Se detectaron {massAsistNeighbors.length} filas válidas. Listas para procesar.
                      </div>
                    )}
                  </div>

                  {massAsistStatus === 'success' && (
                    <button
                      className="btn btn-primary"
                      onClick={handleConfirmMassAsist}
                      style={{ width: '100%', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: '600' }}
                    >
                      <Check size={16} /> Registrar Asistentes de esta Reunión
                    </button>
                  )}

                  {massAsistStatus === 'saving' && (
                    <div style={{ marginTop: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-primary)', marginBottom: '4px' }}>
                        <span>Acreditando asistentes...</span>
                        <span>{massAsistProgress}%</span>
                      </div>
                      <div style={{ height: '6px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${massAsistProgress}%`, backgroundColor: 'var(--color-highlight)', transition: 'width 0.2s ease-out' }}></div>
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        Acreditados con éxito: <strong>{massAsistStats.present}</strong>
                      </div>
                    </div>
                  )}
                </div>

                {/* PASO 2: CARGA DE ORADORES */}
                <div className="card" style={{ margin: 0, borderTop: '4px solid var(--color-mint)', backgroundColor: '#FFFFFF' }}>
                  <h3 style={{ fontSize: '1.15rem', color: 'var(--color-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'var(--color-mint)', color: '#042A38', fontSize: '0.8rem', fontWeight: '700' }}>2</span>
                    Paso 2: Carga de Oradores (WhatsApp Dump Parser)
                  </h3>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                    Pegá el bloque de texto copiado de WhatsApp. El parser extraerá nombres, teléfonos y minutas. Vinculación automática por sufijo de 8 dígitos o nombre.
                  </p>

                  <div style={{ marginBottom: '1.25rem' }}>
                    <textarea
                      className="form-control"
                      rows={6}
                      value={massOradoresText}
                      onChange={(e) => setMassOradoresText(e.target.value)}
                      placeholder="Pegá acá el resumen de oradores copiado de WhatsApp...&#10;Ej:&#10;Filomena Vera – 11 5044-3531&#10;Comenta la importancia de fortalecer la educación...&#10;&#10;Myriam Alejandra Insaurralde – 11 5933-2155&#10;Manifiesta su preocupación por..."
                      style={{ fontSize: '0.85rem', fontFamily: 'monospace', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}
                      disabled={massOradoresStatus === 'saving'}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={handleAnalyzeOradores}
                      disabled={!massOradoresText.trim() || massOradoresStatus === 'saving'}
                      style={{ flex: 1, padding: '10px', fontWeight: '600' }}
                    >
                      {massOradoresStatus === 'loading' ? 'Analizando texto...' : 'Analizar y Previsualizar Oradores'}
                    </button>
                    {parsedOradoresPreview.length > 0 && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setParsedOradoresPreview([]);
                          setMassOradoresText('');
                        }}
                        style={{ padding: '0 15px', color: '#EF4444' }}
                        disabled={massOradoresStatus === 'saving'}
                      >
                        Limpiar
                      </button>
                    )}
                  </div>

                  {/* Tabla de Previsualización Interactiva */}
                  {parsedOradoresPreview.length > 0 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <h4 style={{ fontSize: '0.9rem', color: 'var(--color-primary)', marginBottom: '0.75rem', fontWeight: '700' }}>
                        Oradores Detectados ({parsedOradoresPreview.length})
                      </h4>
                      <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                        <table className="table" style={{ margin: 0, fontSize: '0.85rem' }}>
                          <thead style={{ backgroundColor: '#F8FAFC' }}>
                            <tr>
                              <th>Vecino Detectado</th>
                              <th>Teléfono</th>
                              <th>Minuta Extraída</th>
                              <th>Estado Sugerido</th>
                              <th style={{ width: '60px', textAlign: 'center' }}>Quitar</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsedOradoresPreview.map((row) => (
                              <tr key={row.key} style={{ backgroundColor: row.warning ? '#FFF5F5' : 'inherit' }}>
                                <td style={{ minWidth: '220px' }}>
                                  <div style={{ fontWeight: '600', color: 'var(--color-primary)' }}>{row.nombreRaw}</div>
                                  {row.warning ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                                      <span style={{ color: '#E53E3E', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                        <AlertTriangle size={12} /> Vecino no identificado en la asistencia
                                      </span>
                                      <select
                                        className="form-control form-control-sm"
                                        value={row.vecinoDni || ''}
                                        onChange={(e) => handleUpdatePreviewRow(row.key, 'vecinoDni', e.target.value)}
                                        style={{ fontSize: '0.75rem', padding: '2px 6px', height: 'auto', maxWidth: '240px' }}
                                      >
                                        <option value="">-- Vincular manualmente --</option>
                                        <option value="CREATE_TEMP">➕ Crear como Vecino Temporal (Sin DNI)</option>
                                        {meetingAsistentes.map(a => (
                                          <option key={a.vecino?.dni} value={a.vecino?.dni}>
                                            {a.vecino?.apellido}, {a.vecino?.nombre} ({a.vecino?.dni})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                                      <span style={{ color: '#16A34A', fontSize: '0.75rem', fontWeight: '600' }}>
                                        ✓ Vinculado a: {row.vecinoNombreCompleto} ({row.vecinoDni})
                                      </span>
                                      <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => handleUpdatePreviewRow(row.key, 'vecinoDni', '')}
                                        style={{ fontSize: '0.65rem', padding: '2px 6px', height: 'auto', lineHeight: '1.2' }}
                                      >
                                        Cambiar / Desvincular
                                      </button>
                                    </div>
                                  )}
                                </td>
                                <td style={{ fontSize: '0.8rem', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>{row.telefono}</td>
                                <td style={{ verticalAlign: 'middle' }}>
                                  <textarea
                                    className="form-control"
                                    rows={2}
                                    value={row.minuta || ''}
                                    onChange={(e) => handleUpdatePreviewRow(row.key, 'minuta', e.target.value)}
                                    placeholder="Escribí o editá la minuta final..."
                                    style={{ fontSize: '0.8rem', minWidth: '240px', padding: '6px', lineHeight: '1.25' }}
                                  />
                                </td>
                                <td style={{ verticalAlign: 'middle' }}>
                                  <select
                                    className="form-control form-control-sm"
                                    value={row.estado}
                                    onChange={(e) => handleUpdatePreviewRow(row.key, 'estado', e.target.value)}
                                    style={{ fontSize: '0.8rem', padding: '4px 8px', height: 'auto', minWidth: '130px' }}
                                  >
                                    <option value="en_espera">Anotado (En Espera)</option>
                                    <option value="hablo">Efectivo (Habló)</option>
                                    <option value="se_bajo">Se bajó</option>
                                  </select>
                                </td>
                                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleDeletePreviewRow(row.key)}
                                    style={{ padding: '6px', color: '#EF4444' }}
                                    title="Quitar"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {parsedOradoresPreview.length > 0 && massOradoresStatus === 'success' && (
                    <button
                      className="btn btn-highlight"
                      onClick={handleConfirmMassOradores}
                      style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: '700' }}
                    >
                      <Check size={18} /> Confirmar y Guardar Oradores
                    </button>
                  )}

                  {massOradoresStatus === 'saving' && (
                    <div style={{ marginTop: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-primary)', marginBottom: '4px' }}>
                        <span>Guardando oradores...</span>
                        <span>{massOradoresProgress}%</span>
                      </div>
                      <div style={{ height: '6px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${massOradoresProgress}%`, backgroundColor: 'var(--color-mint)', transition: 'width 0.2s ease-out' }}></div>
                      </div>
                    </div>
                  )}

                  {massOradoresOmittedList.length > 0 && (
                    <div style={{ marginTop: '1.25rem', padding: '12px', backgroundColor: '#FEF2F2', borderRadius: '8px', border: '1px solid #FCA5A5' }}>
                      <h4 style={{ fontSize: '0.85rem', color: '#991B1B', margin: '0 0 6px 0', fontWeight: '700' }}>Detalle de Omitidos/Errores:</h4>
                      <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.75rem', color: '#7F1D1D', display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '120px', overflowY: 'auto' }}>
                        {massOradoresOmittedList.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>
      ) : (
        /* VISTA DE ESTADÍSTICAS POR FUNCIONARIO (BI) */
        <EstadisticasFuncionario />
      )}

      {/* MODAL VER INSCRIPTOS (Requisito 6) */}
      {showInscriptosModal && selectedReunionInscriptos && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px', width: '90%', borderTopColor: 'var(--color-highlight)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} style={{ color: 'var(--color-highlight)' }} />
                Inscriptos: {selectedReunionInscriptos.nombre}
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn btn-highlight btn-sm"
                  onClick={() => setShowImportArea(prev => !prev)}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Plus size={14} /> Importar Excel/CSV
                </button>
                <button 
                  className="btn btn-secondary btn-sm" 
                  onClick={() => {
                    setShowInscriptosModal(false);
                    setSelectedReunionInscriptos(null);
                    setInscriptosList([]);
                    setShowImportArea(false);
                    setModalImportedNeighbors([]);
                    setModalImportStatus('idle');
                    setModalFileName('');
                  }}
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* ÁREA DE IMPORTACIÓN EXPANDIBLE DENTRO DEL MODAL */}
            {showImportArea && (
              <div style={{ backgroundColor: '#F8FAFC', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <h4 style={{ fontSize: '0.95rem', color: 'var(--color-primary)', marginTop: 0, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileSpreadsheet size={16} style={{ color: '#0F766E' }} />
                  Importar Planilla de Inscriptos (.xlsx / .xls / .csv)
                </h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                  Seleccioná el archivo exportado de Excel. El sistema registrará a los ciudadanos en el padrón central y los inscribirá automáticamente en esta reunión.
                </p>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="file"
                    accept=".csv,.txt,.xls,.xlsx"
                    onChange={handleModalFileUpload}
                    style={{ fontSize: '0.85rem' }}
                    disabled={modalImportStatus === 'saving'}
                  />
                  
                  {modalImportStatus === 'success' && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleConfirmModalImport}
                      disabled={modalImportStatus === 'saving'}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px' }}
                    >
                      {modalImportStatus === 'saving' ? 'Guardando...' : <><Check size={14} /> Confirmar {modalImportedNeighbors.length} Vecinos</>}
                    </button>
                  )}
                </div>

                {modalImportStatus === 'loading' && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                    Procesando archivo...
                  </div>
                )}
                {modalImportStatus === 'saving' && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-highlight)', fontWeight: '600', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }}></div>
                    Guardando registros en la base de datos...
                  </div>
                )}
              </div>
            )}

            {loadingInscriptos ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <div className="spinner"></div>
                <p style={{ marginTop: '1rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Cargando inscriptos...</p>
              </div>
            ) : (
              <div>
                {/* Métricas rápidas del modal */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '1.25rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                  <span className="badge badge-info" style={{ backgroundColor: '#F1F5F9', color: 'var(--color-primary)' }}>
                    Total convocados: {inscriptosList.length}
                  </span>
                  <span className="badge badge-success">
                    Presentes: {inscriptosList.filter(i => i.asistio).length}
                  </span>
                  <span className="badge badge-secondary" style={{ backgroundColor: '#E2E8F0', color: '#475569' }}>
                    Ausentes: {inscriptosList.filter(i => !i.asistio).length}
                  </span>
                </div>

                {/* Filtro libre del listado */}
                <div style={{ marginBottom: '1rem', position: 'relative' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Filtrar inscriptos por DNI, nombre o apellido..."
                    value={inscriptosSearch}
                    onChange={(e) => setInscriptosSearch(e.target.value)}
                    style={{ fontSize: '0.85rem', paddingLeft: '2.5rem' }}
                  />
                  <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                </div>

                {/* Tabla de inscriptos */}
                {inscriptosList.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                    No hay inscriptos registrados en esta reunión.
                  </div>
                ) : (
                  <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                    <table className="table" style={{ margin: 0 }}>
                      <thead style={{ position: 'sticky', top: 0, backgroundColor: '#F8FAFC', zIndex: 1 }}>
                        <tr>
                          <th>Vecino</th>
                          <th>DNI</th>
                          <th>Contacto</th>
                          <th>Origen</th>
                          <th style={{ textAlign: 'center' }}>Asistencia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inscriptosList
                          .filter(item => {
                            const term = inscriptosSearch.toLowerCase();
                            const v = item.vecino || {};
                            return (
                              (v.nombre && v.nombre.toLowerCase().includes(term)) ||
                              (v.apellido && v.apellido.toLowerCase().includes(term)) ||
                              (item.vecino_id && item.vecino_id.toLowerCase().includes(term)) ||
                              (v.celular && v.celular.toLowerCase().includes(term))
                            );
                          })
                          .map(item => {
                            const v = item.vecino || {};
                            return (
                              <tr key={item.id}>
                                <td>
                                  <div style={{ fontWeight: '600' }}>{v.nombre} {v.apellido}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                    {v.barrio || 'Sin barrio'} ({v.comuna || 'Sin comuna'})
                                  </div>
                                </td>
                                <td style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                                  {item.vecino_id}
                                </td>
                                <td style={{ fontSize: '0.85rem' }}>
                                  <div>{v.celular || '-'}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{v.email || '-'}</div>
                                </td>
                                <td>
                                  <span className="badge badge-info" style={{ fontSize: '0.75rem', backgroundColor: '#F1F5F9', color: 'var(--color-primary)' }}>
                                    {item.como_se_entero || item.estado_convocatoria || 'Orión'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className={`badge ${item.asistio ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '0.75rem', backgroundColor: item.asistio ? 'var(--color-success)' : '#E2E8F0', color: item.asistio ? '#FFFFFF' : '#475569' }}>
                                    {item.asistio ? 'Presente' : 'Ausente'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
