// Pantalla principal del APROBADOR.
// Una decisión necesita contexto, impacto y vencimiento en la misma pantalla:
// si hay que abrir tres vistas para decidir, la decisión se posterga.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, DecisionRow, DecisionSummary } from '../../lib/api';
import { useIsMobile } from '../../lib/useIsMobile';
import { alertDialog, confirmDialog } from '../../components/AppDialog';
import { T } from './theme';

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(String(value).includes('T') ? String(value) : String(value).replace(' ', 'T') + 'Z');
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString('es-EC', { day: 'numeric', month: 'short' });
};

export default function Decisions() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<DecisionRow[]>([]);
  const [summary, setSummary] = useState<DecisionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await api.getDecisions();
      setRows(result.data);
      setSummary(result.summary);
    } finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = setInterval(() => void load(true), 15000); return () => clearInterval(timer); }, [load]);

  async function decide(row: DecisionRow, action: 'approve' | 'reject') {
    const ok = await confirmDialog({
      title: `${action === 'approve' ? '¿Aprobar' : '¿Rechazar'} "${row.title}"?`,
      message: `${row.request_type_name} · ${row.requester_name} · nivel ${row.level} de ${row.total_levels}`,
      confirmLabel: action === 'approve' ? 'Aprobar' : 'Rechazar',
      danger: action === 'reject',
    });
    if (!ok) return;
    setBusy(row.step_id);
    try { await api.decideApproval(row.step_id, action); await load(true); }
    catch (error) { await alertDialog({ title: 'No se pudo registrar la decisión', message: (error as Error).message, tone: 'danger' }); }
    finally { setBusy(null); }
  }

  if (loading && !rows.length) return <div style={{ padding: 48, color: T.ink3 }}>Buscando decisiones pendientes…</div>;

  return (
    <div style={{ padding: isMobile ? '20px 14px' : 32, maxWidth: 1020, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: T.brand, textTransform: 'uppercase', letterSpacing: .8 }}>Centro de decisiones</div>
        <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 850, color: T.ink, letterSpacing: -.7, margin: '4px 0' }}>Esperan tu decisión</h1>
        <p style={{ color: T.ink3, fontSize: 14 }}>Con el contexto suficiente para decidir sin salir de aquí.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        <Metric label="Pendientes" value={String(summary?.pending ?? 0)} note="esperan por ti" color={T.brand} />
        <Metric label="Vencidas" value={String(summary?.overdue ?? 0)} note="pasaron su fecha" color="#C2413B" />
        <Metric label="Más antigua" value={`${summary?.oldest_days ?? 0}d`} note="sin respuesta" color="#B7791F" />
        <Metric label="Tu tiempo medio" value={summary?.avg_hours != null ? `${summary.avg_hours}h` : '—'} note={`${summary?.decided30 ?? 0} decisiones en 30d`} color="#0F9F6E" />
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 52, textAlign: 'center', background: '#fff', border: `1px dashed ${T.line}`, borderRadius: 13, color: T.ink3, fontSize: 13 }}>
          No tienes decisiones pendientes. Nadie está bloqueado esperándote.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map(row => {
            const overdue = Boolean(row.sla_due_at && new Date(row.sla_due_at) < new Date());
            const due = formatDate(row.sla_due_at);
            const open = expanded === row.step_id;
            return (
              <article key={row.step_id} style={{
                background: '#fff', borderRadius: 13, padding: '16px 18px',
                border: `1px solid ${overdue ? '#FCA5A5' : T.line}`,
                borderLeft: `3px solid ${overdue ? '#C2413B' : T.brand}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 780, color: T.ink }}>{row.title}</div>
                    <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 3 }}>
                      {row.request_type_name} · {row.requester_name} · nivel {row.level} de {row.total_levels}
                      {row.label ? ` · ${row.label}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: overdue ? '#C2413B' : T.ink2 }}>
                      {due ? (overdue ? `Venció ${due}` : `Vence ${due}`) : 'Sin fecha límite'}
                    </div>
                    <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 2 }}>{row.waiting_days} días esperando</div>
                  </div>
                </div>

                {/* Impacto: qué se desbloquea o se detiene con esta decisión */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
                  <Chip label={`${row.attachment_count} ${row.attachment_count === 1 ? 'adjunto' : 'adjuntos'}`} />
                  <Chip label={`${row.requester_in_flight} en curso de ${row.requester_name.split(' ')[0]}`} />
                  {row.waiting_days >= 3 && <Chip label="Bloquea al solicitante" tone="warn" />}
                  {overdue && <Chip label="Fuera de SLA" tone="danger" />}
                </div>

                {row.description && (
                  <div style={{ fontSize: 12.5, color: T.ink2, lineHeight: 1.55, marginBottom: 12 }}>
                    {open || row.description.length <= 220 ? row.description : `${row.description.slice(0, 220)}…`}
                    {row.description.length > 220 && (
                      <button onClick={() => setExpanded(open ? null : row.step_id)} style={{ border: 0, background: 'none', color: T.brand, fontSize: 12, fontWeight: 750, cursor: 'pointer', padding: '0 0 0 6px' }}>
                        {open ? 'ver menos' : 'ver todo'}
                      </button>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
                  <button disabled={busy === row.step_id} onClick={() => decide(row, 'approve')} style={{ border: 0, background: '#0F9F6E', color: '#fff', borderRadius: 8, padding: '9px 16px', fontSize: 12.5, fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}>
                    Aprobar
                  </button>
                  <button disabled={busy === row.step_id} onClick={() => decide(row, 'reject')} style={{ border: `1px solid ${T.line}`, background: '#fff', color: '#C2413B', borderRadius: 8, padding: '9px 16px', fontSize: 12.5, fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}>
                    Rechazar
                  </button>
                  <button onClick={() => navigate(`/solicitudes/${row.request_id}`)} style={{ border: `1px solid ${T.line}`, background: '#fff', color: T.ink2, borderRadius: 8, padding: '9px 16px', fontSize: 12.5, fontWeight: 750, cursor: 'pointer', marginLeft: 'auto' }}>
                    Ver expediente completo
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ label, tone }: { label: string; tone?: 'warn' | 'danger' }) {
  const palette = tone === 'danger'
    ? { bg: '#FEE2E2', color: '#A32D2D' }
    : tone === 'warn' ? { bg: '#FEF3C7', color: '#854F0B' } : { bg: '#F1F5F9', color: T.ink2 };
  return <span style={{ fontSize: 10.5, fontWeight: 750, background: palette.bg, color: palette.color, padding: '4px 9px', borderRadius: 7 }}>{label}</span>;
}

function Metric({ label, value, note, color }: { label: string; value: string; note: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.86)', border: `1px solid ${T.line}`, borderRadius: 13, padding: '15px 17px' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.ink3 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color, margin: '4px 0 1px' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: T.ink3 }}>{note}</div>
    </div>
  );
}
