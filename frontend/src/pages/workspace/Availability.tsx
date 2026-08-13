// Mi disponibilidad.
//
// Cada persona administra sus horas, especialidades y ausencias sin pedirle
// permiso a un administrador. La asignación automática lee justamente esto: si
// alguien no mantiene su disponibilidad, el reparto se degrada para todo el
// equipo, así que la pantalla explica el efecto de cada dato.

import { useCallback, useEffect, useState } from 'react';
import { api, Absence, AvailabilityMembership } from '../../lib/api';
import { alertDialog, confirmDialog } from '../../components/AppDialog';
import { T } from './theme';

const today = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

export default function Availability({ onClose }: { onClose: () => void }) {
  const [memberships, setMemberships] = useState<AvailabilityMembership[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await api.getMyAvailability();
      setMemberships(result.data.memberships);
      setAbsences(result.data.absences);
    } catch (error) {
      await alertDialog({ title: 'No se pudo cargar tu disponibilidad', message: (error as Error).message, tone: 'danger' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (spaceId: string, patch: { weekly_hours?: number; specialties?: string[]; accepts_auto_assign?: number }) => {
    setSaving(spaceId);
    try { await api.updateAvailability(spaceId, patch); await load(); }
    catch (error) { await alertDialog({ title: 'No se pudo guardar', message: (error as Error).message, tone: 'danger' }); }
    finally { setSaving(null); }
  };

  const addAbsence = async () => {
    setSaving('absence');
    try {
      await api.createAbsence({ starts_on: from, ends_on: to, reason: reason.trim() || undefined });
      setReason('');
      await load();
    } catch (error) {
      await alertDialog({ title: 'No se pudo registrar', message: (error as Error).message, tone: 'danger' });
    } finally { setSaving(null); }
  };

  const removeAbsence = async (absence: Absence) => {
    const ok = await confirmDialog({
      title: '¿Eliminar esta ausencia?',
      message: 'Volverás a recibir asignación automática en esas fechas.',
      confirmLabel: 'Eliminar', danger: true,
    });
    if (!ok) return;
    setSaving(absence.id);
    try { await api.deleteAbsence(absence.id); await load(); }
    finally { setSaving(null); }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1400,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <aside onClick={e => e.stopPropagation()} style={{
        width: 520, maxWidth: '95vw', background: '#fff', height: '100%',
        overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${T.line}`, display: 'flex', gap: 12, alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>Mi disponibilidad</div>
            <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>
              Con esto se decide qué trabajo nuevo te llega
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: T.ink3, cursor: 'pointer' }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 48, color: T.ink3, textAlign: 'center' }}>Cargando…</div>
        ) : (
          <div style={{ padding: '18px 22px', display: 'grid', gap: 18 }}>
            {memberships.length === 0 ? (
              <div style={{ fontSize: 12.5, color: T.ink3 }}>
                Todavía no perteneces a ningún espacio de trabajo. Un administrador
                puede añadirte desde Administrar → Líderes de área.
              </div>
            ) : memberships.map(membership => (
              <SpaceAvailability
                key={membership.space_id}
                membership={membership}
                busy={saving === membership.space_id}
                onSave={patch => save(membership.space_id, patch)}
              />
            ))}

            <section style={{ border: `1px solid ${T.line}`, borderRadius: 11, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.ink, marginBottom: 3 }}>Ausencias</div>
              <div style={{ fontSize: 11, color: T.ink3, marginBottom: 11 }}>
                Durante una ausencia no recibirás asignación automática.
              </div>

              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ fontSize: 10.5, color: T.ink3, display: 'grid', gap: 3 }}>
                  Desde
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={input} />
                </label>
                <label style={{ fontSize: 10.5, color: T.ink3, display: 'grid', gap: 3 }}>
                  Hasta
                  <input type="date" value={to} onChange={e => setTo(e.target.value)} style={input} />
                </label>
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo (opcional)" style={{ ...input, flex: '1 1 120px' }} />
                <button onClick={addAbsence} disabled={saving === 'absence'} style={primaryBtn}>Añadir</button>
              </div>

              <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                {absences.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: T.ink3 }}>No tienes ausencias registradas.</div>
                ) : absences.map(absence => {
                  const active = absence.starts_on <= today() && absence.ends_on >= today();
                  return (
                    <div key={absence.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', background: active ? '#FEF3C7' : '#F8FAFC', borderRadius: 8 }}>
                      <span style={{ fontSize: 11.5, color: T.ink2, flex: 1 }}>
                        {absence.starts_on} → {absence.ends_on}
                        {absence.reason ? ` · ${absence.reason}` : ''}
                        {active ? ' · en curso' : ''}
                      </span>
                      <button onClick={() => removeAbsence(absence)} disabled={saving === absence.id} style={{ border: 'none', background: 'none', color: T.ink3, fontSize: 16, cursor: 'pointer' }}>×</button>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function SpaceAvailability({ membership, busy, onSave }: {
  membership: AvailabilityMembership;
  busy: boolean;
  onSave: (patch: { weekly_hours?: number; specialties?: string[]; accepts_auto_assign?: number }) => void;
}) {
  const parsed = (() => {
    try { return JSON.parse(membership.specialties_json) as string[]; } catch { return []; }
  })();
  const [hours, setHours] = useState(membership.weekly_hours);
  const [specialties, setSpecialties] = useState(parsed.join(', '));
  const accepts = membership.accepts_auto_assign !== 0;

  const dirty = hours !== membership.weekly_hours || specialties !== parsed.join(', ');

  return (
    <section style={{ border: `1px solid ${T.line}`, borderRadius: 11, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{membership.space_name}</span>
        {membership.role === 'lead' && (
          <span style={{ fontSize: 9.5, fontWeight: 800, color: T.brand, background: '#E6F1FB', padding: '2px 6px', borderRadius: 6 }}>Líder</span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 9 }}>
        <label style={{ fontSize: 11, color: T.ink3, display: 'grid', gap: 3 }}>
          Horas disponibles por semana
          <input type="number" min={0} max={80} value={hours} onChange={e => setHours(Number(e.target.value))} style={input} />
        </label>
        <label style={{ fontSize: 11, color: T.ink3, display: 'grid', gap: 3 }}>
          Especialidades, separadas por coma
          <input value={specialties} onChange={e => setSpecialties(e.target.value)} placeholder="diseño, campañas, reportes" style={input} />
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input
            type="checkbox" checked={accepts} disabled={busy}
            onChange={e => onSave({ accepts_auto_assign: e.target.checked ? 1 : 0 })}
            style={{ marginTop: 2 }}
          />
          <span style={{ fontSize: 11.5, color: T.ink2 }}>
            Acepto que se me asigne trabajo automáticamente
          </span>
        </label>

        {dirty && (
          <button
            onClick={() => onSave({ weekly_hours: hours, specialties: specialties.split(',').map(s => s.trim()).filter(Boolean) })}
            disabled={busy}
            style={primaryBtn}
          >{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        )}
      </div>
    </section>
  );
}

const input: React.CSSProperties = {
  border: `1px solid ${T.line}`, borderRadius: 8, padding: '8px 10px',
  fontSize: 12.5, fontFamily: 'inherit', outline: 'none', color: T.ink,
};

const primaryBtn: React.CSSProperties = {
  border: 0, background: T.brand, color: '#fff', borderRadius: 8,
  padding: '9px 14px', fontSize: 12, fontWeight: 750, cursor: 'pointer', fontFamily: 'inherit',
};
