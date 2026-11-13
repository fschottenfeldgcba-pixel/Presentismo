import React, { useEffect, useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';
import '../executiveBrief.css';
import { supabase } from '../lib/supabaseClient';
import { getAsistentesPorReunion, DEFAULT_EQUIPO_CERCANIA } from '../services/supabaseService';
import {
  generateMeetingBrief,
  splitBriefParts,
  getFuncionarioConversionFactor
} from '../services/aiBriefService';
import { TIPOS_REUNION } from '../data/mockData';

/**
 * Vista Ejecutiva / Brief Diario (ruta oculta: /brief-ejecutivo).
 * UI minimalista, sans-serif, mobile-first, tono institucional (#042A38).
 */

// ---------------------------------------------------------------------------
// Utilidades y Reglas de Negocio
// ---------------------------------------------------------------------------

const AREAS = {
  CERCANIA: 'cercania',
  PROCESOS: 'procesos',
  VOLUNTARIADO: 'voluntariado'
};

const getHoyBuenosAires = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

const esMananaFecha = (fechaStr, hoyStr) => {
  if (!fechaStr || !hoyStr) return false;
  const hoyD = new Date(hoyStr + 'T12:00:00Z');
  const targetD = new Date(fechaStr + 'T12:00:00Z');
  const diffDays = Math.round((targetD - hoyD) / (1000 * 60 * 60 * 24));
  return diffDays === 1;
};

const formatFechaLarga = (isoDate) => {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const txt = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(y, m - 1, d)));
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};

