// Pantalla principal del SOLICITANTE.
// Responde en diez segundos: qué pedí, en qué va, quién lo tiene y cuándo llega.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, RequesterRow, RequesterSummary } from '../../lib/api';
import { useIsMobile } from '../../lib/useIsMobile';
import { T } from './theme';

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft:       { label: 'Borrador',     color: '#64748B', bg: '#F1F5F9' },
  pending:     { label: 'Enviada',      color: '#185FA5', bg: '#E6F1FB' },
  in_progress: { label: 'En aprobación', color: '#854F0B', bg: '#FEF3C7' },
  approved:    { label: 'Aprobada',     color: '#0F6E56', bg: '#DCFCE7' },
  rejected:    { label: 'Rechazada',    color: '#A32D2D', bg: '#FEE2E2' },
  cancelled:   { label: 'Cancelada',    color: '#64748B', bg: '#F1F5F9' },
};

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const key = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!key) return null;
  return new Date(key + 'T12:00:00').toLocaleDateString('es-EC', { day: 'numeric', month: 'short' });
};

type Filter = 'active' | 'closed' | 'all';

export default function MyRequests() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<RequesterRow[]>([]);
  const [summary, setSummary] = useState<RequesterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('active');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await api.getMyRequests();
      setRows(result.data);
      setSummary(result.summary);
    } finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = setInterval(() => void load(true), 20000); return () => clearInterval(timer); }, [load]);

  const isActive = (row: RequesterRow) =>
    ['draft', 'pending', 'in_progress'].includes(row.status) || (row.status === 'approved' && row.task_done !== 1);

  const visible = rows.filter(row =>
    filter === 'all' ? true : filter === 'active' ? isActive(row) : !isActive(row));

  const needsAttention = rows.filter(row => row.status === 'draft' || row.status === 'rejected');

  if (loading && !rows.length) return <div style={{ padding: 48, color: T.ink3 }}>Cargando tus solicitudes…</div>;

  return (
    <div style={{ padding: isMobile ? '20px 14px' : 32, maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.brand, textTransform: 'uppercase', letterSpacing: .8 }}>Lo que pediste</div>
          <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 850, color: T.ink, letterSpacing: -.7, margin: '4px 0' }}>Mis solicitudes</h1>
          <p style={{ color: T.ink3, fontSize: 14 }}>Estado, próximo paso y entregables, sin preguntar por chat.</p>
        </div>
        <button onClick={() => navigate('/solicitudes/nueva')} style={{ border: 0, borderRadius: 10, padding: '11px 17px', background: T.brand, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          Nueva solicitud
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12, marginBottom: 22 }}>
        <Metric label="En curso" value={summary?.in_flight ?? 0} note="esperando decisión o trabajo" color={T.brand} />
        <Metric label="Por entregar" value={summary?.awaiting_delivery ?? 0} note="el equipo está ejecutando" color="#854F0B" />
        <Metric label="Aprobadas" value={summary?.approved ?? 0} note="históricas" color="#0F9F6E" />
        <Metric label="Borradores" value={summary?.drafts ?? 0} note="sin enviar" color="#64748B" />
      </div>

      {needsAttention.length > 0 && (
        <section style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 13, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#9A3412', marginBottom: 8 }}>Esperan algo de tu parte</div>
          {needsAttention.map(row => (
            <div key={row.id} onClick={() => navigate(`/solicitudes/${row.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', cursor: 'pointer' }}>
              <span style={{ fontSize: 13, color: T.ink, fontWeight: 650, flex: 1 }}>{row.title}</span>
              <span style={{ fontSize: 11, color: '#9A3412', fontWeight: 700 }}>{row.next_step}</span>
            </div>
          ))}
        </section>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([['active', 'En curso'], ['closed', 'Cerradas'], ['all', 'Todas']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} style={{
            border: filter === key ? `1px solid ${T.brand}` : `1px solid ${T.line}`,
            background: filter === key ? '#E6F1FB' : '#fff', color: filter === key ? T.brand : T.ink2,
            borderRadius: 99, padding: '6px 13px', fontSize: 11.5, fontWeight: 750, cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div style={{ padding: 52, textAlign: 'center', background: '#fff', border: `1px dashed ${T.line}`, borderRadius: 13, color: T.ink3, fontSize: 13 }}>
          {filter === 'active' ? 'No tienes solicitudes en curso.' : 'No hay solicitudes en esta vista.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {visible.map(row => <RequestCard key={row.id} row={row} onOpen={() => navigate(`/solicitudes/${row.id}`)} />)}
        </div>
      )}
    </div>
  );
}

function RequestCard({ row, onOpen }: { row: RequesterRow; onOpen: () => void }) {
  const status = STATUS[row.status] ?? STATUS.pending;
  const estimated = formatDate(row.sla_due_at ?? row.task_due_date);
  const overdue = Boolean((row.sla_due_at ?? row.task_due_date) && new Date(String(row.sla_due_at ?? row.task_due_date)) < new Date() && row.task_done !== 1);
  const progress = stageProgress(row);

  return (
    <article onClick={onOpen} style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 13, padding: '15px 17px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 750, color: T.ink }}>{row.title}</div>
          <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 3 }}>{row.request_type_name}</div>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: status.color, background: status.bg, padding: '3px 9px', borderRadius: 7 }}>{status.label}</span>
      </div>

      <div style={{ display: 'flex', gap: 4, margin: '14px 0 10px' }}>
        {STAGES.map((stage, index) => (
          <div key={stage} style={{ flex: 1 }}>
            <div style={{ height: 4, borderRadius: 99, background: index <= progress ? T.brand : '#E2E8F0' }} />
            <div style={{ fontSize: 9.5, color: index <= progress ? T.ink2 : T.ink3, marginTop: 5, fontWeight: index === progress ? 800 : 500 }}>{stage}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
        <span style={{ fontSize: 12, color: T.ink2, fontWeight: 650, flex: '1 1 240px' }}>{row.next_step}</span>
        {row.deliverables_total > 0 && (
          <span style={{ fontSize: 11, color: row.deliverables_ready === row.deliverables_total ? '#0F6E56' : T.ink3, fontWeight: 700 }}>
            {row.deliverables_ready}/{row.deliverables_total} entregables
          </span>
        )}
        {estimated && (
          <span style={{ fontSize: 11, color: overdue ? '#C2413B' : T.ink3, fontWeight: overdue ? 800 : 600 }}>
            {overdue ? 'Venció ' : 'Estimado '}{estimated}
          </span>
        )}
      </div>
    </article>
  );
}

const STAGES = ['Enviada', 'Aprobación', 'Ejecución', 'Entrega'];

/** Índice de la etapa activa dentro de la línea de vida de la solicitud. */
function stageProgress(row: RequesterRow): number {
  if (row.status === 'draft') return -1;
  if (row.task_done === 1 || row.closed_at) return 3;
  if (row.status === 'approved') return 2;
  if (row.status === 'pending' || row.status === 'in_progress') return 1;
  return 0;
}

function Metric({ label, value, note, color }: { label: string; value: number; note: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.86)', border: `1px solid ${T.line}`, borderRadius: 13, padding: '15px 17px' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.ink3 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color, margin: '4px 0 1px' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: T.ink3 }}>{note}</div>
    </div>
  );
}
