import React, { useState } from 'react';
import { LogIn, Key, Users, UserPlus, ArrowLeft } from 'lucide-react';
import { login, signUp } from '../services/supabaseService';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Modo de registro
  const [isSignUp, setIsSignUp] = useState(false);
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState('gerencia');

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
      setError(`Error de autenticación: ${loginError.message || 'Credenciales inválidas.'}`);
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
      setError(`Error de registro: ${signUpError.message || 'No se pudo crear la cuenta.'}`);
    } else if (data) {
      alert('¡Usuario registrado con éxito en Supabase Auth y perfil sincronizado!');
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
        )}

        {/* MODO REGISTRO */}
        {isSignUp ? (
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

            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
