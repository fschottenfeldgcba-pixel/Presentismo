import React, { useState, useEffect } from 'react';
import { Play, Square, UserPlus, Clock, Search, AlertCircle, HelpCircle } from 'lucide-react';
import { ESTADO_CONVOCATORIA } from '../data/mockData';
import { guardarAsistencia, upsertVecino } from '../services/supabaseService';

export default function Cronometro1a1({ reunion, initialAsistencias, onUpdate }) {
  const [asistencias, setAsistencias] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Timers activos en memoria (para segundero en vivo)
  // { 'dni_vecino': { startMs: Number, elapsedSecs: Number } }
  const [activeTimers, setActiveTimers] = useState({});

  // Formulario para registro "Por la ventana" (Walk-In excepcional)
  const [showVentanaModal, setShowVentanaModal] = useState(false);
  const [vetDni, setVetDni] = useState('');
  const [vetNombre, setVetNombre] = useState('');
  const [vetApellido, setVetApellido] = useState('');
  const [vetCelular, setVetCelular] = useState('');
  const [vetEmail, setVetEmail] = useState('');
  const [vetBloque, setVetBloque] = useState('Por la ventana (Libre)');

  useEffect(() => {
    setAsistencias(initialAsistencias);
  }, [initialAsistencias]);

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

    // Guardar asistencia en Supabase sin las columnas de tiempo eliminadas
    await guardarAsistencia(reunion.id, vecinoDni, true);

    // Registrar en el segundero
    setActiveTimers(prev => ({
      ...prev,
      [vecinoDni]: {
        startMs: Date.now(),
        elapsedSecs: 0,
        isRunning: true,
        horaIngreso: horaIngresoStr
      }
    }));

    onUpdate();
  };

  // Finalizar atención (Stop / Guardar)
  const handleStopTimer = async (vecinoDni) => {
    const timer = activeTimers[vecinoDni];
    if (!timer) return;

    const now = new Date();
    const horaSalidaStr = now.toTimeString().split(' ')[0]; // "HH:MM:SS"

    // Calcular permanencia aproximada en minutos
    const totalSecs = timer.elapsedSecs;
    const minutes = Math.max(1, Math.round(totalSecs / 60));

    // Guardar salida en Supabase
    await guardarAsistencia(reunion.id, vecinoDni, true);

    // Remover de los timers activos
    setActiveTimers(prev => {
      const next = { ...prev };
      delete next[vecinoDni];
      return next;
    });

    onUpdate();
    alert(`Reunión con vecino DNI ${vecinoDni} concluida. Permanencia: ${minutes} minutos.`);
  };

  // Carga manual "Por la ventana"
  const handleSaveVentana = async (e) => {
    e.preventDefault();
    if (!vetDni || !vetNombre || !vetApellido) {
      alert('DNI, Nombre y Apellido son obligatorios.');
      return;
    }

    // Alta en el padrón central
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

    // Alta inmediata en asistencia de 1a1
    await guardarAsistencia(reunion.id, vecino.dni, true, {
      estado_convocatoria: 'walk_in'
    });

    // Poner el timer a correr automáticamente
    setActiveTimers(prev => ({
      ...prev,
      [vecino.dni]: {
        startMs: Date.now(),
        elapsedSecs: 0,
        isRunning: true,
        horaIngreso: horaIngresoStr
      }
    }));

    // Resetear
    setVetDni('');
    setVetNombre('');
    setVetApellido('');
    setVetCelular('');
    setVetEmail('');
    setShowVentanaModal(false);
    
    onUpdate();
    alert('¡Vecino registrado por la ventana e inicio de cronómetro!');
  };

  // Filtrado de vecinos
  const filteredAsistencias = asistencias.filter(item => {
    const term = searchQuery.toLowerCase();
    const nombreCompleto = `${item.vecino?.nombre} ${item.vecino?.apellido}`.toLowerCase();
    return (
      item.vecino_id.includes(term) ||
      nombreCompleto.includes(term) ||
      (item.horario_bloque_asignado || '').toLowerCase().includes(term)
    );
  });

  // Formatear segundos a MM:SS
  const formatSeconds = (totalSecs) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ fontSize: '1.2rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={20} style={{ color: 'var(--color-highlight)' }} />
            Planilla Quirúrgica de Reunión 1 a 1
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Control de ingreso, egreso y bloques de atención de vecinos.
          </p>
        </div>

        <button className="btn btn-highlight btn-sm" onClick={() => setShowVentanaModal(true)}>
          <UserPlus size={16} /> Entra "Por la Ventana"
        </button>
      </div>

      <div className="search-container" style={{ maxWidth: '400px', marginBottom: '1.5rem' }}>
        <input
          type="text"
          className="form-control"
          placeholder="Buscar por DNI, Nombre o Bloque Horario..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Bloque Horario</th>
              <th>Vecino (Nombre y DNI)</th>
              <th>Tema / Consulta Previa</th>
              <th>Hora Ingreso</th>
              <th>Hora Salida</th>
              <th style={{ textAlign: 'center' }}>Cronómetro en Vivo</th>
              <th style={{ textAlign: 'right' }}>Acciones Quirúrgicas</th>
            </tr>
          </thead>
          <tbody>
            {filteredAsistencias.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                  No hay vecinos citados para esta mesa en los bloques cargados.
                </td>
              </tr>
            ) : (
              filteredAsistencias.map(item => {
                const timer = activeTimers[item.vecino_id];
                const isRunning = timer?.isRunning;
                
                return (
                  <tr key={item.id} style={{
                    backgroundColor: isRunning ? '#F0FDF4' : (item.asistio && !isRunning ? '#F8FAFC' : 'inherit')
                  }}>
                    <td>
                      <span className="badge badge-info" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {item.estado_convocatoria === 'walk_in' ? 'Espontáneo' : 'Citado'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: '600' }}>
                        {item.vecino?.nombre} {item.vecino?.apellido}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        DNI: {item.vecino_id} 
                        {item.estado_convocatoria === 'walk_in' && (
                          <span style={{ marginLeft: '6px', color: 'var(--color-warning)', fontWeight: '700' }}>(Ventana)</span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.85rem', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.tema_previo || <span style={{ color: 'var(--color-text-muted)' }}>No cargado</span>}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {timer ? timer.horaIngreso : (item.asistio ? 'Registrado' : '-')}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {item.asistio && !isRunning ? 'Concluido' : '-'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {isRunning ? (
                        <span className="cronometro-display" style={{ color: 'var(--color-success)', borderColor: 'var(--color-success)' }}>
                          <span className="status-dot animate-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-success)' }}></span>
                          {formatSeconds(timer.elapsedSecs)}
                        </span>
                      ) : (item.asistio && !isRunning) ? (
                        <span className="badge badge-success">Concluido</span>
                      ) : (
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Sin Iniciar</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {!item.asistio && !isRunning && (
                        <button 
                          className="btn btn-primary btn-sm"
                          onClick={() => handleStartTimer(item.vecino_id)}
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        >
                          <Play size={12} /> Marcar Ingreso
                        </button>
                      )}
                      
                      {isRunning && (
                        <button 
                          className="btn btn-danger btn-sm"
                          onClick={() => handleStopTimer(item.vecino_id)}
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        >
                          <Square size={12} /> Registrar Salida
                        </button>
                      )}

                      {item.asistio && !isRunning && (
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-success)', fontWeight: '600' }}>✓ Atendido</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
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
                <label>Bloque Asignado Temporal</label>
                <input
                  type="text"
                  className="form-control"
                  value={vetBloque}
                  onChange={(e) => setVetBloque(e.target.value)}
                />
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
