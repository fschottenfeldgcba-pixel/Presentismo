import React, { useState, useEffect, useRef } from 'react';
import { 
  getSolicitudesPorReunion, 
  updateEstadoSolicitud, 
  actualizarDetalleSolicitud,
  eliminarSolicitudPapeleta,
  TEMATICAS_PAPELETA, 
  ESTADOS_SOLICITUD,
  clasificarUbicacion 
} from '../services/solicitudesService';
import InputDireccionCaba from './InputDireccionCaba';
import SelectorUbicacionPapeleta from './SelectorUbicacionPapeleta';
import { normalizarDireccionUsig } from '../services/georrefService';
import { 
  ArrowLeft, Search, Download, Copy, Check, QrCode, RefreshCw, 
  Filter, CheckCircle2, Clock, AlertTriangle, ExternalLink, MessageSquare, 
  MapPin, User, FileText, Sparkles, Tag, ChevronRight, Share2, X,
  Edit2, Trash2, Save
} from 'lucide-react';
import * as XLSX from 'xlsx';
import BotonDescargarFichas from './BotonDescargarFichas';

export default function PanelSolicitudesPapeleta({ reunion, onBack }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroTipoRegistro, setFiltroTipoRegistro] = useState('todos'); // 'todos' | 'solicitud' | 'preocupacion'
  const [filtroTematica, setFiltroTematica] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [copiedId, setCopiedId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [ticketInputs, setTicketInputs] = useState({});
  const [notasInputs, setNotasInputs] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ 
    tematica: '', 
    direccion: '', 
    descripcion: '',
    autocompletado: false,
    lat: null,
    lng: null,
    altura: null,
    cruce: null,
    tipo_ubicacion: null,
    comuna_direccion: null
  });

  // Referencia para sincronizar editingId con los timers asíncronos y evitar reescritura en segundo plano
  const editingIdRef = useRef(null);
  editingIdRef.current = editingId;

  // Cargar solicitudes
  const loadData = async (isSilent = false) => {
    // Si el usuario está activamente editando un reclamo, pausar el refresco silencioso
    if (isSilent && editingIdRef.current) return;

    if (!isSilent) setLoading(true);
    try {
      const { data } = await getSolicitudesPorReunion(reunion?.id);
      if (data) {
        // Doble verificación: si mientras la llamada estaba en curso se abrió una edición, no pisar
        if (isSilent && editingIdRef.current) return;

        setSolicitudes(prev => {
          if (editingIdRef.current) {
            // Preservar el item que se está editando para no perder cambios locales en curso
            return data.map(newItem => {
              if (newItem.id === editingIdRef.current) {
                const prevItem = prev.find(p => p.id === newItem.id);
                return prevItem || newItem;
              }
              return newItem;
            });
          }
          return data;
        });

        // Inicializar estados locales de inputs sin sobreescribir lo que el usuario esté escribiendo
        const tObj = {};
        const nObj = {};
        data.forEach(s => {
          tObj[s.id] = s.ticket_suaci || '';
          nObj[s.id] = s.notas_operador || '';
        });
        setTicketInputs(prev => ({ ...tObj, ...prev }));
        setNotasInputs(prev => ({ ...nObj, ...prev }));
      }
    } catch (err) {
      console.error('Error cargando solicitudes:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Polling en vivo cada 6 segundos para stream en tiempo real en la sala
    // Pausado automáticamente si el usuario está en modo edición
    const interval = setInterval(() => {
      if (!editingIdRef.current) {
        loadData(true);
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [reunion?.id]);

  // URL pública para la papeleta de esta reunión
  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  const publicPapeletaUrl = `${baseUrl}?view=papeleta&reunion_id=${reunion?.id || ''}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(publicPapeletaUrl)}`;

  // Actualizar estado de una solicitud
  const handleCambiarEstado = async (solicitudId, nuevoEstado) => {
    setSavingId(solicitudId);
    try {
      await updateEstadoSolicitud(solicitudId, { estado: nuevoEstado }, reunion?.id);
      setSolicitudes(prev => prev.map(s => s.id === solicitudId ? { ...s, estado: nuevoEstado } : s));
    } catch (err) {
      console.error(err);
      alert('No se pudo actualizar el estado.');
    } finally {
      setSavingId(null);
    }
  };

  // Guardar ticket SUACI o notas
  const handleGuardarDetalles = async (solicitudId) => {
    setSavingId(solicitudId);
    try {
      const updates = {
        ticket_suaci: ticketInputs[solicitudId] || '',
        notas_operador: notasInputs[solicitudId] || ''
      };
      await updateEstadoSolicitud(solicitudId, updates, reunion?.id);
      setSolicitudes(prev => prev.map(s => s.id === solicitudId ? { ...s, ...updates } : s));
      alert('¡Detalles de la solicitud guardados con éxito!');
    } catch (err) {
      console.error(err);
      alert('Error al guardar detalles.');
    } finally {
      setSavingId(null);
    }
  };

  // Iniciar edición de reclamo
  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditForm({
      tematica: item.tematica || 'Arbolado',
      direccion: item.direccion || '',
      descripcion: item.descripcion || '',
      autocompletado: Boolean(item.autocompletado),
      lat: item.lat || null,
      lng: item.lng || null,
      altura: item.altura || null,
      cruce: item.cruce || null,
      tipo_ubicacion: item.tipo_ubicacion || null,
      comuna_direccion: item.comuna_direccion || null
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleGuardarEdicion = async (solicitudId) => {
    setSavingId(solicitudId);
    try {
      let latVal = editForm.lat || null;
      let lngVal = editForm.lng || null;

      // Si no tiene coordenadas pero escribió una dirección puntual (ej: no seleccionó del desplegable),
      // resolver en el momento para vincular automáticamente al mapa
      if ((!latVal || !lngVal) && editForm.direccion && editForm.direccion.trim().length >= 3) {
        try {
          const geo = await normalizarDireccionUsig(editForm.direccion);
          if (geo && geo.lat && geo.lng) {
            latVal = geo.lat;
            lngVal = geo.lng;
          }
        } catch (e) {}
      }

      const clasif = clasificarUbicacion(editForm.direccion, {
        autocompletado: editForm.autocompletado || Boolean(latVal && lngVal),
        altura: editForm.altura,
        cruce: editForm.cruce,
        tipo: editForm.tipo_ubicacion,
        lat: latVal,
        lng: lngVal
      });

      const updatesPayload = {
        ...editForm,
        tipo_registro: clasif.tipo,
        lat: clasif.esPuntual ? latVal : null,
        lng: clasif.esPuntual ? lngVal : null
      };

      const res = await actualizarDetalleSolicitud(solicitudId, updatesPayload, reunion?.id);
      if (res.success) {
        setSolicitudes(prev => prev.map(s => {
          if (s.id === solicitudId) {
            return {
              ...s,
              ...updatesPayload
            };
          }
          return s;
        }));
        setEditingId(null);
      } else {
        alert('No se pudo guardar la edición del reclamo.');
      }
    } catch (err) {
      console.error(err);
      alert('Error al guardar edición.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteSolicitud = async (solicitudId) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este reclamo? Esta acción no se puede deshacer.')) return;
    try {
      await eliminarSolicitudPapeleta(solicitudId, reunion?.id);
      setSolicitudes(prev => prev.filter(s => s.id !== solicitudId));
    } catch (err) {
      console.error(err);
      alert('No se pudo eliminar el reclamo.');
    }
  };

  // Copiar solicitud formateada para pegar directamente en SUACI / BAC
  const handleCopiarParaSuaci = (item) => {
    const texto = `SOLICITUD CIUDADANA - ENCUENTRO PRESENCIAL
Reunión: ${reunion?.nombre || 'Encuentro'} (${reunion?.fecha || ''})
Vecino: ${item.nombre_apellido} (DNI: ${item.dni || '-'} | Celular: ${item.telefono || '-'} | Barrio: ${item.barrio || '-'})
Temática: ${item.tematica}
Dirección exacta: ${item.direccion || 'No especificada'}
Descripción del reclamo:
${item.descripcion}
`;
    navigator.clipboard.writeText(texto);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Copiar link público al portapapeles
  const handleCopiarLink = () => {
    navigator.clipboard.writeText(publicPapeletaUrl);
    alert('¡Link del formulario copiado al portapapeles!');
  };

  // Helper para evaluar si un registro califica como Solicitud Puntual o Preocupación General
  // Solo califica como puntual si cuenta con altura, cruce o lugar físico identificable
  const esSolicitudReal = (s) => {
    if (!s || !s.direccion) return false;
    const clasif = clasificarUbicacion(s.direccion, {
      autocompletado: s.autocompletado,
      altura: s.altura,
      cruce: s.cruce,
      tipo: s.tipo_ubicacion,
      lat: s.lat,
      lng: s.lng
    });
    return clasif.esPuntual;
  };

  // Exportar todas las solicitudes a Excel (.xlsx)
  const handleExportarExcel = () => {
    if (!solicitudes || solicitudes.length === 0) {
      alert('No hay solicitudes para exportar.');
      return;
    }

    const exportRows = solicitudes.map((s, idx) => {
      const tipo = esSolicitudReal(s) ? 'Solicitud Puntual' : 'Preocupación / Sugerencia';
      return {
        '#': idx + 1,
        'Tipo': tipo,
        'Fecha': s.fecha || '',
        'Vecino': s.nombre_apellido || '',
        'DNI': s.dni || '',
        'Teléfono': s.telefono || '',
        'Barrio': s.barrio || '',
        'Email': s.email || '',
        'Temática': s.tematica || '',
        'Dirección / Ubicación': s.direccion || '',
        'Descripción del Reclamo': s.descripcion || '',
        'Estado': (ESTADOS_SOLICITUD.find(e => e.id === s.estado)?.label || s.estado || 'Pendiente'),
        'Ticket SUACI': s.ticket_suaci || '',
        'Notas Operador': s.notas_operador || '',
        'Reunión': reunion?.nombre || '',
        'Hora Ingreso': s.created_at ? new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Solicitudes_Papeleta');

    const cleanReunionName = (reunion?.nombre || 'Reunion').replace(/[/\\?%*:|"<>]/g, '_');
    const fechaStr = reunion?.fecha || new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Papeletas_Digitales_${fechaStr}_${cleanReunionName}.xlsx`);
  };

  // Métricas
  const totalCount = solicitudes.length;
  const solicitudesPuntualesCount = solicitudes.filter(s => esSolicitudReal(s)).length;
  const preocupacionesCount = solicitudes.filter(s => !esSolicitudReal(s)).length;
  const pendientesCount = solicitudes.filter(s => !s.estado || s.estado === 'pendiente').length;
  const enGestionCount = solicitudes.filter(s => s.estado === 'en_gestion').length;
  const cargadosSuaciCount = solicitudes.filter(s => s.estado === 'cargado_suaci').length;
  const resueltosCount = solicitudes.filter(s => s.estado === 'resuelto').length;

  // Filtrado
  const filteredSolicitudes = solicitudes.filter(s => {
    // Filtro por Tipo de Registro (Solicitud vs Preocupación)
    const esSolicitud = esSolicitudReal(s);
    if (filtroTipoRegistro === 'solicitud' && !esSolicitud) return false;
    if (filtroTipoRegistro === 'preocupacion' && esSolicitud) return false;

    // Filtro por texto
    if (filtroTexto.trim()) {
      const q = filtroTexto.toLowerCase();
      const matchNom = (s.nombre_apellido || '').toLowerCase().includes(q);
      const matchDni = String(s.dni || '').toLowerCase().includes(q);
      const matchTel = String(s.telefono || '').toLowerCase().includes(q);
      const matchDir = (s.direccion || '').toLowerCase().includes(q);
      const matchDesc = (s.descripcion || '').toLowerCase().includes(q);
      const matchTicket = (s.ticket_suaci || '').toLowerCase().includes(q);
      if (!matchNom && !matchDni && !matchTel && !matchDir && !matchDesc && !matchTicket) return false;
    }

    // Filtro por temática
    if (filtroTematica !== 'todos') {
      if (filtroTematica === 'Otros') {
        if (!s.tematica.startsWith('Otros')) return false;
      } else {
        if (!s.tematica.includes(filtroTematica)) return false;
      }
    }

    // Filtro por estado
    if (filtroEstado !== 'todos') {
      const st = s.estado || 'pendiente';
      if (st !== filtroEstado) return false;
    }

    return true;
  });

  return (
    <div className="container" style={{ maxWidth: '1100px', margin: '0 auto', padding: '16px 12px 60px 12px' }}>
      
      {/* BARRA SUPERIOR DE ACCIONES */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
        >
          <ArrowLeft size={16} /> Volver a la Reunión
        </button>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <a
            href={`?view=mapa_comuna&reunion_id=${reunion?.id || ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm"
            style={{ 
              backgroundColor: '#0284C7', 
              color: '#FFFFFF', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px', 
              fontWeight: 'bold', 
              borderRadius: '6px', 
              padding: '6px 12px',
              textDecoration: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}
            title="Abrir mapa territorial de reclamos de esta comuna en una nueva pestaña"
          >
            <MapPin size={15} /> 🗺️ Ver Mapa
          </a>

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowQrModal(true)}
            style={{ backgroundColor: '#042A38', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', borderRadius: '6px', padding: '6px 12px' }}
          >
            <QrCode size={15} /> Ver / Imprimir QR para Sala
          </button>

          <button
            type="button"
            className="btn btn-sm"
            onClick={handleCopiarLink}
            style={{ backgroundColor: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', borderRadius: '6px', padding: '6px 12px' }}
          >
            <Share2 size={15} /> Copiar Link
          </button>

          <BotonDescargarFichas reunion={reunion} />

          <button
            type="button"
            className="btn btn-sm"
            onClick={handleExportarExcel}
            style={{ backgroundColor: '#10B981', color: '#FFFFFF', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', borderRadius: '6px', padding: '6px 14px' }}
          >
            <Download size={15} /> Exportar a Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* HEADER DE LA REUNIÓN */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '16px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <span style={{ fontSize: '0.72rem', color: '#25C2B9', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Módulo de Papeleta Digital • Gestión SUACI / BAC
            </span>
            <h1 style={{ fontSize: '1.25rem', color: '#042A38', margin: '4px 0', fontWeight: '800' }}>
              {reunion?.nombre || 'Encuentro con Vecinos'}
            </h1>
            <div style={{ fontSize: '0.82rem', color: '#64748B', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <span>📅 {reunion?.fecha || '-'}</span>
              {reunion?.lugar && <span>📍 {reunion.lugar}</span>}
              {reunion?.comuna && <span>🏛️ {reunion.comuna}</span>}
              {reunion?.funcionario && <span>👤 Funcionario: <strong>{reunion.funcionario}</strong></span>}
            </div>
          </div>

          <button
            type="button"
            onClick={() => loadData()}
            className="btn btn-secondary btn-sm"
            title="Refrescar solicitudes"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'spinner' : ''} /> Refrescar
          </button>
        </div>
      </div>

      {/* MÉTRICAS EN VIVO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Total Recibidas</span>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#042A38', marginTop: '2px' }}>{totalCount}</div>
        </div>

        <div 
          onClick={() => setFiltroTipoRegistro(prev => prev === 'solicitud' ? 'todos' : 'solicitud')}
          style={{ 
            backgroundColor: filtroTipoRegistro === 'solicitud' ? '#DCFCE7' : '#F0FDF4', 
            border: filtroTipoRegistro === 'solicitud' ? '2px solid #10B981' : '1px solid #BBF7D0', 
            borderRadius: '10px', 
            padding: '12px', 
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          title="Filtrar por Solicitudes Puntuales con dirección"
        >
          <span style={{ fontSize: '0.72rem', color: '#166534', fontWeight: '700', textTransform: 'uppercase' }}>📍 Solicitudes</span>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#166534', marginTop: '2px' }}>{solicitudesPuntualesCount}</div>
        </div>

        <div 
          onClick={() => setFiltroTipoRegistro(prev => prev === 'preocupacion' ? 'todos' : 'preocupacion')}
          style={{ 
            backgroundColor: filtroTipoRegistro === 'preocupacion' ? '#FEF3C7' : '#FFFBEB', 
            border: filtroTipoRegistro === 'preocupacion' ? '2px solid #F59E0B' : '1px solid #FDE68A', 
            borderRadius: '10px', 
            padding: '12px', 
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          title="Filtrar por Preocupaciones Generales sin ubicación puntual"
        >
          <span style={{ fontSize: '0.72rem', color: '#92400E', fontWeight: '700', textTransform: 'uppercase' }}>💡 Preocupaciones</span>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#92400E', marginTop: '2px' }}>{preocupacionesCount}</div>
        </div>

        <div style={{ backgroundColor: '#FEF9C3', border: '1px solid #FDE047', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: '#854D0E', fontWeight: '700', textTransform: 'uppercase' }}>⏳ Pendientes</span>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#854D0E', marginTop: '2px' }}>{pendientesCount}</div>
        </div>

        <div style={{ backgroundColor: '#DBEAFE', border: '1px solid #93C5FD', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: '#1E40AF', fontWeight: '700', textTransform: 'uppercase' }}>🔄 En Gestión</span>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1E40AF', marginTop: '2px' }}>{enGestionCount}</div>
        </div>

        <div style={{ backgroundColor: '#EDE9FE', border: '1px solid #C4B5FD', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: '#6D28D9', fontWeight: '700', textTransform: 'uppercase' }}>🏷️ Con SUACI</span>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#6D28D9', marginTop: '2px' }}>{cargadosSuaciCount}</div>
        </div>
      </div>

      {/* FILTROS Y BÚSQUEDA */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '14px', border: '1px solid #E2E8F0', marginBottom: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="🔍 Buscar por vecino, DNI, dirección, reclamo o ticket..."
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
            style={{ paddingLeft: '30px', fontSize: '0.85rem' }}
          />
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select
            className="form-control form-control-sm"
            value={filtroTipoRegistro}
            onChange={(e) => setFiltroTipoRegistro(e.target.value)}
            style={{ fontSize: '0.85rem', width: 'auto', fontWeight: '600' }}
          >
            <option value="todos">Tipo: Todos</option>
            <option value="solicitud">📍 Solo Solicitudes Puntuales</option>
            <option value="preocupacion">💡 Solo Preocupaciones Generales</option>
          </select>
          <select
            className="form-control form-control-sm"
            value={filtroTematica}
            onChange={(e) => setFiltroTematica(e.target.value)}
            style={{ fontSize: '0.85rem', width: 'auto' }}
          >
            <option value="todos">Temática: Todas</option>
            {TEMATICAS_PAPELETA.map(t => (
              <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
            ))}
          </select>

          <select
            className="form-control form-control-sm"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            style={{ fontSize: '0.85rem', width: 'auto' }}
          >
            <option value="todos">Estado: Todos</option>
            {ESTADOS_SOLICITUD.map(est => (
              <option key={est.id} value={est.id}>{est.icon} {est.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* LISTADO DE SOLICITUDES EN TIEMPO REAL */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredSolicitudes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px dashed #CBD5E1' }}>
            <FileText size={40} style={{ color: '#94A3B8', marginBottom: '8px' }} />
            <h3 style={{ fontSize: '1rem', color: '#334155', margin: '0 0 4px 0' }}>
              {solicitudes.length === 0 ? 'Aún no se recibieron solicitudes digitales para este encuentro.' : 'Sin coincidencias para los filtros aplicados.'}
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748B', maxWidth: '460px', margin: '0 auto 16px auto' }}>
              Los vecinos pueden completar el formulario escaneando el QR en la sala o ingresando desde el link de WhatsApp enviado al acreditarse.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowQrModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <QrCode size={14} /> Abrir QR para mostrar en pantalla
            </button>
          </div>
        ) : (
          filteredSolicitudes.map((item, idx) => {
            const estadoObj = ESTADOS_SOLICITUD.find(e => e.id === item.estado) || ESTADOS_SOLICITUD[0];
            const tematicaObj = TEMATICAS_PAPELETA.find(t => item.tematica?.startsWith(t.id)) || { icon: '📝', color: '#64748B' };

            return (
              <div
                key={item.id || idx}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  borderLeft: `5px solid ${tematicaObj.color || '#25C2B9'}`,
                  padding: '16px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                }}
              >
                {/* Header de la tarjeta */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: '800', fontSize: '1rem', color: '#042A38' }}>
                        #{idx + 1} — {item.nombre_apellido || 'Vecino'}
                      </span>
                      <span
                        style={{
                          backgroundColor: tematicaObj.color || '#25C2B9',
                          color: '#FFFFFF',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {tematicaObj.icon} {item.tematica}
                      </span>

                      {/* Pill de Tipo: Solicitud vs Preocupación */}
                      {esSolicitudReal(item) ? (
                        <span style={{
                          backgroundColor: '#DCFCE7',
                          color: '#15803D',
                          border: '1px solid #86EFAC',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}>
                          📍 Solicitud Puntual
                        </span>
                      ) : (
                        <span style={{
                          backgroundColor: '#FEF3C7',
                          color: '#B45309',
                          border: '1px solid #FDE68A',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}>
                          💡 Preocupación General
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '3px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <span>🆔 DNI: <strong>{item.dni || '-'}</strong></span>
                      <span>📱 Tel: <strong>{item.telefono || 'No registrado'}</strong></span>
                      {item.barrio && <span>📍 Barrio: <strong>{item.barrio}</strong></span>}
                      {item.email && <span>✉️ {item.email}</span>}
                    </div>
                  </div>

                  {/* Badge de Estado y Selector de Estado + Acciones de Edición/Eliminar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <select
                      value={item.estado || 'pendiente'}
                      onChange={(e) => handleCambiarEstado(item.id, e.target.value)}
                      disabled={savingId === item.id}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        backgroundColor: estadoObj.bg,
                        color: estadoObj.color,
                        border: `1px solid ${estadoObj.color}`,
                        cursor: 'pointer'
                      }}
                    >
                      {ESTADOS_SOLICITUD.map(est => (
                        <option key={est.id} value={est.id}>{est.icon} {est.label}</option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => handleStartEdit(item)}
                      title="Editar temática, dirección o descripción del reclamo"
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        backgroundColor: '#EFF6FF',
                        color: '#1D4ED8',
                        border: '1px solid #BFDBFE',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Edit2 size={13} /> Editar
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteSolicitud(item.id)}
                      title="Eliminar este reclamo"
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        backgroundColor: '#FEF2F2',
                        color: '#DC2626',
                        border: '1px solid #FECACA',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Contenido: Modo Edición vs Modo Visualización */}
                {editingId === item.id ? (
                  <div style={{ backgroundColor: '#EFF6FF', borderRadius: '8px', padding: '14px', border: '1px solid #BFDBFE', marginBottom: '12px' }}>
                    <div style={{ fontWeight: '700', color: '#1E40AF', fontSize: '0.85rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Edit2 size={15} /> Modificar Reclamo del Vecino
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                        Temática:
                      </label>
                      <select
                        className="form-control form-control-sm"
                        value={editForm.tematica}
                        onChange={(e) => setEditForm(prev => ({ ...prev, tematica: e.target.value }))}
                        style={{ fontSize: '0.82rem', maxWidth: '320px' }}
                      >
                        {TEMATICAS_PAPELETA.map(t => (
                          <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                        ))}
                      </select>
                    </div>

                    <SelectorUbicacionPapeleta
                      value={editForm.direccion}
                      meta={{
                        autocompletado: editForm.autocompletado,
                        lat: editForm.lat,
                        lng: editForm.lng,
                        altura: editForm.altura,
                        cruce: editForm.cruce,
                        tipo_ubicacion: editForm.tipo_ubicacion,
                        comuna_direccion: editForm.comuna_direccion
                      }}
                      reunion={reunion}
                      barrioVecino={item.barrio}
                      onChange={(nuevaDir, nuevoMeta) => {
                        setEditForm(prev => ({
                          ...prev,
                          direccion: nuevaDir,
                          ...nuevoMeta
                        }));
                      }}
                    />

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                        Descripción del reclamo:
                      </label>
                      <textarea
                        rows={3}
                        className="form-control form-control-sm"
                        value={editForm.descripcion}
                        onChange={(e) => setEditForm(prev => ({ ...prev, descripcion: e.target.value }))}
                        placeholder="Detalle del reclamo..."
                        style={{ fontSize: '0.85rem' }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleCancelEdit}
                        disabled={savingId === item.id}
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleGuardarEdicion(item.id)}
                        disabled={savingId === item.id}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 14px', fontSize: '0.8rem', fontWeight: 'bold' }}
                      >
                        <Save size={14} /> {savingId === item.id ? 'Guardando...' : 'Guardar Cambios'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '12px', border: '1px solid #E2E8F0', marginBottom: '12px' }}>
                    <div style={{ marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block', marginBottom: '2px' }}>
                        📍 Dirección exacta de la consulta:
                      </span>
                      <div style={{ fontSize: '0.9rem', color: '#1E293B', fontWeight: '600' }}>
                        {item.direccion || 'Sin dirección específica ingresada'}
                      </div>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block', marginBottom: '2px' }}>
                        📝 Breve descripción del reclamo:
                      </span>
                      <div style={{ fontSize: '0.88rem', color: '#334155', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>
                        {item.descripcion || 'Sin descripción'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Barra de Acciones y Gestión de SUACI */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  {/* Botón copiar para SUACI */}
                  <button
                    type="button"
                    onClick={() => handleCopiarParaSuaci(item)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      backgroundColor: copiedId === item.id ? '#DCFCE7' : '#EFF6FF',
                      color: copiedId === item.id ? '#15803D' : '#1E40AF',
                      border: `1px solid ${copiedId === item.id ? '#86EFAC' : '#BFDBFE'}`,
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check size={14} /> ¡Copiado para SUACI!
                      </>
                    ) : (
                      <>
                        <Copy size={14} /> Copiar texto para SUACI / BAC
                      </>
                    )}
                  </button>

                  {/* Input para guardar Nro. de Ticket SUACI */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="text"
                      placeholder="Ticket SUACI (ej: 84920)..."
                      className="form-control form-control-sm"
                      value={ticketInputs[item.id] !== undefined ? ticketInputs[item.id] : (item.ticket_suaci || '')}
                      onChange={(e) => setTicketInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                      style={{ fontSize: '0.78rem', width: '180px' }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleGuardarDetalles(item.id)}
                      disabled={savingId === item.id}
                      style={{ fontSize: '0.75rem', padding: '4px 8px', fontWeight: 'bold' }}
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL QR PARA LA SALA */}
      {showQrModal && (
        <div className="modal-overlay" style={{ backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 1000 }}>
          <div className="modal-content" style={{ maxWidth: '440px', textAlign: 'center', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#25C2B9', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                QR Oficial para la Sala
              </span>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <h3 style={{ fontSize: '1.15rem', color: '#042A38', fontWeight: '800', margin: '0 0 6px 0' }}>
              Escaneá el Formulario de Solicitudes
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748B', marginBottom: '16px' }}>
              {reunion?.nombre} • {reunion?.fecha}
            </p>

            {/* Imagen del QR */}
            <div style={{ backgroundColor: '#FFFFFF', padding: '16px', borderRadius: '12px', display: 'inline-block', border: '2px solid #E2E8F0', marginBottom: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
              <img src={qrImageUrl} alt="QR Papeleta Digital" style={{ width: '220px', height: '220px', display: 'block' }} />
            </div>

            <div style={{ fontSize: '0.78rem', color: '#475569', backgroundColor: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '16px' }}>
              Los vecinos pueden apuntar la cámara del celular para abrir la papeleta digital directamente en su navegador.
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCopiarLink}
                style={{ flex: 1, fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Copy size={14} /> Copiar Link
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.open(publicPapeletaUrl, '_blank')}
                style={{ flex: 1, fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <ExternalLink size={14} /> Abrir Formulario
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
