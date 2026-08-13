// Pantalla principal del SOLICITANTE.
//
// Responde en diez segundos: qué pedí, en qué va, quién lo tiene y cuándo llega.
// Y deja resolver sin escribirle a nadie: corregir, cancelar, duplicar,
// confirmar, devolver, reabrir y calificar.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, RequesterRow, RequesterSummary } from '../../lib/api';
import { useIsMobile } from '../../lib/useIsMobile';
import { alertDialog, confirmDialog } from '../../components/AppDialog';
import { T } from './theme';

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft:       { label: 'Borrador',      color: '#64748B', bg: '#F1F5F9' },
  pending:     { label: 'Enviada',       color: '#185FA5', bg: '#E6F1FB' },
  in_progress: { label: 'En aprobación', color: '#854F0B', bg: '#FEF3C7' },
  approved:    { label: 'Aprobada',      color: '#0F6E56', bg: '#DCFCE7' },
  rejected:    { label: 'Rechazada',     color: '#A32D2D', bg: '#FEE2E2' },
  cancelled:   { label: 'Cancelada',     color: '#64748B', bg: '#F1F5F9' },
};

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const key = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!key) return null;
  return new Date(key + 'T12:00:00').toLocaleDateString('es-EC', { day: 'numeric', month: 'short' });
};

type Filter = 'active' | 'closed' | 'all';
type PanelKind = 'return' | 'reopen' | 'cancel' | 'rate' | 'edit';
interface Panel { id: string; kind: PanelKind }

