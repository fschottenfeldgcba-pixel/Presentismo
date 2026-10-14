import React, { useState, useEffect, useRef } from 'react';
import { buscarUbicacionCaba, obtenerComunaPorCoordenadas } from '../services/georrefService';
import { MapPin, Check, Loader2, Building, Navigation } from 'lucide-react';

export default function InputDireccionCaba({
  value = '',
  onChange,
  onSelectNormalizada,
  placeholder = 'Ej: Av. San Juan 2500, Callao y Corrientes, o Hospital Fernández'
}) {
  const [query, setQuery] = useState(value);
  const [sugerencias, setSugerencias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [seleccionada, setSeleccionada] = useState(null);
  const timeoutRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setMostrarDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = (e) => {
    const text = e.target.value;
    setQuery(text);
    setSeleccionada(null);
    onChange(text);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (!text || text.trim().length < 3) {
      setSugerencias([]);
      setMostrarDropdown(false);
      return;
    }

    setBuscando(true);
    timeoutRef.current = setTimeout(async () => {
      try {
        const results = await buscarUbicacionCaba(text);
        setSugerencias(results);
        setMostrarDropdown(results.length > 0);
      } catch (err) {
        setSugerencias([]);
      } finally {
        setBuscando(false);
      }
    }, 350);
  };

  const handleSelectOption = async (item) => {
    let labelElegido = item.direccionNormalizada || item.label;
    if (item.tipo === 'lugar') {
      if (item.direccionNormalizada && item.direccionNormalizada !== item.label) {
        labelElegido = `${item.label} (${item.direccionNormalizada})`;
      } else {
        labelElegido = item.label;
      }
    }

    setQuery(labelElegido);
    setSeleccionada(item);
    setMostrarDropdown(false);
    onChange(labelElegido);

    let comuna = item.comuna || null;
    if (!comuna && item.lat && item.lng) {
      try {
        comuna = await obtenerComunaPorCoordenadas(item.lat, item.lng);
      } catch (e) {}
    }

    if (onSelectNormalizada) {
      onSelectNormalizada({
        direccion: labelElegido,
        lat: item.lat,
        lng: item.lng,
        comuna: comuna,
        tipo: item.tipo,
        altura: item.altura || null,
        cruce: item.cruce || null,
        fuente: item.fuente,
        autocompletado: true
      });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (mostrarDropdown && sugerencias.length > 0) {
        e.preventDefault();
        handleSelectOption(sugerencias[0]);
      }
    }
  };

  const handleBlur = () => {
    if (!seleccionada && sugerencias.length > 0 && query) {
      const qNorm = query.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const firstNorm = sugerencias[0].label.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (qNorm === firstNorm) {
        handleSelectOption(sugerencias[0]);
      }
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder={placeholder}
          className="form-control"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={() => {
            if (sugerencias.length > 0) setMostrarDropdown(true);
          }}
          style={{
            fontSize: '0.88rem',
            paddingLeft: '32px',
            paddingRight: buscando || seleccionada ? '32px' : '12px',
            borderColor: seleccionada ? '#10B981' : undefined,
            backgroundColor: seleccionada ? '#F0FDF4' : '#FFFFFF'
          }}
        />
        <MapPin 
          size={16} 
          style={{ 
            position: 'absolute', 
            left: '10px', 
            top: '50%', 
            transform: 'translateY(-50%)', 
            color: seleccionada ? '#10B981' : '#94A3B8' 
          }} 
        />

        {buscando && (
          <Loader2 
            size={16} 
            className="animate-spin"
            style={{ 
              position: 'absolute', 
              right: '10px', 
              top: '50%', 
              transform: 'translateY(-50%)', 
              color: '#0284C7' 
            }} 
          />
        )}

        {seleccionada && !buscando && (
          <span
            title="Dirección validada en el Callejero de CABA"
            style={{ 
              position: 'absolute', 
              right: '10px', 
              top: '50%', 
              transform: 'translateY(-50%)', 
              color: '#10B981',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Check size={16} strokeWidth={3} />
          </span>
        )}
      </div>

      {/* Dropdown predictivo de sugerencias oficiales */}
      {mostrarDropdown && sugerencias.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)',
          border: '1px solid #E2E8F0',
          zIndex: 9999,
          maxHeight: '260px',
          overflowY: 'auto'
        }}>
          <div style={{
            padding: '6px 12px',
            fontSize: '0.7rem',
            fontWeight: '700',
            color: '#64748B',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            🏛️ Callejero y Lugares Oficiales de la Ciudad
          </div>

          {sugerencias.map((item) => (
            <div
              key={item.id}
              onClick={() => handleSelectOption(item)}
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid #F1F5F9',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                transition: 'background-color 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F0F9FF'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FFFFFF'}
            >
              <div style={{ marginTop: '2px', color: item.tipo === 'lugar' ? '#8B5CF6' : '#0284C7' }}>
                {item.tipo === 'lugar' ? <Building size={16} /> : <Navigation size={16} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#1E293B' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {item.tipo === 'lugar' ? (
                    <span>📍 {item.direccionNormalizada || 'Ciudad de Buenos Aires'}</span>
                  ) : (
                    <span>{item.localidad || 'CABA'}</span>
                  )}
                  <span style={{
                    fontSize: '0.65rem',
                    backgroundColor: item.tipo === 'lugar' ? '#EDE9FE' : '#E0F2FE',
                    color: item.tipo === 'lugar' ? '#6D28D9' : '#0369A1',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: '700'
                  }}>
                    {item.fuente}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
