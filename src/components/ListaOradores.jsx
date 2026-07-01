import React, { useState, useEffect } from 'react';
import { Mic, CheckCircle2, XCircle, ArrowUp, Plus, UserCheck } from 'lucide-react';
import { ESTADO_ORADOR } from '../data/mockData';
import { getOradores, registrarOrador, updateOradorEstado } from '../services/supabaseService';

export default function ListaOradores({ reunion, asistencias }) {
  const [oradores, setOradores] = useState([]);
  const [selectedVecinoDni, setSelectedVecinoDni] = useState('');
  const [temaOriginal, setTemaOriginal] = useState('');
  const [temaEfectivo, setTemaEfectivo] = useState('');
  const [oradorEnUsoMic, setOradorEnUsoMic] = useState(null); // Orador que va a hablar o escribir tema efectivo

  useEffect(() => {
    loadOradores();
  }, [reunion.id]);

  const loadOradores = async () => {
    const { data, error } = await getOradores(reunion.id);
    if (!error && data) {
      setOradores(data);
    }
  };

  // Filtrar vecinos que están presentes para poder agregarlos como oradores
  const vecinosPresentes = asistencias.filter(a => a.asistio);

  const handleAddOrador = async (e) => {
    e.preventDefault();
    if (!selectedVecinoDni || !temaOriginal) {
      alert('Debe seleccionar un vecino y especificar el tema original de consulta.');
      return;
    }

    const exist = oradores.find(o => o.vecino_id === selectedVecinoDni);
    if (exist) {
      alert('Este vecino ya está anotado en la lista de oradores.');
      return;
    }

    const nextOrder = oradores.length + 1;
    const { error } = await registrarOrador({
      reunion_id: reunion.id,
      vecino_id: selectedVecinoDni,
      tema_original: temaOriginal,
      orden: nextOrder
    });

    if (error) {
      alert(`Error al registrar orador: ${error.message}`);
      return;
    }

    setSelectedVecinoDni('');
    setTemaOriginal('');
    await loadOradores();
  };

  const handleChangeEstado = async (oradorId, nuevoEstado) => {
    if (nuevoEstado === ESTADO_ORADOR.HABLO) {
      const target = oradores.find(o => o.id === oradorId);
      setOradorEnUsoMic(target);
      setTemaEfectivo(target.tema_original); // sugerir original como efectivo
    } else {
      const { error } = await updateOradorEstado(oradorId, nuevoEstado);
      if (error) {
        alert(`Error al cambiar estado: ${error.message}`);
      }
      await loadOradores();
    }
  };

  const handleSaveTemaEfectivo = async () => {
    const { error } = await updateOradorEstado(oradorEnUsoMic.id, ESTADO_ORADOR.HABLO, temaEfectivo);
    if (error) {
      alert(`Error al guardar tema efectivo: ${error.message}`);
    }
    setOradorEnUsoMic(null);
    setTemaEfectivo('');
    await loadOradores();
  };

  return (
    <div className="grid-2">
      {/* Listado de Oradores anotados */}
      <div className="card" style={{ margin: 0 }}>
        <h3 style={{ fontSize: '1.2rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Mic size={20} style={{ color: 'var(--color-highlight)' }} />
          Lista de Micrófono en Vivo
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {oradores.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              No hay oradores registrados aún en el micrófono.
            </div>
          ) : (
            oradores.map((o, idx) => (
              <div 
                key={o.id} 
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  backgroundColor: o.estado === ESTADO_ORADOR.HABLO ? '#F8FAFC' : '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: o.estado === ESTADO_ORADOR.BAJO ? 0.6 : 1
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      backgroundColor: 'var(--color-primary)',
                      color: '#ffffff',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '700'
                    }}>
                      {idx + 1}
                    </span>
                    <strong style={{ color: 'var(--color-primary)' }}>
                      {o.vecino?.nombre} {o.vecino?.apellido}
                    </strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      DNI: {o.vecino_id}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.85rem', marginTop: '6px' }}>
                    <strong>Tema original:</strong> <span style={{ color: 'var(--color-text-dark)' }}>"{o.tema_original}"</span>
                  </div>

                  {o.tema_efectivo && (
                    <div style={{ fontSize: '0.85rem', marginTop: '2px', color: '#0F766E' }}>
                      <strong>Resumen efectivo:</strong> <span>"{o.tema_efectivo}"</span>
                    </div>
                  )}

                  <div style={{ marginTop: '8px' }}>
                    {o.estado === ESTADO_ORADOR.ESPERA && <span className="badge badge-warning">En espera</span>}
                    {o.estado === ESTADO_ORADOR.HABLO && <span className="badge badge-success">Habló</span>}
                    {o.estado === ESTADO_ORADOR.BAJO && <span className="badge badge-danger">Se bajó</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  {o.estado === ESTADO_ORADOR.ESPERA && (
                    <>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleChangeEstado(o.id, ESTADO_ORADOR.HABLO)}
                        title="Marcar como hablando / cerró su intervención"
                        style={{ padding: '6px' }}
                      >
                        <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} />
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleChangeEstado(o.id, ESTADO_ORADOR.BAJO)}
                        title="Se bajó / Canceló la intervención"
                        style={{ padding: '6px' }}
                      >
                        <XCircle size={16} style={{ color: 'var(--color-danger)' }} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Registrar nuevo orador */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1.25rem', color: 'var(--color-primary)' }}>Anotar Orador en Vivo</h3>
          
          <form onSubmit={handleAddOrador}>
            <div className="form-group">
              <label>Seleccionar Vecino Presente *</label>
              <select
                className="form-control"
                value={selectedVecinoDni}
                onChange={(e) => setSelectedVecinoDni(e.target.value)}
                required
              >
                <option value="">-- Seleccionar Vecino --</option>
                {vecinosPresentes.map(a => (
                  <option key={a.vecino_id} value={a.vecino_id}>
                    {a.vecino?.nombre} {a.vecino?.apellido} (DNI: {a.vecino_id})
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block' }}>
                Solo se pueden anotar vecinos que previamente hayan sido marcados como **Presentes** en la asistencia.
              </span>
            </div>

            <div className="form-group">
              <label>Tema Original de Consulta *</label>
              <textarea
                className="form-control"
                rows="3"
                placeholder="Ej: Pide poda del árbol de la puerta de su casa por peligro de caída..."
                value={temaOriginal}
                onChange={(e) => setTemaOriginal(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              <Plus size={16} /> Anotar al Micrófono
            </button>
          </form>
        </div>

        {/* Modal/Panel para guardar tema efectivo */}
        {oradorEnUsoMic && (
          <div className="card" style={{ margin: 0, border: '2px solid var(--color-highlight)', backgroundColor: '#F0FDFA' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Mic size={16} /> Finalizar Intervención de Orador
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
              Vecino: <strong>{oradorEnUsoMic.vecino?.nombre} {oradorEnUsoMic.vecino?.apellido}</strong>. Cargá el tema final abordado para el control de Cercanía.
            </p>

            <div className="form-group">
              <label>Tema Efectivo / Abordado en la Reunión</label>
              <textarea
                className="form-control"
                rows="3"
                value={temaEfectivo}
                onChange={(e) => setTemaEfectivo(e.target.value)}
                placeholder="Ej: El vecino habló de la poda, pero también pidió arreglos por rotura de vereda de raíces."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm" 
                onClick={() => setOradorEnUsoMic(null)}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                className="btn btn-highlight btn-sm" 
                onClick={handleSaveTemaEfectivo}
              >
                Confirmar Intervención
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
