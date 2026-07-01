import React, { useState, useRef } from 'react';
import { Calendar, MapPin, User, FileText, Upload, AlertCircle, ArrowLeft, Check, FileSpreadsheet } from 'lucide-react';
import { TIPOS_REUNION } from '../data/mockData';
import { createReunion, upsertVecino, guardarAsistencia, normalizeComuna, normalizeCanalDifusion } from '../services/supabaseService';
import * as XLSX from 'xlsx';

const COMUNAS = Array.from({ length: 15 }, (_, i) => `Comuna ${i + 1}`);

const BARRIOS = [
  "Convocatoria Comunal",
  "Agronomía",
  "Almagro",
  "Balvanera",
  "Barracas",
  "Belgrano",
  "Boedo",
  "Caballito",
  "Chacarita",
  "Coghlan",
  "Colegiales",
  "Constitución",
  "Flores",
  "Floresta",
  "La Boca",
  "Liniers",
  "Mataderos",
  "Monte Castro",
  "Montserrat",
  "Nueva Pompeya",
  "Núñez",
  "Palermo",
  "Parque Avellaneda",
  "Parque Chacabuco",
  "Parque Chas",
  "Parque Patricios",
  "Paternal",
  "Puerto Madero",
  "Recoleta",
  "Retiro",
  "Saavedra",
  "San Cristóbal",
  "San Nicolás",
  "San Telmo",
  "Vélez Sarsfield",
  "Versalles",
  "Villa Crespo",
  "Villa del Parque",
  "Villa Devoto",
  "Villa General Mitre",
  "Villa Lugano",
  "Villa Luro",
  "Villa Ortúzar",
  "Villa Pueyrredón",
  "Villa Real",
  "Villa Riachuelo",
  "Villa Santa Rita",
  "Villa Soldati",
  "Villa Urquiza"
];

