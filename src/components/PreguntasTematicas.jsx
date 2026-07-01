import React, { useState, useEffect } from 'react';
import { QrCode, MessageSquare, Send, RefreshCw, AlertCircle } from 'lucide-react';
import { getPreguntasQR, addPreguntaQR } from '../services/supabaseService';

export default function PreguntasTematicas({ reunion, asistencias }) {
  const [preguntas, setPreguntas] = useState([]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [selectedVecinoDni, setSelectedVecinoDni] = useState('');

  // Preguntas predefinidas para el simulador
  const bancoPreguntasMock = [
    "¿Se contempla agregar bicisendas en la calle Superí?",
    "¿Hay planes de instalar cámaras de monitoreo con IA en esta plaza?",
    "¿Cómo van a solucionar las demoras en el retiro de contenedores de basura?",
    "¿Cuándo reabre la biblioteca comunal de la calle Tamborini?",
    "¿Se van a reforzar las patrullas los fines de semana en la zona comercial?"
  ];

  useEffect(() => {
    loadPreguntas();
  }, [reunion.id]);

  const loadPreguntas = async () => {
    const { data, error } = await getPreguntasQR(reunion.id);
    if (!error && data) {
      setPreguntas(data);
    }
  };

  const handleSimulateQRQuestion = async () => {
    // Tomar un vecino presente al azar
    const presentes = asistencias.filter(a => a.asistio);
    if (presentes.length === 0) {
      alert('Debe haber al menos un vecino presente para simular la autoría de la pregunta.');
      return;
    }
    const vecinoRandom = presentes[Math.floor(Math.random() * presentes.length)];
    const preguntaRandomText = bancoPreguntasMock[Math.floor(Math.random() * bancoPreguntasMock.length)];

    await addPreguntaQR(reunion.id, vecinoRandom.vecino_id, preguntaRandomText);
    await loadPreguntas();
  };

  const handleManualSendQuestion = async (e) => {
    e.preventDefault();
    if (!selectedVecinoDni || !newQuestionText) {
      alert('Seleccione un vecino y complete la pregunta.');
      return;
    }
    await addPreguntaQR(reunion.id, selectedVecinoDni, newQuestionText);
    setSelectedVecinoDni('');
    setNewQuestionText('');
    await loadPreguntas();
  };

  // Vecinos presentes para elegir como autor de la pregunta manual
  const vecinosPresentes = asistencias.filter(a => a.asistio);

  return (
    <div className="grid-2">
      {/* Listado de preguntas ingresadas */}
      <div className="card" style={{ margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={20} style={{ color: 'var(--color-highlight)' }} />
            Preguntas Recibidas
          </h3>
          <button 
            type="button" 
            className="btn btn-secondary btn-sm"
            onClick={handleSimulateQRQuestion}
            style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
          >
            <RefreshCw size={12} /> Simular Entrada QR
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '450px', overflowY: 'auto' }}>
          {preguntas.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              No se han recibido preguntas por código QR aún.
            </div>
          ) : (
            [...preguntas].reverse().map((pq) => (
              <div 
                key={pq.id} 
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  backgroundColor: '#ffffff',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-highlight)' }}>
                    {pq.vecino?.nombre} {pq.vecino?.apellido}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                    Comuna: {pq.vecino?.comuna || 'No especificada'}
                  </span>
                </div>
                <p style={{ fontSize: '0.9rem', marginTop: '6px', color: 'var(--color-primary)', fontWeight: '500' }}>
                  "{pq.pregunta}"
                </p>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '6px', textAlign: 'right' }}>
                  Recibida: {new Date(pq.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} hs
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Módulo Escáner QR e Ingreso Manual */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Panel del QR */}
        <div className="card" style={{ margin: 0, textAlign: 'center', backgroundColor: 'var(--color-primary)', color: '#ffffff' }}>
          <h3 style={{ color: '#ffffff', fontSize: '1.1rem', marginBottom: '8px' }}>Código QR para Vecinos</h3>
          <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', marginBottom: '1.25rem', maxWidth: '300px', margin: '0 auto 1.25rem auto' }}>
            Los vecinos escanean este código en las pantallas del evento para enviar sus preguntas de forma directa.
          </p>
          
          <div style={{
            backgroundColor: '#ffffff',
            padding: '12px',
            borderRadius: '12px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1rem',
            boxShadow: '0 4px 10px rgba(0,0,0,0.15)'
          }}>
            {/* Dibujamos un QR simulado con CSS */}
            <div style={{
              width: '130px',
              height: '130px',
              border: '4px solid var(--color-primary)',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
              <QrCode size={100} style={{ color: 'var(--color-primary)' }} />
              {/* Logo de Participación en el centro */}
              <div style={{
                position: 'absolute',
                width: '30px',
                height: '30px',
                backgroundColor: 'var(--color-highlight)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary)',
                fontSize: '0.6rem',
                fontWeight: '700',
                border: '2px solid #ffffff'
              }}>
                PC
              </div>
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-mint)', fontWeight: '600' }}>
            ID REUNIÓN: {reunion.id.substring(0, 8).toUpperCase()}
          </div>
        </div>

        {/* Carga manual desde el panel (Soporte) */}
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-primary)' }}>Ingresar Pregunta Manual</h3>
          <form onSubmit={handleManualSendQuestion}>
            <div className="form-group">
              <label>Autor (Vecino Presente)</label>
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
            </div>
            
            <div className="form-group">
              <label>Pregunta Formulada</label>
              <textarea
                className="form-control"
                rows="2"
                placeholder="Escribe la consulta tomada del vecino..."
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-sm" style={{ width: '100%' }}>
              <Send size={14} /> Registrar Pregunta Zonal
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
