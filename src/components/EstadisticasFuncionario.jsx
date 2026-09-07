import React, { useState, useEffect } from 'react';
import { Calendar, FileSpreadsheet, Users, Download, Filter, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { TIPOS_REUNION } from '../data/mockData';
import * as XLSX from 'xlsx';

// Helper para calcular lunes y domingo de la semana actual por defecto
const getWeekDates = (offsetWeeks = 0) => {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + (offsetWeeks * 7));
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  };

  return {
    desde: formatDate(monday),
    hasta: formatDate(sunday)
  };
};

export default function DescargaBloqueAsistencias() {
  const defaultWeek = getWeekDates(0);
  const [fechaDesde, setFechaDesde] = useState(defaultWeek.desde);
  const [fechaHasta, setFechaHasta] = useState(defaultWeek.hasta);
  const [filtroComuna, setFiltroComuna] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  
  const [reuniones, setReuniones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Cargar reuniones del período seleccionado
  useEffect(() => {
    loadReuniones();
  }, [fechaDesde, fechaHasta, filtroComuna, filtroTipo]);

  const loadReuniones = async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('reuniones')
        .select(`
          id,
          nombre,
          fecha,
          comuna,
          barrio,
          barrio_evento,
          funcionario,
          tipo_reunion,
          tema,
          lugar,
          inscripciones_asistencias(
            id,
            asistio,
            vecino_id
          )
        `)
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha', { ascending: true });

      if (filtroComuna) {
        query = query.eq('comuna', filtroComuna);
      }

      if (filtroTipo) {
        query = query.eq('tipo_reunion', filtroTipo);
      }

      const { data, error: errFetch } = await query;
      if (errFetch) throw errFetch;

      const formatted = (data || []).map(r => {
        const inscripciones = r.inscripciones_asistencias || [];
        const inscriptosCount = inscripciones.length;
        const presentesCount = inscripciones.filter(i => i.asistio === true).length;
        return {
          ...r,
          inscriptosCount,
          presentesCount
        };
      });

      setReuniones(formatted);
    } catch (err) {
      console.error('Error al cargar reuniones del bloque:', err);
      setError('No se pudieron cargar las reuniones del período seleccionado.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPreset = (preset) => {
    if (preset === 'esta_semana') {
      const w = getWeekDates(0);
      setFechaDesde(w.desde);
      setFechaHasta(w.hasta);
    } else if (preset === 'semana_anterior') {
      const w = getWeekDates(-1);
      setFechaDesde(w.desde);
      setFechaHasta(w.hasta);
    } else if (preset === 'este_mes') {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      setFechaDesde(`${year}-${month}-01`);
      setFechaHasta(`${year}-${month}-${String(lastDay).padStart(2, '0')}`);
    }
  };

  // Exportar todas las asistencias del bloque seleccionado
  const handleExportConsolidadoBloque = async () => {
    if (reuniones.length === 0) {
      alert('No hay reuniones registradas en el período seleccionado para descargar.');
      return;
    }

    setExporting(true);
    setExportSuccess(false);
    setError(null);

    try {
      const reunionIds = reuniones.map(r => r.id);

      // 1. Obtener todas las asistencias efectivas (asistio = true) de estas reuniones
      let todasAsistencias = [];
      const chunkSize = 50;

      for (let i = 0; i < reunionIds.length; i += chunkSize) {
        const chunkIds = reunionIds.slice(i, i + chunkSize);
        const { data, error: errAsist } = await supabase
          .from('inscripciones_asistencias')
          .select(`
            id,
            reunion_id,
            vecino_id,
            asistio,
            como_se_entero,
            invitado_por,
            tema_previo,
            horario_bloque_asignado,
            vecino:vecinos(
              dni,
              nombre,
              apellido,
              celular,
              email,
              barrio,
              comuna
            )
          `)
          .in('reunion_id', chunkIds)
          .eq('asistio', true);

        if (errAsist) throw errAsist;
        if (data) todasAsistencias = [...todasAsistencias, ...data];
      }

      if (todasAsistencias.length === 0) {
        alert('No se encontraron vecinos con asistencia confirmada (presentes) en las reuniones de este bloque.');
        setExporting(false);
        return;
      }

      // 2. Obtener temas de oradores para todas las reuniones
      let oradoresMap = {};
      for (let i = 0; i < reunionIds.length; i += chunkSize) {
        const chunkIds = reunionIds.slice(i, i + chunkSize);
        const { data: oradoresData } = await supabase
          .from('oradores')
          .select('reunion_id, vecino_id, tema_efectivo, tema_original')
          .in('reunion_id', chunkIds);

        if (oradoresData) {
          oradoresData.forEach(o => {
            const tema = o.tema_efectivo || o.tema_original || '';
            if (o.vecino_id) oradoresMap[`${o.reunion_id}_${String(o.vecino_id).trim()}`] = tema;
          });
        }
      }

      // 3. Consultar historial previo de los asistentes para catalogar 1ª Vez vs Recurrente
      const todosDnis = [...new Set(todasAsistencias.map(a => a.vecino?.dni || a.vecino_id).filter(Boolean))];
      let recurrentesDniSet = new Set();

      for (let i = 0; i < todosDnis.length; i += 100) {
        const chunkDnis = todosDnis.slice(i, i + 100);
        const { data: histData } = await supabase
          .from('inscripciones_asistencias')
          .select('vecino_id, reunion_id')
          .eq('asistio', true)
          .in('vecino_id', chunkDnis);

        if (histData) {
          histData.forEach(h => {
            if (h.vecino_id) {
              const countInCurrentPeriod = todasAsistencias.filter(a => String(a.vecino?.dni || a.vecino_id).trim() === String(h.vecino_id).trim()).length;
              if (!reunionIds.includes(h.reunion_id) || countInCurrentPeriod > 1) {
                recurrentesDniSet.add(String(h.vecino_id).trim());
              }
            }
          });
        }
      }

      // Mapa rápido de reuniones para lookup por ID
      const reunionesMap = {};
      reuniones.forEach(r => {
        reunionesMap[r.id] = r;
      });

      // 4. Mapear al formato exacto de exportación solicitado por Demanda Ciudadana
      const dataToExport = todasAsistencias.map(item => {
        const reunionObj = reunionesMap[item.reunion_id] || {};
        const isPrimeraPersona = reunionObj.tipo_reunion === TIPOS_REUNION.PRIMERA_PERSONA;
        const dniVal = item.vecino?.dni || item.vecino_id || '';
        const cleanDni = String(dniVal).trim();
        const isRecurrente = recurrentesDniSet.has(cleanDni);
        const vezStr = isRecurrente ? 'Recurrente' : '1ª Vez';
        
        const temaOradorKey = `${item.reunion_id}_${cleanDni}`;
        const temaOrador = oradoresMap[temaOradorKey] || item.tema_previo || reunionObj.tema || '';

        return {
          'fecha': reunionObj.fecha || '',
          'comuna': reunionObj.comuna || '',
          'medio': item.como_se_entero || '',
          'vez': vezStr,
          'nombre': item.vecino?.nombre || '',
          'apellido': item.vecino?.apellido || '',
          'dni': dniVal,
          'email': item.vecino?.email || '',
          'telefono': item.vecino?.celular || '',
          'campaña': item.invitado_por || '',
          'funcionario': reunionObj.funcionario || '',
          'barrio': reunionObj.barrio_evento || reunionObj.barrio || item.vecino?.barrio || '',
          'tema': temaOrador,
          'personalidad': isPrimeraPersona ? (reunionObj.tema || reunionObj.funcionario || '') : ''
        };
      });

      // Ordenar por fecha y comuna
      dataToExport.sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
        return a.comuna.localeCompare(b.comuna);
      });

      // 5. Generar archivo Excel con SheetJS
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Asistencias_Bloque');

      const fileName = `Asistencias_Bloque_${fechaDesde}_a_${fechaHasta}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 4000);
    } catch (err) {
      console.error('Error al exportar bloque de asistencias:', err);
      setError('Ocurrió un error al generar la descarga del bloque.');
      alert('Error al generar la descarga: ' + (err.message || 'Error desconocido'));
    } finally {
      setExporting(false);
    }
  };

  // Cálculos de KPIs agregados
  const totalReuniones = reuniones.length;
  const totalInscriptos = reuniones.reduce((acc, r) => acc + (r.inscriptosCount || 0), 0);
  const totalAsistentes = reuniones.reduce((acc, r) => acc + (r.presentesCount || 0), 0);
  const porcentajeAsistencia = totalInscriptos > 0 ? Math.round((totalAsistentes / totalInscriptos) * 100) : 0;

  return (
    <div>
      {/* Encabezado */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', color: 'var(--color-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={22} style={{ color: 'var(--color-highlight)' }} />
            Descarga Bloque de Asistencias (Demanda Ciudadana)
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', margin: '4px 0 0 0' }}>
            Bajada consolidada de todas las asistencias de un período o bloque en un único archivo Excel con el formato oficial.
          </p>
        </div>

        {/* Botón Principal de Descarga */}
        <button
          className="btn btn-primary"
          onClick={handleExportConsolidadoBloque}
          disabled={loading || exporting || totalAsistentes === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            fontSize: '0.9rem',
            fontWeight: '700',
            backgroundColor: exportSuccess ? '#059669' : 'var(--color-primary)',
            borderColor: exportSuccess ? '#059669' : 'var(--color-primary)',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
          }}
        >
          {exporting ? (
            <>
              <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
              Consolidando {totalAsistentes} asistencias...
            </>
          ) : exportSuccess ? (
            <>
              <CheckCircle size={18} /> ¡Archivo Excel Descargado!
            </>
          ) : (
            <>
              <Download size={18} /> Descargar todas las asistencias del bloque ({totalAsistentes})
            </>
          )}
        </button>
      </div>

      {/* Alerta de error si ocurre */}
      {error && (
        <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '12px 16px', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Barra de Filtros y Rango de Fechas */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '16px', backgroundColor: '#FFFFFF' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={16} /> Filtro por Rango de Fechas (Desde - Hasta)
          </span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleSetPreset('esta_semana')}
              style={{ fontSize: '0.78rem', padding: '4px 10px', backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', fontWeight: '600' }}
            >
              📅 Esta Semana
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleSetPreset('semana_anterior')}
              style={{ fontSize: '0.78rem', padding: '4px 10px' }}
            >
              ⏮️ Semana Anterior
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleSetPreset('este_mes')}
              style={{ fontSize: '0.78rem', padding: '4px 10px' }}
            >
              🗓️ Todo el Mes
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-dark)', display: 'block', marginBottom: '4px' }}>
              Fecha Desde
            </label>
            <input
              type="date"
              className="form-control form-control-sm"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              style={{ fontSize: '0.85rem' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-dark)', display: 'block', marginBottom: '4px' }}>
              Fecha Hasta
            </label>
            <input
              type="date"
              className="form-control form-control-sm"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              style={{ fontSize: '0.85rem' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-dark)', display: 'block', marginBottom: '4px' }}>
              Comuna (Opcional)
            </label>
            <select
              className="form-control form-control-sm"
              value={filtroComuna}
              onChange={(e) => setFiltroComuna(e.target.value)}
              style={{ fontSize: '0.85rem' }}
            >
              <option value="">Todas las Comunas</option>
              {Array.from({ length: 15 }, (_, i) => `Comuna ${i + 1}`).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-dark)', display: 'block', marginBottom: '4px' }}>
              Tipo de Evento (Opcional)
            </label>
            <select
              className="form-control form-control-sm"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              style={{ fontSize: '0.85rem' }}
            >
              <option value="">Todos los Tipos</option>
              {Object.values(TIPOS_REUNION).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards de Resumen del Bloque */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '16px', textAlign: 'center', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
          <div style={{ fontSize: '0.8rem', color: '#1E40AF', fontWeight: '700', textTransform: 'uppercase' }}>Reuniones en el Bloque</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#1E3A8A', marginTop: '4px' }}>{totalReuniones}</div>
        </div>

        <div className="card" style={{ padding: '16px', textAlign: 'center', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
          <div style={{ fontSize: '0.8rem', color: '#065F46', fontWeight: '700', textTransform: 'uppercase' }}>Total Asistencias Efectivas</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#047857', marginTop: '4px' }}>{totalAsistentes}</div>
        </div>

        <div className="card" style={{ padding: '16px', textAlign: 'center', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '700', textTransform: 'uppercase' }}>Inscriptos Totales</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#1E293B', marginTop: '4px' }}>{totalInscriptos}</div>
        </div>

        <div className="card" style={{ padding: '16px', textAlign: 'center', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A' }}>
          <div style={{ fontSize: '0.8rem', color: '#92400E', fontWeight: '700', textTransform: 'uppercase' }}>Tasa de Asistencia</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#B45309', marginTop: '4px' }}>{porcentajeAsistencia}%</div>
        </div>
      </div>

      {/* Tabla de Reuniones Comprendidas */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-primary)', fontWeight: '700' }}>
            Reuniones y Actividades Incluidas en el Bloque ({totalReuniones})
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            Del {fechaDesde} al {fechaHasta}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <div className="spinner"></div>
            <p style={{ marginTop: '1rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Cargando reuniones del período...</p>
          </div>
        ) : reuniones.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Calendar size={40} style={{ opacity: 0.5, marginBottom: '8px' }} />
            <p style={{ margin: 0, fontWeight: '600' }}>No se encontraron reuniones en el rango seleccionado.</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem' }}>Probá cambiando las fechas o los filtros superiores.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '110px' }}>Fecha</th>
                  <th>Reunión / Actividad</th>
                  <th>Funcionario</th>
                  <th>Comuna / Barrio</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: 'center', width: '130px' }}>Asistentes</th>
                </tr>
              </thead>
              <tbody>
                {reuniones.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: '600', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {r.fecha}
                    </td>
                    <td>
                      <div style={{ fontWeight: '600', color: 'var(--color-primary)' }}>{r.nombre}</div>
                      {r.lugar && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>📍 {r.lugar}</div>}
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {r.funcionario || <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Sin asignar</span>}
                    </td>
                    <td>
                      <span className="badge badge-info" style={{ fontSize: '0.75rem', backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>
                        {r.comuna}
                      </span>
                      {r.barrio && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>{r.barrio}</div>}
                    </td>
                    <td>
                      <span className="badge badge-secondary" style={{ fontSize: '0.72rem' }}>
                        {r.tipo_reunion}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-success" style={{ backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', fontWeight: '700', fontSize: '0.8rem', padding: '3px 8px' }}>
                        👥 {r.presentesCount} / {r.inscriptosCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
