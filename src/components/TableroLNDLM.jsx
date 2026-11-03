import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Building2,
  MapPin,
  Users,
  Zap,
  Download,
  Upload,
  Search,
  RefreshCw,
  UserMinus,
  UserPlus,
  ArrowLeft,
  FileSpreadsheet,
  Plus,
  Trash2,
  Edit3,
  X,
  Sparkles,
  Award,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  UserCheck,
  ArrowRightLeft
} from 'lucide-react';
import ReasignarVoluntarioModal from './ReasignarVoluntarioModal';
import {
  BARRIOS_CABA_DATA,
  PROXIMITY_TIER_META,
  normalizeNeighborhoodCABA,
  extractComunaNumber,
  evaluateProximityAffinity,
  assignVolunteersByProximity,
  calculateLndlmSummary,
  getSuggestedSubstitutesForSpace,
  parseCulturalSpacesExcel,
  parseVolunteersExcel,
  loadLndlmMeetingData,
  saveLndlmCulturalSpaces,
  deleteLndlmCulturalSpace,
  saveLndlmAssignments,
  importVolunteersToMeeting,
  exportMasterLndlmExcel,
  exportSpacesAssignmentExcel,
  downloadTemplateLndlm
} from '../services/lndlmService';
import { guardarAsistencia, bulkGuardarAsistencias } from '../services/supabaseService';

const SORTED_BARRIOS_KEYS = Object.keys(BARRIOS_CABA_DATA).sort((a, b) => a.localeCompare(b));

