import React, { useState, useEffect } from 'react';
import { LogIn, Key, Users, UserPlus, ArrowLeft, Mail, RefreshCw } from 'lucide-react';
import { login, signUp, recuperarPassword, updatePassword } from '../services/supabaseService';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Modo de registro
  const [isSignUp, setIsSignUp] = useState(false);
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState('gerencia');

  // Modo de recuperación y restablecimiento de contraseña
  const [isRecovery, setIsRecovery] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [recoveryEmailSent, setRecoveryEmailSent] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  // Detectar si el usuario viene desde el correo de restablecimiento de contraseña
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && (hash.includes('access_token=') || hash.includes('type=recovery'))) {
      setIsResetMode(true);
      setError('');
    }
  }, []);

  const handleRecoverySubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Por favor, ingresá tu correo electrónico.');
      return;
    }
    
    setLoading(true);
    setError('');
    const { error: recError } = await recuperarPassword(email);
    setLoading(false);
    
    if (recError) {
      setError(`Error al enviar correo: ${recError.message}`);
    } else {
      setRecoveryEmailSent(true);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    
    setLoading(true);
    setError('');
    const { error: resetError } = await updatePassword(newPassword);
    setLoading(false);
    
    if (resetError) {
      setError(`Error al restablecer contraseña: ${resetError.message}`);
    } else {
      alert('¡Tu contraseña ha sido restablecida con éxito! Ya podés ingresar al sistema.');
      // Limpiar URL de los hash tokens para no quedarse en modo reset
      window.history.replaceState(null, null, window.location.pathname);
      setIsResetMode(false);
      setIsRecovery(false);
      setIsSignUp(false);
      setPassword('');
      setNewPassword('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Por favor, ingresá correo electrónico y contraseña.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    const { data, error: loginError } = await login(email, password);
    setLoading(false);
    
    if (loginError) {
      let msg = loginError.message || 'Credenciales inválidas.';
      if (msg.includes('Invalid login credentials')) {
        msg = 'Credenciales inválidas. Por favor verificá que el correo y la contraseña ingresados sean correctos (o que la cuenta no esté pendiente de confirmación por email).';
      }
      setError(`Error de autenticación: ${msg}`);
    } else if (data) {
      onLoginSuccess(data);
    }
  };

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password || !nombre) {
      setError('Por favor, completá todos los campos obligatorios.');
      return;
    }

    setLoading(true);
    setError('');

    const { data, error: signUpError } = await signUp(email, password, nombre, rol);
    setLoading(false);

    if (signUpError) {
      let msg = signUpError.message || 'No se pudo crear la cuenta.';
      if (msg.includes('over_email_send_rate_limit') || msg.includes('rate limit')) {
        msg = 'Se superó el límite de envío de correos de confirmación en Supabase Auth. Intentá más tarde o desactivá la confirmación de email obligatoria en el panel de Supabase.';
      }
      setError(`Error de registro: ${msg}`);
    } else if (data) {
      alert('¡Usuario registrado con éxito! Ya podés ingresar al sistema.');
      onLoginSuccess(data);
    }
  };



  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '80vh',
      padding: '1rem'
    }}>
      <div className="card" style={{ maxWidth: '450px', width: '100%', padding: '2.5rem' }}>
        <div className="decor-tabs-container">
          <div className="decor-tab-mint"></div>
          <div className="decor-tab-yellow"></div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.8rem', color: 'var(--color-primary)', fontWeight: '700' }}>
            Presentismo <span style={{ color: 'var(--color-highlight)' }}>Vecinal</span>
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Participación Ciudadana
          </p>
        </div>

        {error && (
          <div>
            <div style={{
              backgroundColor: '#FDE8E8',
              color: '#9B1C1C',
              padding: '0.75rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              border: '1px solid #F8B4B4'
            }}>
              {error}
            </div>
            {error.includes('Email not confirmed') && (
              <div style={{
                backgroundColor: '#EFF6FF',
                color: '#1E40AF',
                padding: '0.75rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                marginBottom: '1rem',
                border: '1px solid #BFDBFE',
                lineHeight: '1.4'
              }}>
                💡 <strong>Tip para pruebas locales</strong>: En la consola de Supabase, podés desactivar la confirmación de email obligatoria en: <em>Authentication &gt; Providers &gt; Email &gt; Confirm email: OFF</em>. Así podrás ingresar inmediatamente sin validar el correo.
              </div>
            )}
            {error.includes('rate limit exceeded') && (
              <div style={{
                backgroundColor: '#EFF6FF',
                color: '#1E40AF',
                padding: '0.75rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                marginBottom: '1rem',
                border: '1px solid #BFDBFE',
                lineHeight: '1.4'
              }}>
                💡 <strong>Límite de envíos excedido</strong>: Supabase limita la cantidad de correos de confirmación. Esperá unos minutos o desactivá <em>Confirm email</em> en la consola de Supabase para omitir este paso en tus pruebas.
              </div>
            )}
          </div>
        )}

        {/* VISTA DE RESTABLECIMIENTO (RESET PASSWORD) */}
        {isResetMode ? (
          <form onSubmit={handleResetSubmit}>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
              Establecé tu nueva contraseña para ingresar al sistema:
            </p>
            <div className="form-group">
              <label htmlFor="reset-password">Nueva Contraseña *</label>
              <input
                type="password"
                id="reset-password"
                className="form-control"
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              disabled={loading}
            >
              {loading ? 'Restableciendo...' : <><Key size={18} /> Guardar Nueva Contraseña</>}
            </button>
            <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
              <button 
                type="button" 
                style={{ border: 'none', background: 'none', color: 'var(--color-highlight)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}
                onClick={() => {
                  setIsResetMode(false);
                  setIsRecovery(false);
                  setIsSignUp(false);
                  setError('');
                }}
              >
                Volver al inicio de sesión
              </button>
            </div>
          </form>
        ) : isRecovery ? (
          /* VISTA DE RECUPERACIÓN (RECOVER PASSWORD) */
          <form onSubmit={handleRecoverySubmit}>
            {recoveryEmailSent ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <Mail size={40} style={{ color: 'var(--color-success)', marginBottom: '1rem' }} />
                <h4 style={{ fontSize: '1rem', color: 'var(--color-primary)', fontWeight: '700' }}>¡Correo enviado!</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '8px', lineHeight: '1.4' }}>
                  Te enviamos un correo electrónico a <strong>{email}</strong> con las instrucciones para restablecer tu contraseña.
                </p>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ width: '100%', marginTop: '1.5rem' }}
                  onClick={() => {
                    setIsRecovery(false);
                    setRecoveryEmailSent(false);
                    setError('');
                  }}
                >
                  Volver al inicio de sesión
                </button>
              </div>
            ) : (
              <>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem', lineHeight: '1.4' }}>
                  Ingresá tu correo electrónico y te enviaremos un link para restablecer tu contraseña:
                </p>
                <div className="form-group">
                  <label htmlFor="recovery-email">Correo Electrónico *</label>
                  <input
                    type="email"
                    id="recovery-email"
                    className="form-control"
                    placeholder="ejemplo@correo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: '100%', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  disabled={loading}
                >
                  {loading ? 'Enviando...' : <><Mail size={18} /> Enviar correo de recuperación</>}
                </button>
                <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                  <button 
                    type="button" 
                    style={{ border: 'none', background: 'none', color: 'var(--color-highlight)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}
                    onClick={() => {
                      setIsRecovery(false);
                      setError('');
                    }}
                  >
                    Volver al inicio de sesión
                  </button>
                </div>
              </>
            )}
          </form>
        ) : isSignUp ? (
          /* MODO REGISTRO */
          <form onSubmit={handleSignUpSubmit}>
            <div className="form-group">
              <label htmlFor="reg-nombre">Nombre Completo *</label>
              <input
                type="text"
                id="reg-nombre"
                className="form-control"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-email">Correo Electrónico *</label>
              <input
                type="email"
                id="reg-email"
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-password">Contraseña *</label>
              <input
                type="password"
                id="reg-password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-rol">Rol en el equipo *</label>
              <select
                id="reg-rol"
                className="form-control"
                value={rol}
                onChange={(e) => setRol(e.target.value)}
              >
                <option value="gerencia">Gerencia</option>
                <option value="cercania">Cercanía</option>
                <option value="territorio_coordinacion">Coordinación Territorio</option>
                <option value="agente_territorio">Agente Territorio</option>
              </select>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              disabled={loading}
            >
              {loading ? 'Registrando...' : <><UserPlus size={18} /> Crear Cuenta y Acceder</>}
            </button>

            <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
              <button 
                type="button" 
                style={{ border: 'none', background: 'none', color: 'var(--color-highlight)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}
                onClick={() => {
                  setIsSignUp(false);
                  setError('');
                }}
              >
                Volver al inicio de sesión
              </button>
            </div>
          </form>
        ) : (
          /* MODO INGRESO */
          <>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="email">Correo Electrónico</label>
                <input
                  type="email"
                  id="email"
                  className="form-control"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Contraseña</label>
                <input
                  type="password"
                  id="password"
                  className="form-control"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                disabled={loading}
              >
                {loading ? 'Ingresando...' : <><LogIn size={18} /> Ingresar al Sistema</>}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
              <button 
                type="button" 
                style={{ border: 'none', background: 'none', color: 'var(--color-highlight)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}
                onClick={() => {
                  setIsSignUp(true);
                  setError('');
                }}
              >
                ¿No tenés usuario? Registrar administrador aquí
              </button>
              <button 
                type="button" 
                style={{ border: 'none', background: 'none', color: 'var(--color-text-muted)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.8rem' }}
                onClick={() => {
                  setIsRecovery(true);
                  setError('');
                }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
