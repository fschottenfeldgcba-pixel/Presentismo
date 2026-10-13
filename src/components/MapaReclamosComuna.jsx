import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { getCentroComuna } from '../services/georrefService';
import { TEMATICAS_PAPELETA } from '../services/solicitudesService';
import { MapPin, Filter, Layers, Info, X } from 'lucide-react';

/**
 * Mapa interactivo con Leaflet centrado en la Comuna de la reunión.
 * Muestra "Pines" con colores correspondientes a cada temática de reclamo.
 */
export default function MapaReclamosComuna({ reunion, solicitudes = [], onClose }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);

  const [filtroTematica, setFiltroTematica] = useState('todos');
  const [selectedReclamo, setSelectedReclamo] = useState(null);

  // Filtrar solicitudes que tengan ubicación (coordenadas o que sean solicitudes)
  const reclamosConUbicacion = solicitudes.filter(s => {
    // Si tiene lat y lng directo
    if (s.lat && s.lng) return true;
    // O si tiene dirección cargada
    return Boolean(s.direccion && s.direccion.trim());
  });

  const reclamosFiltrados = reclamosConUbicacion.filter(s => {
    if (filtroTematica === 'todos') return true;
    return (s.tematica || '').startsWith(filtroTematica);
  });

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Obtener centro de la comuna de la reunión
    const centroComuna = getCentroComuna(reunion?.comuna || 'Comuna 1');

    // Inicializar mapa de Leaflet
    const map = L.map(mapContainerRef.current, {
      center: centroComuna,
      zoom: 14,
      zoomControl: true
    });

    mapInstanceRef.current = map;

    // Capa de mosaicos OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors | GCBA Callejero',
      maxZoom: 19
    }).addTo(map);

    // Grupo de capas para los marcadores
    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;

    // Fix tamaño de Leaflet tras render inicial
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [reunion?.comuna]);

  // Actualizar marcadores cuando cambian los datos o el filtro
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    const markersGroup = markersLayerRef.current;
    markersGroup.clearLayers();

    const bounds = [];
    const centroBase = getCentroComuna(reunion?.comuna || 'Comuna 1');

    reclamosFiltrados.forEach((item, index) => {
      const tematicaObj = TEMATICAS_PAPELETA.find(t => item.tematica?.startsWith(t.id)) || {
        color: '#25C2B9',
        icon: '📍',
        label: item.tematica || 'General'
      };

      // Si tiene coordenadas exactas, usarlas. Si no, generar pequeña dispersión alrededor del centro de la comuna para visualización
      let lat = item.lat;
      let lng = item.lng;

      if (!lat || !lng) {
        // Dispersión suave determinista basada en el ID / índice
        const offsetLat = ((index % 5) - 2) * 0.0035 + (Math.sin(index) * 0.002);
        const offsetLng = (((index * 3) % 5) - 2) * 0.0035 + (Math.cos(index) * 0.002);
        lat = centroBase[0] + offsetLat;
        lng = centroBase[1] + offsetLng;
      }

      bounds.push([lat, lng]);

      // Icono HTML personalizado tipo Pin con el color de la temática
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
        <div style="font-family: inherit; min-width: 200px; padding: 4px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span style="background-color: ${tematicaObj.color}; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px;">
              ${tematicaObj.icon} ${item.tematica}
            </span>
          </div>
          <div style="font-weight: 700; font-size: 13px; color: #042A38; margin-bottom: 4px;">
            📍 ${item.direccion || 'Ubicación referencial'}
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

    // Ajustar zoom para que entren todos los pines si hay más de 1
    if (bounds.length > 1 && mapInstanceRef.current) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [reclamosFiltrados, reunion?.comuna]);

  return (
    <div style={{
      backgroundColor: '#FFFFFF',
      borderRadius: '12px',
      border: '1px solid #E2E8F0',
      boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '620px',
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
          <MapPin size={20} style={{ color: 'var(--color-highlight)' }} />
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#FFFFFF', fontWeight: '700' }}>
              Mapa Territorial de Reclamos • {reunion?.comuna || 'Ciudad de Buenos Aires'}
            </h3>
            <span style={{ fontSize: '0.74rem', color: '#9CEAD2' }}>
              {reclamosFiltrados.length} de {reclamosConUbicacion.length} solicitudes georreferenciadas
            </span>
          </div>
        </div>

        {/* FILTRO DE TEMÁTICAS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                background: 'rgba(255,255,255,0.1)',
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
              title="Cerrar mapa"
            >
              <X size={16} /> Cerrar
            </button>
          )}
        </div>
      </div>

      {/* CONTENEDOR DEL MAPA Y PANEL LATERAL */}
      <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
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

        {/* DETALLE LATERAL FLOTANTE SI SE HIZO CLICK EN UN RECLAMO */}
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
              {selectedReclamo.ticket_suaci && (
                <div style={{ marginTop: '4px', color: '#1E40AF', fontWeight: '700' }}>
                  🏷️ Ticket SUACI: {selectedReclamo.ticket_suaci}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
