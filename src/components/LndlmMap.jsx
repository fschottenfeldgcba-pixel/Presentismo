import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

const CABA_CENTER = [-34.6083, -58.42];

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const hubIcon = (name, color = '#0F172A') =>
  L.divIcon({
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div title="${escapeHtml(name)}" style="width:34px;height:34px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:18px;">🚚</div>`
  });

/**
 * Mapa Leaflet reutilizable del módulo LNDLM.
 *  - mode="live": Nodrizas, espacios coloreados por estado y rutas.
 *  - mode="picker": clic en el mapa (o arrastrar el pin) para ubicar una Nodriza.
 */
export default function LndlmMap({ hubs = [], markers = [], routeLines = [], mode = 'live', picker = null, onPick, height = 520, draggableHubs = false, onHubMove }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const fittedRef = useRef(false);
  const onPickRef = useRef(onPick);
  const onHubMoveRef = useRef(onHubMove);

  useEffect(() => {
    onPickRef.current = onPick;
    onHubMoveRef.current = onHubMove;
  }, [onPick, onHubMove]);

  // Inicializar el mapa una sola vez
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(CABA_CENTER, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('click', (e) => {
      if (onPickRef.current) onPickRef.current(e.latlng.lat, e.latlng.lng);
    });

    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Redibujar capas cuando cambian los datos
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds = [];

    routeLines.forEach(line => {
      if (!line.points || line.points.length < 2) return;
      L.polyline(line.points, {
        color: line.color || '#6366F1',
        weight: 3,
        opacity: 0.8,
        dashArray: line.dashed ? '6 8' : null
      }).bindTooltip(line.label || '', { sticky: true }).addTo(layer);
    });

    markers.forEach(m => {
      if (m.lat == null || m.lng == null) return;
      L.circleMarker([m.lat, m.lng], {
        radius: m.radius || 8,
        color: '#fff',
        weight: 2,
        fillColor: m.color || '#94A3B8',
        fillOpacity: 0.95
      })
        .bindPopup(m.popup || escapeHtml(m.label || ''))
        .bindTooltip(escapeHtml(m.label || ''))
        .addTo(layer);
      bounds.push([m.lat, m.lng]);
    });

    hubs.forEach(h => {
      if (h.lat == null || h.lng == null) return;
      const marker = L.marker([h.lat, h.lng], { icon: hubIcon(h.name, h.color), draggable: Boolean(draggableHubs) })
        .bindPopup(`<b>${escapeHtml(h.name)}</b><br/>🛵 ${h.moto_count || 0} moto(s)`)
        .addTo(layer);
      if (draggableHubs) {
        marker.on('dragend', () => {
          const p = marker.getLatLng();
          if (onHubMoveRef.current) onHubMoveRef.current(h.id, p.lat, p.lng);
        });
      }
      bounds.push([h.lat, h.lng]);
    });

    if (mode === 'picker' && picker && picker.lat != null && picker.lng != null) {
      const pin = L.marker([picker.lat, picker.lng], {
        icon: hubIcon('Ubicación de la Nodriza', '#DC2626'),
        draggable: true
      }).addTo(layer);
      pin.on('dragend', () => {
        const p = pin.getLatLng();
        if (onPickRef.current) onPickRef.current(p.lat, p.lng);
      });
      if (!fittedRef.current) {
        map.setView([picker.lat, picker.lng], 13);
        fittedRef.current = true;
      }
    } else if (mode === 'live' && bounds.length > 0 && !fittedRef.current) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      fittedRef.current = true;
    }
  }, [hubs, markers, routeLines, mode, picker, draggableHubs]);

  return <div ref={containerRef} style={{ width: '100%', height: `${height}px`, borderRadius: '12px', border: '1px solid #CBD5E1', zIndex: 0 }} />;
}
