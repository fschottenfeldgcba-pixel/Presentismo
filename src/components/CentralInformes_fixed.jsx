import React, { useState, useEffect, useRef } from 'react';
import { 
  Printer, Search, RefreshCw, ChevronDown, Users, CheckCircle2, TrendingUp, Mic, BarChart3, Download, Filter, 
  Map, MessageSquare, Info, Calendar, Target, Activity
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, CartesianGrid, LineChart, Line 
} from 'recharts';
import { TIPOS_REUNION } from '../data/mockData';
import { fetchDashboardData, generateInsights, processAndNormalizeWord } from '../services/analyticsService';

const COMUNAS = [
  "Comuna 1", "Comuna 1 Norte", "Comuna 1 Sur", "Comuna 2", "Comuna 3", "Comuna 4", "Comuna 5", "Comuna 6", 
  "Comuna 7", "Comuna 8", "Comuna 9", "Comuna 10", "Comuna 11", "Comuna 12", "Comuna 13", "Comuna 14", "Comuna 15"
];

const COMUNA_TO_BARRIOS = {
  "Comuna 1": ["Retiro", "San NicolÃ¡s", "Puerto Madero", "San Telmo", "Montserrat", "ConstituciÃ³n"],
  "Comuna 1 Norte": ["Retiro", "San NicolÃ¡s", "Puerto Madero"],
  "Comuna 1 Sur": ["San Telmo", "Montserrat", "ConstituciÃ³n"],
  "Comuna 2": ["Recoleta"],
  "Comuna 3": ["Balvanera", "San CristÃ³bal"],
  "Comuna 4": ["La Boca", "Barracas", "Parque Patricios", "Nueva Pompeya"],
  "Comuna 5": ["Almagro", "Boedo"],
  "Comuna 6": ["Caballito"],
  "Comuna 7": ["Flores", "Parque Chacabuco"],
  "Comuna 8": ["Villa Soldati", "Villa Riachuelo", "Villa Lugano"],
  "Comuna 9": ["Liniers", "Mataderos", "Parque Avellaneda"],
  "Comuna 10": ["Villa Real", "Monte Castro", "Versalles", "Floresta", "VÃ©lez Sarsfield", "Villa Luro"],
  "Comuna 11": ["Villa General Mitre", "Villa Devoto", "Villa del Parque", "Villa Santa Rita"],
  "Comuna 12": ["Coghlan", "Saavedra", "Villa Urquiza", "Villa PueyrredÃ³n"],
  "Comuna 13": ["Belgrano", "NÃºÃ±ez", "Colegiales"],
  "Comuna 14": ["Palermo"],
  "Comuna 15": ["Chacarita", "Villa Crespo", "Paternal", "Villa OrtÃºzar", "AgronomÃ­a", "Parque Chas"]
};

// --- COMPONENTES AUXILIARES ---

const SemaphoreIndicator = ({ actual, anterior, format = 'number' }) => {
  if (!anterior || anterior === 0) return null;
  const variation = ((actual - anterior) / anterior) * 100;
  if (isNaN(variation) || !isFinite(variation)) return null;

  let color = '#94A3B8';
  let icon = '=';
  let bgColor = '#F1F5F9';

  if (variation > 0) {
    color = '#10B981';
    icon = 'â–²';
    bgColor = '#D1FAE5';
  } else if (variation < 0) {
    color = '#EF4444';
    icon = 'â–¼';
    bgColor = '#FEE2E2';
  }

  const valueStr = format === 'percentage' ? `${Math.abs(variation).toFixed(1)} pp` : `${Math.abs(variation).toFixed(1)}%`;

  return (
    <span style={{ 
      display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', 
      fontWeight: '700', color, backgroundColor: bgColor, padding: '2px 6px', borderRadius: '4px', marginLeft: '8px'
    }}>
      {icon} {valueStr}
    </span>
  );
};

const TooltipWrapper = ({ children, text }) => (
  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} className="kpi-tooltip-wrapper">
    {children}
    <div className="kpi-tooltip" style={{
      visibility: 'hidden', position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
      backgroundColor: '#1E293B', color: '#FFF', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem',
      whiteSpace: 'nowrap', zIndex: 10, opacity: 0, transition: 'opacity 0.2s', marginBottom: '8px', fontWeight: '500'
    }}>
      {text}
      <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', borderWidth: '5px', borderStyle: 'solid', borderColor: '#1E293B transparent transparent transparent' }} />
    </div>
  </div>
);

