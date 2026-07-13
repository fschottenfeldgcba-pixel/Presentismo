import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { 
  FileSpreadsheet, 
  Printer, 
  Search, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown, 
  Check, 
  MapPin, 
  User, 
  Calendar,
  Users
} from 'lucide-react';
import { TIPOS_REUNION } from '../data/mockData';

const COMUNAS = [
  "Comuna 1",
  "Comuna 1 Norte",
  "Comuna 1 Sur",
  "Comuna 2",
  "Comuna 3",
  "Comuna 4",
  "Comuna 5",
  "Comuna 6",
  "Comuna 7",
  "Comuna 8",
  "Comuna 9",
  "Comuna 10",
  "Comuna 11",
  "Comuna 12",
  "Comuna 13",
  "Comuna 14",
  "Comuna 15"
];

// Mapeo oficial de Comunas a Barrios para el filtro dinámico
const COMUNA_TO_BARRIOS = {
  "Comuna 1": ["Retiro", "San Nicolás", "Puerto Madero", "San Telmo", "Montserrat", "Constitución"],
  "Comuna 1 Norte": ["Retiro", "San Nicolás", "Puerto Madero"],
  "Comuna 1 Sur": ["San Telmo", "Montserrat", "Constitución"],
  "Comuna 2": ["Recoleta"],
  "Comuna 3": ["Balvanera", "San Cristóbal"],
  "Comuna 4": ["La Boca", "Barracas", "Parque Patricios", "Nueva Pompeya"],
  "Comuna 5": ["Almagro", "Boedo"],
  "Comuna 6": ["Caballito"],
  "Comuna 7": ["Flores", "Parque Chacabuco"],
  "Comuna 8": ["Villa Soldati", "Villa Riachuelo", "Villa Lugano"],
  "Comuna 9": ["Liniers", "Mataderos", "Parque Avellaneda"],
  "Comuna 10": ["Villa Real", "Monte Castro", "Versalles", "Floresta", "Vélez Sarsfield", "Villa Luro"],
  "Comuna 11": ["Villa General Mitre", "Villa Devoto", "Villa del Parque", "Villa Santa Rita"],
  "Comuna 12": ["Coghlan", "Saavedra", "Villa Urquiza", "Villa Pueyrredón"],
  "Comuna 13": ["Belgrano", "Núñez", "Colegiales"],
  "Comuna 14": ["Palermo"],
  "Comuna 15": ["Chacarita", "Villa Crespo", "Paternal", "Villa Ortúzar", "Agronomía", "Parque Chas"]
};

