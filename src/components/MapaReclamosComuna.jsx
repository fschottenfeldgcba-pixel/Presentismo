import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { getCentroComuna, normalizarDireccionUsig, buscarLugaresEpok } from '../services/georrefService';
import { getComunaFeature } from '../data/comunasGeojson';
import { TEMATICAS_PAPELETA, getSolicitudesPorReunion } from '../services/solicitudesService';
import { MapPin, Filter, Layers, Info, X, Lightbulb, ChevronRight, User, Compass, Maximize2 } from 'lucide-react';

/**
 * Mapa interactivo con Leaflet centrado en la Comuna de la reunión.
 * Muestra "Pines" con colores correspondientes a cada temática de reclamo puntual.
 * Las Preocupaciones (sin dirección) se muestran fuera del mapa en un panel de "Post-its".
 */
export default function MapaReclamosComuna({ reunion, solicitudes: propSolicitudes = [], onClose }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const maskLayerRef = useRef(null);

  const [solicitudes, setSolicitudes] = useState(propSolicitudes);
  const [solicitudesConGeo, setSolicitudesConGeo] = useState([]);
  const [loadingGeo, setLoadingGeo] = useState(true);
  const [filtroTematica, setFiltroTematica] = useState('todos');
  const [selectedReclamo, setSelectedReclamo] = useState(null);
  const [mostrarPostIts, setMostrarPostIts] = useState(true);
  const [mostrarMascaraComuna, setMostrarMascaraComuna] = useState(true);

  const boundsRef = useRef([]);

  // Si no se pasaron solicitudes por props o vienen vacías, cargarlas por ID de reunión
  useEffect(() => {
    if (propSolicitudes && propSolicitudes.length > 0) {
      setSolicitudes(propSolicitudes);
    } else if (reunion?.id) {
      getSolicitudesPorReunion(reunion.id).then(res => {
        if (res && res.data) setSolicitudes(res.data);
      });
    }
  }, [reunion?.id, propSolicitudes]);

  // Geocodificar en cliente las solicitudes que solo tienen texto de dirección o nombre de establecimiento
  useEffect(() => {
    let isCancelled = false;

    const resolverCoordenadas = async () => {
      setLoadingGeo(true);
      const procesadas = await Promise.all(
        solicitudes.map(async (s) => {
          // Si ya tiene coordenadas exactas
          if (s.lat && s.lng) {
            return { ...s, lat: parseFloat(s.lat), lng: parseFloat(s.lng) };
          }

          // Si es una preocupación puramente genérica de toda la ciudad sin punto
          const dirTexto = (s.direccion || '').trim();
          if (!dirTexto) return s;

          const dirLower = dirTexto.toLowerCase();
          if (dirLower === 'en toda la ciudad' || dirLower === 'toda la ciudad' || dirLower === 'general' || dirLower === 'ciudad') {
            return { ...s, tipo_registro: 'preocupacion' };
          }

          // Intentar geocodificar dirección puntual o establecimiento (escuela, plaza, parque, club, comercio)
          try {
            // 1. Si la dirección tiene paréntesis con una calle y altura (ej: "... (AVDA. ASAMBLEA 1221)")
            const matchParentesis = dirTexto.match(/\(([^)]+)\)/);
            if (matchParentesis && matchParentesis[1] && matchParentesis[1].length > 3) {
              const geoParen = await normalizarDireccionUsig(matchParentesis[1]);
              if (geoParen && geoParen.lat && geoParen.lng) {
                return { ...s, lat: geoParen.lat, lng: geoParen.lng };
              }
            }

            // 2. Intentar USIG directamente con el texto completo
            const geoDirecto = await normalizarDireccionUsig(dirTexto);
            if (geoDirecto && geoDirecto.lat && geoDirecto.lng) {
              return { ...s, lat: geoDirecto.lat, lng: geoDirecto.lng };
            }

            // 3. Si USIG no lo reconoce, buscar como Punto de Interés / Establecimiento en EPOK
            // Extraer palabras clave (ej: entre comillas "Niñas de Ayohuma", antes de "|" o antes de "(")
            let qLugar = dirTexto;
            const matchQuotes = dirTexto.match(/"([^"]+)"/);
            if (matchQuotes && matchQuotes[1] && matchQuotes[1].length > 2) {
              qLugar = matchQuotes[1];
            } else if (dirTexto.includes('|')) {
              qLugar = dirTexto.split('|')[0].trim();
            } else if (dirTexto.includes('(')) {
              qLugar = dirTexto.split('(')[0].trim();
            }

            if (qLugar && qLugar.length >= 3) {
              const epokItems = await buscarLugaresEpok(qLugar, 3);
              const foundEpok = epokItems.find(item => item.lat && item.lng);
              if (foundEpok) {
                return { 
                  ...s, 
                  lat: foundEpok.lat, 
                  lng: foundEpok.lng,
                  direccionOficial: foundEpok.direccionNormalizada 
                };
              }
            }
          } catch (e) {
            console.warn('Error resolviendo coordenadas de solicitud:', e);
          }

          // 4. Si es una Solicitud identificada pero no se pudo geocodificar con precisión métrica,
          // posicionarla en el centro de la Comuna con una dispersión leve (jitter) para que figure
          // SIEMPRE como Pin en el Mapa y NUNCA se degrade a Preocupación / Post-it
          const centroComuna = getCentroComuna(reunion?.comuna || 'Comuna 1');
          const seedStr = String(s.id || s.direccion || '');
          const hash = seedStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
          const jitterLat = ((hash % 100) - 50) * 0.00015;
          const jitterLng = (((hash * 7) % 100) - 50) * 0.00015;

          return { 
            ...s, 
            lat: centroComuna[0] + jitterLat, 
            lng: centroComuna[1] + jitterLng,
            esAproximadoComuna: true 
          };
        })
      );

      if (!isCancelled) {
        setSolicitudesConGeo(procesadas);
        setLoadingGeo(false);
      }
    };

    resolverCoordenadas();

    return () => {
      isCancelled = true;
    };
  }, [solicitudes, reunion?.comuna]);

  // Criterio unificado:
  // - Preocupación: Reclamos SIN dirección puntual (o explícitamente escala "en toda la ciudad").
  // - Solicitud Puntual: Todo reclamo con establecimiento, plaza, comercio o dirección identificada.
  const esPreocupacionReal = (s) => {
    if (!s.direccion || !s.direccion.trim()) return true;
    const d = s.direccion.trim().toLowerCase();
    if (d === 'en toda la ciudad' || d === 'toda la ciudad' || d === 'general' || d === 'ciudad') {
      return true;
    }
    if (s.tipo_registro === 'preocupacion' && !s.lat && !s.lng) {
      return true;
    }
    return false;
  };

  const reclamosConUbicacion = solicitudesConGeo.filter(s => !esPreocupacionReal(s));
  const preocupacionesGenerales = solicitudesConGeo.filter(s => esPreocupacionReal(s));

  const reclamosFiltrados = reclamosConUbicacion.filter(s => {
    if (filtroTematica === 'todos') return true;
    return (s.tematica || '').startsWith(filtroTematica);
  });

  const preocupacionesFiltradas = preocupacionesGenerales.filter(s => {
    if (filtroTematica === 'todos') return true;
    return (s.tematica || '').startsWith(filtroTematica);
  });

  // Inicializar mapa de Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const centroComuna = getCentroComuna(reunion?.comuna || 'Comuna 1');

    const map = L.map(mapContainerRef.current, {
      center: centroComuna,
      zoom: 14,
      zoomControl: true
    });

    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors | GCBA Callejero',
      maxZoom: 19
    }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      maskLayerRef.current = null;
    };
  }, [reunion?.comuna]);

  // Dibujar máscara oscura/gris sobre todo lo que NO pertenezca a la Comuna de la reunión
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (maskLayerRef.current) {
      mapInstanceRef.current.removeLayer(maskLayerRef.current);
      maskLayerRef.current = null;
    }

    if (!mostrarMascaraComuna) return;

    const comunaFeature = getComunaFeature(reunion?.comuna || 'Comuna 7');
    if (!comunaFeature || !comunaFeature.coordinates) return;

    // Bounding box exterior gigante para cubrir el resto del mapa
    const outerWorldRing = [
      [-85, -180],
      [-85, 180],
      [85, 180],
      [85, -180]
    ];

    // Hueco(s) correspondientes al polígono de la Comuna atendida (en [lat, lng])
    const holeRings = comunaFeature.coordinates.map(poly => {
      const ring = poly[0];
      return ring.map(pt => [pt[1], pt[0]]);
    });

    // 1. Polígono invertido: Tiñe de gris todo lo que queda fuera de la Comuna
    const maskPolygon = L.polygon([outerWorldRing, ...holeRings], {
      color: '#334155',
      weight: 0,
      fillColor: '#0F172A',
      fillOpacity: 0.44,
      interactive: false
    });

    // 2. Línea perimetral destacada de la Comuna activa
    const borderPolygons = comunaFeature.coordinates.map(poly => {
      const coords = poly[0].map(pt => [pt[1], pt[0]]);
      return L.polygon(coords, {
        color: '#0284C7',
        weight: 3.5,
        opacity: 0.95,
        dashArray: '6, 6',
        fillColor: '#38BDF8',
        fillOpacity: 0.04,
        interactive: false
      });
    });

    const maskGroup = L.layerGroup([maskPolygon, ...borderPolygons]);
    maskGroup.addTo(mapInstanceRef.current);
    maskLayerRef.current = maskGroup;
  }, [reunion?.comuna, mostrarMascaraComuna]);

  // Actualizar marcadores exactos en el mapa
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    const markersGroup = markersLayerRef.current;
    markersGroup.clearLayers();

    const bounds = [];

    reclamosFiltrados.forEach((item) => {
      const tematicaObj = TEMATICAS_PAPELETA.find(t => item.tematica?.startsWith(t.id)) || {
        color: '#25C2B9',
        icon: '📍',
        label: item.tematica || 'General'
      };

      const lat = item.lat;
      const lng = item.lng;

      if (!lat || !lng) return;

      bounds.push([lat, lng]);

      // Pin HTML con orientación fija y exacta
      const customPinHtml = `
        <div style="
          position: relative;
          width: 32px;
          height: 32px;
          background-color: ${tematicaObj.color};
          border: 2px solid #FFFFFF;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 3px 8px rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.15s ease;
        ">
          <span style="
            transform: rotate(45deg);
            font-size: 14px;
            line-height: 1;
            user-select: none;
          ">${tematicaObj.icon}</span>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-pin-marker',
        html: customPinHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      const popupContent = `
        <div style="font-family: inherit; min-width: 220px; padding: 4px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span style="background-color: ${tematicaObj.color}; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px;">
              ${tematicaObj.icon} ${item.tematica}
            </span>
          </div>
          <div style="font-weight: 700; font-size: 13px; color: #042A38; margin-bottom: 4px;">
            📍 ${item.direccion || 'Ubicación'}
          </div>
          <div style="font-size: 12px; color: #334155; line-height: 1.35; margin-bottom: 6px;">
            ${item.descripcion || 'Sin descripción'}
          </div>
          <div style="font-size: 11px; color: #64748B; border-top: 1px solid #E2E8F0; padding-top: 4px;">
            👤 ${item.nombre_apellido || 'Vecino'} ${item.dni ? `• DNI: ${item.dni}` : ''}
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.on('click', () => setSelectedReclamo(item));
      markersGroup.addLayer(marker);
    });

    boundsRef.current = bounds;
    // NOTA: Por requerimiento del usuario, el mapa NO debe saltar ni re-centrarse automáticamente
    // al filtrar por temáticas. Permanece fijo en la Comuna donde sucede la reunión.
  }, [reclamosFiltrados]);

  const handleCentrarComuna = () => {
    if (!mapInstanceRef.current) return;
    const centro = getCentroComuna(reunion?.comuna || 'Comuna 1');
    mapInstanceRef.current.flyTo(centro, 14, { duration: 0.8 });
  };

  const handleVerTodosPines = () => {
    if (!mapInstanceRef.current || !boundsRef.current || boundsRef.current.length === 0) return;
    if (boundsRef.current.length === 1) {
      mapInstanceRef.current.setView(boundsRef.current[0], 15);
    } else {
      mapInstanceRef.current.fitBounds(boundsRef.current, { padding: [50, 50], maxZoom: 16 });
    }
  };

  return (
    <div style={{
      backgroundColor: '#FFFFFF',
      borderRadius: '12px',
      border: '1px solid #E2E8F0',
      boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 120px)',
      minHeight: '600px',
      position: 'relative'
    }}>
      {/* HEADER DEL MAPA */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: '#042A38',
        color: '#FFFFFF',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapPin size={22} style={{ color: 'var(--color-highlight)' }} />
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#FFFFFF', fontWeight: '700' }}>
              Mapa Territorial de Reclamos • {reunion?.comuna || 'Ciudad de Buenos Aires'}
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#9CEAD2' }}>
              📍 {reclamosFiltrados.length} solicitudes geolocalizadas • 💡 {preocupacionesFiltradas.length} preocupaciones en post-its
            </span>
          </div>
        </div>

        {/* CONTROLES */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Botón para volver a centrar la Comuna de la reunión */}
          <button
            type="button"
            onClick={handleCentrarComuna}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: '700',
              backgroundColor: '#0EA5E9',
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
            title={`Centrar mapa en ${reunion?.comuna || 'la Comuna'}`}
          >
            <Compass size={14} />
            Centrar {reunion?.comuna || 'Comuna'}
          </button>

          {/* Botón opcional para ver todos los pines si están dispersos */}
          {reclamosFiltrados.length > 0 && (
            <button
              type="button"
              onClick={handleVerTodosPines}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: '600',
                backgroundColor: 'rgba(255,255,255,0.12)',
                color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.25)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="Ajustar zoom para abarcar todos los pines de este filtro"
            >
              <Maximize2 size={14} />
              Ver todos ({reclamosFiltrados.length})
            </button>
          )}

          {/* Alternar máscara / enfoque geográfico de Comuna */}
          <button
            type="button"
            onClick={() => setMostrarMascaraComuna(prev => !prev)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: '700',
              backgroundColor: mostrarMascaraComuna ? '#0284C7' : 'rgba(255,255,255,0.1)',
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
            title="Diferenciar geográficamente atenuando en gris el resto de la Ciudad"
          >
            <Layers size={14} />
            {mostrarMascaraComuna ? `Enfoque ${reunion?.comuna || 'Comuna'}` : 'Ver Todo sin Gris'}
          </button>

          {/* Alternar panel de post-its */}
          <button
            type="button"
            onClick={() => setMostrarPostIts(prev => !prev)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: '700',
              backgroundColor: mostrarPostIts ? '#F59E0B' : 'rgba(255,255,255,0.1)',
              color: mostrarPostIts ? '#042A38' : '#FFFFFF',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <Lightbulb size={14} />
            Post-its Preocupaciones ({preocupacionesFiltradas.length})
          </button>

          {/* Filtro de temáticas */}
          <select
            value={filtroTematica}
            onChange={(e) => setFiltroTematica(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: '600',
              backgroundColor: '#073B4C',
              color: '#FFFFFF',
              border: '1px solid rgba(255,255,255,0.2)',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="todos">Todos los Temas</option>
            {TEMATICAS_PAPELETA.map(t => (
              <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
            ))}
          </select>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: '#FFFFFF',
                borderRadius: '6px',
                padding: '6px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.8rem',
                fontWeight: '600'
              }}
              title="Cerrar ventana"
            >
              <X size={16} /> Cerrar
            </button>
          )}
        </div>
      </div>

      {/* CUERPO: MAPA LEAFLET + PANEL DE POST-ITS */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden' }}>
        
        {/* ZONA DEL MAPA */}
        <div style={{ flex: 1, position: 'relative', height: '100%' }}>
          <div 
            ref={mapContainerRef} 
            style={{ width: '100%', height: '100%', zIndex: 1 }} 
          />

          {/* LEYENDA FLOTANTE DE PINES */}
          <div style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            zIndex: 1000,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(4px)',
            borderRadius: '8px',
            padding: '10px 12px',
            boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
            border: '1px solid #E2E8F0',
            maxWidth: '280px',
            maxHeight: '180px',
            overflowY: 'auto'
          }}>
            <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: '6px' }}>
              🏷️ Código de Pines por Reclamo
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              {TEMATICAS_PAPELETA.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#1E293B' }}>
                  <span style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: t.color,
                    display: 'inline-block'
                  }} />
                  <span>{t.icon} {t.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* DETALLE FLOTANTE SI SE CLICKEA UN PIN */}
          {selectedReclamo && (
            <div style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              zIndex: 1000,
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              padding: '14px',
              boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
              border: '1px solid #E2E8F0',
              width: '320px',
              maxHeight: 'calc(100% - 32px)',
              overflowY: 'auto',
              animation: 'fadeIn 0.2s ease'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  color: '#FFFFFF',
                  backgroundColor: TEMATICAS_PAPELETA.find(t => selectedReclamo.tematica?.startsWith(t.id))?.color || '#042A38',
                  padding: '3px 8px',
                  borderRadius: '10px'
                }}>
                  {selectedReclamo.tematica}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedReclamo(null)}
                  style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '2px' }}
                >
                  <X size={16} />
                </button>
              </div>

              <h4 style={{ fontSize: '0.92rem', color: '#042A38', margin: '4px 0 6px 0', fontWeight: '700' }}>
                📍 {selectedReclamo.direccion || 'Sin dirección'}
              </h4>

              <p style={{ fontSize: '0.82rem', color: '#334155', lineHeight: '1.4', marginBottom: '10px' }}>
                {selectedReclamo.descripcion}
              </p>

              <div style={{ fontSize: '0.75rem', color: '#64748B', backgroundColor: '#F8FAFC', padding: '8px', borderRadius: '6px' }}>
                <div>👤 <strong>{selectedReclamo.nombre_apellido}</strong></div>
                <div>🆔 DNI: {selectedReclamo.dni || '-'}</div>
                {selectedReclamo.telefono && <div>📱 Tel: {selectedReclamo.telefono}</div>}
              </div>
            </div>
          )}
        </div>

        {/* PANEL DERECHO DE "POST-ITS" (PREOCUPACIONES GENERALES DE ESCALA CIUDAD) */}
        {mostrarPostIts && (
          <div style={{
            width: '340px',
            backgroundColor: '#FFFDF5',
            borderLeft: '2px solid #FDE68A',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 10,
            boxShadow: '-4px 0 10px rgba(0,0,0,0.03)'
          }}>
            <div style={{
              padding: '12px 14px',
              backgroundColor: '#FEF3C7',
              borderBottom: '1px solid #FDE68A',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: '800', color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📌 Preocupaciones Generales
                </h4>
                <span style={{ fontSize: '0.7rem', color: '#B45309' }}>
                  Reclamos sin dirección puntual (escala Ciudad)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMostrarPostIts(false)}
                style={{ background: 'none', border: 'none', color: '#B45309', cursor: 'pointer' }}
                title="Ocultar post-its"
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ flex: 1, padding: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {preocupacionesFiltradas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94A3B8', fontSize: '0.82rem' }}>
                  No hay preocupaciones generales registradas para este filtro.
                </div>
              ) : (
                preocupacionesFiltradas.map((item, idx) => {
                  const tematicaObj = TEMATICAS_PAPELETA.find(t => item.tematica?.startsWith(t.id)) || {
                    color: '#D97706',
                    icon: '💡',
                    label: item.tematica || 'General'
                  };

                  return (
                    <div
                      key={item.id || idx}
                      style={{
                        backgroundColor: '#FEF9C3',
                        borderLeft: `4px solid ${tematicaObj.color}`,
                        borderRadius: '6px',
                        padding: '10px 12px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
                        transform: idx % 2 === 0 ? 'rotate(-0.5deg)' : 'rotate(0.5deg)',
                        transition: 'transform 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: '800',
                          color: '#FFFFFF',
                          backgroundColor: tematicaObj.color,
                          padding: '1px 6px',
                          borderRadius: '8px'
                        }}>
                          {tematicaObj.icon} {item.tematica}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: '#854D0E', fontWeight: '600' }}>
                          💡 Preocupación
                        </span>
                      </div>

                      <div style={{ fontSize: '0.82rem', color: '#1E293B', fontWeight: '600', marginTop: '4px', lineHeight: '1.35' }}>
                        "{item.descripcion}"
                      </div>

                      <div style={{ marginTop: '6px', fontSize: '0.72rem', color: '#78350F', display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #FDE68A', paddingTop: '4px' }}>
                        <span>👤 {item.nombre_apellido || 'Vecino'}</span>
                        {item.dni && <span>DNI: {item.dni}</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
