import React, { useState } from 'react';
import { descargarFichasYReclamos } from '../services/exportFichasService';

/**
 * Botón global de exportación "Descargar Fichas y Reclamos" (válido para cualquier tipo de reunión).
 */
export default function BotonDescargarFichas({ reunion, style = {} }) {
  const [descargando, setDescargando] = useState(false);

  const handleClick = async () => {
    if (descargando) return;
    setDescargando(true);
    try {
      const res = await descargarFichasYReclamos(reunion);
      if (res.count === 0) {
        alert('No hay asistentes, oradores ni fichas para exportar todavía.');
      }
    } catch (err) {
      console.error('Error exportando fichas y reclamos:', err);
      alert('No se pudo generar el archivo. Revisá tu conexión e intentá nuevamente.');
    } finally {
      setDescargando(false);
    }
  };

  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={handleClick}
      disabled={descargando}
      title="Excel con asistentes, tema de inscripción, tema de ficha digital y tema de oratoria"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: '#059669',
        color: '#FFFFFF',
        border: 'none',
        borderRadius: '6px',
        padding: '6px 14px',
        fontWeight: '800',
        cursor: descargando ? 'wait' : 'pointer',
        opacity: descargando ? 0.7 : 1,
        boxShadow: '0 2px 6px rgba(5,150,105,0.35)',
        ...style
      }}
    >
      {descargando ? 'Generando...' : '📥 Descargar Fichas y Reclamos'}
    </button>
  );
}