export default function CentralInformes({ user, onBack }) {
  const [isLoading, setIsLoading] = useState(false);
  const [allData, setAllData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [funcionariosList, setFuncionariosList] = useState([]);
  const [barriosList, setBarriosList] = useState([]);

  // Estados de Filtros
  const [selectedComunas, setSelectedComunas] = useState([]);
  const [selectedBarrio, setSelectedBarrio] = useState('');
  const [selectedFuncionario, setSelectedFuncionario] = useState('');
  const [selectedRol, setSelectedRol] = useState('Todos'); // 'Todos' | 'Solo Inscriptos' | 'Solo Asistentes' | 'Solo Oradores'
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Estados de Ordenamiento
  const [sortField, setSortField] = useState('inscripciones'); // 'inscripciones' | 'asistencias' | 'oratorias'
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' | 'asc'

  // Dropdown de Comunas Múltiple
  const [showComunaDropdown, setShowComunaDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Cargar datos en el montaje
  useEffect(() => {
    loadData();
    
    // Cerrar dropdown al hacer clic afuera
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowComunaDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Generar lista de barrios dinámicos según las comunas seleccionadas
  useEffect(() => {
    if (selectedComunas.length === 0) {
      // Si no hay comuna seleccionada, listar todos los barrios ordenados
      const allBarrios = Object.values(COMUNA_TO_BARRIOS).flat();
      const uniqueBarrios = [...new Set(allBarrios)].sort();
      setBarriosList(uniqueBarrios);
    } else {
      // Filtrar barrios pertenecientes a las comunas seleccionadas
      const filteredBarrios = selectedComunas
        .flatMap(comuna => COMUNA_TO_BARRIOS[comuna] || []);
      const uniqueBarrios = [...new Set(filteredBarrios)].sort();
      setBarriosList(uniqueBarrios);
      
      // Si el barrio seleccionado ya no pertenece a las comunas seleccionadas, resetearlo
      if (selectedBarrio && !uniqueBarrios.includes(selectedBarrio)) {
        setSelectedBarrio('');
      }
    }
  }, [selectedComunas]);

  // Cargar y cruzar datos desde Supabase
  const loadData = async () => {
    setIsLoading(true);
    try {
      const pageSize = 1000;

      // 1. Obtener todas las reuniones que no sean de prueba/test (con paginación)
      let reuniones = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from('reuniones')
          .select('id, nombre, funcionario, fecha, comuna, barrio')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        reuniones = reuniones.concat(data);
        if (data.length < pageSize) break;
        page++;
      }

      // Filtrar en JS por nombre de reunión que no contenga 'test' o 'prueba' (exclusión crítica)
      const validReuniones = (reuniones || []).filter(r => {
        const name = (r.nombre || '').toLowerCase();
        return !name.includes('test') && !name.includes('prueba');
      });

      const validReunionIds = validReuniones.map(r => r.id);
      const reunionesMap = {};
      validReuniones.forEach(r => {
        reunionesMap[r.id] = r;
      });

      // Extraer lista única de funcionarios para el filtro
      const uniqueFuncs = [...new Set(validReuniones.map(r => r.funcionario).filter(Boolean))].sort();
      setFuncionariosList(uniqueFuncs);

      if (validReunionIds.length === 0) {
        setAllData([]);
        setFilteredData([]);
        return;
      }

      // 2. Obtener inscripciones/asistencias ligadas a reuniones válidas (con paginación)
      let inscripciones = [];
      page = 0;
      while (true) {
        const { data, error } = await supabase
          .from('inscripciones_asistencias')
          .select('vecino_id, reunion_id, asistio')
          .in('reunion_id', validReunionIds)
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        inscripciones = inscripciones.concat(data);
        if (data.length < pageSize) break;
        page++;
      }

      // 3. Obtener oratorias ligadas a reuniones válidas y efectivas (con paginación)
      let oradores = [];
      page = 0;
      while (true) {
        const { data, error } = await supabase
          .from('oradores')
          .select('vecino_id, reunion_id, estado')
          .eq('estado', 'hablo')
          .in('reunion_id', validReunionIds)
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        oradores = oradores.concat(data);
        if (data.length < pageSize) break;
        page++;
      }

      // 4. Obtener todos los vecinos (excluyendo nombres de prueba) (con paginación)
      let vecinos = [];
      page = 0;
      while (true) {
        const { data, error } = await supabase
          .from('vecinos')
          .select('dni, nombre, apellido, comuna, barrio, celular, email')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        vecinos = vecinos.concat(data);
        if (data.length < pageSize) break;
        page++;
      }

      const validVecinos = (vecinos || []).filter(v => {
        const n = (v.nombre || '').toLowerCase();
        const a = (v.apellido || '').toLowerCase();
        return !n.includes('test') && !n.includes('prueba') && !a.includes('test') && !a.includes('prueba');
      });

      // 5. Mapear y procesar acumulados en memoria
      const processedList = validVecinos.map(v => {
        const vInscs = (inscripciones || []).filter(i => i.vecino_id === v.dni);
        const vOrads = (oradores || []).filter(o => o.vecino_id === v.dni);

        const totalInscs = vInscs.length;
        const totalAsists = vInscs.filter(i => i.asistio).length;
        const totalOratorias = vOrads.length;

        // Calcular top funcionarios (tags de interés)
        const funcCounts = {};
        vInscs.filter(i => i.asistio).forEach(i => {
          const r = reunionesMap[i.reunion_id];
          if (r && r.funcionario) {
            const func = r.funcionario.trim();
            funcCounts[func] = (funcCounts[func] || 0) + 1;
          }
        });

        const topFuncionarios = Object.entries(funcCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(entry => entry[0]);

        return {
          ...v,
          totalInscripciones: totalInscs,
          totalAsistencias: totalAsists,
          totalOratorias: totalOratorias,
          topFuncionarios,
          inscripcionesReuniones: vInscs.map(i => ({
            ...i,
            reunion: reunionesMap[i.reunion_id]
          }))
        };
      });

      // Ordenar por Mayor a Menor Inscriptos, Asistentes y Oradores (en ese orden)
      processedList.sort((a, b) => 
        b.totalInscripciones - a.totalInscripciones ||
        b.totalAsistencias - a.totalAsistencias ||
        b.totalOratorias - a.totalOratorias
      );

      setAllData(processedList);
      setFilteredData(processedList);
    } catch (err) {
      console.error('Error al estructurar Central de Informes:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Aplicar filtros en cascada reactivos
  useEffect(() => {
    let result = allData;

    // Filtro por búsqueda general (DNI, Nombre, Apellido, Celular, Email)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(v => 
        v.dni.includes(q) ||
        (v.nombre && v.nombre.toLowerCase().includes(q)) ||
        (v.apellido && v.apellido.toLowerCase().includes(q)) ||
        (v.celular && v.celular.includes(q)) ||
        (v.email && v.email.toLowerCase().includes(q))
      );
    }

    // Filtro Comuna (Múltiple)
    if (selectedComunas.length > 0) {
      result = result.filter(v => selectedComunas.includes(v.comuna));
    }

    // Filtro Barrio
    if (selectedBarrio) {
      result = result.filter(v => v.barrio === selectedBarrio);
    }

    // Filtro Funcionario
    if (selectedFuncionario) {
      result = result.filter(v => 
        v.inscripcionesReuniones.some(ir => ir.reunion && ir.reunion.funcionario === selectedFuncionario)
      );
    }

    // Filtro Rol del Vecino
    if (selectedRol === 'Solo Inscriptos') {
      result = result.filter(v => v.totalInscripciones > 0);
    } else if (selectedRol === 'Solo Asistentes') {
      result = result.filter(v => v.totalAsistencias > 0);
    } else if (selectedRol === 'Solo Oradores') {
      result = result.filter(v => v.totalOratorias > 0);
    }

    // Rango de Fechas (Filtrado por las fechas de las reuniones asociadas al vecino)
    if (fechaDesde) {
      const desde = new Date(fechaDesde);
      result = result.filter(v => 
        v.inscripcionesReuniones.some(ir => ir.reunion && ir.reunion.fecha && new Date(ir.reunion.fecha) >= desde)
      );
    }
    if (fechaHasta) {
      const hasta = new Date(fechaHasta);
      result = result.filter(v => 
        v.inscripcionesReuniones.some(ir => ir.reunion && ir.reunion.fecha && new Date(ir.reunion.fecha) <= hasta)
      );
    }

    // Aplicar ordenamiento
    result = [...result].sort((a, b) => {
      const factor = sortOrder === 'asc' ? 1 : -1;
      
      if (sortField === 'inscripciones') {
        return (a.totalInscripciones - b.totalInscripciones) * factor || 
               (a.totalAsistencias - b.totalAsistencias) * factor || 
               (a.totalOratorias - b.totalOratorias) * factor;
      } else if (sortField === 'asistencias') {
        return (a.totalAsistencias - b.totalAsistencias) * factor || 
               (a.totalInscripciones - b.totalInscripciones) * factor || 
               (a.totalOratorias - b.totalOratorias) * factor;
      } else if (sortField === 'oratorias') {
        return (a.totalOratorias - b.totalOratorias) * factor || 
               (a.totalInscripciones - b.totalInscripciones) * factor || 
               (a.totalAsistencias - b.totalAsistencias) * factor;
      }
      return 0;
    });

    setFilteredData(result);
    setCurrentPage(1);
  }, [searchQuery, selectedComunas, selectedBarrio, selectedFuncionario, selectedRol, fechaDesde, fechaHasta, sortField, sortOrder, allData]);

  // Manejo de Comunas en dropdown múltiple
  const handleToggleComuna = (comuna) => {
    if (selectedComunas.includes(comuna)) {
      setSelectedComunas(prev => prev.filter(c => c !== comuna));
    } else {
      setSelectedComunas(prev => [...prev, comuna]);
    }
  };

  const handleResetFilters = () => {
    setSelectedComunas([]);
    setSelectedBarrio('');
    setSelectedFuncionario('');
    setSelectedRol('Todos');
    setFechaDesde('');
    setFechaHasta('');
    setSearchQuery('');
  };

  // Exportar a CSV nativo en UTF-8
  const handleExportCSV = () => {
    if (!filteredData || filteredData.length === 0) {
      alert('No hay datos filtrados para exportar.');
      return;
    }

    const headers = ['DNI', 'Nombre', 'Apellido', 'Comuna', 'Barrio', 'Celular', 'Email', 'Inscripciones', 'Asistencias', 'Oratorias', 'Intereses (Funcionarios)'];
    const rows = filteredData.map(v => [
      v.dni,
      v.nombre || '',
      v.apellido || '',
      v.comuna || '',
      v.barrio || '',
      v.celular || '',
      v.email || '',
      v.totalInscripciones,
      v.totalAsistencias,
      v.totalOratorias,
      v.topFuncionarios.join('; ')
    ]);

    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += headers.join(',') + '\n';
    rows.forEach(row => {
      const escapedRow = row.map(val => {
        const stringVal = String(val).replace(/"/g, '""');
        return `"${stringVal}"`;
      });
      csvContent += escapedRow.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_auditoria_padron_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Manejo de clicks en cabeceras de tabla
  const handleHeaderClick = (field) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Renderizar icono de ordenamiento
  const renderSortIcon = (field) => {
    if (sortField !== field) {
      return <span style={{ color: '#94A3B8', fontSize: '0.75rem', marginLeft: '4px', cursor: 'pointer' }}>⇅</span>;
    }
    return sortOrder === 'asc' ? 
      <span style={{ color: 'var(--color-highlight)', fontSize: '0.75rem', marginLeft: '4px', cursor: 'pointer' }}>▲</span> : 
      <span style={{ color: 'var(--color-highlight)', fontSize: '0.75rem', marginLeft: '4px', cursor: 'pointer' }}>▼</span>;
  };

  // Paginación
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="container" style={{ paddingBottom: '3rem' }}>
      
      {/* CABECERA EXCLUSIVA PARA IMPRESIÓN */}
      <div className="print-header" style={{ display: 'none' }}>
        <h1>DIRECCIÓN GENERAL DE PARTICIPACIÓN CIUDADANA</h1>
        <p><strong>REPORTE EJECUTIVO DE AUDITORÍA DE VECINOS Y PARTICIPACIÓN</strong></p>
        <p style={{ marginTop: '6px' }}>Generado el: {new Date().toLocaleString('es-AR')}</p>
        <p>Usuario auditor: {user.nombre} | Rol: {user.rol.replace('_', ' ')}</p>
        <p style={{ marginTop: '4px' }}>
          Filtros activos: Comunas: {selectedComunas.join(', ') || 'Todas'} | Barrio: {selectedBarrio || 'Todos'} | Funcionario: {selectedFuncionario || 'Todos'} | Rol: {selectedRol}
        </p>
      </div>

      {/* HEADER DE LA CENTRAL DE INFORMES */}
      <div className="hide-on-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 className="section-title" style={{ marginBottom: '4px' }}>
            Central de Informes
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            Panel ejecutivo para la Dirección General: auditorías avanzadas y exportación del padrón de participación.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="btn btn-secondary" 
            onClick={loadData}
            title="Recargar base de datos"
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={16} />
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={handleExportCSV}
            style={{ border: '1px solid #10B981', color: '#065F46', backgroundColor: '#ECFDF5' }}
            disabled={filteredData.length === 0}
          >
            <FileSpreadsheet size={16} /> Exportar CSV
          </button>
          <button 
            className="btn btn-primary" 
            onClick={() => window.print()}
            style={{ backgroundColor: 'var(--color-primary)' }}
            disabled={filteredData.length === 0}
          >
            <Printer size={16} /> Imprimir / PDF
          </button>
        </div>
      </div>

      {/* SECCIÓN DE FILTROS AVANZADOS */}
      <div className="card hide-on-print" style={{ marginBottom: '1.5rem', padding: '16px', backgroundColor: '#F8FAFC' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: '700', color: 'var(--color-primary)' }}>
          🔍 Filtros de Auditoría Avanzada
        </h4>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          
          {/* MULTISELECT COMUNA */}
          <div className="form-group" style={{ margin: 0, position: 'relative' }} ref={dropdownRef}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '4px' }}>Comunas</label>
            <button
              type="button"
              onClick={() => setShowComunaDropdown(!showComunaDropdown)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                textAlign: 'left',
                fontSize: '0.85rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer'
              }}
            >
              <span>
                {selectedComunas.length === 0 
                  ? 'Todas las Comunas' 
                  : `${selectedComunas.length} seleccionada(s)`}
              </span>
              <ChevronDown size={14} style={{ color: 'var(--color-text-muted)' }} />
            </button>

            {showComunaDropdown && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: '#ffffff',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 50,
                maxHeight: '200px',
                overflowY: 'auto',
                padding: '6px',
                marginTop: '4px'
              }}>
                {COMUNAS.map(c => {
                  const isChecked = selectedComunas.includes(c);
                  return (
                    <div 
                      key={c}
                      onClick={() => handleToggleComuna(c)}
                      style={{
                        padding: '6px 8px',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        backgroundColor: isChecked ? 'rgba(37, 194, 185, 0.08)' : 'transparent',
                        transition: 'background-color 0.2s'
                      }}
                    >
                      <input 
                        type="checkbox" 
                        checked={isChecked}
                        readOnly
                        style={{ cursor: 'pointer' }}
                      />
                      <span>{c}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* BARRIO DINÁMICO */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '4px' }}>Barrio</label>
            <select
              value={selectedBarrio}
              onChange={(e) => setSelectedBarrio(e.target.value)}
              className="form-control"
              style={{ padding: '8px 12px', fontSize: '0.85rem' }}
            >
              <option value="">Todos los barrios</option>
              {barriosList.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* FUNCIONARIO */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '4px' }}>Funcionario</label>
            <select
              value={selectedFuncionario}
              onChange={(e) => setSelectedFuncionario(e.target.value)}
              className="form-control"
              style={{ padding: '8px 12px', fontSize: '0.85rem' }}
            >
              <option value="">Todos los funcionarios</option>
              {funcionariosList.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* ROL / NIVEL PARTICIPACIÓN */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '4px' }}>Nivel de Participación</label>
            <select
              value={selectedRol}
              onChange={(e) => setSelectedRol(e.target.value)}
              className="form-control"
              style={{ padding: '8px 12px', fontSize: '0.85rem' }}
            >
              <option value="Todos">Todos (Inscriptos + Presentes)</option>
              <option value="Solo Inscriptos">Solo Inscriptos</option>
              <option value="Solo Asistentes">Solo Asistentes</option>
              <option value="Solo Oradores">Solo Oradores</option>
            </select>
          </div>

          {/* FECHA DESDE */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '4px' }}>Fecha Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="form-control"
              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
            />
          </div>

          {/* FECHA HASTA */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '4px' }}>Fecha Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="form-control"
              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
            />
          </div>

          {/* ORDENAR POR */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '4px' }}>Ordenar por</label>
            <select
              value={`${sortField}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortField(field);
                setSortOrder(order);
              }}
              className="form-control"
              style={{ padding: '8px 12px', fontSize: '0.85rem' }}
            >
              <option value="inscripciones-desc">Inscriptos (Mayor a Menor)</option>
              <option value="inscripciones-asc">Inscriptos (Menor a Mayor)</option>
              <option value="asistencias-desc">Asistentes (Mayor a Menor)</option>
              <option value="asistencias-asc">Asistentes (Menor a Mayor)</option>
              <option value="oratorias-desc">Oradores (Mayor a Menor)</option>
              <option value="oratorias-asc">Oradores (Menor a Mayor)</option>
            </select>
          </div>

        </div>

        {/* BÚSQUEDA TEXTUAL Y BOTÓN RESET */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flexGrow: 1, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              placeholder="Buscar por DNI, Nombre, Apellido, Celular o Email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-control"
              style={{ padding: '8px 12px 8px 36px', fontSize: '0.85rem' }}
            />
          </div>
          <button
            onClick={handleResetFilters}
            className="btn btn-secondary"
            style={{ padding: '8px 16px', fontSize: '0.85rem', height: '38px' }}
          >
            Limpiar Filtros
          </button>
        </div>
      </div>

      {/* VISTA DE CARGA (SPINNER) */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: '12px' }}>
          <div className="spinner"></div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Cruzando datos del padrón y oradores...</p>
        </div>
      ) : (
        /* TABLA DE RESULTADOS */
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          
          {/* Encabezado interno con estadísticas rápidas */}
          <div className="hide-on-print" style={{ padding: '16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Se encontraron <strong>{filteredData.length}</strong> vecinos en el cruce de datos.
            </span>
            {selectedRol !== 'Todos' && (
              <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                Filtro: {selectedRol}
              </span>
            )}
          </div>

          {filteredData.length === 0 ? (
            <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <Users size={48} style={{ margin: '0 auto 12px auto', opacity: 0.3 }} />
              <p style={{ fontSize: '0.95rem', fontWeight: '500' }}>No se encontraron vecinos con los filtros especificados.</p>
              <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Prueba modificando las comunas o limpiando los campos de búsqueda.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid var(--color-border)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: '700' }}>Vecino / DNI</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: '700' }}>Ubicación</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: '700' }}>Contacto</th>
                    <th 
                      onClick={() => handleHeaderClick('inscripciones')}
                      style={{ 
                        textAlign: 'center', 
                        padding: '12px 16px', 
                        fontWeight: '700',
                        cursor: 'pointer',
                        userSelect: 'none',
                        color: sortField === 'inscripciones' ? 'var(--color-highlight)' : 'inherit',
                        backgroundColor: sortField === 'inscripciones' ? 'rgba(37, 194, 185, 0.04)' : 'transparent'
                      }}
                      title="Ordenar por Inscripciones"
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                        Insc. {renderSortIcon('inscripciones')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleHeaderClick('asistencias')}
                      style={{ 
                        textAlign: 'center', 
                        padding: '12px 16px', 
                        fontWeight: '700',
                        cursor: 'pointer',
                        userSelect: 'none',
                        color: sortField === 'asistencias' ? 'var(--color-highlight)' : 'inherit',
                        backgroundColor: sortField === 'asistencias' ? 'rgba(37, 194, 185, 0.04)' : 'transparent'
                      }}
                      title="Ordenar por Asistencias"
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                        Asist. {renderSortIcon('asistencias')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleHeaderClick('oratorias')}
                      style={{ 
                        textAlign: 'center', 
                        padding: '12px 16px', 
                        fontWeight: '700',
                        cursor: 'pointer',
                        userSelect: 'none',
                        color: sortField === 'oratorias' ? 'var(--color-highlight)' : 'inherit',
                        backgroundColor: sortField === 'oratorias' ? 'rgba(37, 194, 185, 0.04)' : 'transparent'
                      }}
                      title="Ordenar por Oratorias"
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                        Orador {renderSortIcon('oratorias')}
                      </div>
                    </th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: '700' }}>Interés Principal (Top 2 Funcionarios)</th>
                  </tr>
                </thead>
                <tbody>
                  {(paginatedData).map((v) => (
                    <tr key={v.dni} style={{ borderBottom: '1px solid var(--color-border)', verticalAlign: 'middle' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: '600', color: 'var(--color-primary)' }}>
                          {v.nombre} {v.apellido}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                          DNI: {v.dni}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                          <MapPin size={12} style={{ color: 'var(--color-highlight)' }} />
                          <span>{v.comuna}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: '16px', marginTop: '2px' }}>
                          {v.barrio}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.8rem' }}>
                        <div>{v.celular || '-'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                          {v.email || '-'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600' }}>
                        <span className="badge" style={{ backgroundColor: '#E2E8F0', color: 'var(--color-primary)', fontSize: '0.8rem' }}>
                          {v.totalInscripciones}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600' }}>
                        <span className="badge" style={{ backgroundColor: v.totalAsistencias > 0 ? '#D1FAE5' : '#F1F5F9', color: v.totalAsistencias > 0 ? '#065F46' : 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                          {v.totalAsistencias}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600' }}>
                        <span className="badge" style={{ backgroundColor: v.totalOratorias > 0 ? '#FEF3C7' : '#F1F5F9', color: v.totalOratorias > 0 ? '#92400E' : 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                          {v.totalOratorias}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {v.topFuncionarios.length === 0 ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin asistencia efectiva</span>
                        ) : (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {v.topFuncionarios.map(f => (
                              <span key={f} className="tag-interes" style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '500' }}>
                                👤 {f}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* CONTROLES DE PAGINACIÓN */}
          {filteredData.length > 0 && (
            <div className="pagination-container hide-on-print" style={{ padding: '16px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                Mostrando vecinos <strong>{Math.min(filteredData.length, (currentPage - 1) * itemsPerPage + 1)}</strong> al <strong>{Math.min(filteredData.length, currentPage * itemsPerPage)}</strong> de <strong>{filteredData.length}</strong>
              </span>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <ChevronLeft size={14} /> Anterior
                </button>
                
                <span style={{ alignSelf: 'center', fontSize: '0.85rem', fontWeight: '600', padding: '0 8px' }}>
                  Pág. {currentPage} de {totalPages}
                </span>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  Siguiente <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
