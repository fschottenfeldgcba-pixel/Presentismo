import React, { useState, useEffect, useRef } from 'react';
import { buscarUbicacionCaba, normalizarDireccionUsig, obtenerComunaPorCoordenadas, buscarLugaresEpok, limpiarTextoDireccion } from '../services/georrefService';
import { MapPin, Check, Loader2, Building, Navigation, GitFork, CornerDownRight } from 'lucide-react';

export default function InputDireccionCaba({
  value = '',
  onChange,
  onSelectNormalizada,
  placeholder = 'Ej: Monroe 1454, Zavalia y Mendoza, o Parque Chacabuco'
}) {
  const [query, setQuery] = useState(value);
  const [sugerencias, setSugerencias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [seleccionada, setSeleccionada] = useState(null);

  // Soporte interactivo para cuando el usuario elige primero la calle y luego indica altura O cruce
  const [calleFijada, setCalleFijada] = useState(null);
  const [tipoDetalle, setTipoDetalle] = useState('altura'); // 'altura' | 'cruce'
  const [detalleFijado, setDetalleFijado] = useState('');

  const timeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const containerRef = useRef(null);
  const detalleInputRef = useRef(null);

  // Sincronizar si cambia el valor externo
  useEffect(() => {
    setQuery(value || '');
    if (!value) {
      setCalleFijada(null);
      setDetalleFijado('');
      setSeleccionada(null);
    }
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
    setCalleFijada(null);
    setDetalleFijado('');
    onChange(text);

    // Cancelar debounce y fetch previo para evitar carreras y retrasos
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (!text || text.trim().length < 3) {
      setSugerencias([]);
      setMostrarDropdown(false);
      setBuscando(false);
      return;
    }

    setBuscando(true);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Debounce rápido de 100ms para respuesta ultra fluida
    timeoutRef.current = setTimeout(async () => {
      try {
        const results = await buscarUbicacionCaba(text, { signal });
        if (!signal.aborted) {
          setSugerencias(results);
          setMostrarDropdown(results.length > 0);
        }
      } catch (err) {
        if (!signal.aborted) {
          setSugerencias([]);
        }
      } finally {
        if (!signal.aborted) {
          setBuscando(false);
        }
      }
    }, 100);
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

    // Si el vecino eligió una calle pura (sin altura y sin cruce),
    // activamos el asistente interactivo para guiarlo a completar Altura o Cruce
    if (item.tipo === 'calle' && !item.altura && !item.cruce) {
      setCalleFijada(item.calle || item.label);
      setDetalleFijado('');
      setTipoDetalle('altura');
      setTimeout(() => {
        if (detalleInputRef.current) detalleInputRef.current.focus();
      }, 100);
    } else {
      setCalleFijada(null);
      setDetalleFijado('');
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

  // Manejar el tipeo en el campo interactivo de Altura o Cruce
  const handleDetalleFijadoChange = async (e) => {
    const val = e.target.value;
    setDetalleFijado(val);

    let dirCompleta = calleFijada;
    if (val.trim()) {
      if (tipoDetalle === 'cruce') {
        const cruceLimpio = val.trim().replace(/^(y|e\/|esq\.?|esquina)\s+/i, '').trim();
        dirCompleta = `${calleFijada} y ${cruceLimpio}`;
      } else {
        dirCompleta = `${calleFijada} ${val.trim()}`;
      }
    }

    setQuery(dirCompleta);
    onChange(dirCompleta);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (val.trim().length >= 1) {
      timeoutRef.current = setTimeout(async () => {
        try {
          const norm = await normalizarDireccionUsig(dirCompleta);
          if (norm) {
            let com = norm.comuna;
            if (!com && norm.lat && norm.lng) {
              com = await obtenerComunaPorCoordenadas(norm.lat, norm.lng);
            }
            if (onSelectNormalizada) {
              onSelectNormalizada({
                direccion: norm.direccion || dirCompleta,
                lat: norm.lat,
                lng: norm.lng,
                comuna: com,
                tipo: 'calle',
                altura: norm.altura || (tipoDetalle === 'altura' ? parseInt(val.trim(), 10) || null : null),
                cruce: norm.cruce || (tipoDetalle === 'cruce' ? val.trim() : null),
                fuente: 'Callejero Oficial (Georef)',
                autocompletado: true
              });
            }
          }
        } catch (err) {}
      }, 250);
    }
  };

  const handleCambiarTipoDetalle = (nuevoTipo) => {
    setTipoDetalle(nuevoTipo);
    setDetalleFijado('');
    setQuery(calleFijada);
    onChange(calleFijada);
    setTimeout(() => {
      if (detalleInputRef.current) detalleInputRef.current.focus();
    }, 50);
  };

  const handleCambiarCalle = () => {
    setCalleFijada(null);
    setDetalleFijado('');
    setQuery('');
    setSeleccionada(null);
    onChange('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (mostrarDropdown && sugerencias.length > 0) {
        e.preventDefault();
        handleSelectOption(sugerencias[0]);
      }
    }
  };

  const handleBlur = async () => {
    if (!seleccionada && query && query.trim().length >= 4) {
      // 1. Si hay sugerencias visibles y la primera coincide con lo escrito, auto-seleccionar
      if (sugerencias.length > 0) {
        const qNorm = query.trim().toLowerCase();
        const firstNorm = sugerencias[0].label.trim().toLowerCase();
        if (qNorm === firstNorm || firstNorm.includes(qNorm)) {
          handleSelectOption(sugerencias[0]);
          return;
        }
      }

      // 2. Si no seleccionó pero escribió una calle con altura o cruce, normalizar de fondo
      try {
        const norm = await normalizarDireccionUsig(query.trim());
        if (norm && norm.direccion) {
          handleSelectOption({
            id: `norm_${Date.now()}`,
            label: norm.direccion,
            direccionNormalizada: norm.direccion,
            calle: norm.direccion,
            tipo: 'calle',
            altura: norm.altura,
            cruce: norm.cruce,
            lat: norm.lat,
            lng: norm.lng,
            comuna: norm.comuna,
            fuente: 'Callejero Oficial (Georef)'
          });
          return;
        }

        // 3. Si escribió un lugar notable o punto de interés (ej: "Ciudad Universitaria", "CeSAC 38"):
        const lugares = await buscarLugaresEpok(query.trim(), 1);
        if (lugares && lugares.length > 0) {
          handleSelectOption(lugares[0]);
          return;
        }
      } catch (e) {}
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
            title="Dirección validada en el Callejero Oficial de la Ciudad"
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

      {/* ASISTENTE GUIADO: Cuando el vecino eligió una calle oficial y puede elegir Altura O Esquina */}
      {calleFijada && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          backgroundColor: '#F0F9FF',
          border: '1.5px solid #0284C7',
          borderRadius: '10px',
          animation: 'fadeIn 0.2s ease'
        }}>
          {/* Fila 1: Calle seleccionada y botón de cambiar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '0.84rem', color: '#0369A1', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Check size={15} color="#0284C7" strokeWidth={3} /> Calle elegida: <span>{calleFijada}</span>
            </div>
            <button
              type="button"
              onClick={handleCambiarCalle}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748B',
                fontSize: '0.74rem',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '2px 4px'
              }}
            >
              Cambiar calle
            </button>
          </div>

          {/* Fila 2: Selector para elegir entre Altura o Cruce con otra calle */}
          <div style={{ fontSize: '0.73rem', color: '#0369A1', marginBottom: '6px', fontWeight: '600' }}>
            👉 ¿Cómo querés indicar el lugar exacto?
          </div>

          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleCambiarTipoDetalle('altura')}
              style={{
                padding: '5px 10px',
                fontSize: '0.75rem',
                fontWeight: '700',
                borderRadius: '6px',
                border: tipoDetalle === 'altura' ? '1.5px solid #0284C7' : '1px solid #CBD5E1',
                backgroundColor: tipoDetalle === 'altura' ? '#E0F2FE' : '#FFFFFF',
                color: tipoDetalle === 'altura' ? '#0369A1' : '#64748B',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>🔢</span>
              <span>Con Número de altura</span>
              {tipoDetalle === 'altura' && <span style={{ fontSize: '0.7rem' }}>✓</span>}
            </button>

            <button
              type="button"
              onClick={() => handleCambiarTipoDetalle('cruce')}
              style={{
                padding: '5px 10px',
                fontSize: '0.75rem',
                fontWeight: '700',
                borderRadius: '6px',
                border: tipoDetalle === 'cruce' ? '1.5px solid #0284C7' : '1px solid #CBD5E1',
                backgroundColor: tipoDetalle === 'cruce' ? '#E0F2FE' : '#FFFFFF',
                color: tipoDetalle === 'cruce' ? '#0369A1' : '#64748B',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>🚦</span>
              <span>Con Esquina / Cruce</span>
              {tipoDetalle === 'cruce' && <span style={{ fontSize: '0.7rem' }}>✓</span>}
            </button>
          </div>

          {/* Fila 3: Input dinámico adaptado a Número o Esquina */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#334155', minWidth: '78px' }}>
              {tipoDetalle === 'altura' ? 'Número (Nº):' : 'Cruzando con:'}
            </span>
            <input
              ref={detalleInputRef}
              type="text"
              inputMode={tipoDetalle === 'altura' ? 'numeric' : 'text'}
              placeholder={tipoDetalle === 'altura' ? 'Ej: 1454' : 'Ej: Cabildo, Mendoza...'}
              value={detalleFijado}
              onChange={handleDetalleFijadoChange}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '0.88rem',
                fontWeight: '700',
                border: '1.5px solid #0284C7',
                borderRadius: '6px',
                backgroundColor: '#FFFFFF'
              }}
            />
          </div>
        </div>
      )}

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
          border: '1px solid #CBD5E1',
          zIndex: 9999,
          maxHeight: '270px',
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

          {sugerencias.map((item) => {
            const tieneAlt = Boolean(item.altura || /\b\d{1,5}\b/.test(item.label));
            const tieneCruce = Boolean(item.cruce || /\s(y|esq|esquina)\s/i.test(item.label) || /\(ESQUINA/i.test(item.label));

            return (
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
                <div style={{ 
                  marginTop: '2px', 
                  color: item.tipo === 'lugar' ? '#8B5CF6' : (tieneCruce ? '#D97706' : (tieneAlt ? '#10B981' : '#0284C7')) 
                }}>
                  {item.tipo === 'lugar' ? (
                    <Building size={16} />
                  ) : tieneCruce ? (
                    <GitFork size={16} />
                  ) : tieneAlt ? (
                    <MapPin size={16} />
                  ) : (
                    <Navigation size={16} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontSize: '0.86rem', 
                    fontWeight: (tieneAlt || tieneCruce) ? '800' : '600', 
                    color: (tieneAlt || tieneCruce) ? '#042A38' : '#1E293B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px'
                  }}>
                    <span>{item.label}</span>
                    {tieneAlt && (
                      <span style={{
                        fontSize: '0.65rem',
                        fontWeight: '700',
                        color: '#15803D',
                        backgroundColor: '#DCFCE7',
                        padding: '1px 6px',
                        borderRadius: '4px'
                      }}>
                        Altura Oficial
                      </span>
                    )}
                    {tieneCruce && (
                      <span style={{
                        fontSize: '0.65rem',
                        fontWeight: '700',
                        color: '#92400E',
                        backgroundColor: '#FEF3C7',
                        padding: '1px 6px',
                        borderRadius: '4px'
                      }}>
                        Esquina Oficial
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {item.tipo === 'lugar' ? (
                      <span>📍 {item.direccionNormalizada || 'Ciudad de Buenos Aires'}</span>
                    ) : (
                      <span>{item.comuna || item.localidad || 'CABA'}</span>
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

                    {!tieneAlt && !tieneCruce && item.tipo === 'calle' && (
                      <span style={{ fontSize: '0.68rem', color: '#0284C7', fontStyle: 'italic' }}>
                        (Elegir y luego indicar altura o esquina)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
