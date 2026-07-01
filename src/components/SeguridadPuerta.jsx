import React, { useState } from 'react';
import { Shield, AlertTriangle } from 'lucide-react';

export default function SeguridadPuerta({ onConfirm, onCancel }) {
  const [preguntaTexto, setPreguntaTexto] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!preguntaTexto.trim()) return;
    onConfirm(preguntaTexto.trim());
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ borderTopColor: '#EF4444' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
          <div style={{ padding: '8px', borderRadius: '50%', backgroundColor: '#FDE8E8', color: '#EF4444' }}>
            <Shield size={20} />
          </div>
          <h3 style={{ margin: 0, color: 'var(--color-primary)' }}>Pregunta de Seguridad Obligatoria</h3>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
          Para registrar la asistencia en este tipo de reunión ("Seguridad en Tu Barrio"), es requisito ingresar la problemática declarada por el vecino al ingresar.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="pregunta">Problemática o "Pregunta de la Puerta" *</label>
            <textarea
              id="pregunta"
              className="form-control"
              rows="3"
              placeholder="Ej: Reclama luminaria rota en la esquina de su casa; robos reiterados a la parada de colectivo..."
              value={preguntaTexto}
              onChange={(e) => setPreguntaTexto(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1.5rem' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onCancel}
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="btn btn-danger" 
              disabled={!preguntaTexto.trim()}
            >
              Confirmar Asistencia
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
