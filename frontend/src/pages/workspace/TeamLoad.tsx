// Pantalla principal del LÍDER DE ÁREA.
// El líder no necesita ver tareas: necesita ver quién está saturado, dónde se
// acumula el trabajo y qué va a incumplir antes de que incumpla.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, TeamLoad as TeamLoadData, TeamMemberLoad } from '../../lib/api';
import { useIsMobile } from '../../lib/useIsMobile';
import { initials, T } from './theme';

/** Umbral de saturación por persona, en tareas abiertas simultáneas. */
const CAPACITY = 8;

export default function TeamLoad() {
  const isMobile = useIsMobile();
  const [data, setData] = useState<TeamLoadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [spaceFilter, setSpaceFilter] = useState<string>('all');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setData((await api.getTeamLoad()).data); }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = setInterval(() => void load(true), 20000); return () => clearInterval(timer); }, [load]);

  const spaceName = useCallback((id: string) => data?.spaces.find(space => space.id === id)?.name ?? id, [data]);

  const members = useMemo(() => {
    const rows = data?.members ?? [];
    const filtered = spaceFilter === 'all' ? rows : rows.filter(row => row.space_id === spaceFilter);
    return [...filtered].sort((a, b) => b.open_tasks - a.open_tasks);
  }, [data, spaceFilter]);

  if (loading && !data) return <div style={{ padding: 48, color: T.ink3 }}>Calculando la carga del equipo…</div>;

  if (!data || data.spaces.length === 0) {
    return (
      <div style={{ padding: 48, maxWidth: 620, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 820, color: T.ink, marginBottom: 10 }}>Aún no lideras ningún espacio</h1>
        <p style={{ color: T.ink3, fontSize: 14, lineHeight: 1.6 }}>
          Un administrador debe asignarte como líder de un espacio en Administrar → Equipos.
          Mientras tanto puedes seguir tu trabajo desde Mi día.
        </p>
      </div>
    );
  }

  const summary = data.summary;
  const saturated = members.filter(member => member.open_tasks >= CAPACITY).length;

  return (
    <div style={{ padding: isMobile ? '20px 14px' : 32, maxWidth: 1140, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.brand, textTransform: 'uppercase', letterSpacing: .8 }}>Tu área</div>
          <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 850, color: T.ink, letterSpacing: -.7, margin: '4px 0' }}>Capacidad y cuellos de botella</h1>
          <p style={{ color: T.ink3, fontSize: 14 }}>Quién está saturado, qué está detenido y dónde se acumula el trabajo.</p>
        </div>
        {data.spaces.length > 1 && (
          <select value={spaceFilter} onChange={event => setSpaceFilter(event.target.value)} style={{ border: `1px solid ${T.line}`, borderRadius: 9, padding: '9px 12px', fontSize: 12.5, background: '#fff', color: T.ink2 }}>
            <option value="all">Todos mis espacios</option>
            {data.spaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: 12, marginBottom: 24 }}>
        <Metric label="Trabajo abierto" value={String(summary?.open_tasks ?? 0)} note="en tus espacios" color={T.brand} />
        <Metric label="Vencido" value={String(summary?.overdue ?? 0)} note="fuera de fecha" color="#C2413B" />
        <Metric label="Bloqueado" value={String(summary?.blocked ?? 0)} note="necesita ayuda" color="#B7791F" />
        <Metric label="Sin responsable" value={String(summary?.unassigned ?? 0)} note="esperan triage" color="#7C3AED" />
        <Metric label="Ciclo medio" value={summary?.cycle_days != null ? `${summary.cycle_days}d` : '—'} note="últimos 30 días" color="#0F9F6E" />
      </div>

      {saturated > 0 && (
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 12.5, color: '#9A3412', fontWeight: 700 }}>
          {saturated === 1 ? '1 persona está' : `${saturated} personas están`} en o sobre el umbral de {CAPACITY} tareas simultáneas. Considera redistribuir antes de asignar más.
        </div>
      )}

      <section style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '15px 17px 11px', borderBottom: `1px solid ${T.line}` }}>
          <h2 style={{ fontSize: 14.5, fontWeight: 800, color: T.ink }}>Carga por persona</h2>
          <p style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>Ordenado por trabajo abierto. La barra compara contra {CAPACITY} tareas simultáneas.</p>
        </div>
        {members.length === 0 ? (
          <div style={{ padding: '28px 16px', textAlign: 'center', color: T.ink3, fontSize: 12.5 }}>
            Este espacio aún no tiene miembros registrados.
          </div>
        ) : members.map(member => (
          <MemberRow key={`${member.space_id}-${member.user_email}`} member={member} spaceName={spaceName(member.space_id)} showSpace={spaceFilter === 'all' && data.spaces.length > 1} />
        ))}
      </section>

      <section style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '15px 17px 11px', borderBottom: `1px solid ${T.line}` }}>
          <h2 style={{ fontSize: 14.5, fontWeight: 800, color: T.ink }}>Dónde se acumula</h2>
          <p style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>Estados con más antigüedad media: ahí está el cuello de botella.</p>
        </div>
        {data.bottlenecks.length === 0 ? (
          <div style={{ padding: '28px 16px', textAlign: 'center', color: T.ink3, fontSize: 12.5 }}>Sin acumulación detectada.</div>
        ) : data.bottlenecks
          .filter(row => spaceFilter === 'all' || row.space_id === spaceFilter)
          .map(row => (
            <div key={`${row.space_id}-${row.status}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 17px', borderBottom: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{row.status_label}</div>
                <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 2 }}>{spaceName(row.space_id)}</div>
              </div>
              <span style={{ fontSize: 11.5, color: T.ink2, fontWeight: 700 }}>{row.open_tasks} {row.open_tasks === 1 ? 'tarea' : 'tareas'}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, minWidth: 96, textAlign: 'right', color: row.avg_stale_days > 7 ? '#C2413B' : row.avg_stale_days > 3 ? '#B7791F' : T.ink3 }}>
                {row.avg_stale_days}d sin mover
              </span>
            </div>
          ))}
      </section>
    </div>
  );
}

function MemberRow({ member, spaceName, showSpace }: { member: TeamMemberLoad; spaceName: string; showSpace: boolean }) {
  const ratio = Math.min(member.open_tasks / CAPACITY, 1.4);
  const color = ratio >= 1 ? '#C2413B' : ratio >= 0.75 ? '#B7791F' : '#0F9F6E';
  const hours = Math.round((member.planned_minutes / 60) * 10) / 10;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 17px', borderBottom: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
      <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#0284C7,#4F46E5)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
        {initials(member.user_name)}
      </div>

      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{member.user_name}</span>
          {member.role === 'lead' && <span style={{ fontSize: 9.5, fontWeight: 800, color: T.brand, background: '#E6F1FB', padding: '2px 6px', borderRadius: 6 }}>Líder</span>}
          {showSpace && <span style={{ fontSize: 10.5, color: T.ink3 }}>{spaceName}</span>}
        </div>
        <div style={{ height: 5, borderRadius: 99, background: '#E2E8F0', marginTop: 7, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(ratio, 1) * 100}%`, height: '100%', background: color, transition: 'width .3s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Stat value={member.open_tasks} label="abiertas" color={color} />
        <Stat value={member.overdue} label="vencidas" color={member.overdue ? '#C2413B' : T.ink3} />
        <Stat value={member.blocked} label="bloqueadas" color={member.blocked ? '#B7791F' : T.ink3} />
        <Stat value={member.done7} label="hechas 7d" color="#0F9F6E" />
        <Stat value={hours ? `${hours}h` : '—'} label="estimadas" color={T.ink2} />
      </div>
    </div>
  );
}

function Stat({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 52 }}>
      <div style={{ fontSize: 15, fontWeight: 850, color }}>{value}</div>
      <div style={{ fontSize: 9.5, color: T.ink3, marginTop: 1 }}>{label}</div>
    </div>
  );
}

function Metric({ label, value, note, color }: { label: string; value: string; note: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.86)', border: `1px solid ${T.line}`, borderRadius: 13, padding: '15px 17px' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.ink3 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, margin: '4px 0 1px' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: T.ink3 }}>{note}</div>
    </div>
  );
}
