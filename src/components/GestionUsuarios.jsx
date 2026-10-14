import React, { useState, useEffect } from 'react';
import { 
  Users, UserX, UserPlus, Shield, ShieldAlert, ArrowLeft, 
  Search, Trash2, CheckCircle2, AlertTriangle, RefreshCw, Clock, Key
} from 'lucide-react';
import { 
  getPerfilesUsuarios, 
  deletePerfilUsuario, 
  updatePerfilUsuarioRol, 
  crearUsuarioAutorizado, 
  isUserOwner 
} from '../services/supabaseService';

export default function GestionUsuarios({ user, onBack, isEmbedded = false }) {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRol, setFilterRol] = useState('todos');
  const [filterRecientes, setFilterRecientes] = useState(false);
  
  // Modal para crear usuario
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRol, setNewRol] = useState('agente_territorio');
  const [creating, setCreating] = useState(false);

  // Modal para confirmar eliminación
  const [userToDelete, setUserToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);

  const isOwner = isUserOwner(user);

  const fetchUsuarios = async () => {
    setLoading(true);
    const { data, error } = await getPerfilesUsuarios();
    if (error) {
      console.error('Error al cargar usuarios:', error);
    } else {
      setUsuarios(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsuarios();
  }, []);

  // Mostrar mensaje de feedback temporal
  const triggerFeedback = (message, type = 'success') => {
    setActionFeedback({ message, type });
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setDeleting(true);
    const { error } = await deletePerfilUsuario(userToDelete.id);
    setDeleting(false);

    if (error) {
      triggerFeedback(`Error al eliminar usuario: ${error.message}`, 'error');
    } else {
      triggerFeedback(`Se eliminó y revocó el acceso para ${userToDelete.nombre || userToDelete.email}.`, 'success');
      setUserToDelete(null);
      fetchUsuarios();
    }
  };

  const handleRoleChange = async (userId, targetUserName, newRoleValue) => {
    const { error } = await updatePerfilUsuarioRol(userId, newRoleValue);
    if (error) {
      triggerFeedback(`Error al actualizar rol: ${error.message}`, 'error');
    } else {
      triggerFeedback(`Rol de ${targetUserName} actualizado a "${newRoleValue}".`, 'success');
      setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, rol: newRoleValue } : u));
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!newEmail || !newPassword || !newNombre) {
      alert('Por favor completá todos los campos.');
      return;
    }
    if (newPassword.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setCreating(true);
    const { data, error } = await crearUsuarioAutorizado(newEmail, newPassword, newNombre, newRol);
    setCreating(false);

    if (error) {
      triggerFeedback(`Error al crear usuario: ${error.message}`, 'error');
    } else {
      triggerFeedback(`Usuario ${newNombre} creado con éxito.`, 'success');
      setShowCreateModal(false);
      setNewNombre('');
      setNewEmail('');
      setNewPassword('');
      setNewRol('agente_territorio');
      fetchUsuarios();
    }
  };

  // Verificación de seguridad en caso de que alguien no autorizado intente renderizar el componente
  if (!isOwner) {
    return (
      <div className="container" style={{ maxWidth: '600px', margin: '3rem auto', textAlign: 'center', padding: '2rem' }}>
        <div className="card" style={{ padding: '2rem', border: '1px solid #FCA5A5', backgroundColor: '#FEF2F2' }}>
          <ShieldAlert size={48} style={{ color: '#DC2626', margin: '0 auto 1rem' }} />
          <h3 style={{ color: '#991B1B', fontWeight: '800' }}>Acceso Restringido</h3>
          <p style={{ color: '#7F1D1D', fontSize: '0.9rem', marginTop: '8px' }}>
            Esta sección de auditoría y gestión de cuentas está reservada exclusivamente para el Administrador General (Fernando Schottenfeld).
          </p>
          <button className="btn btn-secondary" onClick={onBack} style={{ marginTop: '1.5rem' }}>
            <ArrowLeft size={16} /> Volver al Inicio
          </button>
        </div>
      </div>
    );
  }

  // Filtrado de usuarios
  const hoyStr = new Date().toISOString().slice(0, 10);
  const hace7Dias = new Date();
  hace7Dias.setDate(hace7Dias.getDate() - 7);

  const filteredUsuarios = usuarios.filter(u => {
    // Filtro por texto
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchName = (u.nombre || '').toLowerCase().includes(term);
      const matchEmail = (u.email || '').toLowerCase().includes(term);
      const matchRol = (u.rol || '').toLowerCase().includes(term);
      if (!matchName && !matchEmail && !matchRol) return false;
    }

    // Filtro por rol
    if (filterRol !== 'todos' && u.rol !== filterRol) {
      return false;
    }

    // Filtro por recientes
    if (filterRecientes) {
      const uDate = new Date(u.created_at || 0);
      if (uDate < hace7Dias) return false;
    }

    return true;
  });

  // Estadísticas rápidas
  const totalUsuarios = usuarios.length;
  const registradosHoy = usuarios.filter(u => (u.created_at || '').slice(0, 10) === hoyStr);
  const countGerencia = usuarios.filter(u => u.rol === 'gerencia').length;
  const countCercania = usuarios.filter(u => u.rol === 'cercania').length;
  const countCoord = usuarios.filter(u => u.rol === 'territorio_coordinacion').length;
  const countAgentes = usuarios.filter(u => u.rol === 'agente_territorio').length;

  return (
    <div className="container" style={{ maxWidth: '1100px', margin: '0 auto', padding: '16px' }}>
      {/* Feedback Toast */}
      {actionFeedback && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          padding: '12px 20px',
          borderRadius: '8px',
          backgroundColor: actionFeedback.type === 'error' ? '#EF4444' : '#10B981',
          color: '#FFFFFF',
          fontWeight: '700',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'fadeIn 0.3s'
        }}>
          {actionFeedback.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{actionFeedback.message}</span>
        </div>
      )}

      {/* Header de la sección */}
      <div className="card" style={{ marginBottom: '16px', padding: '20px', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            {!isEmbedded && (
              <button 
                type="button" 
                className="btn btn-secondary btn-sm"
                onClick={onBack}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}
              >
                <ArrowLeft size={16} /> Volver al Dashboard
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--color-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={24} style={{ color: 'var(--color-highlight)' }} /> Gestión y Auditoría de Usuarios
              </h2>
              <span style={{ 
                backgroundColor: '#FEF3C7', 
                color: '#B45309', 
                border: '1px solid #FDE68A', 
                fontSize: '0.75rem', 
                fontWeight: '800', 
                padding: '3px 8px', 
                borderRadius: '12px' 
              }}>
                👑 Exclusivo: Fernando Schottenfeld
              </span>
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: '#64748B' }}>
              Control total de accesos al sistema. Podés auditar quiénes están registrados, cambiar roles o eliminar cuentas sospechosas.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={fetchUsuarios}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Refrescar lista de usuarios"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refrescar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowCreateModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}
            >
              <UserPlus size={16} /> Crear Usuario Autorizado
            </button>
          </div>
        </div>

        {/* Estado del Registro Público */}
        <div style={{ 
          marginTop: '16px', 
          padding: '10px 14px', 
          backgroundColor: '#F0FDF4', 
          border: '1px solid #BBF7D0', 
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={18} style={{ color: '#16A34A' }} />
            <span style={{ fontSize: '0.85rem', color: '#166534', fontWeight: '700' }}>
              Registro público de la web: <span style={{ textDecoration: 'underline' }}>DESACTIVADO</span>
            </span>
          </div>
          <span style={{ fontSize: '0.78rem', color: '#15803D' }}>
            Cualquier vecino que acceda a la Papeleta Digital no podrá crearse una cuenta de usuario.
          </span>
        </div>
      </div>

      {/* Tarjetas de Resumen / KPIs */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '12px', 
        marginBottom: '16px' 
      }}>
        <div className="card" style={{ padding: '14px', borderRadius: '10px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>
            Total Registrados
          </span>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--color-primary)', marginTop: '4px' }}>
            {totalUsuarios}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Usuarios con acceso</span>
        </div>

        <div className="card" style={{ 
          padding: '14px', 
          borderRadius: '10px', 
          borderLeft: registradosHoy.length > 0 ? '4px solid #EF4444' : '4px solid #CBD5E1',
          backgroundColor: registradosHoy.length > 0 ? '#FEF2F2' : '#FFFFFF'
        }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: registradosHoy.length > 0 ? '#B91C1C' : '#64748B', textTransform: 'uppercase' }}>
            Registrados Hoy
          </span>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: registradosHoy.length > 0 ? '#DC2626' : 'var(--color-primary)', marginTop: '4px' }}>
            {registradosHoy.length}
          </div>
          <span style={{ fontSize: '0.75rem', color: registradosHoy.length > 0 ? '#991B1B' : '#94A3B8' }}>
            {registradosHoy.length > 0 ? '⚠️ Revisar si corresponden' : 'Sin altas el día de hoy'}
          </span>
        </div>

        <div className="card" style={{ padding: '14px', borderRadius: '10px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>
            Distribución por Rol
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px', fontSize: '0.75rem' }}>
            <span style={{ backgroundColor: '#DBEAFE', color: '#1E40AF', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
              Gerencia: {countGerencia}
            </span>
            <span style={{ backgroundColor: '#F3E8FF', color: '#6B21A8', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
              Cercanía: {countCercania}
            </span>
            <span style={{ backgroundColor: '#CCFBF1', color: '#0F766E', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
              Coord: {countCoord}
            </span>
            <span style={{ backgroundColor: '#DCFCE7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
              Agentes: {countAgentes}
            </span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="card" style={{ marginBottom: '16px', padding: '14px', borderRadius: '10px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 260px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="🔍 Buscar por nombre, email o rol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="form-control form-control-sm"
              value={filterRol}
              onChange={(e) => setFilterRol(e.target.value)}
              style={{ width: 'auto', minWidth: '150px' }}
            >
              <option value="todos">Todos los roles</option>
              <option value="gerencia">Gerencia</option>
              <option value="cercania">Cercanía</option>
              <option value="territorio_coordinacion">Coordinación Territorio</option>
              <option value="agente_territorio">Agente Territorio</option>
            </select>

            <button
              type="button"
              className={`btn btn-sm ${filterRecientes ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterRecientes(!filterRecientes)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem' }}
            >
              <Clock size={14} /> Solo últimos 7 días {filterRecientes ? '(Activo)' : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Listado de Usuarios */}
      <div className="card" style={{ padding: '0', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569' }}>
            Mostrando {filteredUsuarios.length} de {totalUsuarios} usuarios
          </span>
          {searchTerm || filterRol !== 'todos' || filterRecientes ? (
            <button
              type="button"
              onClick={() => { setSearchTerm(''); setFilterRol('todos'); setFilterRecientes(false); }}
              style={{ border: 'none', background: 'none', color: 'var(--color-highlight)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600' }}
            >
              Limpiar filtros
            </button>
          ) : null}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#64748B' }}>
            <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px' }} />
            <p style={{ margin: 0 }}>Cargando usuarios registrados...</p>
          </div>
        ) : filteredUsuarios.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>
            No se encontraron usuarios con los filtros seleccionados.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid var(--color-border)', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px' }}>Usuario</th>
                  <th style={{ padding: '10px 14px' }}>Correo Electrónico</th>
                  <th style={{ padding: '10px 14px' }}>Rol Asignado</th>
                  <th style={{ padding: '10px 14px' }}>Fecha de Alta</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsuarios.map((u) => {
                  const isFernando = (u.email || '').toLowerCase() === 'fschottenfeld@gmail.com' || (u.id === 'd0538204-dda9-4263-87ef-10efc9566bf4');
                  const fechaStr = u.created_at ? new Date(u.created_at).toLocaleString('es-AR', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  }) : 'Desconocida';
                  const isToday = (u.created_at || '').slice(0, 10) === hoyStr;

                  return (
                    <tr 
                      key={u.id}
                      style={{ 
                        borderBottom: '1px solid var(--color-border)', 
                        backgroundColor: isToday ? '#FFFBEB' : '#FFFFFF',
                        transition: 'background-color 0.15s'
                      }}
                    >
                      {/* Nombre y Avatar */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: isFernando ? '#FEF3C7' : '#E2E8F0',
                            color: isFernando ? '#B45309' : '#334155',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '800',
                            fontSize: '0.8rem',
                            flexShrink: 0
                          }}>
                            {isFernando ? '👑' : (u.nombre || u.email || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: '700', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{u.nombre || 'Sin nombre'}</span>
                              {isFernando && (
                                <span style={{ fontSize: '0.65rem', backgroundColor: '#FEF3C7', color: '#B45309', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                                  DUEÑO
                                </span>
                              )}
                              {isToday && (
                                <span style={{ fontSize: '0.65rem', backgroundColor: '#FEE2E2', color: '#DC2626', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                                  NUEVO HOY
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                              ID: {u.id?.slice(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td style={{ padding: '12px 14px', color: '#334155', fontWeight: '500' }}>
                        {u.email}
                      </td>

                      {/* Rol con selector rápido */}
                      <td style={{ padding: '12px 14px' }}>
                        {isFernando ? (
                          <span style={{ 
                            backgroundColor: '#FEF3C7', 
                            color: '#B45309', 
                            padding: '3px 8px', 
                            borderRadius: '6px', 
                            fontSize: '0.75rem', 
                            fontWeight: '800' 
                          }}>
                            Gerencia (Dueño)
                          </span>
                        ) : (
                          <select
                            value={u.rol || 'agente_territorio'}
                            onChange={(e) => handleRoleChange(u.id, u.nombre || u.email, e.target.value)}
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: '600',
                              padding: '3px 6px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              backgroundColor: u.rol === 'gerencia' ? '#EFF6FF' : u.rol === 'cercania' ? '#FAF5FF' : u.rol === 'territorio_coordinacion' ? '#F0FDFA' : '#F0FDF4',
                              color: u.rol === 'gerencia' ? '#1E40AF' : u.rol === 'cercania' ? '#6B21A8' : u.rol === 'territorio_coordinacion' ? '#0F766E' : '#166534',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="gerencia">Gerencia</option>
                            <option value="cercania">Cercanía</option>
                            <option value="territorio_coordinacion">Coordinación Territorio</option>
                            <option value="agente_territorio">Agente Territorio</option>
                          </select>
                        )}
                      </td>

                      {/* Fecha de creación */}
                      <td style={{ padding: '12px 14px', color: '#64748B', fontSize: '0.8rem' }}>
                        {fechaStr}
                      </td>

                      {/* Botón de acción */}
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        {isFernando ? (
                          <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontStyle: 'italic' }}>
                            Cuenta principal
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setUserToDelete(u)}
                            style={{
                              backgroundColor: '#FEE2E2',
                              color: '#DC2626',
                              border: '1px solid #FCA5A5',
                              padding: '4px 10px',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer'
                            }}
                            title="Eliminar usuario y revocar acceso al sistema"
                          >
                            <Trash2 size={13} /> Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      {userToDelete && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div className="card" style={{ maxWidth: '460px', width: '100%', padding: '24px', borderRadius: '12px', border: '2px solid #EF4444' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626' }}>
                <UserX size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#991B1B', fontWeight: '800' }}>
                  ¿Eliminar usuario del sistema?
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#64748B' }}>Esta acción es irreversible</span>
              </div>
            </div>

            <p style={{ fontSize: '0.88rem', color: '#334155', lineHeight: '1.4', margin: '12px 0' }}>
              Estás a punto de dar de baja y revocar el acceso a:
            </p>

            <div style={{ backgroundColor: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '16px' }}>
              <div style={{ fontWeight: '800', color: 'var(--color-primary)' }}>{userToDelete.nombre || 'Sin nombre'}</div>
              <div style={{ fontSize: '0.82rem', color: '#475569' }}>{userToDelete.email}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
                Rol: <strong>{userToDelete.rol}</strong> • Alta: {userToDelete.created_at?.slice(0, 10)}
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: '#DC2626', fontWeight: '600', marginBottom: '20px' }}>
              ⚠️ El usuario perderá el acceso de inmediato y no podrá volver a iniciar sesión.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setUserToDelete(null)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleDeleteUser}
                disabled={deleting}
                style={{
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  fontWeight: '700',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px'
                }}
              >
                {deleting ? 'Eliminando...' : 'Sí, Eliminar Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR USUARIO AUTORIZADO */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '24px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-primary)', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={20} style={{ color: 'var(--color-highlight)' }} /> Crear Usuario Autorizado
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#64748B', marginBottom: '16px' }}>
              Creá un nuevo acceso para un miembro del equipo de Gobierno. Podés asignarle una contraseña inicial y su rol correspondiente.
            </p>

            <form onSubmit={handleCreateSubmit}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>Nombre Completo *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ej: Juan Pérez"
                  value={newNombre}
                  onChange={(e) => setNewNombre(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>Correo Electrónico *</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="ejemplo@buenosaires.gob.ar"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>Contraseña Inicial *</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>Rol en el Equipo *</label>
                <select
                  className="form-control"
                  value={newRol}
                  onChange={(e) => setNewRol(e.target.value)}
                >
                  <option value="agente_territorio">Agente Territorio (Acreditaciones / Minutas)</option>
                  <option value="territorio_coordinacion">Coordinación Territorio</option>
                  <option value="cercania">Cercanía (Gestión y Asistencia)</option>
                  <option value="gerencia">Gerencia (Administrador Completo)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creating}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}
                >
                  {creating ? 'Creando...' : <><UserPlus size={16} /> Crear y Autorizar</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
