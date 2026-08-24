import React, { useState, useEffect } from 'react';
import { Sparkles, Copy, Check, RefreshCw, X, AlertTriangle, FileText, Users, MapPin, Target, MessageSquare } from 'lucide-react';
import { generateMeetingBrief, calculateInscriptosStats, splitBriefParts, generateWhatsAppPlanificacion, getFuncionarioConversionFactor } from '../services/aiBriefService';
import { getAsistentesPorReunion } from '../services/supabaseService';

export default function ModalBriefIA({ reunion, inscriptosList: initialInscriptos, isOpen, onClose }) {
  const [inscriptos, setInscriptos] = useState(initialInscriptos || []);
  const [whatsAppText, setWhatsAppText] = useState('');
  const [briefOriginalText, setBriefOriginalText] = useState('');
  const [milagrosText, setMilagrosText] = useState('');
  const [activeTab, setActiveTab] = useState('whatsapp'); // 'whatsapp' | 'brief' | 'milagros'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (isOpen && reunion) {
      loadDataAndGenerate();
    } else {
      setWhatsAppText('');
      setBriefOriginalText('');
      setMilagrosText('');
      setError(null);
      setCopied(false);
      setActiveTab('whatsapp');
    }
  }, [isOpen, reunion]);

  const loadDataAndGenerate = async () => {
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      let currentInscriptos = initialInscriptos;
      
      // Si no vienen inscriptos cargados en props, consultarlos a Supabase
      if (!currentInscriptos || currentInscriptos.length === 0) {
        const { data, error: errFetch } = await getAsistentesPorReunion(reunion.id);
        if (errFetch) throw errFetch;
        currentInscriptos = data || [];
      }

      setInscriptos(currentInscriptos);
      const convFactor = await getFuncionarioConversionFactor(reunion.funcionario);
      const computedStats = calculateInscriptosStats(currentInscriptos, convFactor);
      setStats(computedStats);

      // 1. Generar Ficha WhatsApp de Planificación y Cobertura (inmediato y determinístico)
      const waPlan = generateWhatsAppPlanificacion(reunion, currentInscriptos.length);
      setWhatsAppText(waPlan);

      if (currentInscriptos.length === 0) {
        setBriefOriginalText('Esta reunión aún no cuenta con inscriptos cargados para generar el Brief de IA.');
        setMilagrosText('No hay inscriptos registrados para analizar casos de alto impacto.');
        return;
      }

      // 2. Generar el Brief con Gemini (Brief Original + Milagros)
      const generatedFullText = await generateMeetingBrief({
        reunion,
        inscriptos: currentInscriptos
      });

      const { parte1, parte2 } = splitBriefParts(generatedFullText);
      setBriefOriginalText(parte1);
      setMilagrosText(parte2);
    } catch (err) {
      console.error('Error al generar brief IA:', err);
      setError(err.message || 'Ocurrió un error inesperado al procesar con IA.');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentText = () => {
    if (activeTab === 'whatsapp') return whatsAppText;
    if (activeTab === 'brief') return briefOriginalText;
    return milagrosText;
  };

  const handleCopyCurrent = () => {
    const text = getCurrentText();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!isOpen || !reunion) return null;

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem',
      backdropFilter: 'blur(4px)'
    }}>
      <div className="modal-content" style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '860px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid #E2E8F0'
      }}>
        {/* Cabecera del Modal */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
          color: '#ffffff'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ 
                backgroundColor: '#3B82F6', 
                color: '#ffffff', 
                padding: '4px 8px', 
                borderRadius: '6px', 
                fontSize: '0.75rem', 
                fontWeight: '700',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Sparkles size={14} /> Briefs & WhatsApp
              </span>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: '#ffffff' }}>
                Centro de Briefs y Planificación
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94A3B8' }}>
              {reunion.nombre} • {reunion.comuna || 'CABA'} {reunion.funcionario ? `• ${reunion.funcionario}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Resumen cuantitativo rápido */}
        {stats && stats.total > 0 && (
          <div style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            gap: '1.25rem',
            flexWrap: 'wrap',
            fontSize: '0.82rem',
            color: '#475569'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Users size={15} style={{ color: '#3B82F6' }} />
              <strong>{stats.total}</strong> inscriptos
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <MapPin size={15} style={{ color: '#10B981' }} />
              <span>{stats.barriosDisplay.length} grupos territoriales</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Target size={15} style={{ color: '#8B5CF6' }} />
              <span>Esperados: <strong>{stats.asistenciaEsperada}</strong> ({stats.factorPct}%)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <FileText size={15} style={{ color: '#F59E0B' }} />
              <span>{stats.preguntas.length} preguntas categorizadas</span>
            </div>
          </div>
        )}

        {/* 3 Solapas de navegación: WhatsApp | Brief Original | Milagros */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #E2E8F0',
          backgroundColor: '#F1F5F9',
          padding: '0 1.5rem'
        }}>
          {/* Solapa 1: WhatsApp */}
          <button
            type="button"
            onClick={() => setActiveTab('whatsapp')}
            style={{
              padding: '10px 18px',
              border: 'none',
              borderBottom: activeTab === 'whatsapp' ? '3px solid #16A34A' : '3px solid transparent',
              backgroundColor: activeTab === 'whatsapp' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'whatsapp' ? '#15803D' : '#64748B',
              fontWeight: '700',
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            <MessageSquare size={16} style={{ color: '#16A34A' }} /> 💬 WhatsApp
          </button>

          {/* Solapa 2: Brief Original */}
          <button
            type="button"
            onClick={() => setActiveTab('brief')}
            style={{
              padding: '10px 18px',
              border: 'none',
              borderBottom: activeTab === 'brief' ? '3px solid #2563EB' : '3px solid transparent',
              backgroundColor: activeTab === 'brief' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'brief' ? '#1D4ED8' : '#64748B',
              fontWeight: '700',
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            <FileText size={16} style={{ color: '#2563EB' }} /> 📍 Brief Original
          </button>

          {/* Solapa 3: Milagros */}
          <button
            type="button"
            onClick={() => setActiveTab('milagros')}
            style={{
              padding: '10px 18px',
              border: 'none',
              borderBottom: activeTab === 'milagros' ? '3px solid #8B5CF6' : '3px solid transparent',
              backgroundColor: activeTab === 'milagros' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'milagros' ? '#6D28D9' : '#64748B',
              fontWeight: '700',
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
          >
            <Target size={16} style={{ color: '#8B5CF6' }} /> 🎯 Milagros
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div style={{ padding: '1.25rem 1.5rem', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {loading && activeTab !== 'whatsapp' ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '3.5rem 1rem',
              gap: '16px',
              textAlign: 'center'
            }}>
              <div style={{
                position: 'relative',
                width: '60px',
                height: '60px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  border: '3px solid #E2E8F0',
                  borderTopColor: '#3B82F6',
                  animation: 'spin 1s linear infinite'
                }} />
                <Sparkles size={26} style={{ color: '#3B82F6' }} />
              </div>
              <div>
                <h4 style={{ margin: '0 0 6px 0', color: '#1E293B', fontSize: '1.05rem', fontWeight: '700' }}>
                  Generando Briefs con Inteligencia Artificial...
                </h4>
                <p style={{ margin: 0, color: '#64748B', fontSize: '0.85rem' }}>
                  Calculando recurrencia, asistencia esperada y seleccionando casos de alto impacto.
                </p>
              </div>
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          ) : error && activeTab !== 'whatsapp' ? (
            <div style={{
              padding: '1.5rem',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FCA5A5',
              borderRadius: '10px',
              color: '#991B1B',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700' }}>
                <AlertTriangle size={20} />
                No se pudo generar el Brief
              </div>
              <div style={{ fontSize: '0.9rem', color: '#7F1D1D' }}>{error}</div>
              <div>
                <button
                  type="button"
                  onClick={loadDataAndGenerate}
                  className="btn btn-secondary"
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #DC2626',
                    color: '#DC2626',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <RefreshCw size={14} /> Reintentar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#64748B' }}>
                  {activeTab === 'whatsapp' && '💬 Mensaje de Planificación y Cobertura Semanal:'}
                  {activeTab === 'brief' && '📍 Mensaje 1 — Brief Original (Territorio, Recurrencia, Asistencia, Clima y Focos):'}
                  {activeTab === 'milagros' && '🎯 Mensaje 2 — Casos de Alto Impacto / Milagros Operativos (Respuestas sugeridas):'}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Check size={14} /> Listo para WhatsApp
                </span>
              </div>
              
              {activeTab === 'whatsapp' && (
                <textarea
                  value={whatsAppText}
                  onChange={(e) => setWhatsAppText(e.target.value)}
                  placeholder="Generando mensaje de WhatsApp..."
                  style={{
                    width: '100%',
                    minHeight: '360px',
                    flex: 1,
                    padding: '14px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#F8FAFC',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    fontSize: '0.86rem',
                    lineHeight: '1.5',
                    color: '#1E293B',
                    resize: 'vertical'
                  }}
                />
              )}

              {activeTab === 'brief' && (
                <textarea
                  value={briefOriginalText}
                  onChange={(e) => setBriefOriginalText(e.target.value)}
                  placeholder="Generando Brief Original..."
                  style={{
                    width: '100%',
                    minHeight: '360px',
                    flex: 1,
                    padding: '14px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#F8FAFC',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    fontSize: '0.86rem',
                    lineHeight: '1.5',
                    color: '#1E293B',
                    resize: 'vertical'
                  }}
                />
              )}

              {activeTab === 'milagros' && (
                <textarea
                  value={milagrosText}
                  onChange={(e) => setMilagrosText(e.target.value)}
                  placeholder="Generando Milagros Operativos..."
                  style={{
                    width: '100%',
                    minHeight: '360px',
                    flex: 1,
                    padding: '14px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#F8FAFC',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    fontSize: '0.86rem',
                    lineHeight: '1.5',
                    color: '#1E293B',
                    resize: 'vertical'
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* Pie de Acciones con los 3 botones de copiado */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #E2E8F0',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div>
            <button
              type="button"
              onClick={loadDataAndGenerate}
              disabled={loading}
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem',
                fontWeight: '600',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#475569',
                cursor: loading ? 'wait' : 'pointer'
              }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              Regenerar IA
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#475569',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Cerrar
            </button>

            {/* BOTÓN 1: WhatsApp */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('whatsapp');
                if (whatsAppText) {
                  navigator.clipboard.writeText(whatsAppText);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2500);
                }
              }}
              disabled={!whatsAppText}
              className="btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: activeTab === 'whatsapp' && copied ? '#059669' : '#16A34A',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: '700',
                cursor: !whatsAppText ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 6px -1px rgba(22, 163, 74, 0.25)',
                transition: 'all 0.2s ease'
              }}
            >
              {activeTab === 'whatsapp' && copied ? <Check size={15} /> : <Copy size={15} />}
              {activeTab === 'whatsapp' && copied ? '¡WhatsApp Copiado!' : '💬 Copiar WhatsApp'}
            </button>

            {/* BOTÓN 2: Brief Original */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('brief');
                if (briefOriginalText) {
                  navigator.clipboard.writeText(briefOriginalText);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2500);
                }
              }}
              disabled={loading || !briefOriginalText}
              className="btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: activeTab === 'brief' && copied ? '#059669' : '#2563EB',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: '700',
                cursor: loading || !briefOriginalText ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.25)',
                transition: 'all 0.2s ease'
              }}
            >
              {activeTab === 'brief' && copied ? <Check size={15} /> : <Copy size={15} />}
              {activeTab === 'brief' && copied ? '¡Brief Copiado!' : '📍 Copiar Brief Original'}
            </button>

            {/* BOTÓN 3: Milagros */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('milagros');
                if (milagrosText) {
                  navigator.clipboard.writeText(milagrosText);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2500);
                }
              }}
              disabled={loading || !milagrosText}
              className="btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: activeTab === 'milagros' && copied ? '#047857' : '#8B5CF6',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: '700',
                cursor: loading || !milagrosText ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 6px -1px rgba(139, 92, 246, 0.25)',
                transition: 'all 0.2s ease'
              }}
            >
              {activeTab === 'milagros' && copied ? <Check size={15} /> : <Copy size={15} />}
              {activeTab === 'milagros' && copied ? '¡Milagros Copiados!' : '🎯 Copiar Milagros'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
