import React from 'react';
import { getUrlWhatsAppPapeleta, getUrlMailPapeleta } from '../services/solicitudesService';

/**
 * Botones de envío de la Ficha/Papeleta Digital por WhatsApp y Mail para un vecino de una reunión.
 * `item` es una fila de inscripciones_asistencias con `vecino` embebido.
 */
export default function FichaEnvioLinks({ reunion, item }) {
  const v = item?.vecino || {};
  const dni = v.dni || item?.vecino_id;
  const nombre = v.nombre || '';

  const waUrl = getUrlWhatsAppPapeleta({ celular: v.celular, nombre, reunionId: reunion?.id, dni });
  const mailUrl = getUrlMailPapeleta({ email: v.email, nombre, reunionId: reunion?.id, dni, reunionNombre: reunion?.nombre });

  if (!waUrl && !mailUrl) return null;

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '0.72rem',
    fontWeight: '700',
    textDecoration: 'none',
    padding: '3px 8px',
    borderRadius: '5px',
    color: '#FFFFFF'
  };

  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
      {waUrl && (
        <a href={waUrl} target="_blank" rel="noopener noreferrer" style={{ ...base, backgroundColor: '#25D366' }} title="Enviar la ficha digital por WhatsApp">
          📱 WhatsApp
        </a>
      )}
      {mailUrl && (
        <a href={mailUrl} style={{ ...base, backgroundColor: '#2563EB' }} title="Enviar la ficha digital por e-mail">
          ✉️ Mail
        </a>
      )}
    </div>
  );
}
