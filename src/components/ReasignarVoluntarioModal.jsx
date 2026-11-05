import React, { useState, useMemo } from 'react';
import { X, ArrowRightLeft, UserPlus, AlertTriangle } from 'lucide-react';

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/**
 * Modal de asignación manual ("a dedo") del Tablero LNDLM.
 *
 *  mode="move-volunteer": se parte de un voluntario y se elige la sede destino entre TODOS los espacios.
 *  mode="assign-to-space": se parte de una sede y se busca entre TODA la nómina de presentes (asistio = true),
 *                          no solo en el banco de suplentes.
 *
 * El cupo puede excederse a propósito; se advierte con "Cupo excedido".
 */
export default function ReasignarVoluntarioModal({
  mode,
  volunteer = null,
  space = null,
  spaces = [],
  volunteers = [],
  assignedCountBySpace = {},
  spacesById = {},
  onConfirm,
  onClose
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null); // espacio (move) o voluntario (assign)
  const [submitting, setSubmitting] = useState(false);

  const isMove = mode === 'move-volunteer';

  const getAssignedCount = (spaceId) => {
    if (!spaceId || !assignedCountBySpace) return 0;
    const entry = assignedCountBySpace[spaceId];
    if (Array.isArray(entry)) return entry.length;
    if (typeof entry === 'number') return entry;
    return 0;
  };

  const spaceOptions = useMemo(() => {
    if (!isMove) return [];
    const q = norm(search.trim());
    return spaces
      .filter(s => s.id !== volunteer?.assigned_space_id)
      .filter(s => !q || norm(`${s.name} ${s.address} ${s.neighborhood} comuna ${s.comuna}`).includes(q))
      .slice(0, 80);
  }, [isMove, spaces, search, volunteer]);

  const volunteerOptions = useMemo(() => {
    if (isMove) return [];
    const q = norm(search.trim());
    return volunteers
      .filter(v => v.attended_training && v.assigned_space_id !== space?.id)
      .filter(v => !q || norm(`${v.first_name} ${v.last_name} ${v.dni}`).includes(q))
      .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`))
      .slice(0, 80);
  }, [isMove, volunteers, search, space]);

  const targetSpace = isMove ? selected : space;
  const targetVolunteer = isMove ? volunteer : selected;

  const targetCount = targetSpace ? getAssignedCount(targetSpace.id) : 0;
  const targetQuota = targetSpace ? Math.max(0, Number(targetSpace.quota_required ?? 2)) : 0;
  const willExceed = Boolean(targetSpace && targetVolunteer) && targetCount + 1 > targetQuota;

  const currentSpaceOfTarget =
    targetVolunteer?.status === 'ASIGNADO' && targetVolunteer.assigned_space_id
      ? spacesById[targetVolunteer.assigned_space_id]
      : null;

  const handleConfirm = async () => {
    if (!targetSpace || !targetVolunteer || submitting) return;
    // Transferencia desde otra sede: confirmación explícita
    if (!isMove && currentSpaceOfTarget) {
      const ok = window.confirm(
        `Este voluntario actualmente está asignado a ${currentSpaceOfTarget.name}. ¿Deseas transferirlo a esta sede?`
      );
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      await onConfirm(targetVolunteer, targetSpace);
    } catch (e) {
      console.error('Error al confirmar asignación manual:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const rowStyle = (active) => ({
    padding: '0.65rem 0.9rem',
    borderRadius: '10px',
    border: active ? '2px solid #4F46E5' : '1px solid #E2E8F0',
    backgroundColor: active ? '#EEF2FF' : 'white',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.6rem',
    textAlign: 'left',
    width: '100%'
  });

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '720px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.1rem 1.4rem', backgroundColor: '#0F172A', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.74rem', color: '#F59E0B', fontWeight: 800, textTransform: 'uppercase' }}>
              {isMove ? 'Mover de sede (asignación manual)' : 'Asignar específico (asignación manual)'}
            </div>
            <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.1rem', color: 'white' }}>
              {isMove
                ? `${volunteer?.first_name} ${volunteer?.last_name} · DNI ${volunteer?.dni}`
                : `🏛️ ${space?.name} (${space?.neighborhood} - C${space?.comuna})`}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ padding: '0.85rem 1.4rem', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
          <input
            type="text"
            autoFocus
            placeholder={isMove ? 'Buscar espacio cultural por nombre, dirección, barrio o comuna...' : 'Buscar en toda la nómina de presentes por nombre, apellido o DNI...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '0.55rem 0.85rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ padding: '0.9rem 1.4rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {isMove && spaceOptions.length === 0 && <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748B' }}>Sin resultados.</div>}
          {!isMove && volunteerOptions.length === 0 && <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748B' }}>Sin resultados entre los presentes (asistio = true).</div>}

          {isMove && spaceOptions.map(s => {
            const cnt = getAssignedCount(s.id);
            const quota = Math.max(0, Number(s.quota_required ?? 2));
            const full = cnt >= quota;
            return (
              <button key={s.id} type="button" onClick={() => setSelected(s)} style={rowStyle(selected?.id === s.id)}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0F172A' }}>{s.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{s.address} · {s.neighborhood} (C{s.comuna})</div>
                </div>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '999px', whiteSpace: 'nowrap', backgroundColor: full ? '#FEE2E2' : '#D1FAE5', color: full ? '#B91C1C' : '#065F46' }}>
                  {cnt}/{quota}{full ? ' · sin cupo' : ' · con cupo'}
                </span>
              </button>
            );
          })}

          {!isMove && volunteerOptions.map(v => {
            const cur = v.status === 'ASIGNADO' && v.assigned_space_id ? spacesById[v.assigned_space_id] : null;
            return (
              <button key={v.dni} type="button" onClick={() => setSelected(v)} style={rowStyle(selected?.dni === v.dni)}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0F172A' }}>{v.first_name} {v.last_name} <span style={{ fontWeight: 600, color: '#64748B', fontSize: '0.76rem' }}>DNI {v.dni}</span></div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Vive en {v.neighborhood || 'S/B'} (C{v.comuna || '?'})</div>
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '999px', maxWidth: '230px', textAlign: 'right', backgroundColor: cur ? '#FEF3C7' : v.status === 'BAJA' ? '#FEE2E2' : '#E0E7FF', color: cur ? '#92400E' : v.status === 'BAJA' ? '#B91C1C' : '#3730A3' }}>
                  {cur ? `Asignado a ${cur.name}` : v.status === 'BAJA' ? 'BAJA' : 'Suplente / libre'}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ padding: '0.9rem 1.4rem', borderTop: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {willExceed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '8px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '0.8rem', fontWeight: 700 }}>
              <AlertTriangle size={15} /> Cupo excedido: {targetSpace.name} quedará con {targetCount + 1}/{targetQuota}. Se forzará la asignación.
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn btn-outline" disabled={submitting} onClick={onClose}>Cancelar</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!targetSpace || !targetVolunteer || submitting}
              onClick={handleConfirm}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}
            >
              {isMove ? <ArrowRightLeft size={14} /> : <UserPlus size={14} />}
              {submitting
                ? 'Guardando en Supabase...'
                : (isMove ? 'Mover a esta sede' : (currentSpaceOfTarget ? 'Transferir a esta sede' : 'Asignar a esta sede'))}
              {!submitting && willExceed ? ' (forzar)' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
