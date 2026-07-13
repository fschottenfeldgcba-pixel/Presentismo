import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Search, Plus, Check, Play, Square, Pause, Shield, Calendar, Users, ClipboardList, Mic, AlertTriangle, Clock } from 'lucide-react';
import { TIPOS_REUNION } from '../data/mockData';
import { 
  getAsistentesPorReunion, 
  guardarAsistencia, 
  upsertVecino, 
  updateReunion, 
  getOradores, 
  registrarOrador, 
  eliminarOrador, 
  updateOradorTema 
} from '../services/supabaseService';
import PreguntasTematicas from './PreguntasTematicas';
import Cronometro1a1 from './Cronometro1a1';
import { supabase } from '../lib/supabaseClient';

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

export default function ControlAsistencia({ reunion, onBack }) {
  const [activeTab, setActiveTab] = useState('asistencia'); // 'asistencia' | 'modulo_especial'
  const [asistencias, setAsistencias] = useState([]); // Usado principalmente en Uno a Uno
  const [searchQuery, setSearchQuery] = useState('');
  const [lastSearchTerm, setLastSearchTerm] = useState('');
  const searchInputRef = useRef(null);
  
  // Estados de carga y búsqueda
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchResults, setSearchResults] = useState([]); // [{ vecino, inscripcion, orador }]
  const [isSaving, setIsSaving] = useState(false);

  // Alerta crítica de oradores
  const [oradoresCount, setOradoresCount] = useState(0);
  const [presentesCount, setPresentesCount] = useState(0);
  const [editingTopics, setEditingTopics] = useState({}); // { vecinoDni: string }

  // Cronómetro del Funcionario (Auditoría General de Cercanía)
  const [reunionStatus, setReunionStatus] = useState('idle'); // 'idle' | 'running' | 'paused' | 'ended'
  const [meetingTimer, setMeetingTimer] = useState(0); // en segundos
  const [timerIntervalId, setTimerIntervalId] = useState(null);
  const [interrupcionesMinutos, setInterrupcionesMinutos] = useState(0);

  // Registro de Nuevo Vecino (Nivel 3)
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [regDni, setRegDni] = useState('');
  const [regNombre, setRegNombre] = useState('');
  const [regApellido, setRegApellido] = useState('');
  const [regCelular, setRegCelular] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regBarrio, setRegBarrio] = useState('Convocatoria Comunal');
  const [regComuna, setRegComuna] = useState('Comuna 1');
  const [regIsOrador, setRegIsOrador] = useState(false);
  const [regTema, setRegTema] = useState('');

  // Estado de edición rápida de vecinos en caliente (Requisito 1)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editDni, setEditDni] = useState('');
  const [editNombre, setEditNombre] = useState('');
  const [editApellido, setEditApellido] = useState('');
  const [editCelular, setEditCelular] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editBarrio, setEditBarrio] = useState('Convocatoria Comunal');
  const [editComuna, setEditComuna] = useState('Comuna 1');

  // Estado del Modal de Seguridad
  const [showSeguridadModal, setShowSeguridadModal] = useState(false);
  const [selectedVecinoDni, setSelectedVecinoDni] = useState(null);
  const [seguridadProblemática, setSeguridadProblemática] = useState('');

  const isCafeOrEncuentro = reunion.tipo_reunion !== TIPOS_REUNION.UNO_A_UNO;
  const isUnoAUno = reunion.tipo_reunion === TIPOS_REUNION.UNO_A_UNO;
  const isTematica = reunion.tipo_reunion === TIPOS_REUNION.TEMATICA;

  // Cargar estadísticas rápidas de asistencia y oradores
  const loadStatsCounts = async () => {
    try {
      // 1. Cargar cantidad de presentes (asistio = true)
      const { count, error } = await supabase
        .from('inscripciones_asistencias')
        .select('*', { count: 'exact', head: true })
        .eq('reunion_id', reunion.id)
        .eq('asistio', true);
      
      if (!error && count !== null) {
        setPresentesCount(count);
      }

      // 2. Cargar cantidad de oradores
      const { data: oradores } = await getOradores(reunion.id);
      if (oradores) {
        setOradoresCount(oradores.length);
      }
    } catch (err) {
      console.error('Error al cargar contadores:', err);
    }
  };

  useEffect(() => {
    // Si es Uno a Uno, cargamos todas las asistencias inicialmente (bloques)
    if (isUnoAUno) {
      const loadAllAsistencias = async () => {
        const { data } = await getAsistentesPorReunion(reunion.id);
        if (data) {
          setAsistencias(data);
        }
      };
      loadAllAsistencias();
    }
    
    loadStatsCounts();

    // Restaurar estado del timer de la reunión si ya tiene marcas
    if (reunion.funcionario_inicio && !reunion.funcionario_cierre) {
      setReunionStatus('running');
      const diffSecs = Math.floor((Date.now() - new Date(reunion.funcionario_inicio).getTime()) / 1000);
      setMeetingTimer(diffSecs > 0 ? diffSecs : 0);
      
      const interval = setInterval(() => {
        setMeetingTimer(t => t + 1);
      }, 1000);
      setTimerIntervalId(interval);
    } else if (reunion.funcionario_cierre) {
      setReunionStatus('ended');
      setMeetingTimer(reunion.duracion_total_minutos * 60);
      setInterrupcionesMinutos(reunion.funcionario_interrupciones_minutos || 0);
    }

    return () => {
      if (timerIntervalId) clearInterval(timerIntervalId);
    };
  }, [reunion.id]);

  // Ejecución de búsqueda reutilizable
  const performSearch = async (q) => {
    setSearching(true);
    setSearched(true);
    setShowRegisterForm(false);
    setSearchResults([]);

    try {
      // 1. Buscar en Padrón Central por DNI, Apellido (ilike) o Celular (ilike)
      const { data: vecinosData, error: errVecinos } = await supabase
        .from('vecinos')
        .select('*')
        .or(`dni.eq.${q},apellido.ilike.%${q}%,celular.ilike.%${q}%`);

      if (errVecinos) throw errVecinos;

      if (vecinosData && vecinosData.length > 0) {
        const dnis = vecinosData.map(v => v.dni);

        // 2. Buscar si están asociados a esta reunión
        const { data: inscData, error: errInsc } = await supabase
          .from('inscripciones_asistencias')
          .select('*')
          .eq('reunion_id', reunion.id)
          .in('vecino_id', dnis);

        if (errInsc) throw errInsc;

        // 3. Buscar si están anotados como oradores
        const { data: oradoresData, error: errOradores } = await supabase
          .from('oradores')
          .select('*')
          .eq('reunion_id', reunion.id)
          .in('vecino_id', dnis);

        if (errOradores) throw errOradores;

        // Combinar datos en la cascada
        const combined = vecinosData.map(v => {
          const insc = inscData?.find(i => i.vecino_id === v.dni);
          const orad = oradoresData?.find(o => o.vecino_id === v.dni);
          return {
            vecino: v,
            inscripcion: insc || null, // null representa Nivel 2
            orador: orad || null
          };
        });

        setSearchResults(combined);
      } else {
        // Nivel 3: Vecino nuevo absoluto
        setSearchResults([]);
        if (/^\d+$/.test(q)) {
          setRegDni(q);
          setRegApellido('');
        } else {
          setRegDni('');
          setRegApellido(q);
        }
      }
    } catch (err) {
      console.error(err);
      alert('Error de red al realizar la búsqueda.');
    } finally {
      setSearching(false);
    }
  };

  // Búsqueda en cascada server-side (DNI o Apellido)
  const handleSearchSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      alert('Ingresá un DNI o Apellido para buscar.');
      return;
    }
    const q = searchQuery.trim();
    setLastSearchTerm(q);
    await performSearch(q);
  };

  const triggerSearchRefresh = async () => {
    if (lastSearchTerm) {
      await performSearch(lastSearchTerm);
    }
  };

  // Acción: Marcar Presente (Nivel 1 o Nivel 2)
  const handleGivePresence = async (vecinoDni, isAlreadyInscribed) => {
    setIsSaving(true);
    try {
      const extra = isAlreadyInscribed ? {} : { estado_convocatoria: 'walk_in', como_se_entero: 'Otro' };
      const { error } = await guardarAsistencia(reunion.id, vecinoDni, true, extra);
      if (error) throw error;
      
      // Limpieza con Memoria Visual: vaciar la caja de texto y retornar el foco
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);

      // Recargar búsqueda para refrescar tarjeta usando el lastSearchTerm
      await triggerSearchRefresh();
      await loadStatsCounts();
    } catch (err) {
      console.error(err);
      alert(`Error al registrar asistencia: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Quitar presente
  const handleRemovePresence = async (vecinoDni) => {
    if (!await window.confirm('¿Está seguro de quitar el presente a este vecino?')) return;
    
    setIsSaving(true);
    try {
      await eliminarOrador(reunion.id, vecinoDni);
      const { error } = await guardarAsistencia(reunion.id, vecinoDni, false);
      if (error) throw error;
      
      // Limpieza con Memoria Visual
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);

      await loadStatsCounts();
      await triggerSearchRefresh();
    } catch (err) {
      console.error(err);
      alert(`Error al quitar asistencia: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Confirmar asistencia en Reunión de Seguridad (Modal)
  const handleConfirmSeguridad = async (e) => {
    e.preventDefault();
    if (!seguridadProblemática.trim()) return;

    setIsSaving(true);
    try {
      const matched = searchResults.find(r => r.vecino.dni === selectedVecinoDni);
      const isAlreadyInscribed = matched && matched.inscripcion !== null;

      const extra = {
        pregunta_puerta: seguridadProblemática.trim()
      };
      if (!isAlreadyInscribed) {
        extra.estado_convocatoria = 'walk_in';
        extra.como_se_entero = 'Otro';
      }

      const { error } = await guardarAsistencia(reunion.id, selectedVecinoDni, true, extra);
      if (error) throw error;

      setShowSeguridadModal(false);
      setSelectedVecinoDni(null);
      setSeguridadProblemática('');
      
      // Limpieza con Memoria Visual
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);

      await triggerSearchRefresh();
      await loadStatsCounts();
    } catch (err) {
      console.error(err);
      alert(`Error al registrar asistencia: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Guardar Vecino Nuevo Absoluto (Nivel 3)
  const handleRegisterAndAdd = async (e) => {
    e.preventDefault();
    if (!regDni || !regNombre || !regApellido) {
      alert('DNI, Nombre y Apellido son obligatorios.');
      return;
    }

    setIsSaving(true);
    try {
      // 1. Guardar en tabla vecinos
      const { data: vecino, error: errVecino } = await upsertVecino({
        dni: regDni,
        nombre: regNombre,
        apellido: regApellido,
        celular: regCelular || null,
        email: regEmail || null,
        barrio: regBarrio || null,
        comuna: regComuna || null
      });

      if (errVecino) throw errVecino;

      // 2. Guardar asistencia con walk-in
      const { error: errAsist } = await guardarAsistencia(reunion.id, regDni, true, {
        estado_convocatoria: 'walk_in',
        como_se_entero: 'Otro'
      });

      if (errAsist) throw errAsist;

      // 3. Si desea ser orador, registrarlo en la tabla oradores
      if (regIsOrador && isCafeOrEncuentro) {
        const { error: errOrador } = await registrarOrador({
          reunion_id: reunion.id,
          vecino_id: regDni,
          tema_original: regTema.trim(),
          estado: 'en_espera',
          orden: oradoresCount + 1
        });
        if (errOrador) throw errOrador;
      }

      alert('¡Vecino registrado e inscrito correctamente!');
      
      const savedDni = regDni;
      setShowRegisterForm(false);
      
      setRegDni('');
      setRegNombre('');
      setRegApellido('');
      setRegCelular('');
      setRegEmail('');
      setRegIsOrador(false);
      setRegTema('');

      // Auto-buscar para mostrar su tarjeta como presente
      setLastSearchTerm(savedDni);
      setSearchQuery('');
      setTimeout(() => {
        performSearch(savedDni);
        searchInputRef.current?.focus();
      }, 150);

      await loadStatsCounts();
    } catch (err) {
      console.error(err);
      alert(`Error al registrar vecino: ${err.message || 'Verifica la conexión'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Apertura y Guardado de Edición en Caliente (Requisito 1)
  const handleOpenEditModal = (vecino) => {
    setEditDni(vecino.dni);
    setEditNombre(vecino.nombre || '');
    setEditApellido(vecino.apellido || '');
    setEditCelular(vecino.celular || '');
    setEditEmail(vecino.email || '');
    setEditComuna(vecino.comuna || 'Comuna 1');
    setEditBarrio(vecino.barrio || 'Convocatoria Comunal');
    setShowEditModal(true);
  };

  const handleSaveEditVecino = async (e) => {
    e.preventDefault();
    if (!editNombre.trim() || !editApellido.trim()) {
      alert('Nombre y Apellido son obligatorios.');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await upsertVecino({
        dni: editDni,
        nombre: editNombre.trim(),
        apellido: editApellido.trim(),
        celular: editCelular.trim() || null,
        email: editEmail.trim() || null,
        comuna: editComuna,
        barrio: editBarrio === 'Convocatoria Comunal' ? null : editBarrio
      });

      if (error) throw error;
      
      alert('¡Datos del vecino actualizados con éxito!');
      setShowEditModal(false);
      await triggerSearchRefresh();
    } catch (err) {
      console.error(err);
      alert(`Error al actualizar datos: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Gestión de Oradores interactivos
  const handleOradorToggle = async (vecinoDni, isChecked, temaPrevio) => {
    try {
      if (isChecked) {
        // Registrar orador
        const { error } = await registrarOrador({
          reunion_id: reunion.id,
          vecino_id: vecinoDni,
          tema_original: temaPrevio || '',
          estado: 'en_espera',
          orden: oradoresCount + 1
        });
        if (error) throw error;
      } else {
        // Eliminar orador
        const { error } = await eliminarOrador(reunion.id, vecinoDni);
        if (error) throw error;
      }
      
      await loadStatsCounts();
      await triggerSearchRefresh();
    } catch (err) {
      console.error(err);
      alert(`No se pudo actualizar orador: ${err.message}`);
    }
  };

  const handleSaveTemaOrador = async (oradorId, DNI) => {
    const nuevoTema = editingTopics[DNI];
    if (nuevoTema === undefined) return;

    try {
      const { error } = await updateOradorTema(oradorId, nuevoTema);
      if (error) throw error;
      alert('¡Tema del orador guardado con éxito!');
      await triggerSearchRefresh();
    } catch (err) {
      console.error(err);
      alert(`Error al guardar tema: ${err.message}`);
    }
  };

  // Auxiliares del Cronómetro de la Reunión
  const startMeetingTimer = async () => {
    setReunionStatus('running');
    const nowStr = new Date().toISOString();
    await updateReunion(reunion.id, { funcionario_inicio: nowStr });
    
    const interval = setInterval(() => {
      setMeetingTimer(t => t + 1);
    }, 1000);
    setTimerIntervalId(interval);
  };

  const endMeetingTimer = async () => {
    if (timerIntervalId) clearInterval(timerIntervalId);
    setReunionStatus('ended');
    const nowStr = new Date().toISOString();
    const durationMins = Math.round(meetingTimer / 60);

    await updateReunion(reunion.id, {
      funcionario_cierre: nowStr,
      funcionario_interrupciones_minutos: interrupcionesMinutos,
      duracion_total_minutos: durationMins > 0 ? durationMins : 1
    });
    alert(`Reunión finalizada. Duración registrada: ${durationMins} minutos.`);
  };

  const formatTimer = (totalSecs) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs > 0 ? hrs + ':' : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Renderizar contenido según reunión Uno a Uno o General
  if (isUnoAUno) {
    return (
      <Cronometro1a1 
        reunion={reunion} 
        initialAsistencias={asistencias} 
        onUpdate={async () => {
          const { data } = await getAsistentesPorReunion(reunion.id);
          if (data) setAsistencias(data);
        }} 
        onBack={onBack}
      />
    );
  }

  return (
    <div className="container">
      {/* Botón Volver */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>
          <ArrowLeft size={16} /> Volver al Tablero
        </button>

        {/* Cronómetro Logístico en Vivo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: '600' }}>Cronómetro Oficial:</span>
          <div className="cronometro-display">
            <Clock size={16} style={{ color: 'var(--color-highlight)' }} />
            <span>{formatTimer(meetingTimer)}</span>
          </div>

          {reunionStatus === 'idle' && (
            <button className="btn btn-primary btn-sm" onClick={startMeetingTimer} style={{ padding: '6px 12px' }}>
              <Play size={12} /> Iniciar
            </button>
          )}

          {reunionStatus === 'running' && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#F1F5F9', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '2px 6px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Interrup:</span>
                <input 
                  type="number" 
                  style={{ width: '40px', border: 'none', background: 'transparent', textAlign: 'center', fontWeight: 'bold' }} 
                  value={interrupcionesMinutos} 
                  onChange={(e) => setInterrupcionesMinutos(parseInt(e.target.value) || 0)} 
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>m</span>
              </div>
              <button className="btn btn-danger btn-sm" onClick={endMeetingTimer} style={{ padding: '6px 12px' }}>
                <Square size={12} /> Cerrar Evento
              </button>
            </div>
          )}
          {reunionStatus === 'ended' && (
            <span className="badge badge-success">Finalizada</span>
          )}
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <div className="decor-tabs-container">
          <div className="decor-tab-mint"></div>
          <div className="decor-tab-yellow"></div>
        </div>

        {/* Alerta de Límite Crítico de Oradores */}
        {oradoresCount >= 22 && (
          <div style={{
            backgroundColor: '#FDE8E8',
            border: '2px solid #EF4444',
            borderRadius: '12px',
            padding: '1.25rem',
            color: '#9B1C1C',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontWeight: '600',
            fontSize: '0.95rem',
            boxShadow: 'var(--shadow-md)'
          }}>
            <AlertTriangle size={24} style={{ color: '#EF4444', flexShrink: 0 }} />
            <div>
              ALERTA: A partir de 22 oradores no ofrecer la palabra en la puerta, dado que es difícil que lleguen a hablar por cuestiones de tiempo.
            </div>
          </div>
        )}

        {/* Datos de la Reunión */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <span className="badge badge-info" style={{ marginBottom: '6px' }}>{reunion.tipo_reunion}</span>
              <h2 style={{ fontSize: '1.4rem', color: 'var(--color-primary)' }}>{reunion.nombre}</h2>
              <div style={{ display: 'flex', gap: '16px', color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '6px', flexWrap: 'wrap' }}>
                <span><strong>Lugar:</strong> {reunion.lugar}</span>
                <span><strong>Funcionario:</strong> {reunion.funcionario || 'No asignado'}</span>
                <span><strong>Comuna:</strong> {reunion.comuna}</span>
                <span style={{ color: 'var(--color-success)', fontWeight: '600' }}>
                  <strong>Asistieron:</strong> {presentesCount}
                </span>
                {isCafeOrEncuentro && (
                  <span style={{ color: 'var(--color-highlight)', fontWeight: '600' }}>
                    <strong>Oradores anotados:</strong> {oradoresCount}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Pestañas de Comportamiento Polimórfico */}
        {isTematica && (
          <div className="tabs" style={{ marginBottom: '1.5rem' }}>
            <div 
              className={`tab ${activeTab === 'asistencia' ? 'active' : ''}`}
              onClick={() => setActiveTab('asistencia')}
            >
              Control de Asistencia General
            </div>
            <div 
              className={`tab ${activeTab === 'modulo_especial' ? 'active' : ''}`}
              onClick={() => setActiveTab('modulo_especial')}
            >
              Preguntas del Público (QR)
            </div>
          </div>
        )}

        {/* RENDERIZADO DE PESTAÑAS */}
        {activeTab === 'modulo_especial' && isTematica ? (
          <PreguntasTematicas reunion={reunion} asistencias={[]} />
        ) : (
          /* MÓDULO DE ASISTENCIA EN CALLE OPTIMIZADO PARA 4G */
          <div>
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-primary)' }}>
                Búsqueda Rápida en Territorio
              </h3>

              <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px' }}>
                <div style={{ position: 'relative', flexGrow: 1 }}>
                  <input
                    type="text"
                    ref={searchInputRef}
                    className="form-control"
                    placeholder="Ingresá DNI o Apellido exacto para buscar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ paddingLeft: '2.5rem' }}
                  />
                  <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                </div>
                <button type="submit" className="btn btn-primary" style={{ minWidth: '120px' }} disabled={searching}>
                  {searching ? 'Buscando...' : 'Buscar'}
                </button>
              </form>
            </div>

            {/* ZONA DE RESULTADOS */}
            {searching ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <div className="spinner"></div>
                <p style={{ marginTop: '1rem', color: 'var(--color-text-muted)' }}>Buscando coincidencia en el servidor...</p>
              </div>
            ) : (
              <div>
                {/* 1. COMPORTAMIENTO INICIAL: Sin búsqueda */}
                {!searched && (
                  <div style={{ padding: '3rem 2rem', textAlign: 'center', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px dashed var(--color-border)' }}>
                    <Users size={48} style={{ color: 'var(--color-highlight)', marginBottom: '1rem', opacity: 0.8 }} />
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--color-primary)', fontWeight: '600' }}>Listo para tomar asistencia</h3>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '6px auto 0 auto' }}>
                      Ingresá el DNI o Apellido del vecino para comprobar su inscripción, acreditarlo del padrón central o darlo de alta en el lugar.
                    </p>
                  </div>
                )}

                {/* 2. CON BÚSQUEDA Y CON RESULTADOS (Niveles 1 y 2) */}
                {searched && searchResults.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.1rem', color: 'var(--color-primary)' }}>
                      Resultados Encontrados ({searchResults.length})
                    </h3>

                    {searchResults.map(result => {
                      const { vecino, inscripcion, orador } = result;
                      const isPresent = inscripcion?.asistio;
                      const isInscribed = inscripcion !== null;

                      return (
                        <div 
                          key={vecino.dni} 
                          className="card" 
                          style={{
                            margin: 0,
                            borderLeft: isInscribed 
                              ? (isPresent ? '6px solid var(--color-success)' : '6px solid var(--color-warning)')
                              : '6px solid var(--color-danger)',
                            backgroundColor: '#FFFFFF',
                            boxShadow: 'var(--shadow-sm)'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ flexGrow: 1, minWidth: '250px' }}>
                              {/* Alerta de Nivel 2: No inscripto pero en padrón */}
                              {!isInscribed && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#B91C1C', fontSize: '0.8rem', fontWeight: '600', marginBottom: '8px', backgroundColor: '#FEE2E2', padding: '4px 8px', borderRadius: '4px' }}>
                                  <AlertTriangle size={14} /> El vecino no se encuentra inscripto en esta reunión
                                </div>
                              )}

                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h4 style={{ fontSize: '1.15rem', color: 'var(--color-primary)', margin: 0 }}>
                                  {vecino.nombre} {vecino.apellido}
                                </h4>
                                <span className={`badge ${
                                  isInscribed 
                                    ? (isPresent ? 'badge-success' : 'badge-info') 
                                    : 'badge-danger'
                                }`} style={{ fontSize: '0.75rem' }}>
                                  {isInscribed 
                                    ? (isPresent ? 'Presente' : 'Inscripto') 
                                    : 'No inscripto'
                                  }
                                </span>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginTop: '10px', fontSize: '0.85rem' }}>
                                <div><strong>DNI:</strong> {vecino.dni}</div>
                                <div><strong>Celular:</strong> {vecino.celular || '-'}</div>
                                <div><strong>Email:</strong> {vecino.email || '-'}</div>
                                <div><strong>Barrio:</strong> {vecino.barrio || '-'} ({vecino.comuna || '-'})</div>
                                {inscripcion?.como_se_entero && (
                                  <div><strong>Difusión:</strong> {inscripcion.como_se_entero}</div>
                                )}
                                {inscripcion?.pregunta_puerta && (
                                  <div style={{ gridColumn: '1 / -1', color: 'var(--color-text-muted)', fontStyle: 'italic', marginTop: '4px' }}>
                                    <strong>Problemática / Puerta:</strong> "{inscripcion.pregunta_puerta}"
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Botones de acción táctiles grandes */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '200px' }}>
                              {isInscribed ? (
                                /* NIVEL 1 */
                                !isPresent ? (
                                  <button 
                                    type="button" 
                                    className="btn btn-primary" 
                                    onClick={() => handleGivePresence(vecino.dni, true)}
                                    disabled={isSaving}
                                    style={{ padding: '12px', fontSize: '0.9rem', fontWeight: 'bold' }}
                                  >
                                    Dar Presente
                                  </button>
                                ) : (
                                  <button 
                                    type="button" 
                                    className="btn btn-secondary" 
                                    onClick={() => handleRemovePresence(vecino.dni)}
                                    disabled={isSaving}
                                    style={{ padding: '8px', fontSize: '0.85rem', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                                  >
                                    Quitar Presente
                                  </button>
                                )
                              ) : (
                                /* NIVEL 2 */
                                <button 
                                  type="button" 
                                  className="btn btn-highlight" 
                                  onClick={() => handleGivePresence(vecino.dni, false)}
                                  disabled={isSaving}
                                  style={{ padding: '12px', fontSize: '0.9rem', fontWeight: 'bold', backgroundColor: 'var(--color-highlight)', color: 'var(--color-primary)' }}
                                >
                                  Acreditar y Dar Presente
                                </button>
                              )}
                              
                              {/* Botón de Editar Datos en Caliente (Requisito 1) */}
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleOpenEditModal(vecino)}
                                disabled={isSaving}
                                style={{ padding: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                              >
                                Editar Datos
                              </button>
                            </div>
                          </div>

                          {/* LÓGICA INTERACTIVA DE ORADORES */}
                          {isPresent && isCafeOrEncuentro && (
                            <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '1rem', paddingTop: '1rem' }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}>
                                <input 
                                  type="checkbox" 
                                  checked={!!orador}
                                  onChange={(e) => handleOradorToggle(vecino.dni, e.target.checked, vecino.tema_previo || inscripcion?.tema_previo)} 
                                  style={{ width: '18px', height: '18px' }}
                                />
                                <Mic size={14} style={{ color: 'var(--color-highlight)' }} />
                                Desea ser Orador en el Micrófono
                              </label>

                              {/* Formulario de tema */}
                              {orador && (
                                <div style={{ marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                                  <div className="form-group" style={{ flexGrow: 1, margin: 0 }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>
                                      ¿De qué le gustaría hablar?
                                    </label>
                                    <textarea
                                      rows="2"
                                      className="form-control"
                                      placeholder="Ingresá la consulta o problemática para el orador..."
                                      value={editingTopics[vecino.dni] !== undefined ? editingTopics[vecino.dni] : (orador.tema_original || '')}
                                      onChange={(e) => {
                                        setEditingTopics({
                                          ...editingTopics,
                                          [vecino.dni]: e.target.value
                                        });
                                      }}
                                      style={{ fontSize: '0.85rem' }}
                                    />
                                  </div>
                                  <button 
                                    className="btn btn-primary btn-sm"
                                    onClick={() => handleSaveTemaOrador(orador.id, vecino.dni)}
                                    style={{ padding: '8px 12px', height: 'fit-content', whiteSpace: 'nowrap' }}
                                  >
                                    Guardar Tema
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 3. CON BÚSQUEDA Y SIN RESULTADOS (Nivel 3) */}
                {searched && searchResults.length === 0 && !showRegisterForm && (
                  <div style={{ padding: '3rem 2rem', textAlign: 'center', backgroundColor: '#FFFDF5', borderRadius: '12px', border: '1px dashed #FCD116' }}>
                    <AlertTriangle size={36} style={{ color: '#D97706', marginBottom: '1rem' }} />
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--color-primary)', fontWeight: '600' }}>Vecino no encontrado en la reunión ni en el padrón central</h3>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', maxWidth: '500px', margin: '6px auto 1.5rem auto' }}>
                      No hallamos coincidencia para la búsqueda. Si se trata de un vecino espontáneo que acaba de llegar, podés registrarlo en el padrón e inscribirlo en esta reunión.
                    </p>
                    <button className="btn btn-highlight" onClick={() => setShowRegisterForm(true)} style={{ padding: '12px 24px', fontWeight: 'bold' }}>
                      + Registrar Nuevo Vecino (Walk-in)
                    </button>
                  </div>
                )}

                {/* FORMULARIO DE REGISTRO MANUAL (NIVEL 3) */}
                {showRegisterForm && (
                  <div className="card" style={{ borderTop: '4px solid var(--color-highlight)', backgroundColor: '#FFFFFF' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <h3 style={{ fontSize: '1.15rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Plus size={20} style={{ color: 'var(--color-highlight)' }} />
                        Registrar Nuevo Vecino
                      </h3>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowRegisterForm(false)}>
                        Cancelar
                      </button>
                    </div>

                    <form onSubmit={handleRegisterAndAdd}>
                      <div className="form-group">
                        <label htmlFor="reg-dni">DNI / Documento *</label>
                        <input
                          type="text"
                          id="reg-dni"
                          className="form-control"
                          placeholder="Sin puntos ni espacios"
                          value={regDni}
                          onChange={(e) => setRegDni(e.target.value)}
                          required
                        />
                      </div>

                      <div className="grid-2" style={{ gap: '1rem' }}>
                        <div className="form-group">
                          <label htmlFor="reg-nombre">Nombre *</label>
                          <input
                            type="text"
                            id="reg-nombre"
                            className="form-control"
                            placeholder="Ej: Marcelo"
                            value={regNombre}
                            onChange={(e) => setRegNombre(e.target.value)}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="reg-apellido">Apellido *</label>
                          <input
                            type="text"
                            id="reg-apellido"
                            className="form-control"
                            placeholder="Ej: Silva"
                            value={regApellido}
                            onChange={(e) => setRegApellido(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="grid-2" style={{ gap: '1rem' }}>
                        <div className="form-group">
                          <label htmlFor="reg-celular">Celular</label>
                          <input
                            type="text"
                            id="reg-celular"
                            className="form-control"
                            placeholder="Ej: 1122334455"
                            value={regCelular}
                            onChange={(e) => setRegCelular(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="reg-email">Email</label>
                          <input
                            type="email"
                            id="reg-email"
                            className="form-control"
                            placeholder="ejemplo@correo.com"
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="grid-2" style={{ gap: '1rem' }}>
                        <div className="form-group">
                          <label htmlFor="reg-comuna">Comuna</label>
                          <select
                            id="reg-comuna"
                            className="form-control"
                            value={regComuna}
                            onChange={(e) => setRegComuna(e.target.value)}
                          >
                            {COMUNAS.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label htmlFor="reg-barrio">Barrio</label>
                          <select
                            id="reg-barrio"
                            className="form-control"
                            value={regBarrio}
                            onChange={(e) => setRegBarrio(e.target.value)}
                          >
                            {BARRIOS.map(b => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {isCafeOrEncuentro && (
                        <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '1rem', paddingTop: '1rem' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}>
                            <input 
                              type="checkbox" 
                              checked={regIsOrador}
                              onChange={(e) => setRegIsOrador(e.target.checked)} 
                              style={{ width: '18px', height: '18px' }}
                            />
                            <Mic size={14} style={{ color: 'var(--color-highlight)' }} />
                            Desea ser Orador en el Micrófono
                          </label>

                          {regIsOrador && (
                            <div className="form-group" style={{ marginTop: '10px' }}>
                              <label htmlFor="reg-tema" style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>
                                ¿De qué le gustaría hablar?
                              </label>
                              <textarea
                                id="reg-tema"
                                rows="2"
                                className="form-control"
                                placeholder="Ingresá la problemática o consulta que el orador desea manifestar..."
                                value={regTema}
                                onChange={(e) => setRegTema(e.target.value)}
                                style={{ fontSize: '0.85rem' }}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.5rem' }}>
                        <button type="button" className="btn btn-secondary" onClick={() => setShowRegisterForm(false)}>
                          Cancelar
                        </button>
                        <button type="submit" className="btn btn-highlight" disabled={isSaving} style={{ fontWeight: 'bold' }}>
                          {isSaving ? 'Registrando...' : 'Registrar y Dar Presente'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL INGRESO SEGURIDAD (PREGUNTA DE LA PUERTA) */}
      {showSeguridadModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ borderTopColor: '#EF4444' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
              <div style={{ padding: '8px', borderRadius: '50%', backgroundColor: '#FDE8E8', color: '#EF4444' }}>
                <Shield size={20} />
              </div>
              <h3 style={{ margin: 0, color: 'var(--color-primary)' }}>Problemática Obligatoria</h3>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
              Para registrar la asistencia en reuniones de Seguridad en tu Barrio, debés ingresar el tema o reclamo por el cual se acerca el vecino.
            </p>

            <form onSubmit={handleConfirmSeguridad}>
              <div className="form-group">
                <label htmlFor="pregunta-puerta">Problemática principal *</label>
                <textarea
                  id="pregunta-puerta"
                  className="form-control"
                  rows="3"
                  placeholder="Ej: Mayor patrullaje en el centro comercial; luminaria rota sobre la calle Iberá..."
                  value={seguridadProblemática}
                  onChange={(e) => setSeguridadProblemática(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.5rem' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => {
                    setShowSeguridadModal(false);
                    setSelectedVecinoDni(null);
                    setSeguridadProblemática('');
                  }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-danger" 
                  disabled={!seguridadProblemática.trim() || isSaving}
                >
                  {isSaving ? 'Guardando...' : 'Confirmar Asistencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDICIÓN RÁPIDA DE VECINO EN TERRITORIO (Requisito 1) */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ borderTopColor: 'var(--color-highlight)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem', color: 'var(--color-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Plus size={20} style={{ color: 'var(--color-highlight)' }} />
                Editar Datos del Vecino
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowEditModal(false)}>
                Cancelar
              </button>
            </div>

            <form onSubmit={handleSaveEditVecino}>
              <div className="form-group">
                <label>DNI (No editable)</label>
                <input
                  type="text"
                  className="form-control"
                  value={editDni}
                  disabled
                  style={{ backgroundColor: '#F1F5F9' }}
                />
              </div>

              <div className="grid-2" style={{ gap: '1rem' }}>
                <div className="form-group">
                  <label htmlFor="edit-nombre">Nombre *</label>
                  <input
                    type="text"
                    id="edit-nombre"
                    className="form-control"
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-apellido">Apellido *</label>
                  <input
                    type="text"
                    id="edit-apellido"
                    className="form-control"
                    value={editApellido}
                    onChange={(e) => setEditApellido(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid-2" style={{ gap: '1rem' }}>
                <div className="form-group">
                  <label htmlFor="edit-celular">Celular</label>
                  <input
                    type="text"
                    id="edit-celular"
                    className="form-control"
                    value={editCelular}
                    onChange={(e) => setEditCelular(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-email">Email</label>
                  <input
                    type="email"
                    id="edit-email"
                    className="form-control"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid-2" style={{ gap: '1rem' }}>
                <div className="form-group">
                  <label htmlFor="edit-comuna">Comuna</label>
                  <select
                    id="edit-comuna"
                    className="form-control"
                    value={editComuna}
                    onChange={(e) => setEditComuna(e.target.value)}
                  >
                    {COMUNAS.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="edit-barrio">Barrio</label>
                  <select
                    id="edit-barrio"
                    className="form-control"
                    value={editBarrio}
                    onChange={(e) => setEditBarrio(e.target.value)}
                  >
                    {BARRIOS.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-highlight" disabled={isSaving} style={{ fontWeight: 'bold' }}>
                  {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
