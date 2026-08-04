import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import DashboardAdmin from './components/DashboardAdmin';
import ABMReuniones from './components/ABMReuniones';
import ControlAsistencia from './components/ControlAsistencia';
import AdministrarReunion from './components/AdministrarReunion';
import PanelModerador from './components/PanelModerador';
import { LogOut, ShieldCheck } from 'lucide-react';
import { supabase } from './lib/supabaseClient';

// Polyfill seguro para prevenir errores de 'removeChild' / 'insertBefore' en React 
// causados por Google Translate o extensiones del navegador que alteran el DOM
if (typeof window !== 'undefined' && typeof Node !== 'undefined' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) {
      if (console && console.warn) {
        console.warn('Node.removeChild prevenido:', child, this);
      }
      if (child.parentNode) {
        return child.parentNode.removeChild(child);
      }
      return child;
    }
    return originalRemoveChild.apply(this, arguments);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (console && console.warn) {
        console.warn('Node.insertBefore prevenido:', referenceNode, this);
      }
      return this.appendChild(newNode);
    }
    return originalInsertBefore.apply(this, arguments);
  };
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error no capturado en la aplicación:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: '#F8FAFC', minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ color: '#991B1B', marginBottom: '1rem', fontWeight: '800' }}>⚠️ Ocurrió un error inesperado al cargar la pantalla</h2>
          <p style={{ color: '#475569', maxWidth: '500px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            {this.state.error?.message || 'Detalle inesperado en la interfaz.'}
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="btn btn-primary"
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{ backgroundColor: 'var(--color-primary)', fontWeight: '700', padding: '10px 24px' }}
            >
              Reintentar
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => {
                localStorage.removeItem('presentismo_user');
                sessionStorage.clear();
                window.location.href = '/';
              }}
              style={{ padding: '10px 20px' }}
            >
              Volver al Login
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('presentismo_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [currentView, setCurrentView] = useState(() => {
    const saved = sessionStorage.getItem('presentismo_view');
    const savedUser = localStorage.getItem('presentismo_user');
    return saved || (savedUser ? 'dashboard' : 'login');
  });
  const [selectedReunion, setSelectedReunion] = useState(() => {
    const saved = sessionStorage.getItem('presentismo_selected_reunion');
    return saved ? JSON.parse(saved) : null;
  });
  const [activeDashboardTab, setActiveDashboardTab] = useState(() => {
    const saved = sessionStorage.getItem('presentismo_dashboard_tab');
    return saved || 'reuniones';
  });
  const [dialog, setDialog] = useState(null);

  // Estados para abrir modales o vistas específicas desde la URL
  const [initialModal, setInitialModal] = useState(null);
  const [initialModalReunionId, setInitialModalReunionId] = useState(null);
  const [initialShowHistorical, setInitialShowHistorical] = useState(false);

  // Parsear parámetros de la URL para soporte multi-pestaña
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qView = params.get('view');
    const qReunionId = params.get('reunion_id');
    const qModal = params.get('modal');
    const qHistorical = params.get('show_historical');

    if (user) {
      if (qHistorical === 'true') {
        setInitialShowHistorical(true);
      }
      if (qView) {
        if (qView === 'dashboard') {
          setCurrentView('dashboard');
          if (qModal && qReunionId) {
            setInitialModal(qModal);
            setInitialModalReunionId(qReunionId);
          }
        } else if (qView === 'create_reunion') {
          setCurrentView('create_reunion');
        } else if (qReunionId) {
          const fetchReunion = async () => {
            try {
              const { data, error } = await supabase
                .from('reuniones')
                .select('*')
                .eq('id', qReunionId)
                .single();
              if (!error && data) {
                setSelectedReunion(data);
                setCurrentView(qView);
              }
            } catch (err) {
              console.error('Error al cargar la reunión de la URL:', err);
            }
          };
          fetchReunion();
        } else {
          setCurrentView(qView);
        }
      }
    }
  }, [user]);

  // Guardar estado en sessionStorage para tolerar F5 (refrescos de navegador)
  useEffect(() => {
    sessionStorage.setItem('presentismo_dashboard_tab', activeDashboardTab);
  }, [activeDashboardTab]);

  // Guardar estado en localStorage para tolerar F5 y multi-pestaña
  React.useEffect(() => {
    if (user) {
      localStorage.setItem('presentismo_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('presentismo_user');
    }
  }, [user]);

  React.useEffect(() => {
    sessionStorage.setItem('presentismo_view', currentView);
  }, [currentView]);

  React.useEffect(() => {
    if (selectedReunion) {
      sessionStorage.setItem('presentismo_selected_reunion', JSON.stringify(selectedReunion));
    } else {
      sessionStorage.removeItem('presentismo_selected_reunion');
    }
  }, [selectedReunion]);

  // Sobrescribir popups nativos del navegador por modales web
  React.useEffect(() => {
    window.alert = (message, title = 'Aviso del Sistema') => {
      return new Promise(resolve => {
        setDialog({ message, title, type: 'alert', resolve });
      });
    };

    window.confirm = (message, title = 'Confirmación') => {
      return new Promise(resolve => {
        setDialog({ message, title, type: 'confirm', resolve });
      });
    };
  }, []);

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    setSelectedReunion(null);
    setCurrentView('login');
    localStorage.removeItem('presentismo_user');
    sessionStorage.clear();
  };

  const handleSelectReunion = (reunion) => {
    setSelectedReunion(reunion);
    setCurrentView('asistencia');
  };

  const handleSaveMeetingSuccess = () => {
    setCurrentView('dashboard');
  };

  const isCercaniaOrGerencia = user && (user.rol === 'gerencia' || user.rol === 'cercania');

  return (
    <ErrorBoundary>
      <div className="app-container notranslate" translate="no">
        {/* HEADER DE LA APLICACIÓN */}
        {user && (
          <header className="app-header">
            <h1>
              <span>BA</span> Participación Ciudadana
            </h1>
            <div className="user-info">
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                <ShieldCheck size={14} style={{ color: 'var(--color-highlight)' }} />
                <strong>{user.nombre}</strong>
              </span>
              <span className="role-badge">
                {(user.rol || 'gerencia').replace('_', ' ')}
              </span>
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={handleLogout} 
                style={{ 
                  padding: '4px 8px', 
                  backgroundColor: 'rgba(255,255,255,0.1)', 
                  color: '#ffffff', 
                  border: '1px solid rgba(255,255,255,0.2)' 
                }}
                title="Cerrar sesión"
              >
                <LogOut size={14} />
              </button>
            </div>
          </header>
        )}

      {/* CUERPO PRINCIPAL / ENRUTADOR DE VISTAS */}
      <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        {currentView === 'login' && (
          <Login onLoginSuccess={handleLoginSuccess} />
        )}

        {currentView === 'dashboard' && user && (
          <DashboardAdmin 
            user={user}
            onSelectReunion={handleSelectReunion}
            onManageReunion={(reunion) => {
              setSelectedReunion(reunion);
              setCurrentView('administrar_reunion');
            }}
            onModerarReunion={(reunion) => {
              setSelectedReunion(reunion);
              setCurrentView('moderar_reunion');
            }}
            onCreateMeetingClick={() => setCurrentView('create_reunion')}
            activeDashboardTab={activeDashboardTab}
            setActiveDashboardTab={setActiveDashboardTab}
            initialModal={initialModal}
            initialModalReunionId={initialModalReunionId}
            initialShowHistorical={initialShowHistorical}
            onClearInitialModal={() => {
              setInitialModal(null);
              setInitialModalReunionId(null);
            }}
          />
        )}

        {currentView === 'create_reunion' && user && (
          <ABMReuniones 
            onBack={() => setCurrentView('dashboard')}
            onSaveSuccess={handleSaveMeetingSuccess}
          />
        )}

        {currentView === 'asistencia' && user && selectedReunion && (
          <ControlAsistencia 
            reunion={selectedReunion}
            user={user}
            mode="asistencia"
            onBack={() => {
              setSelectedReunion(null);
              setCurrentView('dashboard');
            }}
          />
        )}

        {currentView === 'administrar_reunion' && user && selectedReunion && (
          <AdministrarReunion 
            reunion={selectedReunion}
            onBack={() => {
              setSelectedReunion(null);
              setCurrentView('dashboard');
            }}
            onSaveSuccess={() => {
              setSelectedReunion(null);
              setCurrentView('dashboard');
            }}
          />
        )}

        {currentView === 'moderar_reunion' && user && selectedReunion && (
          selectedReunion.tipo_reunion === 'Uno a Uno' ? (
            <ControlAsistencia 
              reunion={selectedReunion}
              user={user}
              mode="moderacion"
              onBack={() => {
                setSelectedReunion(null);
                setCurrentView('dashboard');
              }}
            />
          ) : (
            <PanelModerador 
              reunion={selectedReunion}
              onBack={() => {
                setSelectedReunion(null);
                setCurrentView('dashboard');
              }}
            />
          )
        )}
      </main>

      {/* FOOTER PREMIUM */}
      {user && (
        <footer style={{
          backgroundColor: '#031D27',
          color: 'rgba(255,255,255,0.5)',
          textAlign: 'center',
          padding: '1rem',
          fontSize: '0.75rem',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          marginTop: 'auto'
        }}>
          © 2026 - Dirección General de Participación Ciudadana - Gobierno de la Ciudad de Buenos Aires.
        </footer>
      )}
      {/* GLOBAL CUSTOM ALERT/CONFIRM DIALOG MODAL */}
      {dialog && (
        <div className="modal-overlay" style={{ zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ 
            maxWidth: '450px', 
            width: '90%', 
            padding: '1.75rem', 
            borderTop: `4px solid ${dialog.type === 'confirm' ? 'var(--color-primary)' : 'var(--color-highlight)'}`,
            borderRadius: '12px',
            textAlign: 'center',
            backgroundColor: '#FFFFFF',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            animation: 'fadeIn 0.2s ease'
          }}>
            <h3 style={{ fontSize: '1.25rem', color: 'var(--color-primary)', margin: '0 0 0.85rem 0', fontWeight: '700' }}>
              {dialog.title}
            </h3>
            <p style={{ 
              fontSize: '0.9rem', 
              color: '#334155', 
              margin: '0 0 1.75rem 0', 
              lineHeight: '1.6',
              whiteSpace: 'pre-line'
            }}>
              {dialog.message}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              {dialog.type === 'confirm' && (
                <button 
                  className="btn btn-secondary" 
                  onClick={() => {
                    dialog.resolve(false);
                    setDialog(null);
                  }}
                  style={{ padding: '8px 20px', fontSize: '0.85rem', fontWeight: '600' }}
                >
                  Cancelar
                </button>
              )}
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  dialog.resolve(true);
                  setDialog(null);
                }}
                style={{ 
                  padding: '8px 20px', 
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  backgroundColor: dialog.type === 'confirm' ? 'var(--color-primary)' : 'var(--color-highlight)',
                  borderColor: dialog.type === 'confirm' ? 'var(--color-primary)' : 'var(--color-highlight)'
                }}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
