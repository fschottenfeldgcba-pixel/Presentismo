import React, { useState, useEffect } from 'react';
import { MapPin, Lightbulb, CheckCircle2, Building2, Landmark, Compass, Check, Info } from 'lucide-react';
import InputDireccionCaba from './InputDireccionCaba';
import { clasificarUbicacion } from '../services/solicitudesService';

/**
 * Componente intuitivo y accesible pensado especialmente para adultos mayores
 * y vecinos que completan la Papeleta Digital desde el teléfono celular.
 *
 * Guía al vecino en 2 caminos muy claros:
 * 1. "Tengo una dirección exacta" (Calle + altura, esquina o lugar notable -> Callejero oficial)
 * 2. "No tengo una dirección exacta" (Toda la Ciudad, Mi Comuna, Mi Barrio -> Selección en 1 toque, sin input de texto)
 */
export default function SelectorUbicacionPapeleta({
  value = '',
  meta = {},
  reunion = null,
  barrioVecino = '',
  onChange,
  disabled = false
}) {
  // Deducir comuna y barrio sugeridos
  const comunaTexto = (() => {
    if (reunion?.comuna && String(reunion.comuna).trim()) {
      const c = String(reunion.comuna).trim();
      return c.toLowerCase().startsWith('comuna') ? c : `Comuna ${c}`;
    }
    if (reunion?.nombre) {
      const m = reunion.nombre.match(/comuna\s*(\d{1,2})/i);
      if (m) return `Comuna ${m[1]}`;
    }
    return 'Mi Comuna';
  })();

  const barrioTexto = (() => {
    const b = (barrioVecino || reunion?.barrio || '').trim();
    if (b) {
      return b.toLowerCase().startsWith('barrio') ? b : `Barrio ${b}`;
    }
    return 'Mi Barrio';
  })();

  // Detectar modo inicial a partir del valor existente
  const detectarModoInicial = (val) => {
    if (!val || !val.trim()) return null;
    const norm = val.toLowerCase().trim();
    if (
      norm.includes('toda la ciudad') || 
      norm.includes('comuna') || 
      norm.includes('barrio') || 
      norm === 'caba' ||
      norm === 'general'
    ) {
      return 'general';
    }
    return 'exacta';
  };

  const detectarAlcanceInicial = (val) => {
    if (!val) return null;
    const norm = val.toLowerCase().trim();
    if (norm.includes('toda la ciudad') || norm === 'caba' || norm === 'general') return 'ciudad';
    if (norm.includes('comuna')) return 'comuna';
    if (norm.includes('barrio')) return 'barrio';
    return null;
  };

  const [modo, setModo] = useState(() => detectarModoInicial(value));
  const [alcanceGeneral, setAlcanceGeneral] = useState(() => detectarAlcanceInicial(value));
  const [direccionTexto, setDireccionTexto] = useState(value || '');

  // Sincronizar si el valor externo cambia (ej. al abrir modal con otro ítem)
  useEffect(() => {
    setDireccionTexto(value || '');
    const m = detectarModoInicial(value);
    setModo(m);
    setAlcanceGeneral(detectarAlcanceInicial(value));
  }, [value]);

  // Manejar selección del camino "General" (1 solo toque)
  const handleSeleccionarGeneral = (tipoAlcance) => {
    setAlcanceGeneral(tipoAlcance);
    let textoFinal = 'Toda la Ciudad';
    if (tipoAlcance === 'comuna') textoFinal = comunaTexto;
    if (tipoAlcance === 'barrio') textoFinal = barrioTexto;

    setDireccionTexto(textoFinal);

    if (onChange) {
      onChange(textoFinal, {
        autocompletado: false,
        lat: null,
        lng: null,
        altura: null,
        cruce: null,
        tipo_ubicacion: 'area_general',
        comuna_direccion: tipoAlcance === 'comuna' ? comunaTexto : null,
        modo_ubicacion: 'general',
        alcance_general: tipoAlcance
      });
    }
  };

  // Manejar cambio a modo "Dirección Exacta"
  const handleActivarModoExacto = () => {
    setModo('exacta');
    setAlcanceGeneral(null);
    // Si venía de una opción general, limpiar para que empiece a buscar en el callejero
    if (detectarModoInicial(direccionTexto) === 'general') {
      setDireccionTexto('');
      if (onChange) {
        onChange('', {
          autocompletado: false,
          lat: null,
          lng: null,
          altura: null,
          cruce: null,
          tipo_ubicacion: null,
          comuna_direccion: null,
          modo_ubicacion: 'exacta'
        });
      }
    }
  };

  // Manejar cambio a modo "General"
  const handleActivarModoGeneral = () => {
    setModo('general');
    // Si ya había un barrio o comuna sugerida, pre-seleccionar Mi Comuna por defecto
    const alcanceDefault = 'comuna';
    handleSeleccionarGeneral(alcanceDefault);
  };

  // Manejar selección normalizada del Callejero
  const handleSelectNormalizada = (norm) => {
    setDireccionTexto(norm.direccion);
    if (onChange) {
      onChange(norm.direccion, {
        autocompletado: true,
        lat: norm.lat,
        lng: norm.lng,
        altura: norm.altura,
        cruce: norm.cruce,
        tipo_ubicacion: norm.tipo,
        comuna_direccion: norm.comuna,
        modo_ubicacion: 'exacta'
      });
    }
  };

  // Manejar tipeo libre en el callejero
  const handleDireccionExactaChange = (val) => {
    setDireccionTexto(val);
    if (onChange) {
      const matchNum = val.match(/^([a-záéíóúñ\s\.]+?)\s+(\d{1,5})\b/i);
      const matchCruce = val.match(/^([a-záéíóúñ\s\.]+?)\s+(y|esq|esquina)\s+([a-záéíóúñ\s\.]+)/i);
      const clasif = clasificarUbicacion(val);
      onChange(val, {
        autocompletado: Boolean(matchNum || matchCruce || clasif.esPuntual),
        lat: meta.lat || null,
        lng: meta.lng || null,
        altura: matchNum ? parseInt(matchNum[2], 10) : (meta.altura || null),
        cruce: matchCruce ? matchCruce[3].trim() : (meta.cruce || null),
        tipo_ubicacion: clasif.esPuntual ? (clasif.motivo.includes('Lugar') ? 'lugar' : 'calle') : null,
        comuna_direccion: meta.comuna_direccion || null,
        modo_ubicacion: 'exacta'
      });
    }
  };

  // Clasificación en vivo de lo que está seleccionado
  const clasifActual = clasificarUbicacion(direccionTexto, {
    autocompletado: meta.autocompletado,
    altura: meta.altura,
    cruce: meta.cruce,
    tipo: meta.tipo_ubicacion || meta.tipo,
    lat: meta.lat,
    lng: meta.lng
  });

  return (
    <div style={{ width: '100%', marginBottom: '12px' }}>
      
      {/* Pregunta inicial pedagógica con tipografía legible */}
      <div style={{ marginBottom: '8px' }}>
        <span style={{ 
          fontSize: '0.86rem', 
          fontWeight: '700', 
          color: '#1E293B', 
          display: 'block', 
          marginBottom: '2px' 
        }}>
          ¿Dónde ocurre lo que querés comentar?
        </span>
        <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
          Elegí la opción que mejor describa el lugar:
        </span>
      </div>

      {/* 2 GRANDES BOTONES DE OPCIÓN (ALTO CONTRASTE Y TAMAÑO TÁCTIL) */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
        gap: '10px', 
        marginBottom: '12px' 
      }}>
        
        {/* OPCIÓN A: TENGO DIRECCIÓN EXACTA */}
        <button
          type="button"
          disabled={disabled}
          onClick={handleActivarModoExacto}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '12px 14px',
            borderRadius: '10px',
            backgroundColor: modo === 'exacta' ? '#F0F9FF' : '#FFFFFF',
            border: modo === 'exacta' ? '2px solid #0284C7' : '1.5px solid #CBD5E1',
            boxShadow: modo === 'exacta' ? '0 2px 8px rgba(2, 132, 199, 0.15)' : 'none',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: modo === 'exacta' ? '#0284C7' : '#E2E8F0',
            color: modo === 'exacta' ? '#FFFFFF' : '#64748B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px'
          }}>
            <MapPin size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ 
              fontSize: '0.88rem', 
              fontWeight: '800', 
              color: modo === 'exacta' ? '#0369A1' : '#1E293B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>Tengo dirección exacta</span>
              {modo === 'exacta' && <Check size={16} color="#0284C7" strokeWidth={3} />}
            </div>
            <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: '2px', lineHeight: '1.25' }}>
              Una calle y número, una esquina o un lugar (plaza, hospital, escuela...)
            </div>
          </div>
        </button>

        {/* OPCIÓN B: NO TENGO DIRECCIÓN EXACTA (GENERAL) */}
        <button
          type="button"
          disabled={disabled}
          onClick={handleActivarModoGeneral}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '12px 14px',
            borderRadius: '10px',
            backgroundColor: modo === 'general' ? '#FFFBEB' : '#FFFFFF',
            border: modo === 'general' ? '2px solid #D97706' : '1.5px solid #CBD5E1',
            boxShadow: modo === 'general' ? '0 2px 8px rgba(217, 119, 6, 0.15)' : 'none',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: modo === 'general' ? '#D97706' : '#E2E8F0',
            color: modo === 'general' ? '#FFFFFF' : '#64748B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px'
          }}>
            <Lightbulb size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ 
              fontSize: '0.88rem', 
              fontWeight: '800', 
              color: modo === 'general' ? '#B45309' : '#1E293B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>No tengo dirección exacta</span>
              {modo === 'general' && <Check size={16} color="#D97706" strokeWidth={3} />}
            </div>
            <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: '2px', lineHeight: '1.25' }}>
              Es una inquietud para todo el barrio, la comuna o la ciudad entera
            </div>
          </div>
        </button>

      </div>

      {/* CONTENIDO DESPLEGADO SEGÚN EL MODO ELEGIDO */}

      {/* CASO 1: GENERAL -> SELECCIÓN EN 1 SOLO TOQUE (SIN CAMPO DE TEXTO) */}
      {modo === 'general' && (
        <div style={{
          backgroundColor: '#FFFBEB',
          borderRadius: '10px',
          padding: '14px',
          border: '1.5px solid #FDE68A',
          animation: 'fadeIn 0.2s ease',
          marginBottom: '8px'
        }}>
          <div style={{ 
            fontSize: '0.78rem', 
            fontWeight: '800', 
            color: '#92400E', 
            marginBottom: '8px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px' 
          }}>
            <Compass size={15} /> Seleccioná la zona de tu inquietud:
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', 
            gap: '8px' 
          }}>
            
            {/* Opción 1: Toda la Ciudad */}
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleSeleccionarGeneral('ciudad')}
              style={{
                padding: '10px 8px',
                borderRadius: '8px',
                border: alcanceGeneral === 'ciudad' ? '2px solid #B45309' : '1px solid #FCD34D',
                backgroundColor: alcanceGeneral === 'ciudad' ? '#FDE68A' : '#FFFFFF',
                color: '#78350F',
                fontWeight: '700',
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                textAlign: 'center',
                boxShadow: alcanceGeneral === 'ciudad' ? '0 2px 4px rgba(180,83,9,0.2)' : 'none'
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>🏙️</span>
              <span>Toda la Ciudad</span>
              <span style={{ fontSize: '0.68rem', color: '#92400E', fontWeight: '500' }}>Escala CABA</span>
            </button>

            {/* Opción 2: Mi Comuna */}
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleSeleccionarGeneral('comuna')}
              style={{
                padding: '10px 8px',
                borderRadius: '8px',
                border: alcanceGeneral === 'comuna' ? '2px solid #B45309' : '1px solid #FCD34D',
                backgroundColor: alcanceGeneral === 'comuna' ? '#FDE68A' : '#FFFFFF',
                color: '#78350F',
                fontWeight: '700',
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                textAlign: 'center',
                boxShadow: alcanceGeneral === 'comuna' ? '0 2px 4px rgba(180,83,9,0.2)' : 'none'
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>🏛️</span>
              <span>{comunaTexto}</span>
              <span style={{ fontSize: '0.68rem', color: '#92400E', fontWeight: '500' }}>Toda la Comuna</span>
            </button>

            {/* Opción 3: Mi Barrio */}
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleSeleccionarGeneral('barrio')}
              style={{
                padding: '10px 8px',
                borderRadius: '8px',
                border: alcanceGeneral === 'barrio' ? '2px solid #B45309' : '1px solid #FCD34D',
                backgroundColor: alcanceGeneral === 'barrio' ? '#FDE68A' : '#FFFFFF',
                color: '#78350F',
                fontWeight: '700',
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                textAlign: 'center',
                boxShadow: alcanceGeneral === 'barrio' ? '0 2px 4px rgba(180,83,9,0.2)' : 'none'
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>🏡</span>
              <span style={{ wordBreak: 'break-word' }}>{barrioTexto}</span>
              <span style={{ fontSize: '0.68rem', color: '#92400E', fontWeight: '500' }}>Todo el Barrio</span>
            </button>

          </div>

          {/* Confirmación explícita para que el vecino se quede tranquilo */}
          {alcanceGeneral && (
            <div style={{
              marginTop: '10px',
              padding: '6px 10px',
              backgroundColor: '#FEF3C7',
              borderRadius: '6px',
              fontSize: '0.74rem',
              color: '#92400E',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: '600'
            }}>
              <CheckCircle2 size={15} color="#D97706" style={{ flexShrink: 0 }} />
              <span>
                Quedará registrado como <strong>Preocupación General ({direccionTexto})</strong>. No necesitás ingresar ninguna calle ni dirección.
              </span>
            </div>
          )}
        </div>
      )}

      {/* CASO 2: DIRECCIÓN EXACTA -> CALLEJERO OFICIAL INTELIGENTE */}
      {modo === 'exacta' && (
        <div style={{
          backgroundColor: '#F8FAFC',
          borderRadius: '10px',
          padding: '14px',
          border: '1.5px solid #CBD5E1',
          animation: 'fadeIn 0.2s ease',
          marginBottom: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: '800', color: '#334155', margin: 0 }}>
              Buscá la dirección o lugar en el Callejero Oficial:
            </label>

            {/* Badge dinámico de clasificación en vivo */}
            {clasifActual.esPuntual ? (
              <span style={{
                fontSize: '0.7rem',
                fontWeight: '700',
                color: '#15803D',
                backgroundColor: '#DCFCE7',
                padding: '2px 8px',
                borderRadius: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px'
              }}>
                <CheckCircle2 size={12} /> Solicitud Puntual
              </span>
            ) : (
              <span style={{
                fontSize: '0.7rem',
                fontWeight: '700',
                color: '#B45309',
                backgroundColor: '#FEF3C7',
                padding: '2px 8px',
                borderRadius: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px'
              }}>
                <Info size={12} /> Preocupación General
              </span>
            )}
          </div>

          <InputDireccionCaba
            value={direccionTexto}
            onChange={handleDireccionExactaChange}
            onSelectNormalizada={handleSelectNormalizada}
            placeholder="Ej: Monroe 2500, Zavalia y Mendoza, Parque Chacabuco..."
          />

          {/* Cartel explicativo pedagógico */}
          <div style={{
            marginTop: '8px',
            fontSize: '0.73rem',
            color: clasifActual.esPuntual ? '#15803D' : '#92400E',
            backgroundColor: clasifActual.esPuntual ? '#ECFDF5' : '#FFFBEB',
            border: `1px solid ${clasifActual.esPuntual ? '#A7F3D0' : '#FDE68A'}`,
            padding: '6px 10px',
            borderRadius: '6px',
            lineHeight: '1.3'
          }}>
            {clasifActual.esPuntual ? '✓ ' : 'ℹ️ '}
            <strong>{clasifActual.motivo}:</strong> {clasifActual.mensaje}
          </div>
        </div>
      )}

      {/* Si aún no eligió ninguna de las dos opciones */}
      {!modo && (
        <div style={{
          padding: '10px 12px',
          backgroundColor: '#F1F5F9',
          borderRadius: '8px',
          fontSize: '0.75rem',
          color: '#64748B',
          textAlign: 'center',
          fontStyle: 'italic'
        }}>
          💡 Por favor elegí una de las dos opciones arriba para continuar.
        </div>
      )}

    </div>
  );
}
