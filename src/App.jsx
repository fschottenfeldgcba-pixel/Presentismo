import React, { useState } from 'react';
import Login from './components/Login';
import DashboardAdmin from './components/DashboardAdmin';
import ABMReuniones from './components/ABMReuniones';
import ControlAsistencia from './components/ControlAsistencia';
import AdministrarReunion from './components/AdministrarReunion';
import { LogOut, Users2, ShieldCheck } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('login'); // 'login' | 'dashboard' | 'create_reunion' | 'asistencia'
  const [selectedReunion, setSelectedReunion] = useState(null);

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    setSelectedReunion(null);
    setCurrentView('login');
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
    <div className="app-container">
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
              {user.rol.replace('_', ' ')}
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
            onCreateMeetingClick={() => setCurrentView('create_reunion')}
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
    </div>
  );
}
