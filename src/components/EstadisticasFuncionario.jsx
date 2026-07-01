import React, { useState, useEffect } from 'react';
import { getFuncionariosList, getFuncionarioStats } from '../services/supabaseService';
import { Calendar, Users, Award, Mic, MapPin, Radio, AlertTriangle, UserCheck, Flame, PieChart, TrendingUp, BarChart } from 'lucide-react';

export default function EstadisticasFuncionario() {
  const [funcionarios, setFuncionarios] = useState([]);
  const [selectedFuncionario, setSelectedFuncionario] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [statsData, setStatsData] = useState(null);

  // Cargar lista de funcionarios al montar
  useEffect(() => {
    const loadList = async () => {
      try {
        const { data } = await getFuncionariosList();
        if (data && data.length > 0) {
          setFuncionarios(data);
          setSelectedFuncionario(data[0]);
        }
      } catch (err) {
        console.error('Error al cargar lista de funcionarios:', err);
      } finally {
        setLoadingList(false);
      }
    };
    loadList();
  }, []);

  // Cargar estadísticas al cambiar el funcionario seleccionado
  useEffect(() => {
    if (!selectedFuncionario) return;

    const loadStats = async () => {
      setLoading(true);
      try {
        const { data } = await getFuncionarioStats(selectedFuncionario);
        if (data) {
          setStatsData(data);
        }
      } catch (err) {
        console.error('Error al cargar estadísticas:', err);
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, [selectedFuncionario]);

  if (loadingList) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: '12px' }}>
        <div className="spinner"></div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Cargando funcionarios...</p>
      </div>
    );
  }

  if (funcionarios.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
        <TrendingUp size={48} style={{ color: '#94A3B8', marginBottom: '1rem' }} />
        <h3 style={{ fontSize: '1.2rem', color: 'var(--color-primary)' }}>No hay funcionarios registrados</h3>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '6px' }}>Crea al menos una reunión con un funcionario a cargo para habilitar este panel.</p>
      </div>
    );
  }

  // --- MATEMÁTICA Y AGREGACIONES EN CLIENTE ---
  const meetings = statsData?.meetings || [];
  const attendance = statsData?.attendance || [];
  const speakers = statsData?.speakers || [];

  const totalReuniones = meetings.length;
  
  const hasNoData = totalReuniones === 0;

  // 1. KPIs Banner
  const totalInscriptos = attendance.length;
  const totalAsistentes = attendance.filter(a => a.asistio).length;
  const tasaEfectividad = totalInscriptos > 0 ? ((totalAsistentes / totalInscriptos) * 100).toFixed(1) : 0;

  const attendanceByMeeting = {};
  meetings.forEach(m => {
    attendanceByMeeting[m.id] = { m, present: 0 };
  });
  attendance.forEach(a => {
    if (a.asistio && attendanceByMeeting[a.reunion_id]) {
      attendanceByMeeting[a.reunion_id].present++;
    }
  });

  const meetingList = Object.values(attendanceByMeeting);
  let maxMeeting = null;
  let minMeeting = null;
  if (meetingList.length > 0) {
    maxMeeting = meetingList.reduce((max, curr) => curr.present > max.present ? curr : max, meetingList[0]);
    minMeeting = meetingList.reduce((min, curr) => curr.present < min.present ? curr : min, meetingList[0]);
  }

  // 2. Fidelidad
  const uniqueNeighbors = [...new Set(attendance.filter(a => a.asistio).map(a => a.vecino_id))];
  const totalUniqueNeighbors = uniqueNeighbors.length;

  const attendanceCountPerNeighbor = {};
  attendance.filter(a => a.asistio).forEach(a => {
    attendanceCountPerNeighbor[a.vecino_id] = (attendanceCountPerNeighbor[a.vecino_id] || 0) + 1;
  });
  const reincidentesCount = Object.values(attendanceCountPerNeighbor).filter(count => count >= 2).length;
  const tasaReincidencia = totalUniqueNeighbors > 0 ? ((reincidentesCount / totalUniqueNeighbors) * 100).toFixed(1) : 0;

  const neighborAttendanceProfile = {};
  attendance.forEach(a => {
    if (!neighborAttendanceProfile[a.vecino_id]) {
      neighborAttendanceProfile[a.vecino_id] = { vecino: a.vecino, inscriptoCount: 0, asistioCount: 0 };
    }
    neighborAttendanceProfile[a.vecino_id].inscriptoCount++;
    if (a.asistio) {
      neighborAttendanceProfile[a.vecino_id].asistioCount++;
    }
  });

  const ausentesCronicos = Object.values(neighborAttendanceProfile)
    .filter(p => p.inscriptoCount >= 3 && p.asistioCount === 0)
    .map(p => ({
      dni: p.vecino?.dni || 'S/D',
      nombre: p.vecino?.nombre || 'Vecino',
      apellido: p.vecino?.apellido || 'Desconocido',
      inscriptoCount: p.inscriptoCount
    }))
    .sort((a, b) => b.inscriptoCount - a.inscriptoCount);

  const totalWalkins = attendance.filter(a => a.asistio && a.estado_convocatoria === 'walk_in').length;
  const ratioWalkins = totalAsistentes > 0 ? ((totalWalkins / totalAsistentes) * 100).toFixed(1) : 0;

  // 3. Oradores
  const totalOradoresEfectivos = speakers.filter(s => s.estado === 'hablo').length;
  const promedioOradores = totalReuniones > 0 ? (totalOradoresEfectivos / totalReuniones).toFixed(1) : 0;
  const tasaMicAbierto = totalAsistentes > 0 ? ((totalOradoresEfectivos / totalAsistentes) * 100).toFixed(1) : 0;

  const speakerCountPerNeighbor = {};
  speakers.filter(s => s.estado === 'hablo').forEach(s => {
    if (!speakerCountPerNeighbor[s.vecino_id]) {
      speakerCountPerNeighbor[s.vecino_id] = { vecino: s.vecino, count: 0 };
    }
    speakerCountPerNeighbor[s.vecino_id].count++;
  });
  const oradoresCronicos = Object.values(speakerCountPerNeighbor)
    .filter(p => p.count >= 2)
    .map(p => ({
      dni: p.vecino?.dni || 'S/D',
      nombre: p.vecino?.nombre || 'Vecino',
      apellido: p.vecino?.apellido || 'Desconocido',
      count: p.count
    }))
    .sort((a, b) => b.count - a.count);

  // 4. Canales
  const channelDistribution = {};
  attendance.filter(a => a.asistio).forEach(a => {
    const channel = a.como_se_entero || 'Otro';
    channelDistribution[channel] = (channelDistribution[channel] || 0) + 1;
  });
  const channelList = Object.entries(channelDistribution)
    .map(([name, count]) => ({
      name,
      count,
      pct: totalAsistentes > 0 ? ((count / totalAsistentes) * 100).toFixed(1) : 0
    }))
    .sort((a, b) => b.count - a.count);

  // 5. Geografía
  const comunaDistribution = {};
  const meetingComunas = {};
  meetings.forEach(m => {
    meetingComunas[m.id] = m.comuna || 'Comuna 1';
  });
  attendance.filter(a => a.asistio).forEach(a => {
    const comuna = meetingComunas[a.reunion_id] || 'Comuna 1';
    comunaDistribution[comuna] = (comunaDistribution[comuna] || 0) + 1;
  });
  const comunaList = Object.entries(comunaDistribution)
    .map(([name, count]) => ({
      name,
      count,
      pct: totalAsistentes > 0 ? ((count / totalAsistentes) * 100).toFixed(1) : 0
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* CARD SELECTOR DE FUNCIONARIO */}
      <div className="card" style={{ backgroundColor: '#FFFFFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 className="section-title" style={{ marginBottom: '4px', color: 'var(--color-primary)' }}>
            Estadísticas Estratégicas de Gestión
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            Radiografía ejecutiva y KPIs de cercanía por funcionario a cargo.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label htmlFor="funcionario-select-stats" style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--color-primary)' }}>Funcionario:</label>
          <select
            id="funcionario-select-stats"
            className="form-control"
            value={selectedFuncionario}
            onChange={(e) => setSelectedFuncionario(e.target.value)}
            disabled={loading}
            style={{ width: '220px' }}
          >
            {funcionarios.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: '12px' }}>
          <div className="spinner"></div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Procesando agregaciones en tiempo real...</p>
        </div>
      ) : hasNoData ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <TrendingUp size={48} style={{ color: '#CBD5E1', marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.2rem', color: 'var(--color-primary)' }}>Sin eventos suficientes</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '6px' }}>
            El funcionario seleccionado no registra eventos procesados en este período.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* 1. BANNER DE CONTROL GENERAL */}
          <div className="grid-4" style={{ gap: '1rem' }}>
            <div className="card" style={{ margin: 0, padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: '#EFF6FF', color: 'var(--color-primary)' }}>
                <Calendar size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: '600' }}>REUNIONES TOTALES</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--color-primary)' }}>{totalReuniones}</div>
              </div>
            </div>

            <div className="card" style={{ margin: 0, padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: '#F0FDF4', color: '#16A34A' }}>
                <Users size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: '600' }}>CONVOCATORIA TOTAL</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--color-primary)' }}>
                  {totalAsistentes} <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 'normal' }}>/ {totalInscriptos}</span>
                </div>
              </div>
            </div>

            <div className="card" style={{ margin: 0, padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: '#ECFDF5', color: 'var(--color-highlight)' }}>
                <TrendingUp size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: '600' }}>TASA EFECTIVIDAD</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--color-primary)' }}>{tasaEfectividad}%</div>
              </div>
            </div>

            <div className="card" style={{ margin: 0, padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: '#FFFDF5', color: 'var(--color-yellow)' }}>
                <Award size={22} />
              </div>
              <div style={{ width: '100%' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: '600' }}>RÉCORDS ASISTENCIA</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-primary)', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span>Máx: <strong>{maxMeeting ? `${maxMeeting.present} vec.` : '-'}</strong></span>
                  <span>Mín: <strong>{minMeeting ? `${minMeeting.present} vec.` : '-'}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. ANÁLISIS DE FIDELIDAD Y ROTACIÓN & AUSENTES CRÓNICOS */}
          <div className="grid-2" style={{ gap: '1.5rem' }}>
            <div className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyBetween: 'space-between' }}>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--color-primary)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UserCheck size={18} style={{ color: 'var(--color-highlight)' }} />
                Análisis de Fidelidad y Rotación
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: '700', color: 'var(--color-primary)' }}>{totalUniqueNeighbors}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Vecinos Únicos Alcanzados</div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'right', maxWidth: '180px' }}>
                    Ciudadanos físicos acreditados en sus reuniones.
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: '700', color: 'var(--color-primary)' }}>{tasaReincidencia}%</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Tasa de Reincidencia</div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'right', maxWidth: '180px' }}>
                    {reincidentesCount} vecinos asistieron a 2 o más eventos.
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: '700', color: 'var(--color-primary)' }}>{ratioWalkins}%</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Ratio de Walk-ins</div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'right', maxWidth: '180px' }}>
                    {totalWalkins} vecinos entraron de forma espontánea.
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ margin: 0 }}>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--color-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={18} style={{ color: 'var(--color-yellow)' }} />
                Ausentes Crónicos (Inscriptos Seriales)
              </h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginBottom: '1rem' }}>
                Vecinos registrados a 3 o más reuniones que faltaron a todas. Posible base inflada.
              </p>

              {ausentesCronicos.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: '8px', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  No se detectan ausentes crónicos para este funcionario.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', maxHeight: '185px' }}>
                  <table className="table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>DNI</th>
                        <th>Vecino</th>
                        <th style={{ textAlign: 'center' }}>Inscripciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ausentesCronicos.slice(0, 5).map((v, i) => (
                        <tr key={i}>
                          <td>{v.dni}</td>
                          <td>{v.apellido}, {v.nombre}</td>
                          <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#EF4444' }}>{v.inscriptoCount} Faltas</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {ausentesCronicos.length > 5 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '6px', textAlign: 'right' }}>
                      * Mostrando 5 de {ausentesCronicos.length} ausentes crónicos.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 3. EL TERMÓMETRO DEL MICRÓFONO & ORADORES CRÓNICOS */}
          <div className="grid-2" style={{ gap: '1.5rem' }}>
            <div className="card" style={{ margin: 0 }}>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--color-primary)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Mic size={18} style={{ color: 'var(--color-highlight)' }} />
                Termómetro del Micrófono
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1.5rem' }}>
                <div style={{ backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--color-primary)' }}>{promedioOradores}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Oradores prom. por evento</div>
                </div>

                <div style={{ backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--color-primary)' }}>{tasaMicAbierto}%</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Tasa Micrófono Abierto</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#F0FDF4', border: '1px solid #16A34A', borderRadius: '8px', padding: '10px' }}>
                <Flame size={20} style={{ color: '#16A34A', flexShrink: 0 }} />
                <span style={{ fontSize: '0.75rem', color: '#15803D' }}>
                  Del total de asistentes físicos a las reuniones de {selectedFuncionario}, el <strong>{tasaMicAbierto}%</strong> tomó la palabra en la cola oficial.
                </span>
              </div>
            </div>

            <div className="card" style={{ margin: 0 }}>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--color-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={18} style={{ color: '#EF4444' }} />
                Monopolio del Micrófono (Oradores Crónicos)
              </h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginBottom: '1rem' }}>
                Vecinos que han tomado la palabra 2 o más veces con este funcionario. Identificación de ciudadanos hiperactivos.
              </p>

              {oradoresCronicos.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: '8px', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  No se registran oradores recurrentes con este funcionario.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', maxHeight: '185px' }}>
                  <table className="table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>DNI</th>
                        <th>Vecino</th>
                        <th style={{ textAlign: 'center' }}>Oratorias</th>
                      </tr>
                    </thead>
                    <tbody>
                      {oradoresCronicos.slice(0, 5).map((v, i) => (
                        <tr key={i}>
                          <td>{v.dni}</td>
                          <td>{v.apellido}, {v.nombre}</td>
                          <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--color-highlight)' }}>{v.count} Veces</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {oradoresCronicos.length > 5 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '6px', textAlign: 'right' }}>
                      * Mostrando 5 de {oradoresCronicos.length} oradores crónicos.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 4. CANALES DE DIFUSIÓN & GEOGRAFÍA */}
          <div className="grid-2" style={{ gap: '1.5rem' }}>
            <div className="card" style={{ margin: 0 }}>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--color-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <PieChart size={18} style={{ color: 'var(--color-highlight)' }} />
                Efectividad de Canales de Difusión (Solo Presentes)
              </h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginBottom: '1.25rem' }}>
                Muestra el origen de convocatoria declarado únicamente por las personas que **asistieron físicamente**.
              </p>

              {channelList.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  Sin datos declarados en asistencia.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {channelList.map((ch, idx) => (
                    <div key={idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: '600', marginBottom: '3px' }}>
                        <span>{ch.name}</span>
                        <span>{ch.count} vec. ({ch.pct}%)</span>
                      </div>
                      <div style={{ height: '8px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${ch.pct}%`, backgroundColor: idx === 0 ? 'var(--color-highlight)' : idx === 1 ? 'var(--color-mint)' : '#64748B', borderRadius: '4px' }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card" style={{ margin: 0 }}>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--color-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <BarChart size={18} style={{ color: 'var(--color-highlight)' }} />
                Rendimiento Geográfico por Comuna
              </h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginBottom: '1.25rem' }}>
                Distribución territorial de asistentes físicos agrupados por la comuna de la reunión.
              </p>

              {comunaList.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  Sin datos geográficos.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {comunaList.map((co, idx) => (
                    <div key={idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: '600', marginBottom: '3px' }}>
                        <span>{co.name}</span>
                        <span>{co.count} vec. ({co.pct}%)</span>
                      </div>
                      <div style={{ height: '8px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${co.pct}%`, backgroundColor: idx === 0 ? 'var(--color-highlight)' : '#CBD5E1', borderRadius: '4px' }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
