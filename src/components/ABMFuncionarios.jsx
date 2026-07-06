import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Plus, Edit3, Trash2, X, Search } from 'lucide-react';

export default function ABMFuncionarios() {
  const [funcionarios, setFuncionarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Form states
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [cargo, setCargo] = useState('');
  const [editingId, setEditingId] = useState(null);
  
  // Load officials
  const loadFuncionarios = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('funcionarios')
        .select('*')
        .order('nombre_completo', { ascending: true });
      if (error) throw error;
      setFuncionarios(data || []);
    } catch (err) {
      console.error(err);
      alert('Error al cargar funcionarios: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFuncionarios();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!nombreCompleto.trim()) return;

    try {
      if (editingId) {
        // Update
        const { error } = await supabase
          .from('funcionarios')
          .update({
            nombre_completo: nombreCompleto.trim(),
            cargo: cargo.trim() || null
          })
          .eq('id', editingId);
        if (error) throw error;
        alert('Funcionario actualizado con éxito');
      } else {
        // Create
        const { error } = await supabase
          .from('funcionarios')
          .insert([{
            nombre_completo: nombreCompleto.trim(),
            cargo: cargo.trim() || null
          }]);
        if (error) throw error;
        alert('Funcionario creado con éxito');
      }
      
      setNombreCompleto('');
      setCargo('');
      setEditingId(null);
      await loadFuncionarios();
    } catch (err) {
      console.error(err);
      alert('Error al guardar: ' + err.message);
    }
  };

  const handleEdit = (func) => {
    setEditingId(func.id);
    setNombreCompleto(func.nombre_completo);
    setCargo(func.cargo || '');
  };

  const handleCancel = () => {
    setEditingId(null);
    setNombreCompleto('');
    setCargo('');
  };

  const handleDelete = async (id, name) => {
    if (await confirm(`¿Estás seguro de que querés eliminar a ${name}?`)) {
      try {
        const { error } = await supabase
          .from('funcionarios')
          .delete()
          .eq('id', id);
        if (error) throw error;
        alert('Funcionario eliminado');
        await loadFuncionarios();
      } catch (err) {
        console.error(err);
        alert('Error al eliminar: ' + err.message);
      }
    }
  };

  const filteredFuncionarios = funcionarios.filter(f => 
    f.nombre_completo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (f.cargo && f.cargo.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div style={{ position: 'relative' }}>
      <div className="decor-tabs-container">
        <div className="decor-tab-mint"></div>
        <div className="decor-tab-yellow"></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', alignItems: 'start' }}>
        {/* Formulario */}
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ fontSize: '1.2rem', color: 'var(--color-primary)', marginTop: 0, marginBottom: '1.25rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', fontWeight: '700' }}>
            {editingId ? 'Editar Funcionario' : 'Cargar Funcionario'}
          </h3>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-group">
              <label htmlFor="func-nombre">Nombre y Apellido *</label>
              <input
                type="text"
                id="func-nombre"
                className="form-control"
                placeholder="Ej: Jorge Macri"
                value={nombreCompleto}
                onChange={(e) => setNombreCompleto(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="func-cargo">Cargo</label>
              <input
                type="text"
                id="func-cargo"
                className="form-control"
                placeholder="Ej: Jefe de Gobierno"
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Plus size={16} /> {editingId ? 'Actualizar' : 'Cargar'}
              </button>
              {editingId && (
                <button type="button" className="btn btn-secondary" onClick={handleCancel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <X size={16} /> Cancelar
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Tabla */}
        <div className="card" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ fontSize: '1.2rem', color: 'var(--color-primary)', margin: 0, fontWeight: '700' }}>
              Listado de Funcionarios ({filteredFuncionarios.length})
            </h3>
            <div style={{ position: 'relative', width: '250px' }}>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Buscar funcionario o cargo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '32px' }}
              />
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando funcionarios...</div>
          ) : filteredFuncionarios.length > 0 ? (
            <div className="table-responsive" style={{ maxHeight: '450px', overflowY: 'auto' }}>
              <table className="table" style={{ fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th>Nombre y Apellido</th>
                    <th>Cargo</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFuncionarios.map(f => (
                    <tr key={f.id}>
                      <td style={{ fontWeight: '600', color: 'var(--color-primary)' }}>{f.nombre_completo}</td>
                      <td style={{ color: 'var(--color-text)' }}>{f.cargo || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin cargo especificado</span>}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleEdit(f)}
                            title="Editar funcionario"
                            style={{ padding: '4px 8px' }}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleDelete(f.id, f.nombre_completo)}
                            title="Eliminar funcionario"
                            style={{ padding: '4px 8px', color: '#EF4444', border: '1px solid #FCA5A5' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
              No se encontraron funcionarios.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