export default function ABMReuniones({ onBack, onSaveSuccess }) {
  const [nombre, setNombre] = useState('');
  const [fecha, setFecha] = useState('');
  const [lugar, setLugar] = useState('');
  const [comuna, setComuna] = useState('Comuna 1');
  const [barrio, setBarrio] = useState('Convocatoria Comunal');
  const [funcionario, setFuncionario] = useState('');
  const [tipoReunion, setTipoReunion] = useState(TIPOS_REUNION.ENCUENTRO);
  const [arreglo1, setArreglo1] = useState('');
  
  // Estados para importación de Orión (Real + Drag and Drop)
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [importedNeighbors, setImportedNeighbors] = useState([]);
  const [importStatus, setImportStatus] = useState(''); // '', 'loading', 'success', 'error'
  const [importedCount, setImportedCount] = useState(0);
  const fileInputRef = useRef(null);
  const [saving, setSaving] = useState(false);

  // Datos mock de respaldo por si el usuario prefiere simular la carga
  const orionMockInscriptos = [
    { dni: '95123456', nombre: 'Eduardo', apellido: 'Gutiérrez', celular: '1188887777', email: 'edu.guti@orion.com', barrio: 'Saavedra', comuna: 'Comuna 12' },
    { dni: '95456789', nombre: 'Patricia', apellido: 'Méndez', celular: '1199990000', email: 'patricia.m@orion.com', barrio: 'Coghlan', comuna: 'Comuna 12' },
    { dni: '95123987', nombre: 'Gustavo', apellido: 'Paz', celular: '1122223333', email: 'gustavopaz@orion.com', barrio: 'Villa Urquiza', comuna: 'Comuna 12' },
    { dni: '32123456', nombre: 'Juan Carlos', apellido: 'Gómez', celular: '1155551234', email: 'jc.gomez@mail.com', barrio: 'Palermo', comuna: 'Comuna 14' },
    { dni: '95897654', nombre: 'Estela', apellido: 'Ortiz', celular: '1144441111', email: 'estela.ortiz@orion.com', barrio: 'Villa Pueyrredón', comuna: 'Comuna 12' }
  ];

  const handleSimulateImport = () => {
    setImportStatus('loading');
    setTimeout(() => {
      setImportStatus('success');
      setFileName('Convocados_Orion_Simulado.csv');
      setImportedNeighbors(orionMockInscriptos);
      setImportedCount(orionMockInscriptos.length);
    }, 1200);
  };

  // Procesar archivo CSV o Excel
  const processFile = (file) => {
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isCsvOrTxt = file.name.endsWith('.csv') || file.name.endsWith('.txt');
    if (!isExcel && !isCsvOrTxt) {
      alert('Por favor selecciona un archivo con formato .xlsx, .xls, .csv o .txt.');
      return;
    }

    setFileName(file.name);
    setImportStatus('loading');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let rows = [];
        if (isExcel) {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        } else {
          const text = e.target.result;
          const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
          if (lines.length === 0) throw new Error('El archivo está vacío.');

          const headerLine = lines[0];
          let separator = ',';
          if (headerLine.includes(';')) separator = ';';
          else if (headerLine.includes('\t')) separator = '\t';

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let cols = [];
            let currentVal = '';
            let inQuotes = false;

            for (let c = 0; c < line.length; c++) {
              const char = line[c];
              if (char === '"' || char === "'") {
                inQuotes = !inQuotes;
              } else if (char === separator && !inQuotes) {
                cols.push(currentVal.trim());
                currentVal = '';
              } else {
                currentVal += char;
              }
            }
            cols.push(currentVal.trim());
            rows.push(cols);
          }
        }

        if (rows.length === 0) {
          throw new Error('El archivo parece estar vacío.');
        }

        // Parsear filas
        const parsed = parseRows2D(rows);
        
        if (parsed.length === 0) {
          throw new Error('No se encontraron vecinos válidos en las filas.');
        }

        setImportedNeighbors(parsed);
        setImportedCount(parsed.length);
        setImportStatus('success');
      } catch (err) {
        console.error(err);
        setImportStatus('error');
        alert(`Error al procesar el archivo: ${err.message || 'Verifica el formato del archivo'}`);
      }
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
  };

  // Parser robusto de filas 2D (sea de CSV o Excel)
  const parseRows2D = (rows) => {
    if (rows.length === 0) return [];
    
    // Normalizar encabezados de la fila 0
    const headers = rows[0].map(h => 
      (h || '').toString().trim().replace(/^["']|["']$/g, '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    );

    const findIndex = (keys) => {
      return headers.findIndex(h => keys.some(key => h.includes(key)));
    };

    const idxDni = findIndex(['dni', 'documento', 'identificacion', 'document', 'nro_doc', 'nro doc']);
    const idxNombre = findIndex(['nombre', 'first name', 'first_name']);
    const idxApellido = findIndex(['apellido', 'last name', 'last_name']);
    const idxCelular = findIndex(['celular', 'telefono', 'phone', 'cel']);
    const idxEmail = findIndex(['email', 'correo', 'mail']);
    const idxBarrio = findIndex(['barrio', 'neighborhood']);
    const idxComuna = findIndex(['comuna', 'zone']);
    const idxBloque = findIndex(['bloque', 'horario', 'turno', 'slot']);
    const idxComoEntero = findIndex(['como se entero', 'difusion', 'canal', 'origen']);
    const idxInvitadoPor = findIndex(['invitado por', 'invitado', 'convocador']);
    const idxTemaPrevio = findIndex(['tema', 'reclamo', 'consulta', 'observacion']);
    const idxAccesibilidad = findIndex(['accesibilidad', 'acceso', 'discapacidad']);

    const parsedData = [];

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      if (!cols || cols.length < 2) continue;

      const getValue = (idx) => {
        if (idx === -1 || idx === undefined || cols[idx] === undefined || cols[idx] === null) return null;
        const val = cols[idx].toString().replace(/^["']|["']$/g, '').trim();
        return val === '' ? null : val;
      };

      const dni = getValue(idxDni);
      if (!dni) continue;

      const vNombre = getValue(idxNombre) || 'Vecino';
      const vApellido = getValue(idxApellido) || 'Desconocido';

      parsedData.push({
        dni,
        nombre: vNombre,
        apellido: vApellido,
        celular: getValue(idxCelular),
        email: getValue(idxEmail),
        barrio: getValue(idxBarrio) || (barrio !== 'Convocatoria Comunal' ? barrio : null),
        comuna: getValue(idxComuna) || comuna || null,
        horario_bloque_asignado: getValue(idxBloque),
        como_se_entero: getValue(idxComoEntero),
        invitado_por: getValue(idxInvitadoPor),
        tema_previo: getValue(idxTemaPrevio),
        necesita_accesibilidad: getValue(idxAccesibilidad)
      });
    }

    return parsedData;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!nombre || !fecha) {
      alert('Por favor complete los campos obligatorios: Nombre y Fecha.');
      return;
    }

    setSaving(true);

    // Guardar la reunión
    const { data: created, error: createError } = await createReunion({
      nombre: nombre.trim(),
      fecha,
      lugar: lugar.trim() || 'No especificado',
      comuna,
      barrio: barrio === 'Convocatoria Comunal' ? null : barrio,
      funcionario: funcionario.trim() || null,
      tipo_reunion: tipoReunion,
      arreglo_1: arreglo1.trim() || null,
      funcionario_inicio: null,
      funcionario_cierre: null,
      funcionario_interrupciones_minutos: 0,
      duracion_total_minutos: null
    });

    if (createError) {
      alert(`Error al guardar la reunión: ${createError.message || 'Verifica la conexión'}`);
      setSaving(false);
      return;
    }

    // Si se cargaron vecinos (desde archivo real o simulador)
    if (importStatus === 'success' && importedNeighbors.length > 0 && created) {
      try {
        // Guardamos vecinos e inscripciones secuencialmente
        for (let idx = 0; idx < importedNeighbors.length; idx++) {
          const vecino = importedNeighbors[idx];

          // Alta en padrón central
          await upsertVecino({
            dni: vecino.dni,
            nombre: vecino.nombre,
            apellido: vecino.apellido,
            celular: vecino.celular || null,
            email: vecino.email || null,
            barrio: vecino.barrio || (barrio !== 'Convocatoria Comunal' ? barrio : null),
            comuna: normalizeComuna(vecino.comuna || comuna)
          });
          
          // Alta en la inscripción/asistencias de esta reunión
          const estadoConvocatoria = tipoReunion === TIPOS_REUNION.UNO_A_UNO 
            ? 'seleccionado_uno_a_uno' 
            : (vecino.estado_convocatoria || 'inscripto');

          // Bloque horario en Uno a Uno
          const block = tipoReunion === TIPOS_REUNION.UNO_A_UNO 
            ? (vecino.horario_bloque_asignado || `11:${idx * 15} - 11:${(idx * 15) + 15}`)
            : null;

          await guardarAsistencia(created.id, vecino.dni, false, {
            estado_convocatoria: estadoConvocatoria,
            como_se_entero: normalizeCanalDifusion(vecino.como_se_entero),
            invitado_por: vecino.invitado_por || null,
            tema_previo: vecino.tema_previo || null,
            necesita_accesibilidad: vecino.necesita_accesibilidad || null
          });
        }
      } catch (saveError) {
        console.error('Error al guardar vecinos:', saveError);
        alert('Hubo un error al guardar la lista de vecinos importada. Algunos registros podrían no haberse completado.');
      }
    }

    setSaving(false);
    alert('¡Reunión guardada exitosamente y padrón asociado!');
    onSaveSuccess();
  };

  return (
    <div className="container">
      <div style={{ marginBottom: '1.5rem' }}>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>
          <ArrowLeft size={16} /> Volver al Tablero
        </button>
      </div>

      <div style={{ position: 'relative' }}>
        <div className="decor-tabs-container">
          <div className="decor-tab-mint"></div>
          <div className="decor-tab-yellow"></div>
        </div>

        <div className="card">
          <h2 className="section-title">Alta de Reunión y Carga de Orión</h2>
          
          <form onSubmit={handleSave}>
            <div className="grid-2">
              <div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px' }}>
                  Datos Logísticos de la Reunión
                </h3>

                <div className="form-group">
                  <label htmlFor="nombre">Nombre de la Reunión *</label>
                  <input
                    type="text"
                    id="nombre"
                    className="form-control"
                    placeholder="Ej: Reunión Temática de Seguridad en Comuna 12"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    required
                  />
                </div>

                <div className="grid-2" style={{ gap: '1rem' }}>
                  <div className="form-group">
                    <label htmlFor="fecha">Fecha *</label>
                    <input
                      type="date"
                      id="fecha"
                      className="form-control"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="tipo">Tipo de Evento *</label>
                    <select
                      id="tipo"
                      className="form-control"
                      value={tipoReunion}
                      onChange={(e) => setTipoReunion(e.target.value)}
                    >
                      {Object.values(TIPOS_REUNION).map(val => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="lugar">Lugar de Encuentro</label>
                  <input
                    type="text"
                    id="lugar"
                    className="form-control"
                    placeholder="Ej: Biblioteca Popular (Dirección 123)"
                    value={lugar}
                    onChange={(e) => setLugar(e.target.value)}
                  />
                </div>

                <div className="grid-2" style={{ gap: '1rem' }}>
                  <div className="form-group">
                    <label htmlFor="comuna">Comuna</label>
                    <select
                      id="comuna"
                      className="form-control"
                      value={comuna}
                      onChange={(e) => setComuna(e.target.value)}
                    >
                      {COMUNAS.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="barrio">Barrio</label>
                    <select
                      id="barrio"
                      className="form-control"
                      value={barrio}
                      onChange={(e) => setBarrio(e.target.value)}
                    >
                      {BARRIOS.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="funcionario">Funcionario a Cargo (Orador Central)</label>
                  <input
                    type="text"
                    id="funcionario"
                    className="form-control"
                    placeholder="Ej: Jorge Macri"
                    value={funcionario}
                    onChange={(e) => setFuncionario(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="observaciones">Observaciones / Arreglo Histórico</label>
                  <textarea
                    id="observaciones"
                    className="form-control"
                    rows="3"
                    placeholder="Notas internas y agenda histórica de coordinación..."
                    value={arreglo1}
                    onChange={(e) => setArreglo1(e.target.value)}
                  />
                </div>
              </div>

              {/* Sección de Carga Orión (Drag and Drop Real) */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px' }}>
                  Integración con Sistema Orión
                </h3>

                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  style={{
                    border: '2px dashed var(--color-border)',
                    borderRadius: 'var(--border-radius)',
                    padding: '2rem 1.5rem',
                    textAlign: 'center',
                    backgroundColor: isDragging ? '#ECFDF5' : '#F8FAFC',
                    borderColor: isDragging ? 'var(--color-highlight)' : 'var(--color-border)',
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.2s ease-in-out',
                    cursor: 'pointer'
                  }}
                  onClick={triggerFileSelect}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".csv,.txt,.xls,.xlsx"
                    style={{ display: 'none' }}
                  />

                  {importStatus === 'success' ? (
                    <FileSpreadsheet size={40} style={{ color: 'var(--color-success)' }} />
                  ) : (
                    <Upload size={40} style={{ color: isDragging ? 'var(--color-highlight)' : 'var(--color-text-muted)' }} />
                  )}

                  <div>
                    <h4 style={{ fontSize: '1rem', color: 'var(--color-primary)' }}>
                      {importStatus === 'success' ? 'Planilla Lista' : 'Importar Planilla de Orión'}
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '4px', maxWidth: '300px', margin: '4px auto 0 auto' }}>
                      {importStatus === 'success' 
                        ? `Archivo: ${fileName}`
                        : 'Arrastrá el archivo Excel o CSV de inscriptos directamente acá o hacé clic para seleccionarlo.'
                      }
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={triggerFileSelect}
                    >
                      Seleccionar Archivo
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleSimulateImport}
                      disabled={importStatus === 'loading'}
                    >
                      Simular Datos Mock
                    </button>
                  </div>

                  {importStatus === 'loading' && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                      Analizando columnas, mapeando campos y depurando duplicados de DNI...
                    </div>
                  )}

                  {importStatus === 'success' && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: '#DEF7EC',
                      color: '#03543F',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      marginTop: '12px'
                    }}>
                      <Check size={16} /> ¡Cargados {importedCount} inscriptos del archivo!
                    </div>
                  )}
                </div>

                <div style={{
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginTop: '1.5rem',
                  fontSize: '0.8rem',
                  color: '#1E40AF',
                  display: 'flex',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Columnas Mapeadas:</strong> Buscamos de forma flexible columnas de DNI/Documento, Nombre, Apellido, Celular, Email, Barrio, Comuna, y Bloque Horario para armar la agenda de presentismo.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '2rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onBack}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-highlight" disabled={importStatus === 'loading' || saving}>
                {saving ? 'Guardando reunión...' : 'Guardar Reunión y Vincular Vecinos'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
