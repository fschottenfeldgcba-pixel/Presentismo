import React from 'react';
import { ORADOR_TAGS } from '../constants/oradorTags';

/**
 * Selector interactivo de tags para correcciones manuales.
 * Los tags asignados (selectedTags) aparecen con fondo lleno.
 * Los no asignados aparecen como outline.
 * Click togglea y llama a onToggle(label).
 *
 * Props:
 *   selectedTags  – string[]  – tags actualmente guardados
 *   onToggle      – (label: string) => void
 *   disabled      – bool (opcional)
 *   compact       – bool (opcional) – chips más pequeños
 */
export default function OradorTagSelector({ selectedTags = [], onToggle, disabled = false, compact = false }) {
  const selected = new Set(selectedTags || []);
  const size = compact ? '0.68rem' : '0.75rem';
  const px   = compact ? '7px'    : '10px';
  const py   = compact ? '3px'    : '5px';

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? '4px' : '6px' }}>
      {ORADOR_TAGS.map((tag) => {
        const isOn = selected.has(tag.label);
        return (
          <button
            key={tag.label}
            type="button"
            onClick={() => !disabled && onToggle && onToggle(tag.label)}
            title={isOn ? `Quitar: ${tag.label}` : `Agregar: ${tag.label}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: `${py} ${px}`, borderRadius: '999px',
              border: `1.5px solid ${tag.color}`,
              backgroundColor: isOn ? tag.color : 'transparent',
              color: isOn ? '#fff' : tag.color,
              fontSize: size, fontWeight: 600,
              cursor: disabled ? 'default' : 'pointer',
              opacity: disabled ? 0.6 : isOn ? 1 : 0.65,
              transition: 'all 0.15s ease', userSelect: 'none', whiteSpace: 'nowrap',
            }}
          >
            {isOn && <span style={{ fontSize: '0.65rem' }}>✓</span>}
            {tag.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Display de solo lectura: muestra los tags asignados como píldoras de color.
 */
export function OradorTagsDisplay({ tags = [], compact = false }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? '3px' : '5px' }}>
      {tags.map((label) => {
        const tagDef = ORADOR_TAGS.find((t) => t.label === label);
        const color  = tagDef?.color || '#6b7280';
        return (
          <span
            key={label}
            style={{
              display: 'inline-flex', alignItems: 'center',
              padding: compact ? '2px 7px' : '3px 9px',
              borderRadius: '999px',
              backgroundColor: color, color: '#fff',
              fontSize: compact ? '0.65rem' : '0.72rem',
              fontWeight: 600, whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