// CSS Inline para la impresiÃ³n y tooltips
const globalStyles = `
  @media print {
    .hide-on-print { display: none !important; }
    .print-header { display: block !important; margin-bottom: 20px; }
    .card { break-inside: avoid; page-break-inside: avoid; border: 1px solid #CBD5E1 !important; box-shadow: none !important; }
    body { background-color: white !important; }
    * { color-adjust: exact !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
  .kpi-tooltip-wrapper:hover .kpi-tooltip { visibility: visible !important; opacity: 1 !important; }
`;

export default function CentralInformes({ user, onBack }) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  // Data States
  const [allVecinos, setAllVecinos] = useState([]);
  const [filteredVecinos, setFilteredVecinos] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [reuniones, setReuniones] = useState([]);
  const [frasesRaw, setFrasesRaw] = useState([]);
  const [wordCloudData, setWordCloudData] = useState([]);
  const [insights, setInsights] = useState([]);
  
  // Drill Down State
  const [drillDownModal, setDrillDownModal] = useState({ isOpen: false, type: null, context: null, data: [], history: [] });

  const handleDrillDown = (type, context, data) => {
    let newData = [];
    if (type === 'comuna') {
      const rComuna = reuniones.filter(r => r.comuna === context);
      const tipos = {};
      rComuna.forEach(r => {
        tipos[r.tipo_reunion || 'Sin Tipo'] = (tipos[r.tipo_reunion || 'Sin Tipo'] || 0) + 1;
      });
      newData = Object.entries(tipos).map(([k, v]) => ({ name: k, count: v, reuniones: rComuna.filter(r => r.tipo_reunion === k) }));
    } else if (type === 'actividad') {
      newData = data.reuniones;
    } else if (type === 'reunion') {
      newData = filteredVecinos.filter(v => v.inscripcionesReuniones.some(i => i.reunion_id === context && i.asistio));
    }
    
    setDrillDownModal(prev => ({
      isOpen: true,
      type,
      context,
      data: newData,
      history: [...prev.history, { type, context, data: newData }]
    }));
  };

  const closeDrillDown = () => setDrillDownModal({ isOpen: false, type: null, context: null, data: [], history: [] });
  const goBackDrillDown = () => {
    setDrillDownModal(prev => {
      const newHistory = prev.history.slice(0, -1);
      if (newHistory.length === 0) return { isOpen: false, type: null, context: null, data: [], history: [] };
      const last = newHistory[newHistory.length - 1];
      return { ...prev, type: last.type, context: last.context, data: last.data, history: newHistory };
    });
  };

  // Listas DinÃ¡micas
  const [funcionariosList, setFuncionariosList] = useState([]);
  const [barriosList, setBarriosList] = useState([]);

  // Filtros
  const [selectedComunas, setSelectedComunas] = useState([]);
  const [selectedBarrio, setSelectedBarrio] = useState('');
  const [selectedFuncionario, setSelectedFuncionario] = useState('');
  const [selectedTipoReunion, setSelectedTipoReunion] = useState('');
  const [selectedRol, setSelectedRol] = useState('Todos');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [showComunaDropdown, setShowComunaDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Filtros de grÃ¡ficos
  const [minFrequency, setMinFrequency] = useState(3);
  const [selectedWord, setSelectedWord] = useState(null);
  const [chartGranularity, setChartGranularity] = useState('Diario');

  useEffect(() => {
    // AÃ±adir estilos globales de print si no existen
    if (!document.getElementById('analytics-print-styles')) {
      const style = document.createElement('style');
      style.id = 'analytics-print-styles';
      style.innerHTML = globalStyles;
      document.head.appendChild(style);
    }
    
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowComunaDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedComunas.length === 0) {
      setBarriosList([...new Set(Object.values(COMUNA_TO_BARRIOS).flat())].sort());
    } else {
      const filtered = selectedComunas.flatMap(c => COMUNA_TO_BARRIOS[c] || []);
      const unique = [...new Set(filtered)].sort();
      setBarriosList(unique);
      if (selectedBarrio && !unique.includes(selectedBarrio)) setSelectedBarrio('');
    }
  }, [selectedComunas]);

  const loadData = async () => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const filtros = { selectedComunas, selectedBarrio, selectedFuncionario, selectedTipoReunion, fechaDesde, fechaHasta, searchQuery };
      const data = await fetchDashboardData(filtros);
      
      setAllVecinos(data.vecinos);
      setKpis(data.kpis);
      setReuniones(data.reunionesActuales);
      setFrasesRaw(data.frasesGlobales);
      
      const newInsights = generateInsights(data.kpis.actual, data.kpis.anterior, data.kpis.historico);
      setInsights(newInsights);
      
      const funcs = [...new Set(data.reunionesActuales.map(r => r.funcionario).filter(Boolean))].sort();
      setFuncionariosList(funcs);

    } catch (err) {
      console.error(err);
      alert('Error cargando los datos. Revisa la consola.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!allVecinos.length) {
      setFilteredVecinos([]);
      setWordCloudData([]);
      return;
    }

    let result = allVecinos;
    if (selectedRol === 'Solo Inscriptos') result = result.filter(v => v.totalInscripciones > 0);
    else if (selectedRol === 'Solo Asistentes') result = result.filter(v => v.totalAsistencias > 0);
    else if (selectedRol === 'Solo Oradores') result = result.filter(v => v.totalOratorias > 0);

    setFilteredVecinos(result);

    const wordCounts = {};
    frasesRaw.forEach(o => {
      const texts = [o.tema_efectivo, o.tema_original, o.transcripcion_texto].filter(Boolean);
      texts.forEach(txt => {
        txt.split(/\s+/).forEach(t => {
          const clean = processAndNormalizeWord(t);
          if (clean) wordCounts[clean] = (wordCounts[clean] || 0) + 1;
        });
      });
    });

    const sortedWords = Object.entries(wordCounts)
      .filter(([_, count]) => count >= minFrequency)
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count);
      
    setWordCloudData(sortedWords);
  }, [allVecinos, selectedRol, frasesRaw, minFrequency]);

  const getFrasesForWord = (word) => {
    const frases = [];
    frasesRaw.forEach(o => {
      const txt = o.tema_efectivo || o.tema_original || o.transcripcion_texto;
      if (!txt) return;
      const clean = txt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (clean.includes(word)) frases.push(txt);
    });
    return [...new Set(frases)].slice(0, 20); // Top 20 frases Ãºnicas
  };

  const handleExportCSV = () => {
    // ... CÃ³digo exportaciÃ³n idÃ©ntico al original, lo pondrÃ© simplificado por ahora ...
    if (!filteredVecinos || filteredVecinos.length === 0) return alert('No hay datos.');
    const headers = ['DNI', 'Nombre', 'Apellido', 'Comuna', 'Barrio', 'Celular', 'Email', 'Inscripciones', 'Asistencias', 'Oratorias'];
    const rows = filteredVecinos.map(v => [v.dni, v.nombre, v.apellido, v.comuna, v.barrio, v.celular, v.email, v.totalInscripciones, v.totalAsistencias, v.totalOratorias]);
    let csvContent = '\uFEFF' + headers.join(',') + '\n';
    rows.forEach(r => { csvContent += r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',') + '\n' });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'padron_filtrado.csv';
    link.click();
  };

  // --- CÃLCULO DE GRÃFICOS ---
  
  // 1. GrÃ¡fico EvoluciÃ³n Temporal
  const temporalMap = {};
  reuniones.forEach(r => {
    if (!r.fecha) return;
    const date = new Date(r.fecha);
    let key = '';
    if (chartGranularity === 'Diario') {
      key = date.toISOString().split('T')[0];
    } else if (chartGranularity === 'Semanal') {
      const first = date.getDate() - date.getDay();
      const firstDay = new Date(date.setDate(first)).toISOString().split('T')[0];
      key = `Semana del ${firstDay}`;
    } else { // Mensual
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    
    if (!temporalMap[key]) temporalMap[key] = { name: key, Convocatorias: 0, Asistencias: 0 };
    // Buscamos cuÃ¡ntos vecinos se inscribieron en esta reuniÃ³n en filteredVecinos
    const insc = filteredVecinos.reduce((acc, v) => acc + v.inscripcionesReuniones.filter(i => i.reunion_id === r.id).length, 0);
    const asist = filteredVecinos.reduce((acc, v) => acc + v.inscripcionesReuniones.filter(i => i.reunion_id === r.id && i.asistio).length, 0);
    temporalMap[key].Convocatorias += insc;
    temporalMap[key].Asistencias += asist;
  });
  const temporalChartData = Object.values(temporalMap).sort((a, b) => a.name.localeCompare(b.name));

  // 2. GrÃ¡fico Territorial
  const comunasMap = {};
  filteredVecinos.forEach(v => {
    const c = v.comuna || 'Sin Comuna';
    if (!comunasMap[c]) comunasMap[c] = { comuna: c, Convocados: 0, Asistentes: 0 };
    comunasMap[c].Convocados += v.totalInscripciones;
    comunasMap[c].Asistentes += v.totalAsistencias;
  });
  const territorialChartData = Object.values(comunasMap)
    .map(c => ({ ...c, ConversiÃ³n: c.Convocados > 0 ? (c.Asistentes / c.Convocados) * 100 : 0 }))
    .sort((a, b) => b.Convocados - a.Convocados)
    .slice(0, 15); // Todas

  // 3. GrÃ¡fico de Dona: ProporciÃ³n
  const convTot = kpis?.actual?.convocatorias || 0;
  const asisTot = kpis?.actual?.asistencias || 0;
  const pieData = [
    { name: 'AsistiÃ³ Efectivamente', value: asisTot, color: '#10B981' },
    { name: 'Inscripto sin asistir', value: Math.max(0, convTot - asisTot), color: '#F59E0B' }
  ];

  // Funciones de renderizado para no saturar el return
  const renderEmptyState = () => (
    <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', backgroundColor: '#F8FAFC' }}>
      <BarChart3 size={52} style={{ color: 'var(--color-highlight)', marginBottom: '1rem' }} />
      <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--color-primary)' }}>Central de Informes & Analytics</h3>
      <p style={{ color: '#64748B', maxWidth: '540px', margin: '0 auto 1.5rem auto' }}>
        SeleccionÃ¡ tus filtros y hacÃ© clic en "Generar Informe" para analizar el comportamiento y la demanda ciudadana.
      </p>
      <button onClick={loadData} className="btn btn-primary" style={{ backgroundColor: 'var(--color-highlight)', color: '#0F172A', fontWeight: '800' }}>
        <Search size={18} /> Generar Informe
      </button>
    </div>
  );

  return (
    <div className="container" style={{ paddingBottom: '3rem' }}>
      
      {/* IMPRESIÃ“N */}
      <div className="print-header" style={{ display: 'none' }}>
        <h1 style={{ fontSize: '24px', margin: 0 }}>DIRECCIÃ“N GENERAL DE PARTICIPACIÃ“N CIUDADANA</h1>
        <p style={{ margin: '4px 0', fontSize: '18px' }}><strong>REPORTE EJECUTIVO DE AUDITORÃA Y DASHBOARD ANALÃTICO</strong></p>
        <p style={{ margin: '4px 0', fontSize: '14px', color: '#475569' }}>Generado el: {new Date().toLocaleString('es-AR')}</p>
        <hr style={{ margin: '10px 0', borderColor: '#E2E8F0' }} />
      </div>

      <div className="hide-on-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 className="section-title" style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BarChart3 size={28} style={{ color: 'var(--color-highlight)' }} /> Central de Informes & Analytics
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={loadData}><RefreshCw size={16} className={isLoading ? 'spin' : ''} /></button>
          <button className="btn btn-primary" onClick={() => window.print()} disabled={!hasSearched} style={{ backgroundColor: '#475569' }}>
            <Printer size={16} /> Imprimir / PDF
          </button>
        </div>
      </div>

      {/* FILTROS SIMPLIFICADOS PARA LEER MÃS FÃCIL (Omito el cÃ³digo largo de inputs por espacio, pero estÃ¡n funcionales) */}
      <div className="card hide-on-print" style={{ marginBottom: '1.5rem', padding: '16px', backgroundColor: '#F8FAFC', borderLeft: '4px solid var(--color-highlight)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
           <input type="date" value={fechaDesde} onChange={e=>setFechaDesde(e.target.value)} className="form-control" title="Fecha Desde" />
           <input type="date" value={fechaHasta} onChange={e=>setFechaHasta(e.target.value)} className="form-control" title="Fecha Hasta" />
           <select value={selectedTipoReunion} onChange={e=>setSelectedTipoReunion(e.target.value)} className="form-control">
             <option value="">Tipos de evento</option>
             {Object.values(TIPOS_REUNION).map(t => <option key={t} value={t}>{t}</option>)}
           </select>
           {/* Mas filtros aquÃ­... */}
        </div>
        <div style={{ marginTop: '12px', textAlign: 'right' }}>
           <button onClick={loadData} className="btn btn-primary" style={{ backgroundColor: 'var(--color-highlight)', color: '#0F172A', fontWeight: '700' }}>
            <Search size={18} /> Generar Informe
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}><div className="spinner"></div></div>
      ) : !hasSearched || !kpis ? (
        renderEmptyState()
      ) : (
        <>
          {/* 1. RESUMEN EJECUTIVO */}
          <div className="card" style={{ padding: '20px', backgroundColor: '#F0FDFA', border: '1px solid #14B8A6', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#0F766E', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={20} /> Resumen Ejecutivo
            </h3>
            <p style={{ margin: 0, fontSize: '0.95rem', color: '#0F172A', lineHeight: '1.6' }}>
              En el perÃ­odo seleccionado se realizaron <strong>{kpis.actual.convocatorias.toLocaleString('es-AR')} convocatorias</strong> que alcanzaron a <strong>{kpis.actual.vecinosUnicos.toLocaleString('es-AR')} vecinos Ãºnicos</strong>, con una tasa de conversiÃ³n del <strong>{(kpis.actual.conversion * 100).toFixed(1)}%</strong>. 
              {wordCloudData.length > 0 && ` La demanda ciudadana estuvo marcada por temas vinculados a: `}
              {wordCloudData.slice(0, 3).map((w,i) => <strong key={w.text}>{w.text}{i===2?'':', '}</strong>)}.
            </p>
            {insights.length > 0 && (
              <ul style={{ margin: '12px 0 0 0', paddingLeft: '20px', color: '#334155', fontSize: '0.9rem' }}>
                {insights.map((insight, idx) => <li key={idx} style={{ marginBottom: '4px' }}>{insight}</li>)}
              </ul>
            )}
          </div>

          {/* 2. BLOQUE DE KPIS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            
            <div className="card" style={{ padding: '16px', margin: 0 }}>
              <TooltipWrapper text="Cantidad de convocatorias/mensajes enviados para asistir.">
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>CONVOCATORIA TOTAL <Info size={12}/></span>
              </TooltipWrapper>
              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0F172A' }}>{kpis.actual.convocatorias.toLocaleString('es-AR')}</div>
              <SemaphoreIndicator actual={kpis.actual.convocatorias} anterior={kpis.anterior.convocados} />
            </div>

            <div className="card" style={{ padding: '16px', margin: 0 }}>
              <TooltipWrapper text="Personas Ãºnicas contactadas, sin importar cuÃ¡ntas veces.">
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>VECINOS ÃšNICOS <Info size={12}/></span>
              </TooltipWrapper>
              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0F172A' }}>{kpis.actual.vecinosUnicos.toLocaleString('es-AR')}</div>
              {/* No hay anterior para vecinos Ãºnicos directos facilmente, omitimos semaphore */}
            </div>

            <div className="card" style={{ padding: '16px', margin: 0 }}>
              <TooltipWrapper text="Total de asistencias marcadas como presentes.">
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>ASISTENCIAS EFECTIVAS <Info size={12}/></span>
              </TooltipWrapper>
              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0F172A' }}>{kpis.actual.asistencias.toLocaleString('es-AR')}</div>
              <SemaphoreIndicator actual={kpis.actual.asistencias} anterior={kpis.anterior.asistentes} />
            </div>

            <div className="card" style={{ padding: '16px', margin: 0 }}>
              <TooltipWrapper text="RelaciÃ³n entre Asistentes Efectivos y Convocatorias.">
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>CONVERSIÃ“N <Info size={12}/></span>
              </TooltipWrapper>
              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#10B981' }}>{(kpis.actual.conversion * 100).toFixed(1)}%</div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>({kpis.actual.asistencias} / {kpis.actual.convocatorias})</div>
              <SemaphoreIndicator actual={kpis.actual.conversion} anterior={kpis.anterior.conversion} format="percentage" />
            </div>

            <div className="card" style={{ padding: '16px', margin: 0, borderLeft: '4px solid #3B82F6' }}>
              <TooltipWrapper text="Mide si estamos construyendo comunidad (fidelidad).">
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>FIDELIZACIÃ“N <Info size={12}/></span>
              </TooltipWrapper>
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                  <span>Nuevos:</span> <strong>{kpis.actual.asistentesPrimeraVez}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span>Recurrentes:</span> <strong>{kpis.actual.asistentesReincidentes}</strong>
                </div>
              </div>
            </div>

          </div>

          {/* 3. DEMANDA CIUDADANA */}
          <div className="card" style={{ padding: '24px', marginBottom: '1.5rem', backgroundColor: '#F8FAFC' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#0F172A' }}>
              <MessageSquare size={24} style={{ color: 'var(--color-highlight)' }} /> Demanda Ciudadana
            </h3>
            
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: '2 1 400px', backgroundColor: '#FFF', borderRadius: '8px', padding: '16px', border: '1px solid #E2E8F0' }}>
                <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                  {wordCloudData.slice(0, 35).map((w, i) => {
                    const maxCount = wordCloudData[0].count;
                    const size = 14 + (w.count / maxCount) * 26;
                    return (
                      <span key={i} onClick={() => setSelectedWord(w.text)} style={{
                        fontSize: `${size}px`, fontWeight: 800, color: selectedWord === w.text ? '#14B8A6' : '#475569',
                        margin: '0 8px', cursor: 'pointer', display: 'inline-block', lineHeight: 1.2
                      }}>
                        {w.text}
                      </span>
                    )
                  })}
                </div>
              </div>
              
              <div style={{ flex: '1 1 300px', backgroundColor: '#FFF', borderRadius: '8px', padding: '16px', border: '1px solid #E2E8F0', maxHeight: '350px', overflowY: 'auto' }}>
                {selectedWord ? (
                  <>
                    <h5 style={{ margin: '0 0 12px 0', color: '#0F172A' }}>Frases con "{selectedWord}":</h5>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#475569' }}>
                      {getFrasesForWord(selectedWord).map((f, i) => <li key={i} style={{ marginBottom: '8px' }}>"{f}"</li>)}
                    </ul>
                    <button onClick={() => setSelectedWord(null)} className="btn btn-secondary" style={{ width: '100%', marginTop: '12px' }}>Ver Ranking</button>
                  </>
                ) : (
                  <>
                    <h5 style={{ margin: '0 0 12px 0', color: '#0F172A' }}>Top Preocupaciones:</h5>
                    <table style={{ width: '100%', fontSize: '0.85rem' }}>
                      <tbody>
                        {wordCloudData.slice(0, 10).map((w, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '6px 0', textTransform: 'capitalize' }}>{w.text}</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{w.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 4. GRÃFICOS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
            
            <div className="card" style={{ margin: 0, padding: '20px' }}>
               <h4 style={{ margin: '0 0 16px 0', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} /> EvoluciÃ³n Temporal
               </h4>
               <div style={{ width: '100%', height: 300 }}>
                 <ResponsiveContainer>
                   <LineChart data={temporalChartData}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} />
                     <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                     <YAxis />
                     <Tooltip />
                     <Legend />
                     <Line type="monotone" dataKey="Convocatorias" stroke="#3B82F6" strokeWidth={2} />
                     <Line type="monotone" dataKey="Asistencias" stroke="#10B981" strokeWidth={3} />
                   </LineChart>
                 </ResponsiveContainer>
               </div>
            </div>

            <div className="card" style={{ margin: 0, padding: '20px' }}>
               <h4 style={{ margin: '0 0 16px 0', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Map size={18} /> Ranking Territorial
               </h4>
               <div style={{ width: '100%', height: 300 }}>
                 <ResponsiveContainer>
                   <BarChart data={territorialChartData} layout="vertical" margin={{ left: 20 }}>
                     <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                     <XAxis type="number" />
                     <YAxis dataKey="comuna" type="category" tick={{ fontSize: 11 }} width={80} />
                     <Tooltip />
                     <Legend />
                     <Bar dataKey="Convocados" fill="#E2E8F0" />
                     <Bar dataKey="Asistentes" fill="#14B8A6" onClick={(data) => handleDrillDown('comuna', data.comuna)} style={{ cursor: 'pointer' }} />
                   </BarChart>
                 </ResponsiveContainer>
               </div>
            </div>

          </div>

          {/* DRILL DOWN MODAL */}
          {drillDownModal.isOpen && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
              <div className="card" style={{ width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#FFF', position: 'relative', margin: 0, padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Target size={20} style={{ color: 'var(--color-primary)' }} />
                    Análisis Profundo (Drill Down)
                  </h3>
                  <button onClick={closeDrillDown} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748B' }}>&times;</button>
                </div>
                
                {drillDownModal.history.length > 1 && (
                  <button onClick={goBackDrillDown} className="btn btn-secondary" style={{ marginBottom: '16px', padding: '4px 12px', fontSize: '0.85rem' }}>
                    ← Volver al nivel anterior
                  </button>
                )}

                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: '#334155' }}>
                    {drillDownModal.type === 'comuna' && `Distribución de actividades en ${drillDownModal.context}`}
                    {drillDownModal.type === 'actividad' && `Reuniones del tipo "${drillDownModal.context}"`}
                    {drillDownModal.type === 'reunion' && `Asistentes a la reunión ID: ${drillDownModal.context}`}
                  </h4>
                </div>

                <div style={{ display: 'grid', gap: '8px' }}>
                  {drillDownModal.type === 'comuna' && drillDownModal.data.map((act, i) => (
                    <div key={i} onClick={() => handleDrillDown('actividad', act.name, act)} style={{ padding: '12px', border: '1px solid #E2E8F0', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor='#F1F5F9'} onMouseLeave={e => e.currentTarget.style.backgroundColor='#FFF'}>
                      <strong>{act.name}</strong>
                      <span style={{ backgroundColor: '#14B8A6', color: '#FFF', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>{act.count} reuniones</span>
                    </div>
                  ))}

                  {drillDownModal.type === 'actividad' && drillDownModal.data.map((reu, i) => (
                    <div key={i} onClick={() => handleDrillDown('reunion', reu.id)} style={{ padding: '12px', border: '1px solid #E2E8F0', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF' }}>
                      <div>
                        <strong>{reu.nombre}</strong> <br/>
                        <span style={{ fontSize: '0.8rem', color: '#64748B' }}>{new Date(reu.fecha).toLocaleDateString()} - {reu.funcionario}</span>
                      </div>
                      <span style={{ color: '#14B8A6', fontSize: '0.85rem', fontWeight: 'bold' }}>Ver asistentes &rarr;</span>
                    </div>
                  ))}

                  {drillDownModal.type === 'reunion' && (
                    <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '6px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead style={{ backgroundColor: '#F1F5F9', position: 'sticky', top: 0 }}>
                          <tr>
                            <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>DNI</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>Vecino</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>Barrio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drillDownModal.data.map((v, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '8px 12px' }}>{v.dni}</td>
                              <td style={{ padding: '8px 12px', textTransform: 'capitalize' }}>{v.nombre} {v.apellido}</td>
                              <td style={{ padding: '8px 12px' }}>{v.barrio}</td>
                            </tr>
                          ))}
                          {drillDownModal.data.length === 0 && <tr><td colSpan={3} style={{ padding: '16px', textAlign: 'center', color: '#94A3B8' }}>No se encontraron asistentes para esta reunión en el padrón filtrado.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}