export default function MyRequests() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<RequesterRow[]>([]);
  const [summary, setSummary] = useState<RequesterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('active');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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

  /** Ejecuta una acción del solicitante y refresca sin perder el scroll. */
  const run = useCallback(async (id: string, action: () => Promise<unknown>, success?: string) => {
    setBusy(id);
    try {
      await action();
      setPanel(null);
      await load(true);
      if (success) await alertDialog({ title: success, tone: 'success' });
    } catch (error) {
      await alertDialog({ title: 'No se pudo completar', message: (error as Error).message, tone: 'danger' });
    } finally { setBusy(null); }
  }, [load]);

  const duplicate = (row: RequesterRow) => run(row.id, async () => {
    const created = await api.duplicateRequest(row.id);
    navigate(`/solicitudes/${created.data.id}`);
  });

  const isActive = (row: RequesterRow) =>
    ['draft', 'pending', 'in_progress'].includes(row.status) || (row.status === 'approved' && !row.confirmed_at);

  const visible = rows.filter(row =>
    filter === 'all' ? true : filter === 'active' ? isActive(row) : !isActive(row));

  // Lo que está detenido esperando al propio solicitante, no al equipo.
  const needsAttention = rows.filter(row =>
    row.status === 'draft' || row.status === 'rejected' || (row.delivered_at && !row.confirmed_at));

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
        <Metric label="Esperan por ti" value={summary?.awaiting_me ?? 0} note="tú desbloqueas esto" color="#B7791F" />
        <Metric label="En curso" value={summary?.in_flight ?? 0} note="aprobación o ejecución" color={T.brand} />
        <Metric label="Aprobadas" value={summary?.approved ?? 0} note="históricas" color="#0F9F6E" />
        <Metric label="Borradores" value={summary?.drafts ?? 0} note="sin enviar" color="#64748B" />
      </div>

      {needsAttention.length > 0 && (
        <section style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 13, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#9A3412', marginBottom: 8 }}>Esperan algo de tu parte</div>
          {needsAttention.map(row => (
            <div key={row.id} onClick={() => navigate(`/solicitudes/${row.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', cursor: 'pointer', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: T.ink, fontWeight: 650, flex: '1 1 200px' }}>{row.title}</span>
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
          {visible.map(row => (
            <RequestCard
              key={row.id} row={row} busy={busy === row.id}
              panel={panel?.id === row.id ? panel.kind : null}
              onPanel={kind => setPanel(kind ? { id: row.id, kind } : null)}
              onOpen={() => navigate(`/solicitudes/${row.id}`)}
              onDuplicate={() => duplicate(row)}
              onRun={(action, success) => run(row.id, action, success)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ row, busy, panel, onPanel, onOpen, onDuplicate, onRun }: {
  row: RequesterRow;
  busy: boolean;
  panel: PanelKind | null;
  onPanel: (kind: PanelKind | null) => void;
  onOpen: () => void;
  onDuplicate: () => void;
  onRun: (action: () => Promise<unknown>, success?: string) => Promise<void>;
}) {
  const status = STATUS[row.status] ?? STATUS.pending;
  const estimated = formatDate(row.sla_due_at ?? row.task_due_date);
  const overdue = Boolean((row.sla_due_at ?? row.task_due_date)
    && new Date(String(row.sla_due_at ?? row.task_due_date)) < new Date() && !row.confirmed_at);
  const progress = stageProgress(row);

  const editable = ['draft', 'pending', 'in_progress'].includes(row.status);
  const awaitingConfirmation = Boolean(row.delivered_at && !row.confirmed_at);
  const canRate = Boolean(row.confirmed_at) && !row.rating;
  const canReopen = Boolean(row.confirmed_at)
    && Boolean(row.reopen_due_at) && new Date(String(row.reopen_due_at)) > new Date();

  const confirm = async () => {
    const ok = await confirmDialog({
      title: `¿Confirmar la recepción de "${row.title}"?`,
      message: 'Se cerrará el proceso y quedará registrado en la línea de tiempo.',
      confirmLabel: 'Confirmar recepción',
    });
    if (ok) await onRun(() => api.confirmDelivery(row.id), 'Recepción confirmada');
  };

  return (
    <article style={{
      background: '#fff', borderRadius: 13, padding: '15px 17px',
      border: `1px solid ${awaitingConfirmation ? '#FED7AA' : T.line}`,
      borderLeft: awaitingConfirmation ? '3px solid #B7791F' : `1px solid ${T.line}`,
      opacity: busy ? .6 : 1,
    }}>
      <div onClick={onOpen} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', cursor: 'pointer' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 750, color: T.ink }}>{row.title}</div>
          <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 3 }}>
            {row.request_type_name}
            {row.reopen_count ? ` · reabierta ${row.reopen_count}×` : ''}
            {row.return_count ? ` · devuelta ${row.return_count}×` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {row.rating ? <span style={{ fontSize: 11, color: '#B7791F', fontWeight: 800 }}>{'★'.repeat(row.rating)}</span> : null}
          <span style={{ fontSize: 10.5, fontWeight: 800, color: status.color, background: status.bg, padding: '3px 9px', borderRadius: 7 }}>{status.label}</span>
        </div>
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
        <span style={{ fontSize: 12, color: T.ink2, fontWeight: 650, flex: '1 1 220px' }}>{row.next_step}</span>
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

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
        {awaitingConfirmation && <Action label="Confirmar recepción" primary disabled={busy} onClick={confirm} />}
        {awaitingConfirmation && <Action label="Devolver" disabled={busy} onClick={() => onPanel(panel === 'return' ? null : 'return')} />}
        {canRate && <Action label="Calificar" primary disabled={busy} onClick={() => onPanel(panel === 'rate' ? null : 'rate')} />}
        {canReopen && <Action label="Reabrir" disabled={busy} onClick={() => onPanel(panel === 'reopen' ? null : 'reopen')} />}
        {editable && <Action label="Corregir" disabled={busy} onClick={() => onPanel(panel === 'edit' ? null : 'edit')} />}
        {editable && <Action label="Cancelar" disabled={busy} onClick={() => onPanel(panel === 'cancel' ? null : 'cancel')} />}
        <Action label="Duplicar" disabled={busy} onClick={onDuplicate} />
      </div>

      {panel === 'return' && (
        <ReasonPanel
          title="¿Qué falta o qué está mal?"
          hint="El equipo recibirá tu motivo y el trabajo volverá a abrirse."
          confirmLabel="Devolver entrega" danger
          onCancel={() => onPanel(null)}
          onSubmit={reason => onRun(() => api.returnDelivery(row.id, reason), 'Entrega devuelta al equipo')}
        />
      )}
      {panel === 'reopen' && (
        <ReasonPanel
          title="¿Por qué debe reabrirse?"
          hint={`Puedes reabrir hasta el ${formatDate(row.reopen_due_at) ?? 'plazo acordado'}.`}
          confirmLabel="Reabrir solicitud"
          onCancel={() => onPanel(null)}
          onSubmit={reason => onRun(() => api.reopenRequest(row.id, reason), 'Solicitud reabierta')}
        />
      )}
      {panel === 'cancel' && (
        <ReasonPanel
          title="¿Por qué cancelas la solicitud?"
          hint={row.status === 'draft' ? 'Es un borrador: puedes cancelarlo sin motivo.' : 'Quien ya la revisó verá tu explicación.'}
          confirmLabel="Cancelar solicitud" danger
          optional={row.status === 'draft'}
          onCancel={() => onPanel(null)}
          onSubmit={reason => onRun(() => api.cancelRequest(row.id, reason), 'Solicitud cancelada')}
        />
      )}
      {panel === 'edit' && (
        <EditPanel
          row={row}
          onCancel={() => onPanel(null)}
          onSubmit={(title, description) => onRun(() => api.updateRequest(row.id, { title, description }), 'Solicitud corregida')}
        />
      )}
      {panel === 'rate' && (
        <RatePanel
          onCancel={() => onPanel(null)}
          onSubmit={(rating, comment) => onRun(() => api.rateRequest(row.id, rating, comment), 'Gracias por calificar')}
        />
      )}
    </article>
  );
}

/** Panel de motivo. El mínimo de 10 caracteres lo valida también el backend. */
function ReasonPanel({ title, hint, confirmLabel, danger, optional, onCancel, onSubmit }: {
  title: string; hint: string; confirmLabel: string;
  danger?: boolean; optional?: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const valid = optional || reason.trim().length >= 10;

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 11, color: T.ink3, marginBottom: 9 }}>{hint}</div>
      <textarea
        value={reason} onChange={event => setReason(event.target.value)} rows={3} autoFocus
        placeholder="Escribe el motivo…"
        style={{ width: '100%', border: `1px solid ${T.line}`, borderRadius: 8, padding: '9px 11px', fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
        <Action label={confirmLabel} primary danger={danger} disabled={!valid} onClick={() => onSubmit(reason.trim())} />
        <Action label="Cancelar" onClick={onCancel} />
        {!valid && <span style={{ fontSize: 10.5, color: T.ink3 }}>Faltan {10 - reason.trim().length} caracteres</span>}
      </div>
    </div>
  );
}

function EditPanel({ row, onCancel, onSubmit }: {
  row: RequesterRow;
  onCancel: () => void;
  onSubmit: (title: string, description: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(row.title);
  const [description, setDescription] = useState(row.description ?? '');
  const changed = title.trim() !== row.title || description !== (row.description ?? '');

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, marginBottom: 3 }}>Corregir la solicitud</div>
      <div style={{ fontSize: 11, color: T.ink3, marginBottom: 9 }}>
        Puedes corregir mientras no sea aprobada. El cambio queda en la línea de tiempo.
      </div>
      <input
        value={title} onChange={event => setTitle(event.target.value)} autoFocus placeholder="Título"
        style={{ width: '100%', border: `1px solid ${T.line}`, borderRadius: 8, padding: '9px 11px', fontSize: 12.5, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }}
      />
      <textarea
        value={description} onChange={event => setDescription(event.target.value)} rows={3} placeholder="Descripción"
        style={{ width: '100%', border: `1px solid ${T.line}`, borderRadius: 8, padding: '9px 11px', fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
        <Action label="Guardar cambios" primary disabled={!changed || !title.trim()} onClick={() => onSubmit(title.trim(), description)} />
        <Action label="Cancelar" onClick={onCancel} />
      </div>
    </div>
  );
}

function RatePanel({ onCancel, onSubmit }: {
  onCancel: () => void;
  onSubmit: (rating: number, comment: string) => Promise<void>;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, marginBottom: 9 }}>¿Cómo estuvo el servicio?</div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
        {[1, 2, 3, 4, 5].map(value => (
          <button key={value} onClick={() => setRating(value)} aria-label={`${value} de 5`} style={{
            border: 'none', background: 'none', cursor: 'pointer', fontSize: 24, lineHeight: 1, padding: 0,
            color: value <= rating ? '#F0A73E' : '#D8DEE7',
          }}>★</button>
        ))}
      </div>
      <textarea
        value={comment} onChange={event => setComment(event.target.value)} rows={2}
        placeholder="Comentario opcional"
        style={{ width: '100%', border: `1px solid ${T.line}`, borderRadius: 8, padding: '9px 11px', fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
        <Action label="Enviar calificación" primary disabled={rating < 1} onClick={() => onSubmit(rating, comment.trim())} />
        <Action label="Ahora no" onClick={onCancel} />
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  marginTop: 12, padding: 13, background: '#F8FAFC',
  border: `1px solid ${T.line}`, borderRadius: 10,
};

function Action({ label, onClick, primary, danger, disabled }: {
  label: string; onClick: () => void; primary?: boolean; danger?: boolean; disabled?: boolean;
}) {
  const background = disabled ? '#E2E8F0' : primary ? (danger ? '#C2413B' : T.brand) : '#fff';
  const color = disabled ? T.ink3 : primary ? '#fff' : (danger ? '#C2413B' : T.ink2);
  return (
    <button disabled={disabled} onClick={onClick} style={{
      border: primary ? 0 : `1px solid ${T.line}`, background, color,
      borderRadius: 8, padding: '7px 12px', fontSize: 11.5, fontWeight: 750,
      cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
    }}>{label}</button>
  );
}

const STAGES = ['Enviada', 'Aprobación', 'Ejecución', 'Entrega'];

/** Índice de la etapa activa dentro de la línea de vida de la solicitud. */
function stageProgress(row: RequesterRow): number {
  if (row.status === 'draft') return -1;
  if (row.delivered_at || row.confirmed_at) return 3;
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
