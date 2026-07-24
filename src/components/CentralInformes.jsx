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
    icon = '▲';
    bgColor = '#D1FAE5';
  } else if (variation < 0) {
    color = '#EF4444';
    icon = '▼';
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

// CSS Inline para la impresión y tooltips
const globalStyles = `
  @media print {
    .hide-on-print { display: none !important; }
    .print-header { display: block !important; margin-bottom: 24px; }
    .card { break-inside: avoid !important; page-break-inside: avoid !important; border: 1px solid #CBD5E1 !important; box-shadow: none !important; margin-bottom: 1rem !important; }
    body { background-color: white !important; }
    * { color-adjust: exact !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    @page { size: landscape; margin: 8mm; }
  }
`;

export default function CentralInformes({ user, onBack }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
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

  // Listas Dinámicas
  const [funcionariosList, setFuncionariosList] = useState([]);
  const [barriosList, setBarriosList] = useState([]);
  const [barriosListB, setBarriosListB] = useState([]);

  // Filtros
  const [isComparing, setIsComparing] = useState(false);
  const [selectedComunas, setSelectedComunas] = useState([]);
  const [selectedBarrio, setSelectedBarrio] = useState('');
  const [selectedFuncionario, setSelectedFuncionario] = useState('');
  const [selectedTipoReunion, setSelectedTipoReunion] = useState('');
  const [selectedTema, setSelectedTema] = useState('');
  const [selectedRol, setSelectedRol] = useState('Todos');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [showComunaDropdown, setShowComunaDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Filtros Grupo B
  const [selectedComunasB, setSelectedComunasB] = useState([]);
  const [selectedBarrioB, setSelectedBarrioB] = useState('');
  const [selectedFuncionarioB, setSelectedFuncionarioB] = useState('');
  const [selectedTipoReunionB, setSelectedTipoReunionB] = useState('');
  const [selectedTemaB, setSelectedTemaB] = useState('');
  const [fechaDesdeB, setFechaDesdeB] = useState('');
  const [fechaHastaB, setFechaHastaB] = useState('');
  const [showComunaDropdownB, setShowComunaDropdownB] = useState(false);
  const dropdownRefB = useRef(null);

  // Resultados Grupo B
  const [allVecinosB, setAllVecinosB] = useState([]);
  const [filteredVecinosB, setFilteredVecinosB] = useState([]);
  const [kpisB, setKpisB] = useState(null);
  const [reunionesB, setReunionesB] = useState([]);
  const [frasesRawB, setFrasesRawB] = useState([]);
  const [wordCloudDataB, setWordCloudDataB] = useState([]);
  const [insightsB, setInsightsB] = useState([]);

  // Filtros de gráficos
  const [minFrequency, setMinFrequency] = useState(1);
  const [selectedWord, setSelectedWord] = useState(null);
  const [chartGranularity, setChartGranularity] = useState('Semanal');
  const [semaforoViewMode, setSemaforoViewMode] = useState('matrix');
  const [selectedComunaChart, setSelectedComunaChart] = useState('TODAS');
  const [selectedMesChart, setSelectedMesChart] = useState('TODOS');

  useEffect(() => {
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

  useEffect(() => {
    if (selectedComunasB.length === 0) {
      setBarriosListB([...new Set(Object.values(COMUNA_TO_BARRIOS).flat())].sort());
    } else {
      const filtered = selectedComunasB.flatMap(c => COMUNA_TO_BARRIOS[c] || []);
      const unique = [...new Set(filtered)].sort();
      setBarriosListB(unique);
      if (selectedBarrioB && !unique.includes(selectedBarrioB)) setSelectedBarrioB('');
    }
  }, [selectedComunasB]);

  const getFilterLabel = (tipo, tema, comunas, barrio, func, defaultName) => {
    const parts = [];
    if (tipo) {
      if (tema) parts.push(`${tipo} (${tema})`);
      else parts.push(tipo);
    } else if (tema) {
      parts.push(`Tema: ${tema}`);
    }
    if (func) parts.push(func);
    if (barrio) parts.push(barrio);
    else if (comunas && comunas.length > 0 && comunas.length < COMUNAS.length) {
      parts.push(comunas.length === 1 ? comunas[0] : `${comunas.length} Comunas`);
    }
    return parts.length > 0 ? parts.join(' - ') : defaultName;
  };

  const labelA = getFilterLabel(selectedTipoReunion, selectedTema, selectedComunas, selectedBarrio, selectedFuncionario, 'Grupo A');
  const labelB = getFilterLabel(selectedTipoReunionB, selectedTemaB, selectedComunasB, selectedBarrioB, selectedFuncionarioB, 'Grupo B');

  const loadData = async () => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const filtros = { selectedComunas, selectedBarrio, selectedFuncionario, selectedTipoReunion, selectedTema, fechaDesde, fechaHasta, searchQuery };
      const filtrosB = { 
        selectedComunas: selectedComunasB, selectedBarrio: selectedBarrioB, 
        selectedFuncionario: selectedFuncionarioB, selectedTipoReunion: selectedTipoReunionB, 
        selectedTema: selectedTemaB,
        fechaDesde: fechaDesdeB, fechaHasta: fechaHastaB, searchQuery 
      };

      if (isComparing) {
        const [dataA, dataB] = await Promise.all([
          fetchDashboardData(filtros),
          fetchDashboardData(filtrosB)
        ]);

        setAllVecinos(dataA.vecinos);
        setKpis(dataA.kpis);
        setReuniones(dataA.reunionesActuales);
        setFrasesRaw(dataA.frasesGlobales);
        setInsights(generateInsights(dataA.kpis.actual, dataA.kpis.anterior, dataA.periodos));

        setAllVecinosB(dataB.vecinos);
        setKpisB(dataB.kpis);
        setReunionesB(dataB.reunionesActuales);
        setFrasesRawB(dataB.frasesGlobales);
        setInsightsB(generateInsights(dataB.kpis.actual, dataB.kpis.anterior, dataB.periodos));

        const funcsA = dataA.reunionesActuales.map(r => r.funcionario).filter(Boolean);
        const funcsB = dataB.reunionesActuales.map(r => r.funcionario).filter(Boolean);
        setFuncionariosList([...new Set([...funcsA, ...funcsB])].sort());
      } else {
        const data = await fetchDashboardData(filtros);
        setAllVecinos(data.vecinos);
        setKpis(data.kpis);
        setReuniones(data.reunionesActuales);
        setFrasesRaw(data.frasesGlobales);
        setInsights(generateInsights(data.kpis.actual, data.kpis.anterior, data.periodos));
        setFuncionariosList([...new Set(data.reunionesActuales.map(r => r.funcionario).filter(Boolean))].sort());
        
        setAllVecinosB([]);
        setKpisB(null);
        setReunionesB([]);
        setFrasesRawB([]);
        setInsightsB([]);
      }
    } catch (err) {
      console.error(err);
      alert('Error cargando los datos. Revisa la consola.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Grupo A
    let result = allVecinos || [];
    if (selectedRol === 'Solo Inscriptos') result = result.filter(v => v.totalInscripciones > 0);
    else if (selectedRol === 'Solo Asistentes') result = result.filter(v => v.totalAsistencias > 0);
    else if (selectedRol === 'Solo Oradores') result = result.filter(v => v.totalOratorias > 0);

    setFilteredVecinos(result);

    const wordCounts = {};
    (frasesRaw || []).forEach(o => {
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

  useEffect(() => {
    // Grupo B
    if (!isComparing) return;
    let resultB = allVecinosB || [];
    if (selectedRol === 'Solo Inscriptos') resultB = resultB.filter(v => v.totalInscripciones > 0);
    else if (selectedRol === 'Solo Asistentes') resultB = resultB.filter(v => v.totalAsistencias > 0);
    else if (selectedRol === 'Solo Oradores') resultB = resultB.filter(v => v.totalOratorias > 0);

    setFilteredVecinosB(resultB);

    const wordCountsB = {};
    (frasesRawB || []).forEach(o => {
      const texts = [o.tema_efectivo, o.tema_original, o.transcripcion_texto].filter(Boolean);
      texts.forEach(txt => {
        txt.split(/\s+/).forEach(t => {
          const clean = processAndNormalizeWord(t);
          if (clean) wordCountsB[clean] = (wordCountsB[clean] || 0) + 1;
        });
      });
    });

    const sortedWordsB = Object.entries(wordCountsB)
      .filter(([_, count]) => count >= minFrequency)
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count);
      
    setWordCloudDataB(sortedWordsB);
  }, [allVecinosB, selectedRol, frasesRawB, minFrequency, isComparing]);

  const topTopics = React.useMemo(() => {
    if (wordCloudData.length > 0) return wordCloudData.slice(0, 10);
    const counts = {};
    (frasesRaw || []).forEach(f => {
      const txt = f.tema_original || f.tema_efectivo;
      if (!txt) return;
      txt.split(/\s+/).forEach(word => {
        const clean = processAndNormalizeWord(word);
        if (clean && clean.length > 2) {
          counts[clean] = (counts[clean] || 0) + 1;
        }
      });
    });
    return Object.entries(counts)
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [wordCloudData, frasesRaw]);

  const topTopicsB = React.useMemo(() => {
    if (!isComparing) return [];
    if (wordCloudDataB.length > 0) return wordCloudDataB.slice(0, 10);
    const counts = {};
    (frasesRawB || []).forEach(f => {
      const txt = f.tema_original || f.tema_efectivo;
      if (!txt) return;
      txt.split(/\s+/).forEach(word => {
        const clean = processAndNormalizeWord(word);
        if (clean && clean.length > 2) {
          counts[clean] = (counts[clean] || 0) + 1;
        }
      });
    });
    return Object.entries(counts)
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [wordCloudDataB, frasesRawB, isComparing]);

  const getFrasesForWord = (word) => {
    const frases = [];
    frasesRaw.forEach(o => {
      const txt = o.tema_efectivo || o.tema_original || o.transcripcion_texto;
      if (!txt) return;
      const clean = txt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (clean.includes(word)) frases.push(txt);
    });
    return [...new Set(frases)].slice(0, 20); // Top 20 frases únicas
  };

  const handleExportCSV = () => {
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

  const handlePrintPDF = () => {
    let dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    if (fechaDesde) {
      dateStr = fechaDesde.replace(/-/g, '');
    }

    let comunaStr = 'Todas las comunas';
    if (selectedComunas.length > 0 && selectedComunas.length < 15) {
      if (selectedComunas.length === 1) {
        comunaStr = selectedComunas[0];
      } else {
        comunaStr = `${selectedComunas.length} Comunas`;
      }
    }

    const tipoStr = selectedTipoReunion || 'Todos los eventos';
    const pdfFileName = `${dateStr} - ${comunaStr} - ${tipoStr}`;

    const printWin = window.open('', '_blank');
    if (!printWin) return alert('Por favor permití las ventanas emergentes (pop-ups) para descargar el informe.');

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(el => el.outerHTML)
      .join('\n');

    const containerEl = document.querySelector('.container');
    if (!containerEl) return alert('No hay informe cargado.');

    const clone = containerEl.cloneNode(true);
    clone.querySelectorAll('.hide-on-print').forEach(el => el.remove());

    const headerInClone = clone.querySelector('.print-header');
    if (headerInClone) {
      headerInClone.style.display = 'block';
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>${pdfFileName}</title>
        ${styles}
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          body { background: white !important; font-family: system-ui, -apple-system, sans-serif; padding: 20px; color: #0F172A; }
          .print-header { display: block !important; margin-bottom: 24px; }
          .card { break-inside: avoid; page-break-inside: avoid; border: 1px solid #CBD5E1 !important; box-shadow: none !important; margin-bottom: 1.2rem !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        </style>
      </head>
      <body>
        ${clone.innerHTML}
        <script>
          window.onload = () => {
            setTimeout(() => {
              window.print();
            }, 600);
          };
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  const loadHtml2Pdf = () => {
    return new Promise((resolve, reject) => {
      if (window.html2pdf) return resolve(window.html2pdf);
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = () => resolve(window.html2pdf);
      script.onerror = () => reject(new Error('No se pudo cargar html2pdf'));
      document.head.appendChild(script);
    });
  };

  const handleDownloadPDF = async () => {
    if (!hasSearched || !kpis) return;
    setIsGeneratingPdf(true);

    try {
      const html2pdf = await loadHtml2Pdf();

      let dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      if (fechaDesde) dateStr = fechaDesde.replace(/-/g, '');

      let comunaStr = 'Todas las comunas';
      if (selectedComunas.length > 0 && selectedComunas.length < 15) {
        if (selectedComunas.length === 1) comunaStr = selectedComunas[0];
        else comunaStr = `${selectedComunas.length} Comunas`;
      }

      const tipoStr = selectedTipoReunion || 'Todos los eventos';
      const pdfFileName = `${dateStr} - ${comunaStr} - ${tipoStr}.pdf`;

      const containerEl = document.querySelector('.container');
      if (!containerEl) return alert('No hay informe cargado.');

      // 1. Guardar scroll original y scroll al inicio
      const originalScrollY = window.scrollY;
      window.scrollTo(0, 0);

      // 2. Mostrar header de impresión y ocultar botones de acción
      const printHeader = containerEl.querySelector('.print-header');
      const hideOnPrintEls = containerEl.querySelectorAll('.hide-on-print');

      if (printHeader) printHeader.style.display = 'block';
      hideOnPrintEls.forEach(el => el.style.display = 'none');

      // 3. Fijar ancho/alto explícito en SVGs para Recharts en canvas
      const svgs = containerEl.querySelectorAll('svg');
      svgs.forEach(svg => {
        const rect = svg.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          svg.setAttribute('width', rect.width);
          svg.setAttribute('height', rect.height);
        }
      });

      const opt = {
        margin: [8, 8, 8, 8],
        filename: pdfFileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          logging: false,
          scrollX: 0,
          scrollY: 0,
          windowWidth: document.documentElement.offsetWidth || 1200
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      await html2pdf().set(opt).from(containerEl).save();

      // 4. Restaurar visibilidad original
      if (printHeader) printHeader.style.display = 'none';
      hideOnPrintEls.forEach(el => el.style.display = '');
      window.scrollTo(0, originalScrollY);

    } catch (err) {
      console.error('Error al descargar PDF:', err);
      handlePrintPDF();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // --- CÁLCULO DE GRÁFICOS ---
  
  // 1. Gráfico Evolución Temporal
  const temporalMap = {};

  const processTemporal = (vecinosList, reunionesList, suffix) => {
    const reunionesInsc = {};
    const reunionesAsist = {};
    vecinosList.forEach(v => {
      v.inscripcionesReuniones.forEach(i => {
        reunionesInsc[i.reunion_id] = (reunionesInsc[i.reunion_id] || 0) + 1;
        if (i.asistio) reunionesAsist[i.reunion_id] = (reunionesAsist[i.reunion_id] || 0) + 1;
      });
    });

    reunionesList.forEach(r => {
      if (!r.fecha) return;
      const date = new Date(r.fecha);
      let key = '';
      if (chartGranularity === 'Diario') {
        key = date.toISOString().split('T')[0];
      } else if (chartGranularity === 'Semanal') {
        const first = date.getDate() - date.getDay();
        const firstDay = new Date(date.setDate(first)).toISOString().split('T')[0];
        key = `Sem. ${firstDay}`;
      } else { // Mensual
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }
      
      if (!temporalMap[key]) {
        temporalMap[key] = { name: key, ConvocatoriasA: 0, AsistenciasA: 0, ConvocatoriasB: 0, AsistenciasB: 0 };
      }
      temporalMap[key][`Convocatorias${suffix}`] += (reunionesInsc[r.id] || 0);
      temporalMap[key][`Asistencias${suffix}`] += (reunionesAsist[r.id] || 0);
    });
  };

  processTemporal(filteredVecinos, reuniones, 'A');
  if (isComparing && kpisB) {
    processTemporal(filteredVecinosB, reunionesB, 'B');
  }

  const temporalChartData = Object.values(temporalMap).sort((a, b) => a.name.localeCompare(b.name));

  // 2. Gráfico Territorial
  const comunasMap = {};
  
  const processTerritorial = (vecinosList, suffix) => {
    vecinosList.forEach(v => {
      const c = v.comuna || 'Sin Comuna';
      if (!comunasMap[c]) comunasMap[c] = { comuna: c, ConvocadosA: 0, AsistentesA: 0, ConvocadosB: 0, AsistentesB: 0 };
      comunasMap[c][`Convocados${suffix}`] += v.totalInscripciones;
      comunasMap[c][`Asistentes${suffix}`] += v.totalAsistencias;
    });
  };
  
  processTerritorial(filteredVecinos, 'A');
  if (isComparing && kpisB) {
    processTerritorial(filteredVecinosB, 'B');
  }
  
  const territorialChartData = Object.values(comunasMap)
    .map(c => ({ 
      ...c, 
      ConversionA: c.ConvocadosA > 0 ? (c.AsistentesA / c.ConvocadosA) * 100 : 0,
      ConversionB: c.ConvocadosB > 0 ? (c.AsistentesB / c.ConvocadosB) * 100 : 0
    }))
    .sort((a, b) => (b.AsistentesA + b.AsistentesB) - (a.AsistentesA + a.AsistentesB));

  // 3. Gráfico por Funcionario
  const funcionarioMap = {};
  
  const processFunc = (vecinosList, suffix) => {
    vecinosList.forEach(v => {
      v.inscripcionesReuniones.forEach(i => {
        if (i.reunion && i.reunion.funcionario) {
          const f = i.reunion.funcionario;
          if (!funcionarioMap[f]) funcionarioMap[f] = { name: f, ConvocadosA: 0, AsistentesA: 0, ConvocadosB: 0, AsistentesB: 0 };
          funcionarioMap[f][`Convocados${suffix}`] += 1;
          if (i.asistio) funcionarioMap[f][`Asistentes${suffix}`] += 1;
        }
      });
    });
  };
  
  processFunc(filteredVecinos, 'A');
  if (isComparing && kpisB) {
    processFunc(filteredVecinosB, 'B');
  }

  const funcionarioChartData = Object.values(funcionarioMap)
    .map(c => ({ 
      ...c, 
      ConversionA: c.ConvocadosA > 0 ? (c.AsistentesA / c.ConvocadosA) * 100 : 0,
      ConversionB: c.ConvocadosB > 0 ? (c.AsistentesB / c.ConvocadosB) * 100 : 0 
    }))
    .sort((a, b) => (b.AsistentesA + b.AsistentesB) - (a.AsistentesA + a.AsistentesB))
    .slice(0, 15);

  // 4. Semáforo Político por Comuna y Evolución Temporal (Heatmap Matrix)
  const semaforoComunaMap = {};
  const semaforoTempMap = {};
  const semaforoMatrix = {};
  const timeKeySet = new Set();
  let totalRojo = 0;
  let totalAmarillo = 0;
  let totalVerde = 0;

  reuniones.forEach(r => {
    const c = r.comuna || 'Sin Comuna';
    if (!semaforoComunaMap[c]) {
      semaforoComunaMap[c] = { comuna: c, Verde: 0, Amarillo: 0, Rojo: 0, Total: 0 };
    }
    if (!semaforoMatrix[c]) semaforoMatrix[c] = {};

    const sem = (r.semaforo_politico || 'verde').toLowerCase();
    if (sem.includes('rojo')) {
      semaforoComunaMap[c].Rojo += 1;
      totalRojo += 1;
    } else if (sem.includes('amarillo')) {
      semaforoComunaMap[c].Amarillo += 1;
      totalAmarillo += 1;
    } else {
      semaforoComunaMap[c].Verde += 1;
      totalVerde += 1;
    }
    semaforoComunaMap[c].Total += 1;

    if (r.fecha) {
      const date = new Date(r.fecha);
      let key = '';
      if (chartGranularity === 'Diario') {
        key = date.toISOString().split('T')[0];
      } else if (chartGranularity === 'Semanal') {
        const first = date.getDate() - date.getDay();
        const firstDay = new Date(date.setDate(first)).toISOString().split('T')[0];
        key = `Sem. ${firstDay}`;
      } else { // Mensual
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }
      timeKeySet.add(key);

      if (!semaforoTempMap[key]) {
        semaforoTempMap[key] = { name: key, Verde: 0, Amarillo: 0, Rojo: 0 };
      }
      if (!semaforoMatrix[c][key]) {
        semaforoMatrix[c][key] = { Verde: 0, Amarillo: 0, Rojo: 0, Total: 0 };
      }

      if (sem.includes('rojo')) {
        semaforoTempMap[key].Rojo += 1;
        semaforoMatrix[c][key].Rojo += 1;
      } else if (sem.includes('amarillo')) {
        semaforoTempMap[key].Amarillo += 1;
        semaforoMatrix[c][key].Amarillo += 1;
      } else {
        semaforoTempMap[key].Verde += 1;
        semaforoMatrix[c][key].Verde += 1;
      }
      semaforoMatrix[c][key].Total += 1;
    }
  });

  const semaforoTimeKeys = Array.from(timeKeySet).sort();
  const semaforoComunaData = Object.values(semaforoComunaMap)
    .sort((a, b) => b.Rojo - a.Rojo || b.Amarillo - a.Amarillo || b.Total - a.Total);
  const semaforoComunasSorted = Object.keys(semaforoComunaMap).sort((a, b) => {
    const idxA = COMUNAS.indexOf(a);
    const idxB = COMUNAS.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  const semaforoTemporalData = Object.values(semaforoTempMap)
    .sort((a, b) => a.name.localeCompare(b.name));

  // 5. Gráfico Inscriptos y Asistentes por Comuna y por Mes
  const comunaMesMap = {};

  const processComunaMes = (vecinosList, reunionesList) => {
    const reunionesInsc = {};
    const reunionesAsist = {};
    (vecinosList || []).forEach(v => {
      (v.inscripcionesReuniones || []).forEach(i => {
        reunionesInsc[i.reunion_id] = (reunionesInsc[i.reunion_id] || 0) + 1;
        if (i.asistio) {
          reunionesAsist[i.reunion_id] = (reunionesAsist[i.reunion_id] || 0) + 1;
        }
      });
    });

    (reunionesList || []).forEach(r => {
      if (!r.fecha) return;
      const c = r.comuna || 'Sin Comuna';
      const date = new Date(r.fecha);
      if (isNaN(date.getTime())) return;
      const mesStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const key = `${c}___${mesStr}`;
      if (!comunaMesMap[key]) {
        comunaMesMap[key] = { comuna: c, mes: mesStr, inscriptos: 0, asistentes: 0 };
      }
      comunaMesMap[key].inscriptos += (reunionesInsc[r.id] || 0);
      comunaMesMap[key].asistentes += (reunionesAsist[r.id] || 0);
    });
  };

  processComunaMes(filteredVecinos, reuniones);

  const rawComunaMesEntries = Object.values(comunaMesMap);

  const availableComunasForChart = [...new Set(rawComunaMesEntries.map(e => e.comuna))].sort((a, b) => {
    const idxA = COMUNAS.indexOf(a);
    const idxB = COMUNAS.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  const availableMesesForChart = [...new Set(rawComunaMesEntries.map(e => e.mes))].sort();

  let comunaMesChartData = [];
  let comunaMesChartLayout = 'horizontal';

  if (selectedMesChart !== 'TODOS') {
    const filteredByMes = rawComunaMesEntries.filter(e => e.mes === selectedMesChart);
    const filteredByComuna = selectedComunaChart !== 'TODAS'
      ? filteredByMes.filter(e => e.comuna === selectedComunaChart)
      : filteredByMes;

    comunaMesChartData = filteredByComuna
      .map(e => ({
        name: e.comuna,
        Inscriptos: e.inscriptos,
        Asistentes: e.asistentes
      }))
      .sort((a, b) => b.Inscriptos - a.Inscriptos);
      
    if (comunaMesChartData.length > 8) {
      comunaMesChartLayout = 'vertical';
    }
  } else if (selectedComunaChart !== 'TODAS') {
    const filteredByComuna = rawComunaMesEntries.filter(e => e.comuna === selectedComunaChart);
    comunaMesChartData = filteredByComuna
      .map(e => ({
        name: e.mes,
        Inscriptos: e.inscriptos,
        Asistentes: e.asistentes
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const mesAgg = {};
    rawComunaMesEntries.forEach(e => {
      if (!mesAgg[e.mes]) mesAgg[e.mes] = { name: e.mes, Inscriptos: 0, Asistentes: 0 };
      mesAgg[e.mes].Inscriptos += e.inscriptos;
      mesAgg[e.mes].Asistentes += e.asistentes;
    });
    comunaMesChartData = Object.values(mesAgg).sort((a, b) => a.name.localeCompare(b.name));
  }

  const convTot = kpis?.actual?.convocatorias || 0;
  const asisTot = kpis?.actual?.asistencias || 0;
  const pieData = [
    { name: 'Asistió Efectivamente', value: asisTot, color: '#10B981' },
    { name: 'Inscripto sin asistir', value: Math.max(0, convTot - asisTot), color: '#F59E0B' }
  ];

  const renderEmptyState = () => (
    <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', backgroundColor: '#F8FAFC' }}>
      <BarChart3 size={52} style={{ color: 'var(--color-highlight)', marginBottom: '1rem' }} />
      <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--color-primary)' }}>Central de Informes & Analytics</h3>
      <p style={{ color: '#64748B', maxWidth: '540px', margin: '0 auto 1.5rem auto' }}>
        Seleccioná tus filtros y hacé clic en "Generar Informe" para analizar el comportamiento y la demanda ciudadana.
      </p>
      <button onClick={loadData} className="btn btn-primary" style={{ backgroundColor: 'var(--color-highlight)', color: '#0F172A', fontWeight: '800' }}>
        <Search size={18} /> Generar Informe
      </button>
    </div>
  );

  return (
    <div className="container" style={{ paddingBottom: '3rem' }}>
      
      {/* IMPRESIÓN CON TEMPLATE SOLICITADO */}
      <div className="print-header" style={{ display: 'none', marginBottom: '24px' }}>
        <div style={{
          position: 'relative',
          backgroundColor: '#072432',
          padding: '24px 30px',
          borderRadius: '4px',
          overflow: 'hidden',
          color: 'white'
        }}>
          {/* Solapas decorativas superiores derecha idénticas al template */}
          <div style={{
            position: 'absolute', right: '24px', top: 0, bottom: 0, width: '24px',
            backgroundColor: '#70E0D6', borderTopRightRadius: '10px'
          }}></div>
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '24px',
            backgroundColor: '#FACC15', borderTopRightRadius: '4px'
          }}></div>

          <div style={{ paddingRight: '50px' }}>
            <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '800', color: '#4FD1C5', letterSpacing: '-0.5px' }}>
              Reporte Ejecutivo Central de Informes
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#E2E8F0' }}>
              Dirección General de Cercanía Ciudadana | Secretaría de Gobierno y Vínculo Ciudadano
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', marginTop: '12px', fontSize: '11px', color: '#94A3B8', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px', lineHeight: '1.5' }}>
              <div style={{ whiteSpace: 'nowrap' }}><strong>Generado el:</strong> {new Date().toLocaleString('es-AR')}</div>
              {fechaDesde && fechaHasta && (
                <div style={{ whiteSpace: 'nowrap' }}>
                  <strong>Período:</strong> {fechaDesde.split('-').reverse().join('/')} al {fechaHasta.split('-').reverse().join('/')}
                </div>
              )}
              {selectedComunas.length > 0 && (
                <div style={{ wordBreak: 'break-word', maxWidth: '100%' }}>
                  <strong>Comunas:</strong> {selectedComunas.length === COMUNAS.length ? 'Todas las Comunas' : selectedComunas.join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="hide-on-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 className="section-title" style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BarChart3 size={28} style={{ color: 'var(--color-highlight)' }} /> Central de Informes & Analytics
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={loadData} title="Refrescar datos"><RefreshCw size={16} className={isLoading ? 'spin' : ''} /></button>
          <button 
            className="btn btn-primary" 
            onClick={handleDownloadPDF} 
            disabled={!hasSearched || isGeneratingPdf} 
            style={{ backgroundColor: 'var(--color-highlight)', color: '#0F172A', fontWeight: '800' }}
          >
            <Download size={16} className={isGeneratingPdf ? 'spin' : ''} /> 
            {isGeneratingPdf ? 'Generando PDF...' : 'Descargar PDF'}
          </button>
        </div>
      </div>

      <div className="card hide-on-print" style={{ marginBottom: '1.5rem', padding: '16px', backgroundColor: '#F8FAFC', borderLeft: '4px solid var(--color-highlight)', overflow: 'visible', zIndex: 50 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#0F172A' }}>Filtros Principales (Grupo A)</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: '#0F172A', fontWeight: 'bold' }}>
            <input type="checkbox" checked={isComparing} onChange={(e) => setIsComparing(e.target.checked)} />
            Comparar con (Grupo B)
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          
          {/* Filtro Comunas Multi-Select */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button 
              type="button"
              className="form-control" 
              onClick={() => setShowComunaDropdown(!showComunaDropdown)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', cursor: 'pointer', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}
            >
              <span style={{ fontSize: '0.85rem', color: selectedComunas.length > 0 ? '#0F172A' : '#64748B', fontWeight: selectedComunas.length > 0 ? '600' : 'normal' }}>
                {selectedComunas.length === 0 ? 'Todas las Comunas' : `${selectedComunas.length} Comuna(s)`}
              </span>
              <ChevronDown size={16} />
            </button>
            {showComunaDropdown && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, minWidth: '240px', zIndex: 1000,
                backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '6px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)', padding: '10px', marginTop: '4px',
                maxHeight: '280px', overflowY: 'auto'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid #E2E8F0' }}>
                  <button 
                    type="button"
                    onClick={() => setSelectedComunas(selectedComunas.length === COMUNAS.length ? [] : [...COMUNAS])}
                    style={{ fontSize: '0.75rem', color: '#0284C7', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}
                  >
                    {selectedComunas.length === COMUNAS.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                  </button>
                  {selectedComunas.length > 0 && (
                    <button 
                      type="button"
                      onClick={() => setSelectedComunas([])}
                      style={{ fontSize: '0.75rem', color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                {COMUNAS.map(c => (
                  <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '0.85rem', cursor: 'pointer', color: '#334155' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedComunas.includes(c)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedComunas([...selectedComunas, c]);
                        else setSelectedComunas(selectedComunas.filter(item => item !== c));
                      }}
                    />
                    {c}
                  </label>
                ))}
              </div>
            )}
          </div>

          <select value={selectedBarrio} onChange={e=>setSelectedBarrio(e.target.value)} className="form-control" style={{ fontSize: '0.85rem' }}>
            <option value="">Todos los barrios</option>
            {barriosList.map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          <select value={selectedFuncionario} onChange={e=>setSelectedFuncionario(e.target.value)} className="form-control" style={{ fontSize: '0.85rem' }}>
            <option value="">Todos los funcionarios</option>
            {funcionariosList.map(f => <option key={f} value={f}>{f}</option>)}
          </select>

          <select value={selectedTipoReunion} onChange={e=>{ setSelectedTipoReunion(e.target.value); setSelectedTema(''); }} className="form-control" style={{ fontSize: '0.85rem' }}>
            <option value="">Tipos de evento</option>
            {Object.values(TIPOS_REUNION).map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {(selectedTipoReunion === TIPOS_REUNION.TEMATICA || selectedTipoReunion === TIPOS_REUNION.PROCESOS_CO_CREACION || selectedTipoReunion === TIPOS_REUNION.PROCESOS_INFORMATIVA) && (
            <select value={selectedTema} onChange={e=>setSelectedTema(e.target.value)} className="form-control" style={{ fontSize: '0.85rem', borderColor: '#14B8A6' }}>
              <option value="">Todos los temas</option>
              <option value="Seguridad">Seguridad</option>
              <option value="Educacion">Educacion</option>
              <option value="Salud">Salud</option>
              <option value="Ciudad Atractiva">Ciudad Atractiva</option>
              <option value="Movilidad">Movilidad</option>
            </select>
          )}

          <input type="date" value={fechaDesde} onChange={e=>setFechaDesde(e.target.value)} className="form-control" title="Fecha Desde" style={{ fontSize: '0.85rem' }} />
          <input type="date" value={fechaHasta} onChange={e=>setFechaHasta(e.target.value)} className="form-control" title="Fecha Hasta" style={{ fontSize: '0.85rem' }} />
        </div>
        {isComparing && (
          <>
            <div style={{ marginTop: '16px', marginBottom: '12px', paddingTop: '16px', borderTop: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#0F172A' }}>Filtros Secundarios (Grupo B)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              
              {/* Filtro Comunas Multi-Select B */}
              <div ref={dropdownRefB} style={{ position: 'relative' }}>
                <button 
                  type="button"
                  className="form-control" 
                  onClick={() => setShowComunaDropdownB(!showComunaDropdownB)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', cursor: 'pointer', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}
                >
                  <span style={{ fontSize: '0.85rem', color: selectedComunasB.length > 0 ? '#0F172A' : '#64748B', fontWeight: selectedComunasB.length > 0 ? '600' : 'normal' }}>
                    {selectedComunasB.length === 0 ? 'Todas las Comunas' : `${selectedComunasB.length} Comuna(s)`}
                  </span>
                  <ChevronDown size={16} />
                </button>
                {showComunaDropdownB && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, minWidth: '240px', zIndex: 1000,
                    backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '6px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)', padding: '10px', marginTop: '4px',
                    maxHeight: '280px', overflowY: 'auto'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid #E2E8F0' }}>
                      <button 
                        type="button"
                        onClick={() => setSelectedComunasB(selectedComunasB.length === COMUNAS.length ? [] : [...COMUNAS])}
                        style={{ fontSize: '0.75rem', color: '#0284C7', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}
                      >
                        {selectedComunasB.length === COMUNAS.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                      </button>
                      {selectedComunasB.length > 0 && (
                        <button 
                          type="button"
                          onClick={() => setSelectedComunasB([])}
                          style={{ fontSize: '0.75rem', color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          Limpiar
                        </button>
                      )}
                    </div>
                    {COMUNAS.map(c => (
                      <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '0.85rem', cursor: 'pointer', color: '#334155' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedComunasB.includes(c)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedComunasB([...selectedComunasB, c]);
                            else setSelectedComunasB(selectedComunasB.filter(item => item !== c));
                          }}
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <select value={selectedBarrioB} onChange={e=>setSelectedBarrioB(e.target.value)} className="form-control" style={{ fontSize: '0.85rem' }}>
                <option value="">Todos los barrios</option>
                {barriosListB.map(b => <option key={b} value={b}>{b}</option>)}
              </select>

              <select value={selectedFuncionarioB} onChange={e=>setSelectedFuncionarioB(e.target.value)} className="form-control" style={{ fontSize: '0.85rem' }}>
                <option value="">Todos los funcionarios</option>
                {funcionariosList.map(f => <option key={f} value={f}>{f}</option>)}
              </select>

              <select value={selectedTipoReunionB} onChange={e=>{ setSelectedTipoReunionB(e.target.value); setSelectedTemaB(''); }} className="form-control" style={{ fontSize: '0.85rem' }}>
                <option value="">Tipos de evento</option>
                {Object.values(TIPOS_REUNION).map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              {(selectedTipoReunionB === TIPOS_REUNION.TEMATICA || selectedTipoReunionB === TIPOS_REUNION.PROCESOS_CO_CREACION || selectedTipoReunionB === TIPOS_REUNION.PROCESOS_INFORMATIVA) && (
                <select value={selectedTemaB} onChange={e=>setSelectedTemaB(e.target.value)} className="form-control" style={{ fontSize: '0.85rem', borderColor: '#F59E0B' }}>
                  <option value="">Todos los temas</option>
                  <option value="Seguridad">Seguridad</option>
                  <option value="Educacion">Educacion</option>
                  <option value="Salud">Salud</option>
                  <option value="Ciudad Atractiva">Ciudad Atractiva</option>
                  <option value="Movilidad">Movilidad</option>
                </select>
              )}

              <input type="date" value={fechaDesdeB} onChange={e=>setFechaDesdeB(e.target.value)} className="form-control" title="Fecha Desde B" style={{ fontSize: '0.85rem' }} />
              <input type="date" value={fechaHastaB} onChange={e=>setFechaHastaB(e.target.value)} className="form-control" title="Fecha Hasta B" style={{ fontSize: '0.85rem' }} />
            </div>
          </>
        )}


        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
            {selectedComunas.length > 0 && <span style={{ marginRight: '12px' }}>Comunas: <strong>{selectedComunas.length}</strong></span>}
            {selectedBarrio && <span style={{ marginRight: '12px' }}>Barrio: <strong>{selectedBarrio}</strong></span>}
            {selectedFuncionario && <span>Funcionario: <strong>{selectedFuncionario}</strong></span>}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(selectedComunas.length > 0 || selectedBarrio || selectedFuncionario || selectedTipoReunion || fechaDesde || fechaHasta) && (
              <button 
                type="button" 
                onClick={() => {
                  setSelectedComunas([]);
                  setSelectedBarrio('');
                  setSelectedFuncionario('');
                  setSelectedTipoReunion('');
                  setSelectedTema('');
                  setSelectedTemaB('');
                  setFechaDesde('');
                  setFechaHasta('');
                }} 
                className="btn btn-secondary" 
                style={{ fontSize: '0.85rem' }}
              >
                Limpiar Filtros
              </button>
            )}
            <button onClick={loadData} className="btn btn-primary" style={{ backgroundColor: 'var(--color-highlight)', color: '#0F172A', fontWeight: '800' }}>
              <Search size={18} /> Generar Informe
            </button>
          </div>
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
              En el período seleccionado se realizaron <strong>{kpis.actual.convocatorias.toLocaleString('es-AR')} convocatorias</strong> que alcanzaron a <strong>{kpis.actual.vecinosUnicos.toLocaleString('es-AR')} vecinos únicos</strong>, con una tasa de conversión del <strong>{(kpis.actual.conversion * 100).toFixed(1)}%</strong>. 
              {wordCloudData.length > 0 && ` La demanda ciudadana estuvo marcada por temas vinculados a: `}
              {wordCloudData.slice(0, 3).map((w,i) => <strong key={w.text}>{w.text}{i===2?'':', '}</strong>)}.
            </p>
            {(isComparing && kpisB && filteredVecinos && filteredVecinosB) && (() => {
              const idsA = new Set(filteredVecinos.map(v => v.dni || v.id));
              const overlapInscriptos = filteredVecinosB.filter(v => idsA.has(v.dni || v.id)).length;
              
              const idsAsistentesA = new Set(filteredVecinos.filter(v => v.totalAsistencias > 0).map(v => v.dni || v.id));
              const overlapAsistentes = filteredVecinosB.filter(v => v.totalAsistencias > 0 && idsAsistentesA.has(v.dni || v.id)).length;

              return (
                <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '0.9rem', color: '#334155' }}>
                  <p style={{ margin: '0 0 6px 0' }}>
                    De los <strong>{kpis.actual.vecinosUnicos.toLocaleString('es-AR')}</strong> inscriptos para {labelA}, entre los <strong>{kpisB.actual.vecinosUnicos.toLocaleString('es-AR')}</strong> inscriptos para {labelB} aparecen <strong>{overlapInscriptos.toLocaleString('es-AR')} vecinos que se repiten</strong>.
                  </p>
                  <p style={{ margin: 0 }}>
                    Y entre las <strong>{kpis.actual.asistencias.toLocaleString('es-AR')}</strong> asistencias a {labelA}, <strong>{overlapAsistentes.toLocaleString('es-AR')}</strong> de los {kpisB.actual.asistencias.toLocaleString('es-AR')} vecinos que asistieron a {labelB} también se repiten.
                  </p>
                </div>
              );
            })()}
            {insights.length > 0 && (
              <ul style={{ margin: '12px 0 0 0', paddingLeft: '20px', color: '#334155', fontSize: '0.9rem' }}>
                {insights.map((insight, idx) => <li key={idx} style={{ marginBottom: '4px' }}>{insight}</li>)}
              </ul>
            )}
          </div>

          {/* 2. BLOQUE DE KPIS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            
            <div className="card" style={{ padding: '16px', margin: 0 }}>
              <span title="Cantidad de convocatorias/mensajes enviados para asistir." style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}>CONVOCATORIA TOTAL <Info size={12}/></span>
              {!isComparing || !kpisB ? (
                <>
                  <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0F172A', marginTop: '4px' }}>{kpis.actual.convocatorias.toLocaleString('es-AR')}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600', marginTop: '2px' }}>
                    {reuniones.length} {reuniones.length === 1 ? 'reunión' : 'reuniones'}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  <div style={{ borderBottom: '1px dashed #E2E8F0', paddingBottom: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#0D9488', fontWeight: '700' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }} title={labelA}>{labelA}</span>
                      <span style={{ fontSize: '1.2rem', fontWeight: '800' }}>{kpis.actual.convocatorias.toLocaleString('es-AR')}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '600', textAlign: 'right', marginTop: '1px' }}>
                      {reuniones.length} {reuniones.length === 1 ? 'reunión' : 'reuniones'}
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#D97706', fontWeight: '700' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }} title={labelB}>{labelB}</span>
                      <span style={{ fontSize: '1.2rem', fontWeight: '800' }}>{kpisB.actual.convocatorias.toLocaleString('es-AR')}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '600', textAlign: 'right', marginTop: '1px' }}>
                      {reunionesB.length} {reunionesB.length === 1 ? 'reunión' : 'reuniones'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="card" style={{ padding: '16px', margin: 0 }}>
              <span title="Personas únicas contactadas, sin importar cuántas veces." style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}>VECINOS INSCRIPTOS ÚNICOS <Info size={12}/></span>
              {!isComparing || !kpisB ? (
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0F172A', marginTop: '4px' }}>{kpis.actual.vecinosUnicos.toLocaleString('es-AR')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#0D9488', fontWeight: '700' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }} title={labelA}>{labelA}</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '800' }}>{kpis.actual.vecinosUnicos.toLocaleString('es-AR')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#D97706', fontWeight: '700' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }} title={labelB}>{labelB}</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '800' }}>{kpisB.actual.vecinosUnicos.toLocaleString('es-AR')}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="card" style={{ padding: '16px', margin: 0 }}>
              <span title="Vecinos únicos que asistieron a al menos una reunión." style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}>VECINOS ASISTENTES ÚNICOS <Info size={12}/></span>
              {!isComparing || !kpisB ? (
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0F172A', marginTop: '4px' }}>
                  {filteredVecinos.filter(v => v.totalAsistencias > 0).length.toLocaleString('es-AR')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#0D9488', fontWeight: '700' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }} title={labelA}>{labelA}</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '800' }}>
                      {filteredVecinos.filter(v => v.totalAsistencias > 0).length.toLocaleString('es-AR')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#D97706', fontWeight: '700' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }} title={labelB}>{labelB}</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '800' }}>
                      {filteredVecinosB.filter(v => v.totalAsistencias > 0).length.toLocaleString('es-AR')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="card" style={{ padding: '16px', margin: 0 }}>
              <span title="Total de asistencias marcadas como presentes." style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}>ASISTENCIAS EFECTIVAS <Info size={12}/></span>
              {!isComparing || !kpisB ? (
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#0F172A', marginTop: '4px' }}>{kpis.actual.asistencias.toLocaleString('es-AR')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#0D9488', fontWeight: '700' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }} title={labelA}>{labelA}</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '800' }}>{kpis.actual.asistencias.toLocaleString('es-AR')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#D97706', fontWeight: '700' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }} title={labelB}>{labelB}</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '800' }}>{kpisB.actual.asistencias.toLocaleString('es-AR')}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="card" style={{ padding: '16px', margin: 0 }}>
              <span title="Relación entre Asistentes Efectivos y Convocatorias." style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}>CONVERSIÓN <Info size={12}/></span>
              {!isComparing || !kpisB ? (
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#10B981', marginTop: '4px' }}>{(kpis.actual.conversion * 100).toFixed(1)}%</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#0D9488', fontWeight: '700' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }} title={labelA}>{labelA}</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '800' }}>{(kpis.actual.conversion * 100).toFixed(1)}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#D97706', fontWeight: '700' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }} title={labelB}>{labelB}</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '800' }}>{(kpisB.actual.conversion * 100).toFixed(1)}%</span>
                  </div>
                </div>
              )}
            </div>

            <div className="card" style={{ padding: '16px', margin: 0 }}>
              <span title="Porcentaje de asistentes que tomaron la palabra." style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}>USO DE LA PALABRA <Info size={12}/></span>
              {!isComparing || !kpisB ? (
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#8B5CF6', marginTop: '4px' }}>{(kpis.actual.tasaUsoPalabra * 100).toFixed(1)}%</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#0D9488', fontWeight: '700' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }} title={labelA}>{labelA}</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '800' }}>{(kpis.actual.tasaUsoPalabra * 100).toFixed(1)}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#D97706', fontWeight: '700' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }} title={labelB}>{labelB}</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '800' }}>{(kpisB.actual.tasaUsoPalabra * 100).toFixed(1)}%</span>
                  </div>
                </div>
              )}
            </div>

            <div className="card" style={{ padding: '16px', margin: 0 }}>
              <span title="Vecinos que asistieron a más de una reunión vs los que asistieron una única vez." style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help' }}>EFECTO COMUNIDAD <Info size={12}/></span>
              {!isComparing || !kpisB ? (
                <>
                  <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#8B5CF6', marginTop: '4px' }}>
                    {filteredVecinos.filter(v => v.totalAsistencias >= 2).length.toLocaleString('es-AR')} <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#64748B' }}>reincidentes</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600', marginTop: '4px' }}>
                    {filteredVecinos.filter(v => v.totalAsistencias === 1).length.toLocaleString('es-AR')} asistieron una única vez
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  <div style={{ borderBottom: '1px dashed #E2E8F0', paddingBottom: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#0D9488', fontWeight: '700' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%' }} title={labelA}>{labelA}</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: '800' }}>
                        {filteredVecinos.filter(v => v.totalAsistencias >= 2).length} reinc. / {filteredVecinos.filter(v => v.totalAsistencias === 1).length} única
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#D97706', fontWeight: '700' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%' }} title={labelB}>{labelB}</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: '800' }}>
                        {filteredVecinosB.filter(v => v.totalAsistencias >= 2).length} reinc. / {filteredVecinosB.filter(v => v.totalAsistencias === 1).length} única
                      </span>
                    </div>
                  </div>
                </div>
              )}
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
              
              <div style={{ flex: '1 1 300px', backgroundColor: '#FFF', borderRadius: '8px', padding: '16px', border: '1px solid #E2E8F0' }}>
                {selectedWord ? (
                  <>
                    <h5 style={{ margin: '0 0 12px 0', color: '#0F172A' }}>Frases con "{selectedWord}":</h5>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#475569' }}>
                      {getFrasesForWord(selectedWord).map((f, i) => <li key={i} style={{ marginBottom: '8px' }}>"{f}"</li>)}
                    </ul>
                    <button onClick={() => setSelectedWord(null)} className="btn btn-secondary" style={{ width: '100%', marginTop: '12px' }}>Ver Ranking</button>
                  </>
                ) : (
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <h5 style={{ margin: '0 0 12px 0', color: '#0F172A', fontWeight: '700', fontSize: '0.95rem' }}>
                        Top Preocupaciones {isComparing && `(${labelA})`}:
                      </h5>
                      {topTopics.length === 0 ? (
                        <p style={{ color: '#475569', fontSize: '0.85rem', fontWeight: '500', margin: 0 }}>
                          Sin registros.
                        </p>
                      ) : (
                        <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                          <tbody>
                            {topTopics.map((w, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                <td style={{ padding: '8px 0', textTransform: 'capitalize', color: '#0F172A', fontWeight: '700', fontSize: '0.85rem' }}>
                                  <span style={{ color: '#64748B', marginRight: '6px' }}>#{i + 1}</span> {w.text}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: '800', color: '#14B8A6', fontSize: '0.85rem' }}>
                                  {w.count} {w.count === 1 ? 'vez' : 'veces'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    {isComparing && (
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <h5 style={{ margin: '0 0 12px 0', color: '#0F172A', fontWeight: '700', fontSize: '0.95rem' }}>
                          Top Preocupaciones (${labelB}):
                        </h5>
                        {topTopicsB.length === 0 ? (
                          <p style={{ color: '#475569', fontSize: '0.85rem', fontWeight: '500', margin: 0 }}>
                            Sin registros.
                          </p>
                        ) : (
                          <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                            <tbody>
                              {topTopicsB.map((w, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                  <td style={{ padding: '8px 0', textTransform: 'capitalize', color: '#0F172A', fontWeight: '700', fontSize: '0.85rem' }}>
                                    <span style={{ color: '#64748B', marginRight: '6px' }}>#{i + 1}</span> {w.text}
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: '800', color: '#F59E0B', fontSize: '0.85rem' }}>
                                    {w.count} {w.count === 1 ? 'vez' : 'veces'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. GRÁFICOS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
            
            {/* CARD SEMÁFORO POLÍTICO (ANCHO COMPLETO) */}
            <div className="card" style={{ gridColumn: '1 / -1', margin: 0, padding: '24px', backgroundColor: '#FFFFFF', borderLeft: '4px solid #EF4444' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h4 style={{ margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                    <Activity size={20} style={{ color: '#EF4444' }} /> Semáforo Político por Comuna y Evolución Temporal
                  </h4>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748B' }}>
                    Análisis del clima y riesgo político en las reuniones (Verde: Sin riesgo | Amarillo: Seguimiento | Rojo: Crítico).
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', fontWeight: '700' }}>
                    <span style={{ padding: '4px 10px', borderRadius: '20px', backgroundColor: '#D1FAE5', color: '#065F46' }}>
                      🟢 {totalVerde} Sin Riesgo
                    </span>
                    <span style={{ padding: '4px 10px', borderRadius: '20px', backgroundColor: '#FEF3C7', color: '#92400E' }}>
                      🟡 {totalAmarillo} Seguimiento
                    </span>
                    <span style={{ padding: '4px 10px', borderRadius: '20px', backgroundColor: '#FEE2E2', color: '#991B1B' }}>
                      🔴 {totalRojo} Críticos
                    </span>
                  </div>

                  <div style={{ display: 'flex', backgroundColor: '#F1F5F9', borderRadius: '6px', padding: '2px' }}>
                    <button 
                      type="button"
                      onClick={() => setSemaforoViewMode('matrix')}
                      style={{
                        padding: '4px 12px', fontSize: '0.8rem', fontWeight: '700', borderRadius: '4px', border: 'none', cursor: 'pointer',
                        backgroundColor: semaforoViewMode === 'matrix' ? '#FFF' : 'transparent',
                        color: semaforoViewMode === 'matrix' ? '#0F172A' : '#64748B',
                        boxShadow: semaforoViewMode === 'matrix' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                      }}
                    >
                      Matriz Comuna x Fecha
                    </button>
                    <button 
                      type="button"
                      onClick={() => setSemaforoViewMode('comuna')}
                      style={{
                        padding: '4px 12px', fontSize: '0.8rem', fontWeight: '700', borderRadius: '4px', border: 'none', cursor: 'pointer',
                        backgroundColor: semaforoViewMode === 'comuna' ? '#FFF' : 'transparent',
                        color: semaforoViewMode === 'comuna' ? '#0F172A' : '#64748B',
                        boxShadow: semaforoViewMode === 'comuna' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                      }}
                    >
                      Por Comuna
                    </button>
                    <button 
                      type="button"
                      onClick={() => setSemaforoViewMode('temporal')}
                      style={{
                        padding: '4px 12px', fontSize: '0.8rem', fontWeight: '700', borderRadius: '4px', border: 'none', cursor: 'pointer',
                        backgroundColor: semaforoViewMode === 'temporal' ? '#FFF' : 'transparent',
                        color: semaforoViewMode === 'temporal' ? '#0F172A' : '#64748B',
                        boxShadow: semaforoViewMode === 'temporal' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                      }}
                    >
                      Evolución Global
                    </button>
                  </div>
                </div>
              </div>

              {semaforoViewMode === 'matrix' && (
                <div style={{ overflowX: 'auto', marginTop: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px', fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '10px 12px', backgroundColor: '#F8FAFC', color: '#475569', borderRadius: '6px', minWidth: '120px', fontSize: '0.8rem' }}>
                          Comuna \ Fecha
                        </th>
                        {semaforoTimeKeys.map(timeKey => (
                          <th key={timeKey} style={{ textAlign: 'center', padding: '10px 8px', backgroundColor: '#F8FAFC', color: '#475569', borderRadius: '6px', minWidth: '85px', fontSize: '0.78rem' }}>
                            {timeKey}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {semaforoComunasSorted.map(comuna => (
                        <tr key={comuna}>
                          <td style={{ fontWeight: '700', color: '#0F172A', padding: '8px 12px', backgroundColor: '#F1F5F9', borderRadius: '6px', fontSize: '0.82rem' }}>
                            {comuna}
                          </td>
                          {semaforoTimeKeys.map(timeKey => {
                            const cell = semaforoMatrix[comuna]?.[timeKey] || { Verde: 0, Amarillo: 0, Rojo: 0, Total: 0 };
                            let bg = '#F8FAFC';
                            let textColor = '#94A3B8';
                            let badgeText = '-';

                            if (cell.Rojo > 0) {
                              bg = '#FEE2E2';
                              textColor = '#991B1B';
                              badgeText = `🔴 ${cell.Rojo}`;
                            } else if (cell.Amarillo > 0) {
                              bg = '#FEF3C7';
                              textColor = '#92400E';
                              badgeText = `🟡 ${cell.Amarillo}`;
                            } else if (cell.Verde > 0) {
                              bg = '#D1FAE5';
                              textColor = '#065F46';
                              badgeText = `🟢 ${cell.Verde}`;
                            }

                            return (
                              <td key={timeKey} style={{ textAlign: 'center', padding: '8px 6px', backgroundColor: bg, color: textColor, borderRadius: '6px', fontWeight: '800', fontSize: '0.8rem' }}>
                                {badgeText}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {semaforoViewMode === 'comuna' && (
                <div style={{ width: '100%', height: Math.max(340, semaforoComunaData.length * 28) }}>
                  <ResponsiveContainer>
                    <BarChart data={semaforoComunaData} layout="vertical" margin={{ left: 50, right: 30, top: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis dataKey="comuna" type="category" tick={{ fontSize: 11 }} width={80} interval={0} />
                      <Tooltip formatter={(val, name) => [`${val} reuniones`, name]} />
                      <Legend />
                      <Bar dataKey="Verde" name="🟢 Sin Riesgo" stackId="a" fill="#10B981" />
                      <Bar dataKey="Amarillo" name="🟡 En Seguimiento" stackId="a" fill="#F59E0B" />
                      <Bar dataKey="Rojo" name="🔴 Crítico" stackId="a" fill="#EF4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {semaforoViewMode === 'temporal' && (
                <div style={{ width: '100%', height: 320 }}>
                  <ResponsiveContainer>
                    <BarChart data={semaforoTemporalData} margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip formatter={(val, name) => [`${val} reuniones`, name]} />
                      <Legend />
                      <Bar dataKey="Verde" name="🟢 Sin Riesgo" stackId="a" fill="#10B981" />
                      <Bar dataKey="Amarillo" name="🟡 En Seguimiento" stackId="a" fill="#F59E0B" />
                      <Bar dataKey="Rojo" name="🔴 Crítico" stackId="a" fill="#EF4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            
            <div className="card" style={{ margin: 0, padding: '20px' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                 <h4 style={{ margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={18} /> Evolución Temporal
                 </h4>
                 <select value={chartGranularity} onChange={(e) => setChartGranularity(e.target.value)} className="form-control" style={{ width: 'auto', padding: '4px 8px', fontSize: '0.85rem' }}>
                   <option value="Diario">Diario</option>
                   <option value="Semanal">Semanal</option>
                   <option value="Mensual">Mensual</option>
                 </select>
               </div>
               <div style={{ width: '100%', height: 300 }}>
                 <ResponsiveContainer>
                   <LineChart data={temporalChartData} margin={{ left: 10, right: 35, top: 10, bottom: 10 }}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} />
                     <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                     <YAxis />
                     <Tooltip />
                     <Legend verticalAlign="bottom" align="center" wrapperStyle={{ paddingTop: '20px', fontSize: '0.85rem' }} />
                     {(!isComparing || !kpisB) ? (
                       <>
                         <Line type="monotone" dataKey="ConvocatoriasA" name="Inscriptos (Convocatoria)" stroke="#2563EB" strokeWidth={2} strokeDasharray="3 3" />
                         <Line type="monotone" dataKey="AsistenciasA" name="Asistencias Efectivas" stroke="#10B981" strokeWidth={3} />
                       </>
                     ) : (
                       <>
                         <Line type="monotone" dataKey="ConvocatoriasA" name={`Inscriptos (${labelA})`} stroke="#06B6D4" strokeWidth={2} strokeDasharray="4 4" />
                         <Line type="monotone" dataKey="ConvocatoriasB" name={`Inscriptos (${labelB})`} stroke="#FB923C" strokeWidth={2} strokeDasharray="4 4" />
                         <Line type="monotone" dataKey="AsistenciasA" name={`Asistencias (${labelA})`} stroke="#0D9488" strokeWidth={3} />
                         <Line type="monotone" dataKey="AsistenciasB" name={`Asistencias (${labelB})`} stroke="#EA580C" strokeWidth={3} />
                       </>
                     )}
                   </LineChart>
                 </ResponsiveContainer>
               </div>
            </div>

            <div className="card" style={{ margin: 0, padding: '20px' }}>
               <h4 style={{ margin: '0 0 16px 0', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Map size={18} /> Ranking Territorial
               </h4>
               <div style={{ width: '100%', height: Math.max(380, territorialChartData.length * 28) }}>
                 <ResponsiveContainer>
                   <BarChart data={territorialChartData} layout="vertical" margin={{ left: 50, right: 20 }}>
                     <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                     <XAxis type="number" />
                     <YAxis dataKey="comuna" type="category" tick={{ fontSize: 11 }} width={80} interval={0} />
                     <Tooltip />
                     <Legend />
                     {(!isComparing || !kpisB) ? (
                       <>
                         <Bar dataKey="ConvocadosA" name="Convocados" fill="#94A3B8" />
                         <Bar dataKey="AsistentesA" name="Asistentes" fill="#14B8A6" onClick={(data) => handleDrillDown('comuna', data.comuna)} style={{ cursor: 'pointer' }} />
                       </>
                     ) : (
                       <>
                         <Bar dataKey="AsistentesA" name={labelA} fill="#14B8A6" onClick={(data) => handleDrillDown('comuna', data.comuna)} style={{ cursor: 'pointer' }} />
                         <Bar dataKey="AsistentesB" name={labelB} fill="#F59E0B" style={{ cursor: 'pointer' }} />
                       </>
                     )}
                   </BarChart>
                 </ResponsiveContainer>
               </div>
            </div>

            <div className="card" style={{ margin: 0, padding: '20px' }}>
               <h4 style={{ margin: '0 0 16px 0', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} /> Ranking por Funcionario
               </h4>
               <div style={{ width: '100%', height: 350 }}>
                 <ResponsiveContainer>
                   <BarChart data={funcionarioChartData} layout="vertical" margin={{ left: 50, right: 20 }}>
                     <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                     <XAxis type="number" />
                     <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} interval={0} />
                     <Tooltip />
                     <Legend />
                     {(!isComparing || !kpisB) ? (
                       <>
                         <Bar dataKey="ConvocadosA" name="Convocados" fill="#94A3B8" />
                         <Bar dataKey="AsistentesA" name="Asistentes" fill="#3B82F6" />
                       </>
                     ) : (
                       <>
                         <Bar dataKey="AsistentesA" name={labelA} fill="#14B8A6" />
                         <Bar dataKey="AsistentesB" name={labelB} fill="#F59E0B" />
                       </>
                     )}
                   </BarChart>
                 </ResponsiveContainer>
               </div>
            </div>

            {/* 5. Gráfico Inscriptos y Asistentes por Comuna y por Mes */}
            <div className="card" style={{ margin: 0, padding: '20px', gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <h4 style={{ margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <BarChart3 size={18} style={{ color: 'var(--color-highlight)' }} /> Inscriptos y Asistentes por Comuna y por Mes
                </h4>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: '600' }}>Comuna:</span>
                    <select 
                      value={selectedComunaChart} 
                      onChange={(e) => setSelectedComunaChart(e.target.value)} 
                      className="form-control" 
                      style={{ width: 'auto', padding: '4px 8px', fontSize: '0.85rem' }}
                    >
                      <option value="TODAS">Todas las Comunas</option>
                      {availableComunasForChart.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: '600' }}>Mes:</span>
                    <select 
                      value={selectedMesChart} 
                      onChange={(e) => setSelectedMesChart(e.target.value)} 
                      className="form-control" 
                      style={{ width: 'auto', padding: '4px 8px', fontSize: '0.85rem' }}
                    >
                      <option value="TODOS">Todos los Meses</option>
                      {availableMesesForChart.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ width: '100%', height: Math.max(340, comunaMesChartData.length * 30) }}>
                <ResponsiveContainer>
                  <BarChart 
                    data={comunaMesChartData} 
                    layout={comunaMesChartLayout} 
                    margin={{ left: comunaMesChartLayout === 'vertical' ? 50 : 10, right: 30, top: 10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={comunaMesChartLayout !== 'vertical'} horizontal={comunaMesChartLayout === 'vertical'} />
                    {comunaMesChartLayout === 'vertical' ? (
                      <>
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} interval={0} />
                      </>
                    ) : (
                      <>
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis />
                      </>
                    )}
                    <Tooltip formatter={(val, name) => [`${val} personas`, name]} />
                    <Legend verticalAlign="bottom" align="center" wrapperStyle={{ paddingTop: '16px', fontSize: '0.85rem' }} />
                    <Bar dataKey="Inscriptos" name="Inscriptos (Convocatoria)" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Asistentes" name="Asistentes Efectivos" fill="#10B981" radius={[4, 4, 0, 0]} />
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
