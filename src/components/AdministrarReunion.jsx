import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, Shield, User, FileText, Check, AlertCircle, Mic, RefreshCw, Trash2 } from 'lucide-react';
import { TIPOS_REUNION } from '../data/mockData';
import { updateReunion, getOradores, updateOradorDetails, deleteReunionCompleta, cachedQuery, getEquipoCercania, getAgentesTerritorio, DEFAULT_EQUIPO_CERCANIA, DEFAULT_AGENTES_TERRITORIO } from '../services/supabaseService';
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

export default function AdministrarReunion({ reunion, onBack, onSaveSuccess }) {
  // Formulario general
  const [nombre, setNombre] = useState(reunion?.nombre || '');
  const [funcionario, setFuncionario] = useState(reunion?.funcionario || '');
  const [fecha, setFecha] = useState(reunion?.fecha || '');
  const [lugar, setLugar] = useState(reunion?.lugar || '');
  const [tipoReunion, setTipoReunion] = useState(reunion?.tipo_reunion || '');
  const [comuna, setComuna] = useState(reunion?.comuna || 'Comuna 1');
  const [barrioEvento, setBarrioEvento] = useState(reunion?.barrio_evento || '');
  const [barrio, setBarrio] = useState(reunion?.barrio || 'Convocatoria Comunal');
  const [arreglo1, setArreglo1] = useState(reunion?.arreglo_1 || '');
  const [tema, setTema] = useState(reunion?.tema || '');

  // Estados para funcionarios y autocompletado
  const [funcionariosList, setFuncionariosList] = useState([]);
  const [selectedFuncionarios, setSelectedFuncionarios] = useState([]);
  const [showFuncDropdown, setShowFuncDropdown] = useState(false);
  const [funcSearchTerm, setFuncSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  // Nuevos campos para Planificación y Cobertura (Reunión de Mañana)
  const [funcionariosAcompanantes, setFuncionariosAcompanantes] = useState(
    Array.isArray(reunion?.funcionarios_acompanantes)
      ? reunion.funcionarios_acompanantes.join(', ')
      : (reunion?.funcionarios_acompanantes || '')
  );

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

  const [observacionesPreparacion, setObservacionesPreparacion] = useState(reunion?.observaciones_preparacion || '');

  // Sincronizar estados si la reunión se carga asincrónicamente desde la URL
  useEffect(() => {
    if (reunion) {
      if (reunion.nombre) setNombre(reunion.nombre);
      if (reunion.funcionario) setFuncionario(reunion.funcionario);
      if (reunion.fecha) setFecha(reunion.fecha);
      if (reunion.lugar) setLugar(reunion.lugar);
      if (reunion.tipo_reunion) setTipoReunion(reunion.tipo_reunion);
      if (reunion.comuna) setComuna(reunion.comuna);
      if (reunion.barrio_evento) setBarrioEvento(reunion.barrio_evento);
      if (reunion.barrio) setBarrio(reunion.barrio);
      if (reunion.arreglo_1) setArreglo1(reunion.arreglo_1);
      if (reunion.tema) setTema(reunion.tema);
      if (reunion.funcionarios_acompanantes) {
        const val = Array.isArray(reunion.funcionarios_acompanantes)
          ? reunion.funcionarios_acompanantes.join(', ')
          : String(reunion.funcionarios_acompanantes);
        setFuncionariosAcompanantes(val);
      }
      if (reunion.responsable_cercania_id || reunion.equipo_cercania) {
        const targetId = reunion.responsable_cercania_id || reunion.equipo_cercania?.id;
        const match = equipoCercaniaList.find(r => r.id === targetId);
        if (match) {
          setSelectedEquipoCercania([match]);
        } else if (reunion.equipo_cercania) {
          setSelectedEquipoCercania([reunion.equipo_cercania]);
        }
      }
      if (reunion.observaciones_preparacion) setObservacionesPreparacion(reunion.observaciones_preparacion);
    }
  }, [reunion, equipoCercaniaList]);

  // Cargar dropdowns de Supabase e inicializar seleccionados
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

        if (resFunc?.data) {
          setFuncionariosList(resFunc.data);
          
          if (reunion?.funcionario) {
            const currentNames = reunion.funcionario.split(' / ').map(n => n.trim());
            const preselected = resFunc.data.filter(f => currentNames.includes(f.nombre_completo));
            setSelectedFuncionarios(preselected);
          }
        }

        if (resCercania?.data) {
          setEquipoCercaniaList(resCercania.data);
        }

        if (resAgentes?.data) {
          setAgentesList(resAgentes.data);
          if (reunion?.integrantes_asignados) {
            const currentNames = Array.isArray(reunion.integrantes_asignados)
              ? reunion.integrantes_asignados
              : reunion.integrantes_asignados.split(',').map(n => n.trim());
            const preselected = resAgentes.data.filter(a => currentNames.includes(a.nombre_completo));
            setSelectedIntegrantes(preselected);
          }
        }
      } catch (err) {
        console.error('Error cargando listas de dropdowns:', err);
      }
    };
    fetchDropdownData();
  }, [reunion]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowFuncDropdown(false);
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

  // Autocompletar el nombre de la reunión
  useEffect(() => {
    const displayFecha = fecha ? fecha.split('-').reverse().join('/') : '';
    const displayTipo = tipoReunion || '';
    
    // Unir nombres de funcionarios seleccionados
    const displayFuncionarios = selectedFuncionarios.length > 0 
      ? selectedFuncionarios.map(f => f.nombre_completo).join(' / ') 
      : '';
      
    const displayComunaBarrio = barrio && barrio !== 'Convocatoria Comunal'
      ? `${comuna} - ${barrio}`
      : comuna;

    // Si tiene tema/famoso y es Temática, Procesos Participativos o Primera Persona, lo anexamos al tipo
    const displayTipoConTema = tema && (tipoReunion === TIPOS_REUNION.TEMATICA || tipoReunion === TIPOS_REUNION.PROCESOS_CO_CREACION || tipoReunion === TIPOS_REUNION.PROCESOS_INFORMATIVA || tipoReunion === TIPOS_REUNION.PRIMERA_PERSONA)
      ? `${displayTipo} (${tema})`
      : displayTipo;

    const parts = [displayFecha, displayTipoConTema, displayFuncionarios, displayComunaBarrio].filter(Boolean);
    const autocompletedName = parts.join(' - ');
    setNombre(autocompletedName);
    setFuncionario(displayFuncionarios);
  }, [fecha, tipoReunion, selectedFuncionarios, comuna, barrio, tema]);

  // Estados de carga y guardado
  const [savingReunion, setSavingReunion] = useState(false);
  const [loadingOradores, setLoadingOradores] = useState(false);
  const [oradores, setOradores] = useState([]);
  
  // Estados locales por orador para edición
  const [oradorStates, setOradorStates] = useState({}); // { id: { estado, tema_original, tema_efectivo } }
  const [savedOradorStatus, setSavedOradorStatus] = useState({}); // { id: 'success' | 'error' | null }
  const [savingOradorId, setSavingOradorId] = useState(null);
  const [savingAllOradores, setSavingAllOradores] = useState(false);

  const isCafeOrEncuentro = tipoReunion !== TIPOS_REUNION.UNO_A_UNO;

  // Cargar oradores asociados
  const loadOradores = async () => {
    if (!isCafeOrEncuentro) return;
    setLoadingOradores(true);
    const { data, error } = await getOradores(reunion.id);
    setLoadingOradores(false);
    if (!error && data) {
      setOradores(data);
      // Inicializar el estado local para edición
      const localState = {};
      data.forEach(o => {
        localState[o.id] = {
          estado: o.estado || 'en_espera',
          tema_original: o.tema_original || '',
          tema_efectivo: o.tema_efectivo || ''
        };
      });
      setOradorStates(localState);
    }
  };

  useEffect(() => {
    loadOradores();
  }, [reunion.id, tipoReunion]);

  // Guardar datos generales de la reunión
  const handleSaveReunion = async (e) => {
    e.preventDefault();
    if (!nombre.trim() || !fecha || !lugar.trim()) {
      alert('Por favor, completá los campos obligatorios.');
      return;
    }

    setSavingReunion(true);
    const { error } = await updateReunion(reunion.id, {
      nombre: nombre.trim(),
      funcionario: funcionario.trim() || null,
      fecha,
      lugar: lugar.trim(),
      tipo_reunion: tipoReunion,
      comuna,
      barrio_evento: barrioEvento.trim() || null,
      barrio: barrio === 'Convocatoria Comunal' ? null : barrio,
      tema: (tipoReunion === TIPOS_REUNION.TEMATICA || tipoReunion === TIPOS_REUNION.PROCESOS_CO_CREACION || tipoReunion === TIPOS_REUNION.PROCESOS_INFORMATIVA || tipoReunion === TIPOS_REUNION.PRIMERA_PERSONA) ? tema.trim() : null,
      arreglo_1: arreglo1.trim() || null,
      funcionarios_acompanantes: funcionariosAcompanantes.trim() ? [funcionariosAcompanantes.trim()] : null,
      responsable_cercania_id: selectedEquipoCercania.length > 0 ? selectedEquipoCercania[0].id : null,
      integrantes_asignados: selectedIntegrantes.length > 0 ? selectedIntegrantes.map(a => a.nombre_completo) : null,
      observaciones_preparacion: observacionesPreparacion.trim() || null
    });
    setSavingReunion(false);

    if (error) {
      alert(`Error al actualizar la reunión: ${error.message}`);
    } else {
      alert('¡Datos de la reunión guardados con éxito!');
      if (onSaveSuccess) onSaveSuccess();
    }
  };

  const handleDeleteReunion = async () => {
    const confirmText1 = `¿Estás completamente seguro de que querés eliminar permanentemente la reunión "${reunion.nombre}"?\n\nEsta acción eliminará la reunión de la base de datos, así como todos los inscriptos, asistencias y oradores asociados.`;
    if (!await window.confirm(confirmText1)) return;

    const confirmText2 = `⚠️ ¡ATENCIÓN!\nEsta acción es irreversible. ¿Realmente querés eliminarla?`;
    if (!await window.confirm(confirmText2)) return;

    setSavingReunion(true);
    try {
      const { error } = await deleteReunionCompleta(reunion.id);
      if (error) {
        alert(`Error al eliminar la reunión: ${error.message}`);
      } else {
        alert('¡La reunión ha sido eliminada con éxito!');
        if (onBack) onBack();
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al eliminar la reunión.');
    } finally {
      setSavingReunion(false);
    }
  };

  // Cambios locales en filas de oradores
  const handleOradorStateChange = (id, field, value) => {
    setOradorStates(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
    // Limpiar el estado de guardado tras edición
    setSavedOradorStatus(prev => ({
      ...prev,
      [id]: null
    }));
  };

  // Guardar orador individual
  const handleSaveOradorRow = async (oradorId) => {
    const local = oradorStates[oradorId];
    if (!local) return;

    setSavingOradorId(oradorId);
    
    // Auto-Set de Estado (Requisito 2): Si tiene texto en tema_efectivo, forzar estado a 'hablo'
    let finalEstado = local.estado;
    if (local.tema_efectivo && local.tema_efectivo.trim() !== '') {
      finalEstado = 'hablo';
    }

    const updates = {
      estado: finalEstado,
      tema_original: local.tema_original,
      tema_efectivo: finalEstado === 'hablo' ? (local.tema_efectivo || '') : null
    };

    const { error } = await updateOradorDetails(oradorId, updates);
    setSavingOradorId(null);

    if (error) {
      setSavedOradorStatus(prev => ({ ...prev, [oradorId]: 'error' }));
      alert(`Error al guardar: ${error.message}`);
    } else {
      setSavedOradorStatus(prev => ({ ...prev, [oradorId]: 'success' }));
      // Quitar feedback visual tras 3 segundos
      setTimeout(() => {
        setSavedOradorStatus(prev => ({ ...prev, [oradorId]: null }));
      }, 3000);
      // Recargar para sincronizar estado en el selector
      await loadOradores();
    }
  };

  // Guardar todos los oradores de forma concurrente (Promise.all)
  const handleSaveAllOradores = async () => {
    if (oradores.length === 0) return;
    setSavingAllOradores(true);

    try {
      const savePromises = oradores.map(async (o) => {
        const local = oradorStates[o.id];
        if (!local) return;

        // Auto-Set de Estado (Requisito 2): Si tiene texto en tema_efectivo, forzar estado a 'hablo'
        let finalEstado = local.estado;
        if (local.tema_efectivo && local.tema_efectivo.trim() !== '') {
          finalEstado = 'hablo';
        }

        const updates = {
          estado: finalEstado,
          tema_original: local.tema_original,
          tema_efectivo: finalEstado === 'hablo' ? (local.tema_efectivo || '') : null
        };
        return updateOradorDetails(o.id, updates);
      });

      const results = await Promise.all(savePromises);
      
      const errors = results.filter(res => !res || res.error);
      if (errors.length > 0) {
        alert(`Se guardaron algunos oradores, pero hubo errores en ${errors.length} de ellos.`);
      } else {
        alert('¡Todos los cambios de los oradores se guardaron con éxito!');
      }

      // Feedback visual para todas las filas
      const successStatus = {};
      oradores.forEach(o => {
        successStatus[o.id] = 'success';
      });
      setSavedOradorStatus(successStatus);

      setTimeout(() => {
        const resetStatus = {};
        oradores.forEach(o => {
          resetStatus[o.id] = null;
        });
        setSavedOradorStatus(resetStatus);
      }, 3000);

      await loadOradores();
    } catch (err) {
      console.error(err);
      alert('Error de red al guardar todos los oradores.');
    } finally {
      setSavingAllOradores(false);
    }
  };

  return (
    <div className="container">
      {/* Botón Volver */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>
          <ArrowLeft size={16} /> Volver al Tablero
        </button>
      </div>

      <div style={{ position: 'relative' }}>
        {/* Solapas de decoración */}
        <div className="decor-tabs-container">
          <div className="decor-tab-mint"></div>
          <div className="decor-tab-yellow"></div>
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          
          {/* PANEL IZQUIERDO: DETALLES DE LA REUNIÓN */}
          <div className="card" style={{ flex: '1 1 380px', margin: 0, height: 'fit-content' }}>
            <h3 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} style={{ color: 'var(--color-highlight)' }} />
              Editar Reunión
            </h3>

            <form onSubmit={handleSaveReunion}>
              <div className="grid-2" style={{ gap: '1rem' }}>
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
                  <label htmlFor="tipo">Tipo de Reunión</label>
                  <select
                    id="tipo"
                    className="form-control"
                    value={tipoReunion}
                    onChange={(e) => setTipoReunion(e.target.value)}
                  >
                    <option value={TIPOS_REUNION.ENCUENTRO}>{TIPOS_REUNION.ENCUENTRO}</option>
                    <option value={TIPOS_REUNION.CAFE}>{TIPOS_REUNION.CAFE}</option>
                    <option value={TIPOS_REUNION.SEGURIDAD}>{TIPOS_REUNION.SEGURIDAD}</option>
                    <option value={TIPOS_REUNION.TEMATICA}>{TIPOS_REUNION.TEMATICA}</option>
                    <option value={TIPOS_REUNION.UNO_A_UNO}>{TIPOS_REUNION.UNO_A_UNO}</option>
                    <option value={TIPOS_REUNION.PROCESOS_CO_CREACION}>{TIPOS_REUNION.PROCESOS_CO_CREACION}</option>
                    <option value={TIPOS_REUNION.PROCESOS_INFORMATIVA}>{TIPOS_REUNION.PROCESOS_INFORMATIVA}</option>
                    <option value={TIPOS_REUNION.PRIMERA_PERSONA}>{TIPOS_REUNION.PRIMERA_PERSONA}</option>
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
                <label htmlFor="lugar">Lugar / Dirección *</label>
                <input
                  type="text"
                  id="lugar"
                  className="form-control"
                  value={lugar}
                  onChange={(e) => setLugar(e.target.value)}
                  required
                />
              </div>

              <div className="grid-2" style={{ gap: '1rem' }}>
                <div className="form-group">
                  <label htmlFor="comuna">Comuna</label>
                  <select
                    id="comuna"
                    className="form-control"
                    value={comuna}
                    onChange={(e) => setComuna(e.target.value)}
                  >
                    {COMUNAS.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
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
                <label htmlFor="arreglo_1">Observaciones / Arreglo Histórico</label>
                <textarea
                  id="arreglo_1"
                  className="form-control"
                  rows="2"
                  placeholder="Notas internas y agenda histórica de coordinación..."
                  value={arreglo1}
                  onChange={(e) => setArreglo1(e.target.value)}
                />
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

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                disabled={savingReunion}
              >
                {savingReunion ? 'Guardando...' : <><Save size={18} /> Guardar Cambios Generales</>}
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                style={{ width: '100%', marginTop: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '1px solid #EF4444', color: '#B91C1C', backgroundColor: '#FEF2F2' }}
                onClick={handleDeleteReunion}
                disabled={savingReunion}
              >
                <Trash2 size={18} /> Eliminar Reunión Permanentemente
              </button>
            </form>
          </div>

          {/* PANEL DERECHO: MINUTA Y ORADORES (Solo Cafés y Encuentros) */}
          <div className="card" style={{ flex: '2 1 500px', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mic size={20} style={{ color: 'var(--color-highlight)' }} />
                Minuta de Oradores
              </h3>
              {isCafeOrEncuentro && oradores.length > 0 && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    onClick={loadOradores} 
                    title="Recargar cola de oradores"
                    disabled={loadingOradores || savingAllOradores}
                  >
                    <RefreshCw size={14} className={loadingOradores ? 'spin' : ''} /> Recargar
                  </button>
                  <button 
                    className="btn btn-highlight btn-sm" 
                    onClick={handleSaveAllOradores}
                    disabled={loadingOradores || savingAllOradores}
                    style={{ fontWeight: '600', backgroundColor: 'var(--color-highlight)', color: 'var(--color-primary)' }}
                  >
                    {savingAllOradores ? 'Guardando todo...' : 'Guardar Todo'}
                  </button>
                </div>
              )}
            </div>

            {!isCafeOrEncuentro ? (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px dashed var(--color-border)' }}>
                <AlertCircle size={36} style={{ color: 'var(--color-text-muted)', marginBottom: '0.75rem' }} />
                <h4 style={{ color: 'var(--color-primary)', margin: 0 }}>Minuta no disponible</h4>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '6px', maxWidth: '360px', margin: '6px auto 0 auto' }}>
                  La carga de minutas de micrófono está pensada exclusivamente para los formatos de **Encuentro con Vecinos** y **Café con Vecinos**.
                </p>
              </div>
            ) : loadingOradores ? (
              <div style={{ padding: '4rem 0', textAlign: 'center' }}>
                <div className="spinner"></div>
                <p style={{ marginTop: '1rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Cargando lista de oradores...</p>
              </div>
            ) : oradores.length === 0 ? (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px dashed var(--color-border)' }}>
                <Mic size={36} style={{ color: 'var(--color-text-muted)', marginBottom: '0.75rem' }} />
                <h4 style={{ color: 'var(--color-primary)', margin: 0 }}>No hay oradores registrados</h4>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '6px', maxWidth: '320px', margin: '6px auto 0 auto' }}>
                  Nadie ha sido anotado para hablar en territorio durante el control de acceso a esta reunión.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {oradores.map((o) => {
                  const state = oradorStates[o.id] || { estado: 'en_espera', tema_original: '', tema_efectivo: '' };
                  const saveStatus = savedOradorStatus[o.id];
                  const isSavingRow = savingOradorId === o.id;

                  return (
                    <div 
                      key={o.id} 
                      className="card" 
                      style={{ 
                        margin: 0, 
                        padding: '1.25rem', 
                        border: '1px solid var(--color-border)', 
                        backgroundColor: '#FFFFFF',
                        borderLeft: state.estado === 'hablo'
                          ? '5px solid var(--color-success)'
                          : state.estado === 'se_bajo'
                          ? '5px solid var(--color-text-muted)'
                          : '5px solid var(--color-highlight)'
                      }}
                    >
                      {/* Cabecera del Orador */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <strong style={{ color: 'var(--color-primary)', fontSize: '1rem' }}>
                            #{o.orden} - {o.vecino?.nombre} {o.vecino?.apellido}
                          </strong>
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            DNI: {o.vecino_id} | Barrio: {o.vecino?.barrio || 'No especificado'}
                          </span>
                        </div>

                        {/* Selector de 3 Categorías */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <select
                            className="form-control form-control-sm"
                            value={state.estado}
                            onChange={(e) => handleOradorStateChange(o.id, 'estado', e.target.value)}
                            style={{ 
                              width: '120px', 
                              padding: '4px 8px', 
                              fontSize: '0.8rem', 
                              fontWeight: '600',
                              backgroundColor: state.estado === 'hablo' ? '#DEF7EC' : state.estado === 'se_bajo' ? '#F3F4F6' : '#E1EFFE',
                              color: state.estado === 'hablo' ? '#03543F' : state.estado === 'se_bajo' ? '#374151' : '#1E429F',
                              border: '1px solid #CBD5E1'
                            }}
                          >
                            <option value="en_espera">Anotado</option>
                            <option value="hablo">Efectivo</option>
                            <option value="se_bajo">Se bajó</option>
                          </select>

                          {/* Botón de guardado rápido por fila */}
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleSaveOradorRow(o.id)}
                            disabled={isSavingRow}
                            style={{ 
                              padding: '4px 8px', 
                              backgroundColor: saveStatus === 'success' ? 'var(--color-success)' : saveStatus === 'error' ? 'var(--color-danger)' : 'var(--color-primary)',
                              borderColor: saveStatus === 'success' ? 'var(--color-success)' : saveStatus === 'error' ? 'var(--color-danger)' : 'var(--color-primary)'
                            }}
                            title="Guardar cambios de este orador"
                          >
                            {isSavingRow ? '...' : saveStatus === 'success' ? <Check size={14} /> : 'Guardar'}
                          </button>
                        </div>
                      </div>

                      {/* Textareas de Minuta / Temática */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)' }}>
                            Problemática Original (Anotado en la Puerta)
                          </label>
                          <textarea
                            rows="2"
                            className="form-control"
                            value={state.tema_original}
                            onChange={(e) => handleOradorStateChange(o.id, 'tema_original', e.target.value)}
                            style={{ fontSize: '0.85rem' }}
                            placeholder="Tema de consulta manifestado en la puerta..."
                          />
                        </div>

                        {/* Tema Efectivo / Minuta de lo que habló (SIEMPRE HABILITADO - Requisito 2) */}
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ 
                            fontSize: '0.75rem', 
                            fontWeight: '600', 
                            color: 'var(--color-primary)'
                          }}>
                            Minuta Final (Lo que expuso en el Micrófono - Se autoguardará como Efectivo si tiene texto) *
                          </label>
                          <textarea
                            rows="2"
                            className="form-control"
                            value={state.tema_efectivo}
                            onChange={(e) => handleOradorStateChange(o.id, 'tema_efectivo', e.target.value)}
                            placeholder="Escribí el resumen corregido de lo que el vecino expuso frente al funcionario..." 
                            style={{ 
                              fontSize: '0.85rem', 
                              backgroundColor: '#FFFFFF',
                              borderColor: state.tema_efectivo ? 'var(--color-highlight)' : 'var(--color-border)' 
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}
