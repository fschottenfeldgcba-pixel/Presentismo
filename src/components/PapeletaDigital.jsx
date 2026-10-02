import React, { useState, useEffect } from 'react';
import { 
  TEMATICAS_PAPELETA, 
  getReunionParaPapeleta, 
  getVecinoParaPapeleta, 
  guardarSolicitudesPapeleta 
} from '../services/solicitudesService';
import { CheckCircle2, Plus, Trash2, Send, MapPin, FileText, User, Phone, Mail, Calendar, Sparkles, Building2, AlertCircle } from 'lucide-react';

export default function PapeletaDigital({ reunionId, initialDni, onVolver }) {
  const [reunion, setReunion] = useState(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [enviadoExito, setEnviadoExito] = useState(false);
  const [cantidadEnviada, setCantidadEnviada] = useState(0);

  // Datos personales del vecino
  const [nombreApellido, setNombreApellido] = useState('');
  const [dni, setDni] = useState(initialDni || '');
  const [telefono, setTelefono] = useState('');
  const [barrio, setBarrio] = useState('');
  const [email, setEmail] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0]);

  // Lista dinámica de solicitudes
  const [solicitudes, setSolicitudes] = useState([
    { id: 1, tematica: '', tematica_otro: '', direccion: '', descripcion: '' }
  ]);

  // Error feedback
  const [formError, setFormError] = useState('');

  // Cargar datos de la reunión y del vecino al montar
  useEffect(() => {
    const init = async () => {
      setLoadingInitial(true);
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const rId = reunionId || urlParams.get('reunion_id');
        const qDni = initialDni || urlParams.get('dni');

        if (rId) {
          const rData = await getReunionParaPapeleta(rId);
          if (rData) {
            setReunion(rData);
            if (rData.fecha) setFecha(rData.fecha);
          }
        }

        if (qDni) {
          setDni(qDni);
          const vData = await getVecinoParaPapeleta(qDni, rId);
          if (vData) {
            const fullNom = `${vData.nombre || ''} ${vData.apellido || ''}`.trim();
            if (fullNom) setNombreApellido(fullNom);
            if (vData.celular) setTelefono(vData.celular);
            if (vData.barrio) setBarrio(vData.barrio);
            if (vData.email) setEmail(vData.email);
            
            // Si tenía un tema previo cargado en la inscripción, sugerirlo en la primera solicitud
            if (vData.tema_previo && solicitudes.length === 1 && !solicitudes[0].descripcion) {
              setSolicitudes([{
                id: 1,
                tematica: '',
                tematica_otro: '',
                direccion: '',
                descripcion: vData.tema_previo
              }]);
            }
          }
        }
      } catch (err) {
        console.error('Error inicializando papeleta:', err);
      } finally {
        setLoadingInitial(false);
      }
    };

    init();
  }, [reunionId, initialDni]);

  // Si el usuario cambia el DNI manualmente, intentar auto-completar sus datos
  const handleDniBlur = async () => {
    if (!dni || dni.length < 7) return;
    try {
      const vData = await getVecinoParaPapeleta(dni, reunion?.id);
      if (vData && (vData.nombre || vData.apellido)) {
        const fullNom = `${vData.nombre || ''} ${vData.apellido || ''}`.trim();
        if (fullNom && !nombreApellido) setNombreApellido(fullNom);
        if (vData.celular && !telefono) setTelefono(vData.celular);
        if (vData.barrio && !barrio) setBarrio(vData.barrio);
        if (vData.email && !email) setEmail(vData.email);
      }
    } catch (e) {}
  };

  const handleAddSolicitud = () => {
    setSolicitudes(prev => [
      ...prev,
      { id: Date.now(), tematica: '', tematica_otro: '', direccion: '', descripcion: '' }
    ]);
  };

  const handleRemoveSolicitud = (id) => {
    if (solicitudes.length <= 1) return;
    setSolicitudes(prev => prev.filter(s => s.id !== id));
  };

  const handleSolicitudChange = (id, field, value) => {
    setSolicitudes(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!nombreApellido.trim()) {
      setFormError('Por favor completá tu Nombre y Apellido.');
      return;
    }

    if (!dni.trim()) {
      setFormError('Por favor completá tu número de DNI.');
      return;
    }

    // Validar que al menos una solicitud tenga temática y descripción
    const validSolicitudes = solicitudes.filter(s => s.tematica && (s.descripcion.trim() || s.direccion.trim()));
    if (validSolicitudes.length === 0) {
      setFormError('Por favor seleccioná la temática e ingresá la descripción de al menos una solicitud.');
      return;
    }

    setEnviando(true);
    try {
      const res = await guardarSolicitudesPapeleta({
        reunion_id: reunion?.id || null,
        vecino_id: dni.trim(),
        nombre_apellido: nombreApellido.trim(),
        dni: dni.trim(),
        telefono: telefono.trim(),
        barrio: barrio.trim(),
        email: email.trim(),
        fecha: fecha,
        solicitudes: validSolicitudes
      });

      if (res.success) {
        setCantidadEnviada(validSolicitudes.length);
        setEnviadoExito(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setFormError(res.error || 'Ocurrió un error al enviar el formulario.');
      }
    } catch (err) {
      console.error(err);
      setFormError('No se pudo enviar el formulario. Verifica tu conexión e intentá de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  if (loadingInitial) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F4F7F9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '4px solid #CBD5E1', borderTopColor: '#25C2B9', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px auto' }} />
          <p style={{ color: '#475569', fontWeight: '600' }}>Cargando formulario de solicitudes...</p>
        </div>
      </div>
    );
  }

  // Pantalla de Éxito
  if (enviadoExito) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F4F7F9', padding: '24px 16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ maxWidth: '580px', width: '100%', backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '32px 24px', boxShadow: '0 10px 25px rgba(0,0,0,0.08)', textAlign: 'center', borderTop: '6px solid #10B981' }}>
          <div style={{ width: '64px', height: '64px', backgroundColor: '#DCFCE7', color: '#10B981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
            <CheckCircle2 size={36} />
          </div>

          <h2 style={{ fontSize: '1.4rem', color: '#042A38', fontWeight: '800', marginBottom: '8px' }}>
            ¡Solicitud Recibida con Éxito!
          </h2>
          <p style={{ color: '#475569', fontSize: '0.95rem', lineHeight: '1.5', marginBottom: '20px' }}>
            Muchas gracias, <strong>{nombreApellido}</strong>. Registramos <strong>{cantidadEnviada} {cantidadEnviada === 1 ? 'solicitud' : 'solicitudes'}</strong>.
          </p>

          <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', textAlign: 'left', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#1E40AF', fontWeight: '700', fontSize: '0.85rem' }}>
              <Sparkles size={16} /> Próximos pasos y gestión:
            </div>
            <p style={{ fontSize: '0.85rem', color: '#475569', margin: 0, lineHeight: '1.5' }}>
              El equipo de <strong>Participación Ciudadana y Cercanía</strong> está canalizando tus reclamos en tiempo real a través del sistema <strong>SUACI / BA Colaborativa</strong> para su derivación y resolución con las áreas de gobierno correspondientes.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEnviadoExito(false);
                setSolicitudes([{ id: Date.now(), tematica: '', tematica_otro: '', direccion: '', descripcion: '' }]);
              }}
              style={{ backgroundColor: '#042A38', color: '#FFFFFF', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer', border: 'none' }}
            >
              + Cargar otra solicitud para este encuentro
            </button>
            {onVolver && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onVolver}
                style={{ padding: '10px', fontSize: '0.85rem' }}
              >
                Volver al Panel Principal
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F4F7F9', padding: '20px 12px 60px 12px' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        
        {/* ENCABEZADO OFICIAL TIPO GCBA */}
        <div style={{ backgroundColor: '#042A38', color: '#FFFFFF', borderRadius: '16px 16px 0 0', padding: '22px 20px', position: 'relative', overflow: 'hidden', boxShadow: '0 4px 12px rgba(4,42,56,0.15)' }}>
          {/* Solapas decorativas GCBA */}
          <div style={{ position: 'absolute', top: 0, right: '20px', display: 'flex', gap: '4px' }}>
            <div style={{ width: '40px', height: '10px', backgroundColor: '#25C2B9', borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px' }} />
            <div style={{ width: '40px', height: '10px', backgroundColor: '#FCD116', borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', letterSpacing: '1px', textTransform: 'uppercase', color: '#25C2B9', fontWeight: '800' }}>
              Buenos Aires Ciudad
            </span>
          </div>

          <h1 style={{ fontSize: '1.35rem', fontWeight: '800', margin: '0 0 6px 0', color: '#FFFFFF' }}>
            FORMULARIO DE SOLICITUDES
          </h1>

          {reunion && (
            <div style={{ fontSize: '0.82rem', color: '#CBD5E1', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <Building2 size={13} style={{ color: '#25C2B9' }} />
              <span><strong>{reunion.nombre}</strong></span>
              {reunion.lugar && <span>• {reunion.lugar}</span>}
              {reunion.comuna && <span>• {reunion.comuna}</span>}
            </div>
          )}
        </div>

        {/* CONTENEDOR PRINCIPAL */}
        <form onSubmit={handleSubmit} style={{ backgroundColor: '#FFFFFF', borderRadius: '0 0 16px 16px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.06)', border: '1px solid #E2E8F0', borderTop: 'none' }}>
          
          <div style={{ fontSize: '0.78rem', color: '#64748B', fontStyle: 'italic', marginBottom: '16px', backgroundColor: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            * Los datos marcados con asterisco son obligatorios. Las solicitudes son elevadas de forma directa al equipo de gestión.
          </div>

          {formError && (
            <div style={{ backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          {/* SECCIÓN 1: DATOS PERSONALES */}
          <div style={{ marginBottom: '24px', backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <h3 style={{ fontSize: '0.9rem', color: '#042A38', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={15} style={{ color: '#25C2B9' }} /> Datos del Vecino
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                  * Nombre y apellido:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Juan Pérez"
                  className="form-control"
                  value={nombreApellido}
                  onChange={(e) => setNombreApellido(e.target.value)}
                  style={{ fontSize: '0.88rem', padding: '8px 12px', borderRadius: '6px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                  * DNI:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Número de DNI (sin puntos)"
                  className="form-control"
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  onBlur={handleDniBlur}
                  style={{ fontSize: '0.88rem', padding: '8px 12px', borderRadius: '6px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                  * Teléfono / Celular:
                </label>
                <input
                  type="tel"
                  placeholder="Ej: 11 1234 5678"
                  className="form-control"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  style={{ fontSize: '0.88rem', padding: '8px 12px', borderRadius: '6px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                  * Barrio / Comuna:
                </label>
                <input
                  type="text"
                  placeholder="Ej: La Boca, Comuna 4"
                  className="form-control"
                  value={barrio}
                  onChange={(e) => setBarrio(e.target.value)}
                  style={{ fontSize: '0.88rem', padding: '8px 12px', borderRadius: '6px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                  * e-mail:
                </label>
                <input
                  type="email"
                  placeholder="ejemplo@email.com"
                  className="form-control"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ fontSize: '0.88rem', padding: '8px 12px', borderRadius: '6px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                  * Fecha:
                </label>
                <input
                  type="date"
                  className="form-control"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  style={{ fontSize: '0.88rem', padding: '8px 12px', borderRadius: '6px' }}
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: BLOQUES DE SOLICITUDES REPETIBLES */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '0.95rem', color: '#042A38', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={16} style={{ color: '#25C2B9' }} /> Reclamos y Solicitudes
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>
                {solicitudes.length} {solicitudes.length === 1 ? 'solicitud' : 'solicitudes'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {solicitudes.map((sol, index) => (
                <div 
                  key={sol.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '2px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    position: 'relative'
                  }}
                >
                  {/* Barra de cabecera de la solicitud */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                    <span style={{ fontWeight: '800', fontSize: '0.85rem', color: '#042A38', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ backgroundColor: '#042A38', color: '#FFFFFF', borderRadius: '50%', width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>
                        {index + 1}
                      </span>
                      Solicitud #{index + 1}
                    </span>

                    {solicitudes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSolicitud(sol.id)}
                        style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        title="Eliminar esta solicitud"
                      >
                        <Trash2 size={14} /> Quitar
                      </button>
                    )}
                  </div>

                  {/* 1. Temática */}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '6px' }}>
                      * Temática de solicitud o consulta:
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {TEMATICAS_PAPELETA.map((t) => {
                        const isSelected = sol.tematica === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleSolicitudChange(sol.id, 'tematica', t.id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '6px 12px',
                              borderRadius: '20px',
                              fontSize: '0.78rem',
                              fontWeight: isSelected ? '800' : '600',
                              border: isSelected ? `2px solid ${t.color}` : '1px solid #CBD5E1',
                              backgroundColor: isSelected ? t.color : '#F8FAFC',
                              color: isSelected ? '#FFFFFF' : '#334155',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span>{t.icon}</span>
                            <span>{t.label}</span>
                            {isSelected && <span style={{ fontSize: '0.7rem' }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>

                    {sol.tematica === 'Otros' && (
                      <input
                        type="text"
                        placeholder="Especificar temática..."
                        className="form-control form-control-sm"
                        value={sol.tematica_otro || ''}
                        onChange={(e) => handleSolicitudChange(sol.id, 'tematica_otro', e.target.value)}
                        style={{ marginTop: '8px', fontSize: '0.85rem' }}
                      />
                    )}
                  </div>

                  {/* 2. Dirección exacta */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                      * Dirección exacta de solicitud / consulta:
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Ej: Av. San Juan 2500 o Esquina Defensa y Caseros"
                        className="form-control"
                        value={sol.direccion}
                        onChange={(e) => handleSolicitudChange(sol.id, 'direccion', e.target.value)}
                        style={{ fontSize: '0.88rem', paddingLeft: '32px' }}
                      />
                      <MapPin size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                    </div>
                  </div>

                  {/* 3. Breve descripción */}
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                      * Breve descripción:
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Describí con el mayor detalle posible qué ocurre en el lugar, horario o referencias..."
                      className="form-control"
                      value={sol.descripcion}
                      onChange={(e) => handleSolicitudChange(sol.id, 'descripcion', e.target.value)}
                      style={{ fontSize: '0.88rem', lineHeight: '1.4' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Botón para agregar más solicitudes */}
            <button
              type="button"
              onClick={handleAddSolicitud}
              style={{
                marginTop: '12px',
                width: '100%',
                padding: '10px',
                backgroundColor: '#EFF6FF',
                color: '#1E40AF',
                border: '1px dashed #93C5FD',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Plus size={16} /> + Agregar otra solicitud / reclamo
            </button>
          </div>

          {/* BOTÓN DE ENVÍO */}
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              type="submit"
              disabled={enviando}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: '#25C2B9',
                color: '#042A38',
                border: 'none',
                borderRadius: '10px',
                fontWeight: '800',
                fontSize: '1rem',
                cursor: enviando ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(37,194,185,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {enviando ? (
                <>Enviando solicitudes...</>
              ) : (
                <>
                  <Send size={18} /> Enviar Formulario de Solicitudes
                </>
              )}
            </button>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', textAlign: 'center' }}>
              Al enviar, las solicitudes ingresan inmediatamente a la bandeja de gestión y seguimiento.
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