export default function TableroLNDLM({ reunion, onBack, onOpenComando }) {
  const meetingId = reunion?.id;

  const [volunteers, setVolunteers] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success' | 'warning' | 'error' | 'info', text: string }

  // Pestaña interna activa: 'spaces' | 'volunteers'
  const [activeTab, setActiveTab] = useState('spaces');

  // Filtros en Pestaña de Espacios Culturales
  const [spaceSearch, setSpaceSearch] = useState('');
  const [spaceComunaFilter, setSpaceComunaFilter] = useState('TODAS');
  const [spaceBarrioFilter, setSpaceBarrioFilter] = useState('TODOS');
  const [spaceStatusFilter, setSpaceStatusFilter] = useState('TODOS'); // 'TODOS' | 'COMPLETO' | 'INCOMPLETO' | 'VACIO'
  const [spaceTierFilter, setSpaceTierFilter] = useState('TODOS');

  // Filtros en Pestaña de Voluntarios y Banco de Suplentes
  const [volSearch, setVolSearch] = useState('');
  const [volStatusFilter, setVolStatusFilter] = useState('TODOS'); // 'TODOS' | 'ASIGNADO' | 'SUPLENTE' | 'PRESENTE' | 'INSCRIPTO' | 'BAJA'
  const [volComunaFilter, setVolComunaFilter] = useState('TODAS');
  const [volBarrioFilter, setVolBarrioFilter] = useState('TODOS');
  const [volPage, setVolPage] = useState(1);
  const VOLS_PER_PAGE = 50;

  // Modal de Reemplazo / Asignación de Suplente Cercano
  const [substituteModal, setSubstituteModal] = useState(null);
  // { space, replacingVolunteer: volunteer | null, markReplacedAs: 'BAJA' | 'SUPLENTE', search: '' }

  // Modal de Alta / Edición de Espacio Cultural
  const [spaceFormModal, setSpaceFormModal] = useState(null);
  // { mode: 'create' | 'edit', data: { id, name, address, neighborhood, comuna, contact_name, contact_phone, contact_email, quota_required } }

  // Modal de Asignación Manual desde la fila de un voluntario
  const [manualSpaceModal, setManualSpaceModal] = useState(null);
  // { volunteer, search: '' }

  // Modal Universal de Reasignación Manual / A Dedo (Mover de Sede o Asignar Específico)
  const [reasignarModal, setReasignarModal] = useState(null);
  // { mode: 'move-volunteer' | 'assign-to-space', volunteer?: obj, space?: obj }

  // Referencias a inputs de archivo ocultos
  const spacesFileInputRef = useRef(null);
  const volunteersFileInputRef = useRef(null);

  const showToast = (text, type = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage(prev => (prev?.text === text ? null : prev));
    }, 6500);
  };

  const fetchAllData = async () => {
    if (!meetingId) return;
    setLoading(true);
    try {
      const { volunteers: loadedVols, spaces: loadedSpaces } = await loadLndlmMeetingData(meetingId);
      setVolunteers(loadedVols || []);
      setSpaces(loadedSpaces || []);
    } catch (err) {
      console.error('Error cargando datos de LNDLM:', err);
      showToast('Error al cargar los datos del tablero LNDLM.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [meetingId]);

  // Resumen general y métricas de efectividad geográfica
  const summary = useMemo(() => {
    return calculateLndlmSummary(volunteers, spaces);
  }, [volunteers, spaces]);

  // Mapa rápido de voluntarios asignados por espacio
  const assignedBySpaceMap = useMemo(() => {
    const map = {};
    spaces.forEach(s => {
      map[s.id] = [];
    });
    volunteers.forEach(v => {
      if (v.status === 'ASIGNADO' && v.assigned_space_id && map[v.assigned_space_id]) {
        map[v.assigned_space_id].push(v);
      }
    });
    return map;
  }, [volunteers, spaces]);

  // Mapa rápido de espacios por ID
  const spacesByIdMap = useMemo(() => {
    const map = {};
    spaces.forEach(s => {
      map[s.id] = s;
    });
    return map;
  }, [spaces]);

  // Filtrado de Espacios Culturales
  const filteredSpaces = useMemo(() => {
    return spaces.filter(sp => {
      const assignedVols = assignedBySpaceMap[sp.id] || [];
      const req = Math.max(0, Number(sp.quota_required ?? 2));
      const count = assignedVols.length;

      if (spaceComunaFilter !== 'TODAS' && Number(sp.comuna) !== Number(spaceComunaFilter)) {
        return false;
      }
      if (spaceBarrioFilter !== 'TODOS' && sp.neighborhood !== spaceBarrioFilter) {
        return false;
      }
      if (spaceStatusFilter === 'COMPLETO' && count < req) return false;
      if (spaceStatusFilter === 'INCOMPLETO' && count >= req) return false;
      if (spaceStatusFilter === 'VACIO' && count > 0) return false;

      if (spaceTierFilter !== 'TODOS') {
        const hasTier = assignedVols.some(v => v.proximity_tier === spaceTierFilter);
        if (!hasTier) return false;
      }

      if (spaceSearch.trim()) {
        const q = spaceSearch
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        const matchSpace = [
          sp.name,
          sp.address,
          sp.neighborhood,
          `comuna ${sp.comuna}`,
          sp.contact_name,
          sp.contact_email,
          sp.contact_phone
        ]
          .join(' ')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .includes(q);

        const matchVol = assignedVols.some(v =>
          `${v.first_name} ${v.last_name} ${v.dni} ${v.neighborhood}`
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .includes(q)
        );

        if (!matchSpace && !matchVol) return false;
      }

      return true;
    });
  }, [spaces, assignedBySpaceMap, spaceComunaFilter, spaceBarrioFilter, spaceStatusFilter, spaceTierFilter, spaceSearch]);

  // Filtrado de Voluntarios
  const filteredVolunteers = useMemo(() => {
    return volunteers.filter(v => {
      if (volStatusFilter === 'ASIGNADO' && v.status !== 'ASIGNADO') return false;
      if (volStatusFilter === 'SUPLENTE' && !(v.attended_training && (v.status === 'SUPLENTE' || (!v.assigned_space_id && v.status !== 'BAJA')))) return false;
      if (volStatusFilter === 'PRESENTE' && !v.attended_training) return false;
      if (volStatusFilter === 'INSCRIPTO' && v.attended_training) return false;
      if (volStatusFilter === 'BAJA' && v.status !== 'BAJA') return false;

      if (volComunaFilter !== 'TODAS' && Number(v.comuna) !== Number(volComunaFilter)) return false;
      if (volBarrioFilter !== 'TODOS' && v.neighborhood !== volBarrioFilter) return false;

      if (volSearch.trim()) {
        const q = volSearch
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        const spName = v.assigned_space_id ? (spacesByIdMap[v.assigned_space_id]?.name || '') : '';
        const text = [
          v.first_name,
          v.last_name,
          v.dni,
          v.cuil,
          v.neighborhood,
          `comuna ${v.comuna || ''}`,
          v.email,
          v.phone,
          spName
        ]
          .join(' ')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        if (!text.includes(q)) return false;
      }

      return true;
    });
  }, [volunteers, spacesByIdMap, volStatusFilter, volComunaFilter, volBarrioFilter, volSearch]);

  // Resetear página de voluntarios al cambiar filtros
  useEffect(() => {
    setVolPage(1);
  }, [volSearch, volStatusFilter, volComunaFilter, volBarrioFilter]);

  const paginatedVolunteers = useMemo(() => {
    const start = (volPage - 1) * VOLS_PER_PAGE;
    return filteredVolunteers.slice(start, start + VOLS_PER_PAGE);
  }, [filteredVolunteers, volPage]);

  const totalVolPages = Math.max(1, Math.ceil(filteredVolunteers.length / VOLS_PER_PAGE));

  // ============================================================================
  // ACCIONES PRINCIPALES DEL MOTOR Y PERSISTENCIA
  // ============================================================================

  /**
   * Ejecuta el algoritmo de Asignación Automática por Cercanía en 4 pasadas.
   * Blindaje anti-sobrescritura: respeta de forma estricta los voluntarios con is_manual_override = true.
   */
  const handleRunAutomaticAssignment = async (preserveManual = true) => {
    if (spaces.length === 0) {
      showToast('Primero debés importar o cargar los Espacios Culturales (166 sedes) para poder asignar.', 'warning');
      return;
    }

    const presentCount = volunteers.filter(v => v.attended_training && v.status !== 'BAJA').length;
    if (presentCount === 0) {
      showToast(
        'No hay voluntarios marcados como PRESENTES (asistio = true) en la capacitación. Marcá presentes en el Check-in o usá el botón "Marcar Presentes" en la pestaña Voluntarios.',
        'warning'
      );
      return;
    }

    setProcessing(true);
    try {
      const result = assignVolunteersByProximity(volunteers, spaces, {
        preserveManualAssignments: preserveManual !== false
      });

      setVolunteers(result.updatedVolunteers);
      await saveLndlmAssignments(meetingId, result.updatedVolunteers);

      const s = result.summary;
      const preservedNote = result.manualPreservedCount > 0
        ? ` (se blindaron y respetaron ${result.manualPreservedCount} asignaciones manuales previas)`
        : '';
      showToast(
        `⚡ Asignación completada: ${s.totalAssigned} voluntarios asignados${preservedNote} (${s.pctBarrioOComuna}% en su mismo barrio o comuna, ${s.pctLimitrofe}% en comuna vecina) y ${s.totalSubstitutes} en banco de suplentes.`,
        'success'
      );
    } catch (err) {
      console.error('Error ejecutando asignación automática:', err);
      showToast('Ocurrió un error al ejecutar la asignación automática.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Importa el archivo Excel de Espacios Culturales (`Domicilios espacios culturales.xlsx` / `Datos1`)
   */
  const handleImportSpacesFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setProcessing(true);
    try {
      const parsedSpaces = await parseCulturalSpacesExcel(file);
      let finalSpaces = parsedSpaces;

      if (spaces.length > 0) {
        const replaceAll = await window.confirm(
          `Se leyeron ${parsedSpaces.length} Espacios Culturales del archivo "${file.name}".\n\n¿Deseás REEMPLAZAR el listado actual (${spaces.length} espacios) por este nuevo listado?\n(Si presionás Cancelar, se agregarán/actualizarán por nombre sin borrar los existentes).`
        );
        if (!replaceAll) {
          const mapByName = new Map();
          spaces.forEach(s => mapByName.set(s.name.trim().toLowerCase(), s));
          parsedSpaces.forEach(s => {
            const key = s.name.trim().toLowerCase();
            if (mapByName.has(key)) {
              const prev = mapByName.get(key);
              mapByName.set(key, { ...prev, ...s, id: prev.id });
            } else {
              mapByName.set(key, s);
            }
          });
          finalSpaces = Array.from(mapByName.values());
        }
      }

      const { data: savedSpaces } = await saveLndlmCulturalSpaces(meetingId, finalSpaces);
      setSpaces(savedSpaces);
      showToast(`🏛️ Se importaron y normalizaron ${savedSpaces.length} Espacios Culturales correctamente.`, 'success');
    } catch (err) {
      console.error('Error importando espacios culturales:', err);
      showToast(err.message || 'Error al procesar el Excel de Espacios Culturales.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Importa el archivo Excel de Nómina de Voluntarios (`Confirmados Capacitación LNDLM.xlsx`)
   */
  const handleImportVolunteersFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setProcessing(true);
    try {
      const { volunteers: parsedVols, duplicateCount } = await parseVolunteersExcel(file);
      if (parsedVols.length === 0) {
        showToast('No se encontraron voluntarios válidos en el archivo.', 'warning');
        setProcessing(false);
        return;
      }

      await importVolunteersToMeeting(meetingId, parsedVols);
      await fetchAllData();

      const presentInFile = parsedVols.filter(v => v.attended_training).length;
      showToast(
        `📥 Se importaron ${parsedVols.length} voluntarios a la reunión (${presentInFile} con asistencia marcada${duplicateCount > 0 ? `, ${duplicateCount} duplicados omitidos` : ''}). Barrios y comunas normalizados.`,
        'success'
      );
    } catch (err) {
      console.error('Error importando voluntarios:', err);
      showToast(err.message || 'Error al procesar el archivo de voluntarios.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Modifica el cupo requerido (`quota_required`) de un espacio cultural
   */
  const handleUpdateSpaceQuota = async (spaceId, newQuota) => {
    const validQuota = Math.max(0, parseInt(newQuota, 10) || 0);
    const updatedSpaces = spaces.map(s => (s.id === spaceId ? { ...s, quota_required: validQuota } : s));
    setSpaces(updatedSpaces);
    await saveLndlmCulturalSpaces(meetingId, updatedSpaces);
  };

  /**
   * Guarda alta o edición manual de un Espacio Cultural
   */
  const handleSaveSpaceForm = async (e) => {
    e.preventDefault();
    if (!spaceFormModal) return;
    const d = spaceFormModal.data;
    if (!d.name?.trim()) {
      showToast('El nombre del espacio cultural es obligatorio.', 'warning');
      return;
    }

    const normBarrio = normalizeNeighborhoodCABA(d.neighborhood) || 'SAN NICOLAS';
    const comunaNum = extractComunaNumber(d.comuna, normBarrio) || 1;
    const quota = Math.max(1, parseInt(d.quota_required, 10) || 2);

    let updatedSpaces;
    if (spaceFormModal.mode === 'edit') {
      updatedSpaces = spaces.map(s =>
        s.id === d.id
          ? {
              ...s,
              name: d.name.trim(),
              address: d.address.trim(),
              neighborhood: normBarrio,
              comuna: comunaNum,
              contact_name: d.contact_name.trim(),
              contact_phone: d.contact_phone.trim(),
              contact_email: d.contact_email.trim(),
              quota_required: quota
            }
          : s
      );
    } else {
      const newSpace = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `sp_${Date.now()}`,
        name: d.name.trim(),
        address: d.address.trim() || 'Dirección a confirmar',
        neighborhood: normBarrio,
        comuna: comunaNum,
        contact_name: d.contact_name.trim(),
        contact_phone: d.contact_phone.trim(),
        contact_email: d.contact_email.trim(),
        quota_required: quota
      };
      updatedSpaces = [newSpace, ...spaces];
    }

    setProcessing(true);
    try {
      const { data: savedSpaces } = await saveLndlmCulturalSpaces(meetingId, updatedSpaces);
      setSpaces(savedSpaces);
      setSpaceFormModal(null);
      showToast(
        spaceFormModal.mode === 'edit' ? 'Espacio cultural actualizado.' : 'Nuevo espacio cultural agregado.',
        'success'
      );
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Elimina un Espacio Cultural puntual
   */
  const handleDeleteSpace = async (space) => {
    const confirmed = await window.confirm(`¿Eliminar el espacio cultural "${space.name}"? Los voluntarios asignados a esta sede pasarán a estado SUPLENTE.`);
    if (!confirmed) {
      return;
    }
    setProcessing(true);
    try {
      const remainingSpaces = spaces.filter(s => s.id !== space.id);
      const updatedVols = volunteers.map(v => {
        if (v.assigned_space_id === space.id) {
          return {
            ...v,
            assigned_space_id: null,
            assignment_score: null,
            proximity_tier: null,
            distance_km: null,
            is_manual_override: false,
            status: v.attended_training ? 'SUPLENTE' : 'INSCRIPTO'
          };
        }
        return v;
      });
      setSpaces(remainingSpaces);
      setVolunteers(updatedVols);
      await deleteLndlmCulturalSpace(meetingId, space.id, remainingSpaces);
      await saveLndlmAssignments(meetingId, updatedVols);
      showToast(`Espacio "${space.name}" eliminado.`, 'info');
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Da de baja o desasigna a un voluntario de un espacio cultural
   */
  const handleRemoveVolunteerFromSpace = async (volunteer, targetStatus = 'BAJA', openSubstituteSelector = false) => {
    const space = spacesByIdMap[volunteer.assigned_space_id];
    const updatedVols = volunteers.map(v => {
      if (v.dni === volunteer.dni) {
        return {
          ...v,
          assigned_space_id: null,
          assignment_score: null,
          proximity_tier: null,
          distance_km: null,
          is_manual_override: false,
          status: targetStatus
        };
      }
      return v;
    });

    setVolunteers(updatedVols);
    await saveLndlmAssignments(meetingId, updatedVols);

    if (openSubstituteSelector && space) {
      setSubstituteModal({
        space,
        replacingVolunteer: null,
        markReplacedAs: 'BAJA',
        search: ''
      });
    } else {
      showToast(
        targetStatus === 'BAJA'
          ? `Voluntario ${volunteer.first_name} ${volunteer.last_name} marcado como BAJA.`
          : `Voluntario ${volunteer.first_name} ${volunteer.last_name} devuelto al banco de SUPLENTES.`,
        'info'
      );
    }
  };

  /**
   * Asigna un suplente (o reemplaza a un titular) en un espacio cultural específico
   */
  const handleConfirmSubstituteAssignment = async (substituteVolunteer) => {
    if (!substituteModal?.space || !substituteVolunteer) return;
    const { space, replacingVolunteer, markReplacedAs } = substituteModal;
    const aff = evaluateProximityAffinity(substituteVolunteer, space);

    const updatedVols = volunteers.map(v => {
      if (replacingVolunteer && v.dni === replacingVolunteer.dni) {
        return {
          ...v,
          assigned_space_id: null,
          assignment_score: null,
          proximity_tier: null,
          distance_km: null,
          status: markReplacedAs || 'BAJA'
        };
      }
      if (v.dni === substituteVolunteer.dni) {
        return {
          ...v,
          attended_training: true,
          assigned_space_id: space.id,
          assignment_score: aff.assignment_score,
          proximity_tier: aff.proximity_tier,
          distance_km: aff.distance_km,
          status: 'ASIGNADO'
        };
      }
      return v;
    });

    setVolunteers(updatedVols);
    setSubstituteModal(null);
    await saveLndlmAssignments(meetingId, updatedVols);

    const tierLabel = PROXIMITY_TIER_META[aff.proximity_tier]?.label || aff.proximity_tier;
    showToast(
      replacingVolunteer
        ? `✅ Reemplazo exitoso en "${space.name}": se asignó a ${substituteVolunteer.first_name} ${substituteVolunteer.last_name} (${tierLabel}).`
        : `✅ Voluntario ${substituteVolunteer.first_name} ${substituteVolunteer.last_name} asignado a "${space.name}" (${tierLabel}).`,
      'success'
    );
  };

  /**
   * Asignación / Reasignación Manual ("a dedo"):
   * - Setea is_manual_override = true y proximity_tier = 'MANUAL'
   * - Libera automáticamente el cupo anterior si ya estaba asignado a otra sede
   * - Permite exceder cupo si el operador lo fuerza manualmente
   * - Blindado contra re-ejecución del algoritmo
   */
  const handleConfirmManualAssignment = async (targetVolunteer, targetSpace) => {
    if (!targetVolunteer || !targetSpace) return;
    setProcessing(true);
    try {
      const prevSpace = targetVolunteer.assigned_space_id ? spacesByIdMap[targetVolunteer.assigned_space_id] : null;
      const aff = evaluateProximityAffinity(targetVolunteer, targetSpace);

      const updatedVols = volunteers.map(v => {
        if (v.dni === targetVolunteer.dni) {
          return {
            ...v,
            attended_training: true,
            assigned_space_id: targetSpace.id,
            is_manual_override: true,
            proximity_tier: 'MANUAL',
            assignment_score: null,
            distance_km: aff.distance_km,
            status: 'ASIGNADO'
          };
        }
        return v;
      });

      if (!targetVolunteer.attended_training && meetingId) {
        await guardarAsistencia({
          reunion_id: meetingId,
          vecino_id: targetVolunteer.dni,
          asistio: true,
          estado_convocatoria: 'inscripto'
        });
      }

      setVolunteers(updatedVols);
      setReasignarModal(null);
      await saveLndlmAssignments(meetingId, updatedVols);

      if (prevSpace && prevSpace.id !== targetSpace.id) {
        showToast(
          `🔄 Transferencia exitosa: ${targetVolunteer.first_name} ${targetVolunteer.last_name} pasó de "${prevSpace.name}" a "${targetSpace.name}" (Fijado Manual).`,
          'success'
        );
      } else {
        showToast(
          `✋ ${targetVolunteer.first_name} ${targetVolunteer.last_name} asignado manualmente a "${targetSpace.name}" (Fijado Manual).`,
          'success'
        );
      }
    } catch (err) {
      console.error('Error al realizar asignación manual:', err);
      showToast('Error al persistir la asignación manual: ' + err.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Asigna manualmente a un voluntario desde la pestaña de Voluntarios a un espacio cultural elegido
   */
  const handleAssignVolunteerToSpaceManual = async (volunteer, space) => {
    return handleConfirmManualAssignment(volunteer, space);
  };

  /**
   * Cambia la asistencia (`attended_training` / `asistio`) de un voluntario individual
   */
  const handleToggleVolunteerAttendance = async (volunteer) => {
    const nextAttended = !volunteer.attended_training;
    const updatedVols = volunteers.map(v => {
      if (v.dni === volunteer.dni) {
        return {
          ...v,
          attended_training: nextAttended,
          assigned_space_id: nextAttended ? v.assigned_space_id : null,
          assignment_score: nextAttended ? v.assignment_score : null,
          proximity_tier: nextAttended ? v.proximity_tier : null,
          distance_km: nextAttended ? v.distance_km : null,
          status: nextAttended
            ? (v.assigned_space_id ? 'ASIGNADO' : 'SUPLENTE')
            : 'INSCRIPTO'
        };
      }
      return v;
    });

    setVolunteers(updatedVols);
    await guardarAsistencia({
      reunion_id: meetingId,
      vecino_id: volunteer.dni,
      asistio: nextAttended,
      estado_convocatoria: 'inscripto'
    });
    await saveLndlmAssignments(meetingId, updatedVols);
  };

  /**
   * Marca asistencia masiva (Todos los filtrados o Simulación de N presentes para pruebas)
   */
  const handleBulkMarkAttendance = async (mode = 'ALL_FILTERED') => {
    if (volunteers.length === 0) return;

    let targetDnis = new Set();
    if (mode === 'ALL_FILTERED') {
      filteredVolunteers.forEach(v => targetDnis.add(v.dni));
    } else if (mode === 'SIMULATE_600') {
      const targetCount = Math.min(volunteers.length, 600);
      volunteers.slice(0, targetCount).forEach(v => targetDnis.add(v.dni));
    }

    if (targetDnis.size === 0) return;

    setProcessing(true);
    try {
      const updatedVols = volunteers.map(v => {
        if (targetDnis.has(v.dni)) {
          return {
            ...v,
            attended_training: true,
            status: v.assigned_space_id ? 'ASIGNADO' : (v.status === 'BAJA' ? 'BAJA' : 'SUPLENTE')
          };
        }
        return v;
      });

      const payload = Array.from(targetDnis).map(dni => ({
        reunion_id: meetingId,
        vecino_id: dni,
        asistio: true,
        estado_convocatoria: 'inscripto'
      }));

      setVolunteers(updatedVols);
      await bulkGuardarAsistencias(payload);
      await saveLndlmAssignments(meetingId, updatedVols);
      showToast(`✅ Se marcaron ${targetDnis.size} voluntarios como PRESENTES en la capacitación.`, 'success');
    } catch (err) {
      console.error('Error en asistencia masiva:', err);
      showToast('Error al actualizar asistencias masivas.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Cambia el estado de un voluntario a BAJA o lo reactiva como SUPLENTE
   */
  const handleToggleVolunteerBaja = async (volunteer) => {
    const isCurrentlyBaja = volunteer.status === 'BAJA';
    const nextStatus = isCurrentlyBaja
      ? (volunteer.attended_training ? 'SUPLENTE' : 'INSCRIPTO')
      : 'BAJA';

    const updatedVols = volunteers.map(v => {
      if (v.dni === volunteer.dni) {
        return {
          ...v,
          assigned_space_id: null,
          assignment_score: null,
          proximity_tier: null,
          distance_km: null,
          status: nextStatus
        };
      }
      return v;
    });

    setVolunteers(updatedVols);
    await saveLndlmAssignments(meetingId, updatedVols);
    showToast(
      isCurrentlyBaja
        ? `Voluntario ${volunteer.first_name} ${volunteer.last_name} reactivado.`
        : `Voluntario ${volunteer.first_name} ${volunteer.last_name} dado de BAJA.`,
      'info'
    );
  };

  // Lista de suplentes sugeridos para el modal activo
  const suggestedSubstitutes = useMemo(() => {
    if (!substituteModal?.space) return [];
    const list = getSuggestedSubstitutesForSpace(substituteModal.space, volunteers);
    if (!substituteModal.search?.trim()) return list;
    const q = substituteModal.search
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return list.filter(v =>
      `${v.first_name} ${v.last_name} ${v.dni} ${v.neighborhood} comuna ${v.comuna}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .includes(q)
    );
  }, [substituteModal, volunteers]);

  const renderAffinityBadge = (tierKey, score, distanceKm) => {
    const meta = PROXIMITY_TIER_META[tierKey] || PROXIMITY_TIER_META.RESTO_CABA;
    const isManual = tierKey === 'MANUAL';
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.3rem',
          padding: '0.2rem 0.55rem',
          borderRadius: '999px',
          fontSize: '0.73rem',
          fontWeight: 700,
          backgroundColor: meta.bgColor,
          color: meta.color,
          border: `1px solid ${meta.borderColor}`,
          whiteSpace: 'nowrap'
        }}
        title={
          isManual
            ? 'Asignación manual / excepción de cupo (blindado)'
            : `Score de cercanía: ${score || meta.score} pts${distanceKm != null ? ` • Distancia aprox: ${distanceKm} km` : ''}`
        }
      >
        <span>{meta.icon}</span>
        <span>{meta.label}</span>
        {!isManual && <span style={{ opacity: 0.8, fontWeight: 600 }}>({score || meta.score})</span>}
        {distanceKm != null && distanceKm > 0 && (
          <span style={{ opacity: 0.75, fontSize: '0.68rem' }}>• {distanceKm} km</span>
        )}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '3rem' }}>
      {/* Inputs ocultos para importación de Excels */}
      <input
        type="file"
        ref={spacesFileInputRef}
        onChange={handleImportSpacesFile}
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
      />
      <input
        type="file"
        ref={volunteersFileInputRef}
        onChange={handleImportVolunteersFile}
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
      />

      {/* CABECERA PRINCIPAL DEL MÓDULO LNDLM */}
      <div
        className="card"
        style={{
          padding: '1.35rem 1.5rem',
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #1E1B4B 100%)',
          color: 'white',
          border: 'none',
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.25)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {onBack && (
                <button
                  onClick={onBack}
                  className="btn"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.2)',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.82rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <ArrowLeft size={15} /> Volver a Reuniones
                </button>
              )}
              <span
                style={{
                  backgroundColor: '#F59E0B',
                  color: '#0F172A',
                  fontWeight: 800,
                  fontSize: '0.72rem',
                  padding: '0.2rem 0.65rem',
                  borderRadius: '999px',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase'
                }}
              >
                🏛️ LA NOCHE DE LOS MUSEOS 2026
              </span>
              <span style={{ fontSize: '0.82rem', color: '#94A3B8' }}>
                Reunión vinculada: <strong style={{ color: '#E2E8F0' }}>{reunion?.nombre || 'Capacitación LNDLM'}</strong>
                {reunion?.fecha ? ` (${reunion.fecha})` : ''}
              </span>
            </div>

            <h1 style={{ margin: '0.2rem 0 0 0', fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'white' }}>
              Tablero de Asignación de Voluntarios a Espacios Culturales
            </h1>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#CBD5E1', maxWidth: '820px' }}>
              Motor geográfico de 4 pasadas (Mismo Barrio → Misma Comuna → Comuna Limítrofe → Menor Distancia por Centroide) sobre los voluntarios acreditados con <code style={{ color: '#FDE68A' }}>asistio = true</code>.
            </p>
          </div>

          {/* BOTONERA DE ACCIONES OPERATIVAS */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
            <button
              onClick={() => spacesFileInputRef.current?.click()}
              disabled={processing}
              className="btn"
              style={{
                backgroundColor: 'rgba(255,255,255,0.1)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.25)',
                padding: '0.55rem 0.9rem',
                fontSize: '0.83rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem'
              }}
              title="Importar Excel de los ~166 Espacios Culturales (Domicilios espacios culturales.xlsx / Datos1)"
            >
              <Building2 size={16} color="#38BDF8" />
              Importar Espacios ({spaces.length})
            </button>

            <button
              onClick={() => volunteersFileInputRef.current?.click()}
              disabled={processing}
              className="btn"
              style={{
                backgroundColor: 'rgba(255,255,255,0.1)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.25)',
                padding: '0.55rem 0.9rem',
                fontSize: '0.83rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem'
              }}
              title="Importar Excel de Voluntarios Confirmados a la Capacitación (~1001 inscriptos)"
            >
              <Upload size={16} color="#A78BFA" />
              Importar Voluntarios ({volunteers.length})
            </button>

            <button
              onClick={() => handleRunAutomaticAssignment(false)}
              disabled={processing || loading}
              className="btn"
              style={{
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                color: '#0F172A',
                border: 'none',
                padding: '0.6rem 1.1rem',
                fontSize: '0.88rem',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)'
              }}
            >
              <Zap size={17} fill="#0F172A" />
              {processing ? 'Procesando...' : '⚡ Ejecutar Asignación por Cercanía'}
            </button>

            {summary.totalAssigned > 0 && summary.openVacancies > 0 && (
              <button
                onClick={() => handleRunAutomaticAssignment(true)}
                disabled={processing || loading}
                className="btn"
                style={{
                  backgroundColor: '#10B981',
                  color: 'white',
                  border: 'none',
                  padding: '0.55rem 0.85rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
                title="Mantiene las asignaciones actuales y rellena únicamente las vacantes libres con suplentes cercanos"
              >
                <Sparkles size={15} /> Cubrir Vacantes Libres
              </button>
            )}

            {onOpenComando && (
              <button
                onClick={onOpenComando}
                className="btn"
                style={{
                  backgroundColor: '#4F46E5',
                  color: 'white',
                  border: '1px solid #818CF8',
                  padding: '0.55rem 0.95rem',
                  fontSize: '0.83rem',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem'
                }}
                title="Mesa de control del evento: check-ins, nodrizas, rutas de viandas y mapa en vivo"
              >
                🛵 Logística en Vivo (Evento)
              </button>
            )}

            <button
              onClick={() => exportSpacesAssignmentExcel(volunteers, spaces)}
              disabled={processing || spaces.length === 0}
              className="btn"
              style={{
                backgroundColor: '#0284C7',
                color: 'white',
                border: '1px solid #0EA5E9',
                padding: '0.55rem 0.95rem',
                fontSize: '0.83rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem'
              }}
              title="Descargar Excel con el detalle de cada museo y sus voluntarios asignados en columnas horizontales"
            >
              <Download size={16} /> Descargar Asignación por Museo (XLSX)
            </button>

            <button
              onClick={() => exportMasterLndlmExcel(reunion, volunteers, spaces, summary)}
              disabled={processing || (volunteers.length === 0 && spaces.length === 0)}
              className="btn"
              style={{
                backgroundColor: '#059669',
                color: 'white',
                border: '1px solid #10B981',
                padding: '0.55rem 0.95rem',
                fontSize: '0.83rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem'
              }}
              title="Descargar Excel maestro con asignaciones para notificaciones del 11/11 y 12/11, estado por museo y banco de suplentes"
            >
              <Download size={16} /> Exportar Excel Maestro
            </button>
          </div>
        </div>
      </div>

      {/* BANNER DE NOTIFICACIÓN / FEEDBACK */}
      {statusMessage && (
        <div
          style={{
            padding: '0.85rem 1.2rem',
            borderRadius: '10px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            fontWeight: 600,
            fontSize: '0.9rem',
            backgroundColor:
              statusMessage.type === 'error'
                ? '#FEF2F2'
                : statusMessage.type === 'warning'
                ? '#FFFBEB'
                : statusMessage.type === 'info'
                ? '#EFF6FF'
                : '#ECFDF5',
            color:
              statusMessage.type === 'error'
                ? '#991B1B'
                : statusMessage.type === 'warning'
                ? '#92400E'
                : statusMessage.type === 'info'
                ? '#1E40AF'
                : '#065F46',
            border: `1px solid ${
              statusMessage.type === 'error'
                ? '#FECACA'
                : statusMessage.type === 'warning'
                ? '#FDE68A'
                : statusMessage.type === 'info'
                ? '#BFDBFE'
                : '#A7F3D0'
            }`
          }}
        >
          <span>{statusMessage.text}</span>
          <button
            onClick={() => setStatusMessage(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0.2rem' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 5 KPIs SUPERIORES */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem'
        }}
      >
        {/* KPI 1: Total Inscriptos */}
        <div className="card" style={{ padding: '1.1rem 1.25rem', borderLeft: '4px solid #6366F1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Total Inscriptos
            </span>
            <Users size={18} color="#6366F1" />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', marginTop: '0.25rem' }}>
            {summary.totalInscriptos}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '0.2rem' }}>
            Padrón cargado en la reunión
          </div>
        </div>

        {/* KPI 2: Presentes en Capacitación */}
        <div className="card" style={{ padding: '1.1rem 1.25rem', borderLeft: '4px solid #0EA5E9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Presentes en Capacitación
            </span>
            <UserCheck size={18} color="#0EA5E9" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0369A1' }}>
              {summary.totalPresentes}
            </span>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0284C7' }}>
              ({summary.totalInscriptos > 0 ? Math.round((summary.totalPresentes / summary.totalInscriptos) * 100) : 0}%)
            </span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '0.2rem' }}>
            Habilitados para asignar (<code style={{ fontSize: '0.74rem' }}>asistio = true</code>)
          </div>
        </div>

        {/* KPI 3: Espacios Cubiertos */}
        <div className="card" style={{ padding: '1.1rem 1.25rem', borderLeft: '4px solid #10B981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Espacios Cubiertos
            </span>
            <Building2 size={18} color="#10B981" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '1.85rem', fontWeight: 800, color: '#047857' }}>
              {summary.spacesCoveredFull}
            </span>
            <span style={{ fontSize: '1.1rem', fontWeight: 600, color: '#64748B' }}>
              / {summary.totalSpaces}
            </span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '0.2rem' }}>
            {summary.spacesPartial > 0 ? `${summary.spacesPartial} parciales • ` : ''}
            {summary.spacesEmpty} sin asignar
          </div>
        </div>

        {/* KPI 4: Vacantes Totales Cubiertas */}
        <div className="card" style={{ padding: '1.1rem 1.25rem', borderLeft: '4px solid #F59E0B' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Voluntarios Asignados
            </span>
            <Award size={18} color="#F59E0B" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '1.85rem', fontWeight: 800, color: '#B45309' }}>
              {summary.totalAssigned}
            </span>
            <span style={{ fontSize: '1.1rem', fontWeight: 600, color: '#64748B' }}>
              / {summary.totalQuotaRequired} cupos
            </span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '0.2rem' }}>
            {summary.openVacancies === 0 && summary.totalQuotaRequired > 0
              ? '¡100% de vacantes cubiertas!'
              : `${summary.openVacancies} vacantes abiertas`}
          </div>
        </div>

        {/* KPI 5: Suplentes Disponibles */}
        <div className="card" style={{ padding: '1.1rem 1.25rem', borderLeft: '4px solid #8B5CF6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Suplentes Disponibles
            </span>
            <Sparkles size={18} color="#8B5CF6" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '1.85rem', fontWeight: 800, color: '#6D28D9' }}>
              {summary.totalSubstitutes}
            </span>
            {summary.totalBajas > 0 && (
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#DC2626' }}>
                ({summary.totalBajas} bajas)
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '0.2rem' }}>
            Presentes en reserva listos para reemplazo
          </div>
        </div>
      </div>

      {/* RESUMEN DE EFECTIVIDAD GEOGRÁFICA (Se muestra cuando hay voluntarios asignados) */}
      {summary.totalAssigned > 0 && (
        <div
          className="card"
          style={{
            padding: '1rem 1.35rem',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MapPin size={18} color="#0F172A" />
              <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0F172A' }}>
                Efectividad del Motor de Cercanía Geográfica:
              </span>
              <span
                style={{
                  backgroundColor: '#DCFCE7',
                  color: '#166534',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  padding: '0.15rem 0.6rem',
                  borderRadius: '999px'
                }}
              >
                {summary.pctBarrioOComuna}% en su mismo barrio o comuna • {summary.pctLimitrofe}% en comuna vecina
              </span>
            </div>
            <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>
              Distancia lineal promedio: <strong>{summary.avgDistanceKm} km</strong>
            </span>
          </div>

          {/* Barra de distribución y desglose de las 4 pasadas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
            <div
              style={{
                padding: '0.6rem 0.85rem',
                borderRadius: '8px',
                backgroundColor: '#D1FAE5',
                border: '1px solid #6EE7B7',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#065F46' }}>🟢 Pasada 1: Mismo Barrio</div>
                <div style={{ fontSize: '0.7rem', color: '#047857' }}>Coincidencia exacta (Score 100)</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#065F46' }}>{summary.tierCounts.MISMO_BARRIO}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#047857' }}>{summary.pctMismoBarrio}%</div>
              </div>
            </div>

            <div
              style={{
                padding: '0.6rem 0.85rem',
                borderRadius: '8px',
                backgroundColor: '#DBEAFE',
                border: '1px solid #93C5FD',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1E40AF' }}>🔵 Pasada 2: Misma Comuna</div>
                <div style={{ fontSize: '0.7rem', color: '#1D4ED8' }}>Misma Comuna CABA (Score 80)</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1E40AF' }}>{summary.tierCounts.MISMA_COMUNA}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1D4ED8' }}>{summary.pctMismaComuna}%</div>
              </div>
            </div>

            <div
              style={{
                padding: '0.6rem 0.85rem',
                borderRadius: '8px',
                backgroundColor: '#EDE9FE',
                border: '1px solid #C4B5FD',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6D28D9' }}>🟣 Pasada 3: Limítrofe</div>
                <div style={{ fontSize: '0.7rem', color: '#5B21B6' }}>Barrio / Comuna Vecina (Score 60)</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#6D28D9' }}>{summary.tierCounts.COMUNA_LIMITROFE}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#5B21B6' }}>{summary.pctLimitrofe}%</div>
              </div>
            </div>

            <div
              style={{
                padding: '0.6rem 0.85rem',
                borderRadius: '8px',
                backgroundColor: '#FFEDD5',
                border: '1px solid #FDBA74',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#9A3412' }}>🟠 Pasada 4: Resto CABA</div>
                <div style={{ fontSize: '0.7rem', color: '#C2410C' }}>Menor distancia lineal (Score 40)</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#9A3412' }}>{summary.tierCounts.RESTO_CABA}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#C2410C' }}>{summary.pctResto}%</div>
              </div>
            </div>

            {summary.manualCount > 0 && (
              <div
                style={{
                  padding: '0.6rem 0.85rem',
                  borderRadius: '8px',
                  backgroundColor: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569' }}>✋ Manual / Excepción</div>
                  <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Fijado manual (Excluido de cálculo)</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#334155' }}>{summary.manualCount}</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>Fijados</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NAVEGACIÓN DE PESTAÑAS INTERNAS DEL MÓDULO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '2px solid #E2E8F0', paddingBottom: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('spaces')}
            className="btn"
            style={{
              backgroundColor: activeTab === 'spaces' ? '#0F172A' : '#F1F5F9',
              color: activeTab === 'spaces' ? 'white' : '#475569',
              fontWeight: 700,
              padding: '0.6rem 1.15rem',
              borderRadius: '8px',
              border: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Building2 size={17} />
            🏛️ Tablero de Espacios Culturales y Reasignación ({spaces.length})
          </button>

          <button
            onClick={() => setActiveTab('volunteers')}
            className="btn"
            style={{
              backgroundColor: activeTab === 'volunteers' ? '#0F172A' : '#F1F5F9',
              color: activeTab === 'volunteers' ? 'white' : '#475569',
              fontWeight: 700,
              padding: '0.6rem 1.15rem',
              borderRadius: '8px',
              border: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Users size={17} />
            👥 Nómina de Voluntarios y Banco de Suplentes ({volunteers.length})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => downloadTemplateLndlm('spaces')}
            className="btn btn-outline"
            style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }}
            title="Descargar plantilla Excel de ejemplo para los 166 Espacios Culturales"
          >
            <FileSpreadsheet size={14} style={{ marginRight: '0.3rem' }} /> Plantilla Espacios
          </button>
          <button
            onClick={() => downloadTemplateLndlm('volunteers')}
            className="btn btn-outline"
            style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }}
            title="Descargar plantilla Excel de ejemplo para Confirmados Capacitación LNDLM"
          >
            <FileSpreadsheet size={14} style={{ marginRight: '0.3rem' }} /> Plantilla Voluntarios
          </button>
          <button
            onClick={fetchAllData}
            className="btn btn-outline"
            style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }}
            title="Sincronizar con la base de datos"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ============================================================================
          PESTAÑA 1: TABLERO DE ESPACIOS CULTURALES Y REASIGNACIÓN MANUAL
         ============================================================================ */}
      {activeTab === 'spaces' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Barra de Filtros de Espacios Culturales */}
          <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center', flex: '1 1 650px' }}>
              <div style={{ position: 'relative', flex: '1 1 250px', minWidth: '220px' }}>
                <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Buscar espacio cultural, dirección, barrio, referente o voluntario..."
                  value={spaceSearch}
                  onChange={e => setSpaceSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <select
                value={spaceComunaFilter}
                onChange={e => setSpaceComunaFilter(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.84rem', backgroundColor: 'white' }}
              >
                <option value="TODAS">Todas las Comunas (1-15)</option>
                {Array.from({ length: 15 }, (_, i) => i + 1).map(c => (
                  <option key={c} value={c}>Comuna {c}</option>
                ))}
              </select>

              <select
                value={spaceBarrioFilter}
                onChange={e => setSpaceBarrioFilter(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.84rem', backgroundColor: 'white' }}
              >
                <option value="TODOS">Todos los Barrios (48)</option>
                {SORTED_BARRIOS_KEYS.map(bKey => (
                  <option key={bKey} value={bKey}>
                    {BARRIOS_CABA_DATA[bKey].display} (C{BARRIOS_CABA_DATA[bKey].comuna})
                  </option>
                ))}
              </select>

              <select
                value={spaceStatusFilter}
                onChange={e => setSpaceStatusFilter(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.84rem', backgroundColor: 'white' }}
              >
                <option value="TODOS">Estado de Cupo: Todos</option>
                <option value="COMPLETO">✅ Cupo Completo ({summary.spacesCoveredFull})</option>
                <option value="INCOMPLETO">⚠️ Cupo Incompleto ({summary.spacesPartial + summary.spacesEmpty})</option>
                <option value="VACIO">⭕ Sin Asignar ({summary.spacesEmpty})</option>
              </select>

              <select
                value={spaceTierFilter}
                onChange={e => setSpaceTierFilter(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.84rem', backgroundColor: 'white' }}
              >
                <option value="TODOS">Nivel Cercanía: Todos</option>
                <option value="MANUAL">✋ Manual / Excepción</option>
                <option value="MISMO_BARRIO">🟢 Mismo Barrio (100)</option>
                <option value="MISMA_COMUNA">🔵 Misma Comuna (80)</option>
                <option value="COMUNA_LIMITROFE">🟣 Comuna Limítrofe (60)</option>
                <option value="RESTO_CABA">🟠 Resto CABA (40)</option>
              </select>
            </div>

            <button
              onClick={() =>
                setSpaceFormModal({
                  mode: 'create',
                  data: {
                    name: '',
                    address: '',
                    neighborhood: 'SAN NICOLAS',
                    comuna: 1,
                    contact_name: '',
                    contact_phone: '',
                    contact_email: '',
                    quota_required: 2
                  }
                })
              }
              className="btn btn-primary"
              style={{ padding: '0.5rem 0.9rem', fontSize: '0.83rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Plus size={16} /> Agregar Espacio
            </button>
          </div>

          {/* Estado vacío si aún no se importaron los espacios culturales */}
          {spaces.length === 0 ? (
            <div className="card" style={{ padding: '3rem 2rem', textAlign: 'center', backgroundColor: '#F8FAFC', border: '2px dashed #CBD5E1' }}>
              <Building2 size={46} color="#64748B" style={{ margin: '0 auto 0.75rem auto' }} />
              <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '1.2rem', color: '#0F172A' }}>
                Aún no se han cargado los Espacios Culturales de LNDLM
              </h3>
              <p style={{ margin: '0 auto 1.25rem auto', maxWidth: '580px', fontSize: '0.9rem', color: '#64748B' }}>
                Importá el archivo Excel de las <strong>~166 sedes culturales</strong> (<code>Domicilios espacios culturales.xlsx</code> / hoja <code>Datos1</code>) con sus direcciones, barrios, comunas, referentes y cupos requeridos.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => spacesFileInputRef.current?.click()}
                  className="btn btn-primary"
                  style={{ padding: '0.65rem 1.25rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                >
                  <Upload size={17} /> Importar Excel de Espacios Culturales
                </button>
                <button
                  onClick={() => downloadTemplateLndlm('spaces')}
                  className="btn btn-outline"
                  style={{ padding: '0.65rem 1.1rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                >
                  <FileSpreadsheet size={17} /> Descargar Plantilla Ejemplo
                </button>
              </div>
            </div>
          ) : filteredSpaces.length === 0 ? (
            <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>
              No se encontraron espacios culturales que coincidan con los filtros seleccionados.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>
                Mostrando <strong>{filteredSpaces.length}</strong> de <strong>{spaces.length}</strong> espacios culturales
              </div>

              {filteredSpaces.map((sp) => {
                const assignedList = assignedBySpaceMap[sp.id] || [];
                const reqQuota = Math.max(0, Number(sp.quota_required ?? 2));
                const isExceeded = assignedList.length > reqQuota;
                const isFull = assignedList.length === reqQuota && reqQuota > 0;
                const openSlotsCount = Math.max(0, reqQuota - assignedList.length);

                return (
                  <div
                    key={sp.id}
                    className="card"
                    style={{
                      padding: '1.15rem 1.35rem',
                      borderLeft: `5px solid ${isExceeded ? '#EF4444' : isFull ? '#10B981' : assignedList.length > 0 ? '#F59E0B' : '#94A3B8'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.9rem'
                    }}
                  >
                    {/* Cabecera de la Sede Cultural */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              backgroundColor: '#E0F2FE',
                              color: '#0369A1',
                              fontWeight: 800,
                              fontSize: '0.73rem',
                              padding: '0.18rem 0.55rem',
                              borderRadius: '6px'
                            }}
                          >
                            COMUNA {sp.comuna}
                          </span>
                          <span
                            style={{
                              backgroundColor: '#F1F5F9',
                              color: '#0F172A',
                              fontWeight: 800,
                              fontSize: '0.73rem',
                              padding: '0.18rem 0.6rem',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1'
                            }}
                          >
                            📍 {sp.neighborhood}
                          </span>
                          <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#0F172A' }}>
                            {sp.name}
                          </h3>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.82rem', color: '#475569', alignItems: 'center' }}>
                          <span>🏛️ <strong>Dirección:</strong> {sp.address || 'Sin especificar'}</span>
                          {(sp.contact_name || sp.contact_phone || sp.contact_email) && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', color: '#334155', backgroundColor: '#F8FAFC', padding: '0.15rem 0.55rem', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                              <strong>Referente:</strong> {sp.contact_name || '-'}
                              {sp.contact_phone && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                  <Phone size={12} /> {sp.contact_phone}
                                </span>
                              )}
                              {sp.contact_email && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                  <Mail size={12} /> {sp.contact_email}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Control de Cupo Requerido y Estado de Cobertura */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            backgroundColor: '#F8FAFC',
                            padding: '0.25rem 0.55rem',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                            fontSize: '0.78rem'
                          }}
                          title="Modificar cupo requerido de voluntarios en este espacio cultural"
                        >
                          <span style={{ color: '#64748B', fontWeight: 600 }}>Cupo req:</span>
                          <input
                            type="number"
                            min="0"
                            max="50"
                            value={reqQuota}
                            onChange={e => handleUpdateSpaceQuota(sp.id, e.target.value)}
                            style={{
                              width: '48px',
                              padding: '0.15rem 0.3rem',
                              borderRadius: '5px',
                              border: '1px solid #CBD5E1',
                              textAlign: 'center',
                              fontWeight: 700,
                              fontSize: '0.82rem'
                            }}
                          />
                        </div>

                        <span
                          style={{
                            padding: '0.3rem 0.7rem',
                            borderRadius: '999px',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            backgroundColor: isExceeded
                              ? '#FEE2E2'
                              : isFull
                              ? '#D1FAE5'
                              : assignedList.length > 0
                              ? '#FEF3C7'
                              : '#F1F5F9',
                            color: isExceeded
                              ? '#B91C1C'
                              : isFull
                              ? '#065F46'
                              : assignedList.length > 0
                              ? '#92400E'
                              : '#475569',
                            border: isExceeded ? '1px solid #FCA5A5' : 'none'
                          }}
                        >
                          {isExceeded
                            ? `⚠️ CUPO EXCEDIDO (${assignedList.length}/${reqQuota})`
                            : isFull
                            ? `✅ COMPLETO (${assignedList.length}/${reqQuota})`
                            : `⚠️ ${assignedList.length}/${reqQuota} ASIGNADOS`}
                        </span>

                        <button
                          onClick={() => setReasignarModal({ mode: 'assign-to-space', space: sp })}
                          className="btn"
                          style={{
                            padding: '0.3rem 0.65rem',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            backgroundColor: '#EFF6FF',
                            color: '#1D4ED8',
                            border: '1px solid #BFDBFE'
                          }}
                          title="Buscar en toda la nómina de presentes para asignar o transferir a esta sede"
                        >
                          <UserPlus size={14} /> + Asignar Específico
                        </button>

                        <button
                          onClick={() =>
                            setSubstituteModal({
                              space: sp,
                              replacingVolunteer: null,
                              markReplacedAs: 'BAJA',
                              search: ''
                            })
                          }
                          className="btn btn-outline"
                          style={{ padding: '0.3rem 0.65rem', fontSize: '0.76rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                          title="Asignar rápidamente un voluntario suplente cercano a este espacio"
                        >
                          <Users size={14} /> + Suplente
                        </button>

                        <button
                          onClick={() =>
                            setSpaceFormModal({
                              mode: 'edit',
                              data: { ...sp }
                            })
                          }
                          className="btn btn-outline"
                          style={{ padding: '0.3rem 0.5rem' }}
                          title="Editar datos del espacio cultural"
                        >
                          <Edit3 size={14} />
                        </button>

                        <button
                          onClick={() => handleDeleteSpace(sp)}
                          className="btn btn-outline"
                          style={{ padding: '0.3rem 0.5rem', color: '#DC2626', borderColor: '#FECACA' }}
                          title="Eliminar espacio cultural"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Grilla de Voluntarios Asignados + Vacantes Abiertas */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                        gap: '0.65rem'
                      }}
                    >
                      {assignedList.map((vol) => (
                        <div
                          key={vol.dni}
                          style={{
                            padding: '0.75rem 0.9rem',
                            borderRadius: '10px',
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '0.55rem'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0F172A' }}>
                                {vol.first_name} {vol.last_name}
                              </div>
                              <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '0.1rem' }}>
                                DNI: <strong>{vol.dni}</strong>
                                {vol.cuil ? ` • CUIL: ${vol.cuil}` : ''}
                              </div>
                            </div>
                            {renderAffinityBadge(vol.proximity_tier, vol.assignment_score, vol.distance_km)}
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.76rem', color: '#334155', alignItems: 'center' }}>
                            <span style={{ backgroundColor: '#E2E8F0', padding: '0.12rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>
                              Vive en: {vol.neighborhood || 'S/B'} {vol.comuna ? `(C${vol.comuna})` : ''}
                            </span>
                            {vol.phone && <span>📱 {vol.phone}</span>}
                            {vol.email && <span style={{ color: '#64748B' }}>✉️ {vol.email}</span>}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', borderTop: '1px solid #E2E8F0', paddingTop: '0.45rem', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => setReasignarModal({ mode: 'move-volunteer', volunteer: vol })}
                              className="btn"
                              style={{
                                backgroundColor: '#FEF3C7',
                                color: '#92400E',
                                border: '1px solid #FDE68A',
                                padding: '0.25rem 0.6rem',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem'
                              }}
                              title="Mover o transferir este voluntario a cualquier otra de las 166 sedes"
                            >
                              <ArrowRightLeft size={12} /> Mover de Sede
                            </button>

                            <button
                              onClick={() =>
                                setSubstituteModal({
                                  space: sp,
                                  replacingVolunteer: vol,
                                  markReplacedAs: 'BAJA',
                                  search: ''
                                })
                              }
                              className="btn"
                              style={{
                                backgroundColor: '#EFF6FF',
                                color: '#1D4ED8',
                                border: '1px solid #BFDBFE',
                                padding: '0.25rem 0.6rem',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem'
                              }}
                              title="Reemplazar por un suplente cercano sugerido automáticamente"
                            >
                              <RefreshCw size={12} /> Reemplazar por Suplente
                            </button>

                            <button
                              onClick={() => handleRemoveVolunteerFromSpace(vol, 'SUPLENTE', false)}
                              className="btn"
                              style={{
                                backgroundColor: '#F1F5F9',
                                color: '#475569',
                                border: '1px solid #CBD5E1',
                                padding: '0.25rem 0.55rem',
                                fontSize: '0.73rem',
                                fontWeight: 600
                              }}
                              title="Quitar de este museo y devolver al banco de suplentes"
                            >
                              A Suplente
                            </button>

                            <button
                              onClick={() => handleRemoveVolunteerFromSpace(vol, 'BAJA', false)}
                              className="btn"
                              style={{
                                backgroundColor: '#FEF2F2',
                                color: '#DC2626',
                                border: '1px solid #FECACA',
                                padding: '0.25rem 0.55rem',
                                fontSize: '0.73rem',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                              title="Dar de baja al voluntario y liberar la vacante"
                            >
                              <UserMinus size={12} /> Baja
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Slots de Vacantes Abiertas */}
                      {Array.from({ length: openSlotsCount }).map((_, idx) => (
                        <div
                          key={`empty-${sp.id}-${idx}`}
                          style={{
                            padding: '0.75rem 0.9rem',
                            borderRadius: '10px',
                            backgroundColor: '#FFFBEB',
                            border: '1px dashed #F59E0B',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem'
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#92400E' }}>
                              Vacante Abierta #{assignedList.length + idx + 1}
                            </div>
                            <div style={{ fontSize: '0.73rem', color: '#B45309' }}>
                              Requiere cubrir cupo en {sp.neighborhood} (C{sp.comuna})
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              setSubstituteModal({
                                space: sp,
                                replacingVolunteer: null,
                                markReplacedAs: 'BAJA',
                                search: ''
                              })
                            }
                            className="btn"
                            style={{
                              backgroundColor: '#F59E0B',
                              color: '#0F172A',
                              border: 'none',
                              padding: '0.35rem 0.7rem',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            <UserPlus size={13} /> Sugerir Suplente Cercano
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================================
          PESTAÑA 2: NÓMINA DE VOLUNTARIOS Y BANCO DE SUPLENTES
         ============================================================================ */}
      {activeTab === 'volunteers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Filtros y Acciones Masivas de Voluntarios */}
          <div className="card" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', flex: '1 1 620px' }}>
                <div style={{ position: 'relative', flex: '1 1 250px', minWidth: '210px' }}>
                  <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    placeholder="Buscar voluntario por nombre, DNI, CUIL, barrio o museo..."
                    value={volSearch}
                    onChange={e => setVolSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>

                <select
                  value={volStatusFilter}
                  onChange={e => setVolStatusFilter(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.84rem', backgroundColor: 'white' }}
                >
                  <option value="TODOS">Todos los Voluntarios ({volunteers.length})</option>
                  <option value="ASIGNADO">✅ Asignados a Museo ({summary.totalAssigned})</option>
                  <option value="SUPLENTE">🛡️ Banco de Suplentes ({summary.totalSubstitutes})</option>
                  <option value="PRESENTE">🙋 Presentes en Capacitación ({summary.totalPresentes})</option>
                  <option value="INSCRIPTO">📋 Inscriptos Ausentes ({summary.totalInscriptos - summary.totalPresentes})</option>
                  <option value="BAJA">🚫 Dados de Baja ({summary.totalBajas})</option>
                </select>

                <select
                  value={volComunaFilter}
                  onChange={e => setVolComunaFilter(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.84rem', backgroundColor: 'white' }}
                >
                  <option value="TODAS">Todas las Comunas</option>
                  {Array.from({ length: 15 }, (_, i) => i + 1).map(c => (
                    <option key={c} value={c}>Comuna {c}</option>
                  ))}
                </select>

                <select
                  value={volBarrioFilter}
                  onChange={e => setVolBarrioFilter(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.84rem', backgroundColor: 'white' }}
                >
                  <option value="TODOS">Todos los Barrios</option>
                  {SORTED_BARRIOS_KEYS.map(bKey => (
                    <option key={bKey} value={bKey}>
                      {BARRIOS_CABA_DATA[bKey].display} (C{BARRIOS_CABA_DATA[bKey].comuna})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleBulkMarkAttendance('ALL_FILTERED')}
                  disabled={processing || filteredVolunteers.length === 0}
                  className="btn btn-outline"
                  style={{ padding: '0.45rem 0.8rem', fontSize: '0.78rem', fontWeight: 700, color: '#0369A1', borderColor: '#7DD3FC' }}
                  title="Marca como presentes (asistio = true) a todos los voluntarios actualmente filtrados"
                >
                  ✅ Marcar Filtrados como Presentes ({filteredVolunteers.length})
                </button>
              </div>
            </div>
          </div>

          {/* Tabla de Voluntarios */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Asistió (Check-in)</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Voluntario</th>
                    <th style={{ padding: '0.75rem 1rem' }}>DNI / CUIL</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Barrio y Comuna (Normalizado)</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Contacto / Canal</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Estado LNDLM</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Espacio Cultural Asignado</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedVolunteers.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: '#64748B' }}>
                        No hay voluntarios que coincidan con la búsqueda. Podés importar el padrón desde el botón <strong>"Importar Voluntarios"</strong>.
                      </td>
                    </tr>
                  ) : (
                    paginatedVolunteers.map(v => {
                      const assignedSpace = v.assigned_space_id ? spacesByIdMap[v.assigned_space_id] : null;
                      return (
                        <tr key={v.dni} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: v.status === 'BAJA' ? '#FEF2F2' : 'white' }}>
                          <td style={{ padding: '0.65rem 1rem' }}>
                            <button
                              onClick={() => handleToggleVolunteerAttendance(v)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.25rem 0.6rem',
                                borderRadius: '999px',
                                border: '1px solid',
                                borderColor: v.attended_training ? '#6EE7B7' : '#CBD5E1',
                                backgroundColor: v.attended_training ? '#D1FAE5' : '#F1F5F9',
                                color: v.attended_training ? '#065F46' : '#64748B',
                                fontWeight: 700,
                                fontSize: '0.74rem',
                                cursor: 'pointer'
                              }}
                            >
                              {v.attended_training ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                              {v.attended_training ? 'PRESENTE' : 'AUSENTE'}
                            </button>
                          </td>

                          <td style={{ padding: '0.65rem 1rem' }}>
                            <div style={{ fontWeight: 700, color: '#0F172A' }}>
                              {v.first_name} {v.last_name}
                            </div>
                            {v.birth_date && (
                              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Nac: {v.birth_date}</div>
                            )}
                          </td>

                          <td style={{ padding: '0.65rem 1rem' }}>
                            <div style={{ fontWeight: 700, color: '#334155' }}>{v.dni}</div>
                            {v.cuil && <div style={{ fontSize: '0.72rem', color: '#64748B' }}>CUIL: {v.cuil}</div>}
                          </td>

                          <td style={{ padding: '0.65rem 1rem' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                backgroundColor: '#F1F5F9',
                                color: '#0F172A',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1'
                              }}
                            >
                              {v.neighborhood || 'SIN BARRIO'}
                            </span>
                            {v.comuna && (
                              <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', fontWeight: 700, color: '#0369A1' }}>
                                Comuna {v.comuna}
                              </span>
                            )}
                          </td>

                          <td style={{ padding: '0.65rem 1rem', fontSize: '0.76rem', color: '#475569' }}>
                            {v.phone && <div>📱 {v.phone}</div>}
                            {v.email && <div>✉️ {v.email}</div>}
                            {v.channel && <div style={{ color: '#94A3B8' }}>Canal: {v.channel}</div>}
                          </td>

                          <td style={{ padding: '0.65rem 1rem' }}>
                            <span
                              style={{
                                padding: '0.2rem 0.55rem',
                                borderRadius: '999px',
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                backgroundColor:
                                  v.status === 'ASIGNADO'
                                    ? '#DCFCE7'
                                    : v.status === 'SUPLENTE'
                                    ? '#EDE9FE'
                                    : v.status === 'BAJA'
                                    ? '#FEE2E2'
                                    : v.attended_training
                                    ? '#E0F2FE'
                                    : '#F1F5F9',
                                color:
                                  v.status === 'ASIGNADO'
                                    ? '#166534'
                                    : v.status === 'SUPLENTE'
                                    ? '#5B21B6'
                                    : v.status === 'BAJA'
                                    ? '#991B1B'
                                    : v.attended_training
                                    ? '#0369A1'
                                    : '#64748B'
                              }}
                            >
                              {v.status || 'INSCRIPTO'}
                            </span>
                          </td>

                          <td style={{ padding: '0.65rem 1rem' }}>
                            {assignedSpace ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.8rem' }}>
                                  🏛️ {assignedSpace.name}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                    {assignedSpace.neighborhood} (C{assignedSpace.comuna})
                                  </span>
                                  {renderAffinityBadge(v.proximity_tier, v.assignment_score, v.distance_km)}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>Sin espacio asignado</span>
                            )}
                          </td>

                          <td style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                              {v.status !== 'BAJA' && spaces.length > 0 && (
                                <button
                                  onClick={() => setReasignarModal({ mode: 'move-volunteer', volunteer: v })}
                                  className="btn btn-outline"
                                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.73rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                  title="Asignar o mover espacio cultural manualmente con control de cupo"
                                >
                                  <ArrowRightLeft size={12} /> {v.assigned_space_id ? 'Mover Sede' : 'Asignar Sede'}
                                </button>
                              )}
                              <button
                                onClick={() => handleToggleVolunteerBaja(v)}
                                className="btn btn-outline"
                                style={{
                                  padding: '0.25rem 0.55rem',
                                  fontSize: '0.73rem',
                                  color: v.status === 'BAJA' ? '#059669' : '#DC2626',
                                  borderColor: v.status === 'BAJA' ? '#A7F3D0' : '#FECACA'
                                }}
                              >
                                {v.status === 'BAJA' ? 'Reactivar' : 'Dar Baja'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginación de Voluntarios */}
            {totalVolPages > 1 && (
              <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                  Página <strong>{volPage}</strong> de <strong>{totalVolPages}</strong> ({filteredVolunteers.length} voluntarios)
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    disabled={volPage <= 1}
                    onClick={() => setVolPage(p => Math.max(1, p - 1))}
                    className="btn btn-outline"
                    style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
                  >
                    Anterior
                  </button>
                  <button
                    disabled={volPage >= totalVolPages}
                    onClick={() => setVolPage(p => Math.min(totalVolPages, p + 1))}
                    className="btn btn-outline"
                    style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================================
          MODAL 1: REEMPLAZO / SUGERENCIA AUTOMÁTICA DE SUPLENTES CERCANOS
         ============================================================================ */}
      {substituteModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '780px',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)'
            }}
          >
            <div style={{ padding: '1.15rem 1.4rem', backgroundColor: '#0F172A', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#F59E0B', fontWeight: 800, textTransform: 'uppercase' }}>
                  SUGERENCIA INTELIGENTE POR CERCANÍA GEOGRÁFICA
                </div>
                <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.15rem', color: 'white' }}>
                  🏛️ {substituteModal.space.name} ({substituteModal.space.neighborhood} - Comuna {substituteModal.space.comuna})
                </h3>
              </div>
              <button
                onClick={() => setSubstituteModal(null)}
                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {substituteModal.replacingVolunteer && (
              <div style={{ padding: '0.85rem 1.4rem', backgroundColor: '#FFFBEB', borderBottom: '1px solid #FDE68A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ fontSize: '0.84rem', color: '#92400E' }}>
                  Reemplazando a: <strong>{substituteModal.replacingVolunteer.first_name} {substituteModal.replacingVolunteer.last_name}</strong> (DNI {substituteModal.replacingVolunteer.dni})
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <span style={{ color: '#78350F', fontWeight: 600 }}>Al reemplazarlo, marcar como:</span>
                  <select
                    value={substituteModal.markReplacedAs}
                    onChange={e => setSubstituteModal(prev => ({ ...prev, markReplacedAs: e.target.value }))}
                    style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #F59E0B', fontWeight: 700, fontSize: '0.78rem' }}
                  >
                    <option value="BAJA">🚫 BAJA (No participa)</option>
                    <option value="SUPLENTE">🛡️ SUPLENTE (Disponible para otra sede)</option>
                  </select>
                </div>
              </div>
            )}

            <div style={{ padding: '0.9rem 1.4rem', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
              <input
                type="text"
                placeholder="Filtrar suplentes disponibles por nombre, DNI, barrio o comuna..."
                value={substituteModal.search}
                onChange={e => setSubstituteModal(prev => ({ ...prev, search: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            <div style={{ padding: '1rem 1.4rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {suggestedSubstitutes.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>
                  No hay suplentes disponibles en este momento (recordá que deben tener asistencia marcada <code>asistio = true</code>).
                </div>
              ) : (
                suggestedSubstitutes.slice(0, 60).map((sub) => (
                  <div
                    key={sub.dni}
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: '10px',
                      border: '1px solid #E2E8F0',
                      backgroundColor: 'white',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.75rem'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0F172A' }}>
                          {sub.first_name} {sub.last_name}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: '#64748B' }}>DNI {sub.dni}</span>
                        {renderAffinityBadge(sub.suggested_tier, sub.suggested_score, sub.suggested_distance_km)}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                        📍 Vive en: <strong>{sub.neighborhood || 'Sin barrio'}</strong> (Comuna {sub.comuna || '?'})
                        {sub.phone ? ` • 📱 ${sub.phone}` : ''}
                        {sub.email ? ` • ✉️ ${sub.email}` : ''}
                      </div>
                    </div>

                    <button
                      onClick={() => handleConfirmSubstituteAssignment(sub)}
                      className="btn btn-primary"
                      style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', fontWeight: 700 }}
                    >
                      {substituteModal.replacingVolunteer ? 'Seleccionar Reemplazo' : 'Asignar a esta Sede'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================
          MODAL 2: ALTA / EDICIÓN DE ESPACIO CULTURAL
         ============================================================================ */}
      {spaceFormModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <form
            onSubmit={handleSaveSpaceForm}
            className="card"
            style={{ width: '100%', maxWidth: '560px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0F172A' }}>
                {spaceFormModal.mode === 'edit' ? '✏️ Editar Espacio Cultural' : '🏛️ Nuevo Espacio Cultural'}
              </h3>
              <button type="button" onClick={() => setSpaceFormModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>Nombre del Espacio Cultural *</label>
                <input
                  type="text"
                  required
                  value={spaceFormModal.data.name}
                  onChange={e => setSpaceFormModal(prev => ({ ...prev, data: { ...prev.data, name: e.target.value } }))}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>Dirección</label>
                <input
                  type="text"
                  value={spaceFormModal.data.address}
                  onChange={e => setSpaceFormModal(prev => ({ ...prev, data: { ...prev.data, address: e.target.value } }))}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>Barrio CABA (Normalizado)</label>
                <select
                  value={spaceFormModal.data.neighborhood}
                  onChange={e => {
                    const bKey = e.target.value;
                    const autoComuna = BARRIOS_CABA_DATA[bKey]?.comuna || spaceFormModal.data.comuna;
                    setSpaceFormModal(prev => ({
                      ...prev,
                      data: { ...prev.data, neighborhood: bKey, comuna: autoComuna }
                    }));
                  }}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                >
                  {SORTED_BARRIOS_KEYS.map(bKey => (
                    <option key={bKey} value={bKey}>
                      {bKey} (Comuna {BARRIOS_CABA_DATA[bKey].comuna})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>Comuna (1-15) y Cupo</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    value={spaceFormModal.data.comuna}
                    onChange={e => setSpaceFormModal(prev => ({ ...prev, data: { ...prev.data, comuna: Number(e.target.value) } }))}
                    style={{ width: '50%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                    title="Comuna"
                  />
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={spaceFormModal.data.quota_required}
                    onChange={e => setSpaceFormModal(prev => ({ ...prev, data: { ...prev.data, quota_required: Number(e.target.value) } }))}
                    style={{ width: '50%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                    title="Cupo requerido"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>Nombre Referente</label>
                <input
                  type="text"
                  value={spaceFormModal.data.contact_name}
                  onChange={e => setSpaceFormModal(prev => ({ ...prev, data: { ...prev.data, contact_name: e.target.value } }))}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>Celular Referente</label>
                <input
                  type="text"
                  value={spaceFormModal.data.contact_phone}
                  onChange={e => setSpaceFormModal(prev => ({ ...prev, data: { ...prev.data, contact_phone: e.target.value } }))}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem' }}>Email Referente</label>
                <input
                  type="email"
                  value={spaceFormModal.data.contact_email}
                  onChange={e => setSpaceFormModal(prev => ({ ...prev, data: { ...prev.data, contact_email: e.target.value } }))}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setSpaceFormModal(null)} className="btn btn-outline">
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Guardar Espacio Cultural
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================================
          MODAL 3: ASIGNAR SEDE CULTURAL A UN VOLUNTARIO DESDE LA PESTAÑA DE PADRÓN
         ============================================================================ */}
      {manualSpaceModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: '720px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
          >
            <div style={{ padding: '1.1rem 1.4rem', backgroundColor: '#0F172A', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.74rem', color: '#38BDF8', fontWeight: 800 }}>ASIGNACIÓN MANUAL DE ESPACIO CULTURAL</div>
                <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.1rem', color: 'white' }}>
                  Voluntario: {manualSpaceModal.volunteer.first_name} {manualSpaceModal.volunteer.last_name} ({manualSpaceModal.volunteer.neighborhood || 'Sin Barrio'} - C{manualSpaceModal.volunteer.comuna || '?'})
                </h3>
              </div>
              <button onClick={() => setManualSpaceModal(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '0.85rem 1.4rem', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <input
                type="text"
                placeholder="Buscar espacio cultural por nombre, barrio o comuna..."
                value={manualSpaceModal.search}
                onChange={e => setManualSpaceModal(prev => ({ ...prev, search: e.target.value }))}
                style={{ width: '100%', padding: '0.5rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ padding: '1rem 1.4rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {spaces
                .map(sp => {
                  const aff = evaluateProximityAffinity(manualSpaceModal.volunteer, sp);
                  const currentCount = (assignedBySpaceMap[sp.id] || []).length;
                  return { sp, aff, currentCount };
                })
                .filter(({ sp }) => {
                  if (!manualSpaceModal.search?.trim()) return true;
                  const q = manualSpaceModal.search.trim().toLowerCase();
                  return `${sp.name} ${sp.neighborhood} comuna ${sp.comuna}`.toLowerCase().includes(q);
                })
                .sort((a, b) => b.aff.assignment_score - a.aff.assignment_score || a.aff.distance_km - b.aff.distance_km)
                .map(({ sp, aff, currentCount }) => (
                  <div
                    key={sp.id}
                    style={{
                      padding: '0.7rem 0.95rem',
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.9rem', color: '#0F172A' }}>{sp.name}</strong>
                        {renderAffinityBadge(aff.proximity_tier, aff.assignment_score, aff.distance_km)}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '0.15rem' }}>
                        📍 {sp.address} • <strong>{sp.neighborhood}</strong> (Comuna {sp.comuna}) • Cupo actual: <strong>{currentCount}/{sp.quota_required}</strong>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAssignVolunteerToSpaceManual(manualSpaceModal.volunteer, sp)}
                      className="btn btn-primary"
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 700 }}
                    >
                      Asignar aquí
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================
          MODAL 4: REASIGNACIÓN MANUAL ("A DEDO" / BUSCADOR UNIVERSAL Y TRANSFERENCIAS)
         ============================================================================ */}
      {reasignarModal && (
        <ReasignarVoluntarioModal
          mode={reasignarModal.mode}
          volunteer={reasignarModal.volunteer}
          space={reasignarModal.space}
          spaces={spaces}
          volunteers={volunteers}
          assignedCountBySpace={assignedBySpaceMap}
          spacesById={spacesByIdMap}
          onConfirm={handleConfirmManualAssignment}
          onClose={() => setReasignarModal(null)}
        />
      )}
    </div>
  );
}
