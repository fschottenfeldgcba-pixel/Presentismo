import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  lookupVolunteer,
  uploadCheckinPhoto,
  volunteerCheckin,
  volunteerConfirmFood,
  MIGRATION_HINT
} from '../services/lndlmLogisticsService';

const DNI_KEY = 'lndlm_checkin_dni';

const ERROR_MESSAGES = {
  NO_ATTENDANCE: 'El DNI ingresado no registra asistencia a la capacitación obligatoria',
  NOT_ASSIGNED: 'Todavía no tenés un espacio cultural asignado. Consultá con tu coordinador.',
  PHOTO_REQUIRED: 'La foto es obligatoria para hacer el check-in.',
  NOT_CHECKED_IN: 'Primero tenés que hacer el check-in en tu espacio.',
  NOT_RECEIVER: 'Solo el responsable de recibir las viandas puede confirmar la recepción.'
};

const S = {
  page: { minHeight: '100vh', background: 'linear-gradient(180deg,#0F172A 0%,#1E1B4B 100%)', display: 'flex', justifyContent: 'center', padding: '16px', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', boxSizing: 'border-box' },
  wrap: { width: '100%', maxWidth: '460px', display: 'flex', flexDirection: 'column', gap: '14px' },
  card: { background: '#fff', borderRadius: '18px', padding: '18px', boxShadow: '0 10px 25px rgba(0,0,0,0.25)' },
  h1: { margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0F172A' },
  muted: { color: '#64748B', fontSize: '0.88rem' },
  input: { width: '100%', boxSizing: 'border-box', padding: '16px', fontSize: '1.4rem', letterSpacing: '0.08em', textAlign: 'center', borderRadius: '14px', border: '2px solid #CBD5E1', outline: 'none' },
  btnPrimary: { width: '100%', padding: '18px', fontSize: '1.1rem', fontWeight: 800, borderRadius: '14px', border: 'none', background: '#0F172A', color: '#fff', cursor: 'pointer' },
  btnGiant: { width: '100%', padding: '26px 12px', fontSize: '1.5rem', fontWeight: 900, borderRadius: '18px', border: 'none', background: 'linear-gradient(135deg,#10B981,#059669)', color: '#fff', cursor: 'pointer', boxShadow: '0 8px 20px rgba(16,185,129,0.4)' },
  btnPhoto: { width: '100%', padding: '16px', fontSize: '1.05rem', fontWeight: 800, borderRadius: '14px', border: '2px dashed #6366F1', background: '#EEF2FF', color: '#3730A3', cursor: 'pointer' },
  btnFood: { width: '100%', padding: '20px 12px', fontSize: '1.2rem', fontWeight: 800, borderRadius: '16px', border: 'none', background: 'linear-gradient(135deg,#F59E0B,#D97706)', color: '#0F172A', cursor: 'pointer' },
  error: { background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '12px 14px', borderRadius: '12px', fontWeight: 600, fontSize: '0.92rem' },
  row: { display: 'flex', flexDirection: 'column', gap: '2px', padding: '10px 0', borderBottom: '1px solid #F1F5F9' },
  label: { fontSize: '0.72rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  value: { fontSize: '1.02rem', fontWeight: 700, color: '#0F172A' }
};

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';

export default function LndlmCheckinApp() {
  const [dniInput, setDniInput] = useState('');
  const [info, setInfo] = useState(null); // respuesta de lndlm_volunteer_lookup
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const fileRef = useRef(null);
  const dniRef = useRef('');

  const handleApiError = (res, fallback) => {
    if (res?.missing) return setError(MIGRATION_HINT);
    const code = res?.data?.error;
    setError(ERROR_MESSAGES[code] || res?.error?.message || fallback);
  };

  const login = useCallback(async (rawDni, silent = false) => {
    const dni = String(rawDni || '').replace(/\D/g, '').trim();
    if (!dni) {
      setError('Ingresá tu número de DNI.');
      return;
    }
    console.log('[Portal LNDLM UI] Intentando login con DNI:', dni);
    if (!silent) setLoading(true);
    setError('');
    const res = await lookupVolunteer(dni);
    if (!silent) setLoading(false);
    console.log('[Portal LNDLM UI] Respuesta recibida de lookupVolunteer:', res);

    if (res.error || !res.data?.ok) {
      if (silent) return; // en refresco automático no pisamos la pantalla
      handleApiError(res, 'No pudimos validar tu DNI. Probá de nuevo.');
      localStorage.removeItem(DNI_KEY);
      return;
    }
    dniRef.current = dni;
    localStorage.setItem(DNI_KEY, dni);
    setInfo(res.data);
  }, []);

  // Sesión recordada en el celular
  useEffect(() => {
    const saved = localStorage.getItem(DNI_KEY);
    if (saved) {
      setDniInput(saved);
      login(saved);
    }
  }, [login]);

  // Refresco periódico para enterarse de que la moto salió (solo cuando ya hizo check-in)
  useEffect(() => {
    if (!info?.assigned || !info?.checkin?.check_in_time || info?.checkin?.food_received_time) return undefined;
    const t = setInterval(() => login(dniRef.current, true), 20000);
    return () => clearInterval(t);
  }, [info, login]);

  const logout = () => {
    localStorage.removeItem(DNI_KEY);
    setInfo(null);
    setDniInput('');
    setPhotoFile(null);
    setPhotoPreview('');
    setError('');
  };

  const onPhotoChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
    setError('');
  };

  const doCheckin = async () => {
    if (!photoFile) {
      setError(ERROR_MESSAGES.PHOTO_REQUIRED);
      return;
    }
    setBusy(true);
    setError('');
    const up = await uploadCheckinPhoto(photoFile, dniRef.current);
    if (up.error || !up.url) {
      setBusy(false);
      setError(`No se pudo subir la foto (${up.error?.message || 'error de red'}). Revisá tu conexión e intentá de nuevo.`);
      return;
    }
    const res = await volunteerCheckin(dniRef.current, up.url);
    setBusy(false);
    if (res.error || !res.data?.ok) {
      handleApiError(res, 'No se pudo registrar el check-in.');
      return;
    }
    setInfo(res.data);
    setPhotoFile(null);
    setPhotoPreview('');
  };

  const doConfirmFood = async () => {
    const ok = await window.confirm('¿Confirmás que recibiste las viandas de tu equipo?', 'Recepción de viandas');
    if (!ok) return;
    setBusy(true);
    setError('');
    const res = await volunteerConfirmFood(dniRef.current);
    setBusy(false);
    if (res.error || !res.data?.ok) {
      handleApiError(res, 'No se pudo registrar la recepción.');
      return;
    }
    setInfo(res.data);
  };

  // ---------------------------------------------------------------------------
  // PANTALLA 1: LOGIN POR DNI
  // ---------------------------------------------------------------------------
  if (!info) {
    return (
      <div style={S.page}>
        <div style={S.wrap}>
          <div style={{ textAlign: 'center', color: '#fff', marginTop: '28px' }}>
            <div style={{ fontSize: '3rem' }}>🏛️</div>
            <h1 style={{ margin: '4px 0', fontSize: '1.6rem', fontWeight: 900 }}>La Noche de los Museos</h1>
            <div style={{ color: '#FCD34D', fontWeight: 700 }}>Portal del Voluntario 2026</div>
          </div>

          <div style={S.card}>
            <h2 style={{ ...S.h1, marginBottom: '6px' }}>Ingresá tu DNI</h2>
            <p style={{ ...S.muted, marginTop: 0 }}>Sin puntos ni espacios. Es todo lo que necesitás para entrar.</p>
            <form onSubmit={(e) => { e.preventDefault(); login(dniInput); }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                style={S.input}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder="12345678"
                value={dniInput}
                onChange={(e) => setDniInput(e.target.value.replace(/\D/g, ''))}
              />
              {error && <div style={S.error}>{error}</div>}
              <button type="submit" style={S.btnPrimary} disabled={loading}>
                {loading ? 'Verificando...' : 'Ingresar'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const v = info.volunteer || {};
  const space = info.space;
  const ci = info.checkin || {};
  const hasCheckedIn = Boolean(ci.check_in_time);
  const isReceiver = Boolean(ci.is_food_receiver);
  const foodDone = Boolean(ci.food_received_time);
  const team = info.team || {};

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        {/* ENCABEZADO */}
        <div style={{ color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#FCD34D', fontWeight: 800 }}>🏛️ LA NOCHE DE LOS MUSEOS 2026</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900 }}>¡Hola, {v.first_name}!</div>
          </div>
          <button onClick={logout} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 12px', fontWeight: 700 }}>
            Salir
          </button>
        </div>

        {error && <div style={S.error}>{error}</div>}

        {!info.assigned ? (
          <div style={S.card}>
            <h2 style={S.h1}>Todavía sin espacio asignado</h2>
            <p style={S.muted}>{ERROR_MESSAGES.NOT_ASSIGNED}</p>
          </div>
        ) : (
          <>
            {/* HOJA DE RUTA */}
            <div style={S.card}>
              <h2 style={{ ...S.h1, marginBottom: '4px' }}>Tu hoja de ruta</h2>
              <div style={S.row}>
                <span style={S.label}>Voluntario/a</span>
                <span style={S.value}>{v.first_name} {v.last_name}</span>
              </div>
              <div style={S.row}>
                <span style={S.label}>Espacio cultural</span>
                <span style={{ ...S.value, fontSize: '1.2rem' }}>🏛️ {space?.name}</span>
              </div>
              <div style={S.row}>
                <span style={S.label}>Dirección</span>
                <a
                  style={{ ...S.value, color: '#2563EB', textDecoration: 'none' }}
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${space?.address || ''}, ${space?.name || ''}, Buenos Aires`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  📍 {space?.address || 'A confirmar'}
                </a>
              </div>
              <div style={{ ...S.row, borderBottom: 'none' }}>
                <span style={S.label}>Referente del museo</span>
                <span style={S.value}>{space?.contact_name || 'A confirmar'}</span>
                {space?.contact_phone && (
                  <a style={{ color: '#059669', fontWeight: 800, textDecoration: 'none' }} href={`tel:${space.contact_phone}`}>
                    📞 {space.contact_phone}
                  </a>
                )}
              </div>
            </div>

            {/* ACCIÓN 1: CHECK-IN CON FOTO */}
            {!hasCheckedIn ? (
              <div style={S.card}>
                <h2 style={{ ...S.h1, marginBottom: '4px' }}>Cuando llegues</h2>
                <p style={{ ...S.muted, marginTop: 0 }}>Sacá una foto de la experiencia en tu espacio y después tocá "Ya llegué".</p>

                <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhotoChange} style={{ display: 'none' }} />
                {photoPreview && (
                  <img src={photoPreview} alt="Foto de la experiencia" style={{ width: '100%', borderRadius: '14px', marginBottom: '10px', maxHeight: '260px', objectFit: 'cover' }} />
                )}
                <button type="button" style={S.btnPhoto} onClick={() => fileRef.current?.click()} disabled={busy}>
                  {photoFile ? '🔄 Cambiar foto' : '📸 Subir foto de la experiencia'}
                </button>

                <div style={{ height: '12px' }} />
                <button
                  type="button"
                  style={{ ...S.btnGiant, opacity: photoFile && !busy ? 1 : 0.45 }}
                  onClick={doCheckin}
                  disabled={!photoFile || busy}
                >
                  {busy ? 'Enviando...' : '📍 Ya llegué al espacio'}
                </button>
                {!photoFile && <div style={{ ...S.muted, textAlign: 'center', marginTop: '8px' }}>La foto es obligatoria para registrar tu llegada.</div>}
              </div>
            ) : (
              <div style={{ ...S.card, background: '#ECFDF5', border: '2px solid #6EE7B7' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#065F46' }}>✅ Check-in registrado a las {fmtTime(ci.check_in_time)}</div>
                <div style={{ ...S.muted, marginTop: '4px' }}>
                  Tu equipo: {team.checked_in || 0} de {team.assigned || 0} voluntarios ya llegaron.
                </div>
              </div>
            )}

            {/* ACCIÓN 2: VIANDAS */}
            {hasCheckedIn && isReceiver && (
              <div style={{ ...S.card, border: '2px solid #FBBF24' }}>
                {!foodDone ? (
                  <>
                    <div style={{ fontWeight: 800, color: '#92400E', fontSize: '1.02rem', marginBottom: '8px' }}>
                      Sos el responsable de recibir las viandas de tu equipo. Te avisaremos cuando la moto esté en camino.
                    </div>
                    {info.route_status === 'IN_TRANSIT' && (
                      <div style={{ background: '#FEF3C7', padding: '12px', borderRadius: '12px', fontWeight: 900, color: '#92400E', marginBottom: '10px', textAlign: 'center', fontSize: '1.1rem' }}>
                        🛵 ¡La moto con las viandas está en camino!
                      </div>
                    )}
                    <button type="button" style={S.btnFood} onClick={doConfirmFood} disabled={busy}>
                      🍱 Recibí las viandas
                    </button>
                  </>
                ) : (
                  <div style={{ fontWeight: 900, color: '#065F46', fontSize: '1.1rem' }}>
                    🍱 Viandas recibidas a las {fmtTime(ci.food_received_time)}. ¡Gracias!
                  </div>
                )}
              </div>
            )}

            {hasCheckedIn && !isReceiver && (
              <div style={S.card}>
                <div style={{ fontWeight: 700, color: '#334155' }}>
                  🍱 {team.receiver_name ? `${team.receiver_name} es el/la responsable de recibir las viandas de tu equipo.` : 'Las viandas las recibe el primer voluntario de tu equipo en llegar.'}
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', paddingBottom: '20px' }}>
          Gobierno de la Ciudad de Buenos Aires · Participación Ciudadana
        </div>
      </div>
    </div>
  );
}