const formatFechaCorta = (isoDate) => {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d}/${m}/${y}`;
};

const formatHorarioReunion = (inicio, fin) => {
  if (!inicio) return '';
  const ini = String(inicio).slice(0, 5);
  if (!fin || fin === inicio) return `${ini} hs`;
  const end = String(fin).slice(0, 5);
  return `${ini} a ${end} hs`;
};

/** Clasifica una reunión en su área de gestión según el tipo de reunión. */
function getAreaReunion(reunion) {
  const tipo = reunion?.tipo_reunion || '';
  if (
    tipo === TIPOS_REUNION.PROCESOS_CO_CREACION ||
    tipo === TIPOS_REUNION.PROCESOS_INFORMATIVA ||
    tipo.toLowerCase().startsWith('procesos participativos')
  ) {
    return AREAS.PROCESOS;
  }
  if (
    tipo === TIPOS_REUNION.EXPERIENCIAS_BA ||
    tipo === TIPOS_REUNION.VOLUNTARIADOS ||
    /voluntari/i.test(tipo) ||
    /experiencias\s*ba/i.test(tipo)
  ) {
    return AREAS.VOLUNTARIADO;
  }
  return AREAS.CERCANIA;
}

/** Determina si una reunión se gestiona por confirmados (Uno a Uno, Voluntariados, Experiencias BA). */
function esReunionBasadaEnConfirmados(reunion) {
  const tipo = reunion?.tipo_reunion || '';
  return (
    tipo === TIPOS_REUNION.UNO_A_UNO ||
    /uno\s*a\s*uno/i.test(tipo) ||
    /1\s*a\s*1/i.test(tipo) ||
    tipo === TIPOS_REUNION.EXPERIENCIAS_BA ||
    tipo === TIPOS_REUNION.VOLUNTARIADOS ||
    /voluntari/i.test(tipo) ||
    /experiencias\s*ba/i.test(tipo)
  );
}

/** Filtra los asistentes que cuentan con confirmación efectiva. */
function getConfirmados(asistentes = []) {
  return asistentes.filter(
    (a) =>
      Boolean(a.confirmado) ||
      a.estado_convocatoria === 'seleccionado_uno_a_uno' ||
      a.estado_convocatoria === 'citado'
  );
}

/** Agrupa N (reuniones), X (participantes según regla) e Y (asistencia esperada) por área. */
function calcularResumenPorArea(reuniones) {
  const base = () => ({ n: 0, x: 0, y: 0, confirmadosCount: 0 });
  return reuniones.reduce(
    (acc, r) => {
      const area = getAreaReunion(r);
      acc[area].n += 1;
      acc[area].x += r.participantesCount || 0;
      acc[area].y += r.asistenciaEsperada || 0;
      if (r.usaConfirmados) {
        acc[area].confirmadosCount += 1;
      }
      return acc;
    },
    { [AREAS.CERCANIA]: base(), [AREAS.PROCESOS]: base(), [AREAS.VOLUNTARIADO]: base() }
  );
}

const normalizar = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Divide un campo de texto/array de funcionarios en nombres individuales respetando paréntesis. */
const splitNombres = (val) => {
  if (!val) return [];
  const arr = Array.isArray(val) ? val : [val];
  const resultado = [];
  arr.forEach((v) => {
    if (!v) return;
    const tokens = [];
    let current = '';
    let depth = 0;
    const str = String(v);
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === '(') depth++;
      else if (char === ')') depth = Math.max(0, depth - 1);

      if ((char === ',' || char === ';' || char === '\n') && depth === 0) {
        if (current.trim()) tokens.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) tokens.push(current.trim());
    tokens.forEach((t) => {
      const clean = t.trim();
      if (clean && normalizar(clean) !== 'sin especificar' && normalizar(clean) !== 'a confirmar') {
        resultado.push(clean);
      }
    });
  });
  return resultado;
};

/** Extrae únicamente los funcionarios principales (titulares de cada reunión). */
function extraerFuncionariosPrincipales(reuniones) {
  const mapa = new Map();
  reuniones.forEach((r) => {
    let titulares = splitNombres(r.funcionario);
    if (titulares.length === 0 && r.funcionario_cargo) {
      titulares = splitNombres(r.funcionario_cargo);
    }
    // Si no tiene funcionario ni cargo especificado, tomar el primer acompañante como referencia
    if (titulares.length === 0 && r.funcionarios_acompanantes) {
      const acomp = splitNombres(r.funcionarios_acompanantes);
      if (acomp.length > 0) titulares = [acomp[0]];
    }

    titulares.forEach((nombre) => {
      const key = normalizar(nombre);
      if (!mapa.has(key)) mapa.set(key, { nombre, reuniones: [] });
      const entry = mapa.get(key);
      if (!entry.reuniones.some((x) => x.id === r.id)) {
        entry.reuniones.push({ id: r.id, nombre: r.nombre });
      }
    });
  });
  return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Extrae la lista de acompañantes de una reunión, excluyendo al titular si estuviera repetido. */
const extraerAcompanantesReunion = (reunion) => {
  if (!reunion) return [];
  const acomp = splitNombres(reunion.funcionarios_acompanantes);
  const titulares = splitNombres(reunion.funcionario).map(normalizar);
  return acomp.filter((a) => !titulares.includes(normalizar(a)));
};

const getResponsableEquipo = (r) => {
  if (r.equipo_cercania?.nombre_completo) return r.equipo_cercania.nombre_completo;
  if (r.responsable_cercania_id) {
    const match = DEFAULT_EQUIPO_CERCANIA.find((x) => x.id === r.responsable_cercania_id);
    if (match) return match.nombre_completo;
  }
  return 'Sin responsable asignado';
};

/** Convierte el formato WhatsApp (*negrita*, _cursiva_) en elementos React. */
const renderLinea = (linea, key) => {
  const partes = linea.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <p key={key} className="min-h-[0.75rem]">
      {partes.map((p, i) =>
        p.startsWith('*') && p.endsWith('*') && p.length > 2 ? (
          <strong key={i} className="font-semibold text-slate-900">
            {p.slice(1, -1)}
          </strong>
        ) : (
          <span key={i}>{p.replace(/(^|\s)_([^_]+)_(?=\s|$|[.,:;])/g, '$1$2')}</span>
        )
      )}
    </p>
  );
};

const briefCacheKey = (r) => `brief_ejecutivo_v2_${r.id}_${r.participantesCount}`;

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

function ResumenArea({ titulo, n, x, y, esVoluntariado = false, usaConfirmados = false, esMixto = false }) {
  // Regla de Negocio 2: Empty States limpios si N === 0
  if (n === 0) {
    return (
      <p className="text-base sm:text-lg leading-relaxed text-slate-500 py-4 border-t border-slate-200 first:border-t-0 italic">
        No hay reuniones programadas de {titulo}.
      </p>
    );
  }

  // Regla de Negocio 3: Etiqueta dinámica (inscriptos vs confirmados)
  let labelParticipantes = 'inscriptos';
  if (esMixto) {
    labelParticipantes = 'inscriptos y confirmados';
  } else if (usaConfirmados) {
    labelParticipantes = 'confirmados';
  }

  const tipoTexto = esVoluntariado ? 'Experiencias/Voluntariados programadas' : 'reuniones programadas';

  return (
    <p className="text-base sm:text-lg leading-relaxed text-slate-700 py-4 border-t border-slate-200 first:border-t-0">
      <strong className="font-bold text-[#042A38]">{titulo}</strong> tiene{' '}
      <strong className="font-bold text-[#042A38]">{n}</strong> {tipoTexto}, con un total de{' '}
      <strong className="font-bold text-[#042A38]">{x}</strong> {labelParticipantes} y esperamos una asistencia de{' '}
      <strong className="font-bold text-[#042A38]">{y}</strong> personas.
    </p>
  );
}

function TarjetaReunion({ reunion }) {
  const [abierta, setAbierta] = useState(false);
  const [estadoBrief, setEstadoBrief] = useState('idle'); // idle | cargando | listo | vacio | error
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');

  const generar = async (forzar = false) => {
    if (reunion.participantesCount === 0) {
      setEstadoBrief('vacio');
      return;
    }
    setEstadoBrief('cargando');
    setError('');
    try {
      if (!forzar) {
        const cached = localStorage.getItem(briefCacheKey(reunion));
        if (cached) {
          setTexto(cached);
          setEstadoBrief('listo');
          return;
        }
      }
      // Para Uno a Uno y Voluntariados, el brief se basa en confirmados
      const listaBrief =
        reunion.usaConfirmados && reunion.confirmados?.length > 0
          ? reunion.confirmados
          : reunion.inscriptos;

      const full = await generateMeetingBrief({ reunion, inscriptos: listaBrief });
      const { parte1 } = splitBriefParts(full);
      const brief = parte1 || full;
      try {
        localStorage.setItem(briefCacheKey(reunion), brief);
      } catch {
        /* almacenamiento lleno: se ignora */
      }
      setTexto(brief);
      setEstadoBrief('listo');
    } catch (err) {
      console.error('Error generando brief ejecutivo:', err);
      setError(err?.message || 'No se pudo generar el brief.');
      setEstadoBrief('error');
    }
  };

  const toggle = () => {
    const next = !abierta;
    setAbierta(next);
    if (next && estadoBrief === 'idle') generar(false);
  };

  const labelParticipantes = reunion.usaConfirmados ? 'confirmados' : 'inscriptos';
  const horarioTexto = formatHorarioReunion(reunion.hora_inicio_real, reunion.hora_fin_real);
  const acompanantes = useMemo(() => extraerAcompanantesReunion(reunion), [reunion]);

  return (
    <div
      className={`border rounded-2xl bg-white shadow-sm overflow-hidden transition-all ${
        abierta ? 'border-[#042A38] ring-1 ring-[#042A38]/15' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={abierta}
        className="w-full flex items-start justify-between gap-4 text-left px-5 py-5 cursor-pointer bg-white border-0 transition-colors"
      >
        <span className="flex-1">
          {/* Metadata superior: Fecha, Horario, Comuna y Tipo de Reunión */}
          <div className="flex items-center gap-2 flex-wrap text-xs uppercase tracking-wider text-slate-500 font-medium">
            <span>{reunion.fecha ? formatFechaCorta(reunion.fecha) : 'Hoy'}</span>
            {horarioTexto && (
              <>
                <span>•</span>
                <span className="font-semibold text-slate-700">{horarioTexto}</span>
              </>
            )}
            <span>•</span>
            <span>{reunion.comuna || 'CABA'}</span>
            <span>•</span>
            <span className="font-semibold text-slate-700">{reunion.tipo_reunion || 'Reunión'}</span>
          </div>

          {/* Nombre de la reunión */}
          <div className="text-lg font-bold text-[#042A38] leading-snug mt-1.5">
            {reunion.nombre}
          </div>

          {/* Funcionario principal si está presente */}
          {reunion.funcionario && (
            <div className="text-sm font-semibold text-slate-700 mt-1">
              👤 {reunion.funcionario}
            </div>
          )}

          {/* Acompañantes en la tarjeta */}
          {acompanantes.length > 0 && (
            <div className="text-xs text-slate-500 mt-1 leading-relaxed">
              <span className="font-medium text-slate-600">Acompañan:</span>{' '}
              {acompanantes.join(' · ')}
            </div>
          )}

          {/* Métricas clave: Inscriptos/Confirmados y Asistencia esperada */}
          <div className="text-sm text-slate-500 mt-2 flex items-center gap-2 flex-wrap">
            <span>
              <strong className="text-slate-900 font-bold">{reunion.participantesCount}</strong>{' '}
              {labelParticipantes}
            </span>
            <span>·</span>
            <span>
              asistencia esperada{' '}
              <strong className="text-slate-900 font-bold">{reunion.asistenciaEsperada}</strong>
            </span>
          </div>
        </span>

        <span
          className={`text-2xl text-slate-400 leading-none mt-1 transition-transform duration-200 ${
            abierta ? 'rotate-180 text-[#042A38]' : ''
          }`}
          aria-hidden="true"
        >
          ⌄
        </span>
      </button>

      {abierta && (
        <div className="px-5 pb-6 pt-1 border-t border-slate-100">
          <div className="py-4 space-y-2 text-base text-slate-700">
            {horarioTexto && (
              <p>
                <span className="text-slate-500">Horario: </span>
                <strong className="font-semibold text-slate-900">{horarioTexto}</strong>
              </p>
            )}
            <p>
              <span className="text-slate-500">Lugar: </span>
              <strong className="font-semibold text-slate-900">{reunion.lugar || 'Sin especificar'}</strong>
            </p>
            {reunion.funcionario && (
              <p>
                <span className="text-slate-500">Funcionario titular: </span>
                <strong className="font-semibold text-slate-900">{reunion.funcionario}</strong>
              </p>
            )}
            {acompanantes.length > 0 && (
              <div className="pt-1">
                <span className="text-slate-500">Funcionarios acompañantes ({acompanantes.length}):</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {acompanantes.map((acomp, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200"
                    >
                      {acomp}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <p>
              <span className="text-slate-500">Responsable del equipo en territorio: </span>
              <strong className="font-semibold text-slate-900">{getResponsableEquipo(reunion)}</strong>
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3">Brief</p>

            {estadoBrief === 'cargando' && (
              <p className="text-base text-slate-500 italic">Preparando el análisis de esta reunión…</p>
            )}
            {estadoBrief === 'vacio' && (
              <p className="text-base text-slate-500 italic">
                Esta reunión todavía no tiene participantes registrados para generar el análisis.
              </p>
            )}
            {estadoBrief === 'error' && (
              <div>
                <p className="text-base text-red-700">{error}</p>
                <button
                  type="button"
                  onClick={() => generar(true)}
                  className="mt-3 text-sm font-semibold text-[#042A38] underline cursor-pointer bg-transparent border-0"
                >
                  Reintentar
                </button>
              </div>
            )}
            {estadoBrief === 'listo' && (
              <div className="space-y-1 text-base leading-relaxed text-slate-700 font-normal">
                {texto.split('\n').map((l, i) => renderLinea(l, i))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExecutiveBrief() {
  const [reuniones, setReuniones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const hoyReal = useMemo(() => getHoyBuenosAires(), []);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(hoyReal);

  const esHoy = fechaSeleccionada === hoyReal;
  const esManana = useMemo(() => esMananaFecha(fechaSeleccionada, hoyReal), [fechaSeleccionada, hoyReal]);

  // Página privada: sin indexación
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Brief Ejecutivo';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.title = prevTitle;
      document.head.removeChild(meta);
    };
  }, []);

  useEffect(() => {
    let cancelado = false;

    const cargar = async () => {
      setCargando(true);
      setError('');
      try {
        let res = await supabase
          .from('reuniones')
          .select('*, equipo_cercania(id, nombre_completo, telefono)')
          .eq('fecha', fechaSeleccionada);
        if (res.error) {
          // Reintento sin el join por si la relación no está disponible
          res = await supabase.from('reuniones').select('*').eq('fecha', fechaSeleccionada);
        }
        if (res.error) throw res.error;

        const base = res.data || [];

        const factorCache = new Map();
        const getFactor = (func) => {
          const k = func || '__none__';
          if (!factorCache.has(k)) factorCache.set(k, getFuncionarioConversionFactor(func));
          return factorCache.get(k);
        };

        const enriquecidas = await Promise.all(
          base.map(async (r) => {
            const [{ data: inscriptosData }, factor] = await Promise.all([
              getAsistentesPorReunion(r.id),
              getFactor(r.funcionario)
            ]);
            const inscriptos = inscriptosData || [];
            const confirmados = getConfirmados(inscriptos);
            const usaConfirmados = esReunionBasadaEnConfirmados(r);

            // Regla de Negocio 3: Si es Uno a Uno o similar, se basa en confirmados
            const participantesCount = usaConfirmados
              ? (confirmados.length > 0 ? confirmados.length : inscriptos.length)
              : inscriptos.length;

            const asistenciaEsperada = usaConfirmados
              ? participantesCount
              : Math.round(inscriptos.length * (factor?.factor ?? 0.45));

            return {
              ...r,
              inscriptos,
              confirmados,
              usaConfirmados,
              inscriptosCount: inscriptos.length,
              confirmadosCount: confirmados.length,
              participantesCount,
              asistenciaEsperada
            };
          })
        );

        if (!cancelado) setReuniones(enriquecidas);
      } catch (err) {
        console.error('Error cargando brief ejecutivo:', err);
        if (!cancelado) setError('No pudimos cargar la agenda de esta fecha. Intentá nuevamente en unos minutos.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    };

    cargar();
    return () => {
      cancelado = true;
    };
  }, [fechaSeleccionada]);

  const resumen = useMemo(() => calcularResumenPorArea(reuniones), [reuniones]);
  const funcionarios = useMemo(() => extraerFuncionariosPrincipales(reuniones), [reuniones]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      <div className="max-w-2xl mx-auto px-5 py-10 sm:py-14">
        {/* SECCIÓN 1: Saludo, selector de fecha y resumen agregado */}
        <header className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3">
              {formatFechaLarga(fechaSeleccionada)}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-[#042A38] tracking-tight leading-tight">
              Buen día Mari, ¿cómo estás?
            </h1>
            <p className="text-lg sm:text-xl text-slate-600 font-medium mt-2">
              {esHoy
                ? 'Este es tu cronograma de hoy:'
                : esManana
                ? 'Este es tu cronograma de mañana:'
                : 'Este es tu cronograma para esta fecha:'}
            </p>
          </div>

          {/* Selector de fecha (Ícono de calendario arriba a la derecha) */}
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0 pt-1">
            <div
              className={`relative flex items-center justify-center w-11 h-11 rounded-2xl border transition-all shadow-sm cursor-pointer ${
                !esHoy
                  ? 'bg-[#042A38] text-white border-[#042A38] shadow-md'
                  : 'bg-white text-[#042A38] border-slate-200 hover:border-[#042A38] hover:bg-slate-50'
              }`}
              title="Seleccionar otra fecha en el calendario"
            >
              <Calendar size={20} />
              <input
                type="date"
                value={fechaSeleccionada}
                onChange={(e) => {
                  if (e.target.value) setFechaSeleccionada(e.target.value);
                }}
                aria-label="Seleccionar fecha"
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>

            {!esHoy && (
              <button
                type="button"
                onClick={() => setFechaSeleccionada(hoyReal)}
                className="text-xs font-semibold text-[#042A38] hover:underline cursor-pointer bg-transparent border-0 p-0"
              >
                Volver a hoy
              </button>
            )}
          </div>
        </header>

        {cargando && <p className="text-base text-slate-500 mt-10 italic">Cargando la agenda…</p>}
        {error && <p className="text-base text-red-700 mt-10">{error}</p>}

        {!cargando && !error && reuniones.length === 0 && (
          <div className="mt-10 py-8 px-6 bg-white rounded-2xl border border-slate-200 text-center shadow-sm">
            <p className="text-base sm:text-lg text-slate-600 italic">
              {esHoy
                ? 'Hoy no hay reuniones programadas.'
                : esManana
                ? 'Mañana no hay reuniones programadas.'
                : 'No hay reuniones programadas para esta fecha.'}
            </p>
            {!esHoy && (
              <button
                type="button"
                onClick={() => setFechaSeleccionada(hoyReal)}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#042A38] hover:underline cursor-pointer bg-transparent border-0"
              >
                Ver agenda de hoy
              </button>
            )}
          </div>
        )}

        {!cargando && !error && reuniones.length > 0 && (
          <>
            <section className="mt-8 bg-white rounded-2xl border border-slate-200 px-6 py-2 shadow-sm">
              <ResumenArea
                titulo="Cercanía"
                n={resumen[AREAS.CERCANIA].n}
                x={resumen[AREAS.CERCANIA].x}
                y={resumen[AREAS.CERCANIA].y}
                usaConfirmados={
                  resumen[AREAS.CERCANIA].n > 0 &&
                  resumen[AREAS.CERCANIA].confirmadosCount === resumen[AREAS.CERCANIA].n
                }
                esMixto={
                  resumen[AREAS.CERCANIA].confirmadosCount > 0 &&
                  resumen[AREAS.CERCANIA].confirmadosCount < resumen[AREAS.CERCANIA].n
                }
              />
              <ResumenArea
                titulo="Procesos Participativos"
                n={resumen[AREAS.PROCESOS].n}
                x={resumen[AREAS.PROCESOS].x}
                y={resumen[AREAS.PROCESOS].y}
              />
              <ResumenArea
                titulo="Voluntariado"
                n={resumen[AREAS.VOLUNTARIADO].n}
                x={resumen[AREAS.VOLUNTARIADO].x}
                y={resumen[AREAS.VOLUNTARIADO].y}
                esVoluntariado
                usaConfirmados
              />
            </section>

            {/* SECCIÓN 2: Radar de funcionarios */}
            <section className="mt-12">
              <h2 className="text-xl sm:text-2xl font-bold text-[#042A38] leading-snug tracking-tight">
                {esHoy
                  ? 'En la agenda de hoy estarán presentes los siguientes funcionarios:'
                  : esManana
                  ? 'En la agenda de mañana estarán presentes los siguientes funcionarios:'
                  : 'En la agenda de esta fecha estarán presentes los siguientes funcionarios:'}
              </h2>
              {funcionarios.length === 0 ? (
                <div className="mt-4 bg-white rounded-2xl border border-slate-200 px-6 py-5 shadow-sm text-center">
                  <p className="text-base text-slate-500 italic">
                    {esHoy
                      ? 'No hay funcionarios cargados para hoy.'
                      : esManana
                      ? 'No hay funcionarios cargados para mañana.'
                      : 'No hay funcionarios cargados para esta fecha.'}
                  </p>
                </div>
              ) : (
                <div className="mt-4 bg-white rounded-2xl border border-slate-200 px-6 py-2 shadow-sm">
                  <ul className="list-none divide-y divide-slate-200 m-0 p-0">
                    {funcionarios.map((f) => (
                      <li key={f.nombre} className="py-4">
                        <p className="text-lg font-bold text-[#042A38]">{f.nombre}</p>
                        <p className="text-base text-slate-600 mt-0.5">
                          {f.reuniones.map((x) => x.nombre).join(' · ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* SECCIÓN 3: Desglose operativo y briefs */}
            <section className="mt-12">
              <h2 className="text-xl sm:text-2xl font-bold text-[#042A38] leading-snug tracking-tight">
                Para saber más de cada una de las reuniones, clima y asistencia esperada, clickeá debajo:
              </h2>
              <div className="mt-5 space-y-4">
                {reuniones.map((r) => (
                  <TarjetaReunion key={r.id} reunion={r} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
