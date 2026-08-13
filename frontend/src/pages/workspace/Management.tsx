import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../lib/useIsMobile';
import { api, ManagementMetrics } from '../../lib/api';
import { T, PRIORITY, initials } from './theme';

const SLA_LABEL: Record<string, string> = {
  urgent: '≤ 2 días', high: '≤ 4 días', normal: '≤ 6 días', low: '≤ 8 días',
};
const PRIORITY_ORDER = ['urgent', 'high', 'normal', 'low'];

export default function Management() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [m, setM] = useState<ManagementMetrics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getMetrics().then(r => setM(r.data)).catch(e => setError((e as Error).message));
  }, []);

  if (error) {
    return (
      <div style={{ padding: isMobile ? '20px 14px' : 32, maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 12, padding: '14px 18px', fontSize: 13 }}>
          {error}
        </div>
      </div>
    );
  }
  if (!m) return <div style={{ padding: 40, color: T.ink3 }}>Calculando métricas…</div>;

  // Agregados globales
  const slaTotals = m.slaByPriority.reduce((a, s) => ({ done: a.done + s.done30, within: a.within + s.within }), { done: 0, within: 0 });
  const slaPct = slaTotals.done > 0 ? Math.round((slaTotals.within / slaTotals.done) * 100) : null;
  const cycles = m.bySpace.filter(s => s.cycle_days != null && s.done30 > 0);
  const cycleGlobal = cycles.length
    ? (cycles.reduce((a, s) => a + (s.cycle_days ?? 0) * s.done30, 0) / cycles.reduce((a, s) => a + s.done30, 0)).toFixed(1)
    : null;

  function exportCsv() {
    const lines: string[] = [];
    lines.push('POR ÁREA');
    lines.push('Área,Abiertas,Completadas 30d,Ciclo medio (días)');
    for (const s of m!.bySpace) lines.push(`${s.name},${s.open},${s.done30},${s.cycle_days ?? ''}`);
    lines.push('');
    lines.push('TAREAS ENVEJECIDAS (>7 días sin movimiento)');
    lines.push('Título,Área,Responsable,Prioridad,Días sin movimiento');
    for (const t of m!.aged) lines.push(`"${t.title.replace(/"/g, '""')}",${t.space_name},${t.assignee_name ?? 'Sin asignar'},${t.priority},${t.stale_days}`);
    lines.push('');
    lines.push('APROBADORES');
    lines.push('Nombre,Pendientes,Decididas 30d,Horas promedio de decisión');
    for (const a of m!.approvers) lines.push(`${a.name},${a.pending},${a.decided},${a.avg_hours ?? ''}`);
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flowapp-gerencia-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: isMobile ? '20px 14px' : 32, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: T.ink, letterSpacing: -0.4 }}>Gerencia</h1>
        <span style={{ fontSize: 12, color: T.ink3, background: '#F1F5F9', padding: '3px 10px', borderRadius: 8 }}>últimos 30 días</span>
        <button onClick={exportCsv} style={{
          marginLeft: 'auto', background: '#fff', border: `1px solid ${T.line}`, borderRadius: 9,
          padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: T.ink2, cursor: 'pointer',
        }}>
          Exportar CSV
        </button>
      </div>
      <p style={{ color: T.ink3, fontSize: 13, marginBottom: 24 }}>
        Cumplimiento, velocidad y cuellos de botella por área.
      </p>

      {/* KPIs globales */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12, marginBottom: 26 }}>
        <Kpi label="Solicitudes creadas" value={m.requests.created30 ?? 0} sub={`${m.requests.inflight ?? 0} en curso`} color={T.brand} />
        <Kpi label="Cumplimiento SLA" value={slaPct != null ? `${slaPct}%` : '—'} sub={`${slaTotals.within}/${slaTotals.done} a tiempo`} color={slaPct == null ? T.ink3 : slaPct >= 80 ? '#0F6E56' : slaPct >= 60 ? '#854F0B' : '#A32D2D'} />
        <Kpi label="Ciclo medio" value={cycleGlobal != null ? `${cycleGlobal}d` : '—'} sub="de creación a entrega" color="#534AB7" />
        <Kpi label="Envejecidas" value={m.agedCount} sub=">7 días sin movimiento" color={m.agedCount > 0 ? '#A32D2D' : '#0F6E56'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, alignItems: 'start', marginBottom: 26 }}>
        {/* Por área */}
        <section>
          <h2 style={secTitle}>Por área</h2>
          <div style={card}>
            <div style={{ ...row, fontSize: 10.5, fontWeight: 800, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <span style={{ flex: 1 }}>Área</span>
              <span style={{ width: 62, textAlign: 'right' }}>Abiertas</span>
              <span style={{ width: 62, textAlign: 'right' }}>Hechas</span>
              <span style={{ width: 62, textAlign: 'right' }}>Ciclo</span>
            </div>
            {m.bySpace.map(s => (
              <div key={s.id} style={{ ...row, cursor: 'pointer' }} onClick={() => navigate(`/espacio/${s.id}`)}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{s.name}</span>
                </span>
                <span style={{ width: 62, textAlign: 'right', fontSize: 13, color: T.ink }}>{s.open}</span>
                <span style={{ width: 62, textAlign: 'right', fontSize: 13, color: '#0F6E56' }}>{s.done30}</span>
                <span style={{ width: 62, textAlign: 'right', fontSize: 13, color: T.ink2 }}>{s.cycle_days != null ? `${s.cycle_days}d` : '—'}</span>
              </div>
            ))}
          </div>
        </section>

        {/* SLA por prioridad */}
        <section>
          <h2 style={secTitle}>SLA por prioridad</h2>
          <div style={{ ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {PRIORITY_ORDER.map(pk => {
              const s = m.slaByPriority.find(x => x.priority === pk);
              const p = PRIORITY[pk] ?? PRIORITY.normal;
              const pct = s && s.done30 > 0 ? Math.round((s.within / s.done30) * 100) : null;
              return (
                <div key={pk}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, background: p.bg, color: p.color, padding: '1px 8px', borderRadius: 8 }}>{p.label}</span>
                    <span style={{ fontSize: 11, color: T.ink3 }}>{SLA_LABEL[pk]}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: pct == null ? T.ink3 : pct >= 80 ? '#0F6E56' : pct >= 60 ? '#854F0B' : '#A32D2D' }}>
                      {pct != null ? `${pct}%` : 'sin datos'}
                    </span>
                    {s && <span style={{ fontSize: 11, color: T.ink3 }}>({s.within}/{s.done30})</span>}
                  </div>
                  <div style={{ height: 7, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct ?? 0}%`, background: pct == null ? T.line : pct >= 80 ? '#1D9E75' : pct >= 60 ? '#EF9F27' : '#E24B4A', borderRadius: 99, transition: 'width .3s' }} />
                  </div>
                </div>
              );
            })}
            <p style={{ fontSize: 11, color: T.ink3, margin: 0 }}>Sobre tareas completadas en los últimos 30 días.</p>
          </div>
        </section>
      </div>

      {/* Aprobadores */}
      <section style={{ marginBottom: 26 }}>
        <h2 style={secTitle}>Aprobadores — cuellos de botella</h2>
        <div style={card}>
          {m.approvers.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: T.ink3, fontSize: 13 }}>Sin actividad de aprobación aún.</div>
          ) : (
            <>
              <div style={{ ...row, fontSize: 10.5, fontWeight: 800, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                <span style={{ flex: 1 }}>Aprobador</span>
                <span style={{ width: 90, textAlign: 'right' }}>Pendientes</span>
                <span style={{ width: 100, textAlign: 'right' }}>Decididas 30d</span>
                <span style={{ width: 110, textAlign: 'right' }}>Tiempo medio</span>
              </div>
              {m.approvers.map(a => (
                <div key={a.email} style={row}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#E6F1FB', color: T.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initials(a.name)}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  </span>
                  <span style={{ width: 90, textAlign: 'right' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 9, background: a.pending > 2 ? '#FCEBEB' : a.pending > 0 ? '#FAEEDA' : '#F1F5F9', color: a.pending > 2 ? '#A32D2D' : a.pending > 0 ? '#854F0B' : T.ink3 }}>
                      {a.pending}
                    </span>
                  </span>
                  <span style={{ width: 100, textAlign: 'right', fontSize: 13, color: T.ink2 }}>{a.decided}</span>
                  <span style={{ width: 110, textAlign: 'right', fontSize: 13, color: T.ink2 }}>{a.avg_hours != null ? `${a.avg_hours}h` : '—'}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      {/* Envejecidas */}
      <section>
        <h2 style={secTitle}>Tareas envejecidas <span style={{ fontWeight: 400, color: T.ink3, fontSize: 12 }}>— más de 7 días sin movimiento</span></h2>
        <div style={card}>
          {m.aged.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#0F6E56', fontSize: 13, fontWeight: 600 }}>Nada envejecido. Buen ritmo.</div>
          ) : m.aged.map(t => {
            const p = PRIORITY[t.priority] ?? PRIORITY.normal;
            return (
              <div key={t.id} style={{ ...row, cursor: 'pointer' }} onClick={() => navigate(`/espacio/${t.space_id}`)}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.space_color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: T.ink, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  <span style={{ fontSize: 11, color: T.ink3 }}>{t.space_name} · {t.assignee_name ?? 'Sin asignar'}</span>
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 700, background: p.bg, color: p.color, padding: '2px 8px', borderRadius: 8, flexShrink: 0 }}>{p.label}</span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: t.stale_days > 14 ? '#A32D2D' : '#854F0B', width: 52, textAlign: 'right' }}>{t.stale_days}d</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: number | string; sub: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: T.ink3, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color, letterSpacing: -1 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.ink3, marginTop: 3 }}>{sub}</div>
    </div>
  );
}

const secTitle: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 10 };
const card: React.CSSProperties = { background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, overflow: 'hidden' };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: `1px solid ${T.line}` };
