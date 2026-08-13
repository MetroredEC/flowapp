import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';
import { api, PendingApproval, Space, Task, WorkDay } from '../../lib/api';
import { useIsMobile } from '../../lib/useIsMobile';
import { alertDialog, confirmDialog } from '../../components/AppDialog';
import { PRIORITY, T } from './theme';
import TaskDetail from './TaskDetail';

const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const isoToday = () => localDateKey();
const isoTomorrow = () => { const date = new Date(); date.setDate(date.getDate() + 1); return localDateKey(date); };
const taskDateKey = (value?: string | null) => String(value ?? '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;

export default function MyDay() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const firstName = accounts[0]?.name?.split(' ')[0] ?? '';
  const [day, setDay] = useState<WorkDay | null>(null);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [d, a, s] = await Promise.all([api.getMyDay(), api.getMyApprovals(), api.getSpaces()]);
      setDay(d.data); setApprovals(a.data); setSpaces(s.data);
    } finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = setInterval(() => void load(true), 12000); return () => clearInterval(timer); }, [load]);

  const doneStatus = useCallback((task: Task) => {
    const space = spaces.find(item => item.id === task.space_id);
    return space?.statuses.find(status => status.is_done === 1)?.key;
  }, [spaces]);

  async function update(task: Task, body: Partial<Task>) {
    setBusy(task.id);
    try { await api.updateTask(task.id, body); await load(true); }
    catch (error) { await alertDialog({ title: 'No se pudo actualizar', message: (error as Error).message, tone: 'danger' }); }
    finally { setBusy(null); }
  }

  async function completeNext() {
    const task = day?.planned[0];
    if (!task) return;
    const status = doneStatus(task);
    if (!status) return;
    const ok = await confirmDialog({ title: `¿Completar "${task.title}"?`, message: 'Se registrará en la línea de tiempo del trabajo.', confirmLabel: 'Completar' });
    if (ok) await update(task, { status });
  }

  async function decide(item: PendingApproval, action: 'approve' | 'reject') {
    const ok = await confirmDialog({
      title: `${action === 'approve' ? '¿Aprobar' : '¿Rechazar'} "${item.title}"?`,
      message: `${item.request_type_name} · ${item.requester_name} · nivel ${item.level} de ${item.total_levels}`,
      confirmLabel: action === 'approve' ? 'Aprobar' : 'Rechazar', danger: action === 'reject',
    });
    if (!ok) return;
    setBusy(item.step_id);
    try { await api.decideApproval(item.step_id, action); await load(true); }
    catch (error) { await alertDialog({ title: 'No se pudo registrar la decisión', message: (error as Error).message, tone: 'danger' }); }
    finally { setBusy(null); }
  }

  const greeting = new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';
  const planned = day?.planned ?? [];
  const suggested = day?.suggested ?? [];
  const summary = day?.summary;
  const progressTotal = (summary?.planned ?? 0) + (summary?.completed_today ?? 0);
  const progress = progressTotal ? Math.round(((summary?.completed_today ?? 0) / progressTotal) * 100) : 0;
  const openTask = useMemo(() => [...planned, ...suggested].find(t => t.id === openId), [planned, suggested, openId]);

  if (loading && !day) return <div style={{ padding: 48, color: T.ink3 }}>Preparando tu día…</div>;

  return (
    <div style={{ padding: isMobile ? '20px 14px' : 32, maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.brand, textTransform: 'uppercase', letterSpacing: .8 }}>Centro personal</div>
          <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 850, color: T.ink, letterSpacing: -.7, margin: '4px 0' }}>{greeting}{firstName ? `, ${firstName}` : ''}</h1>
          <p style={{ color: T.ink3, fontSize: 14 }}>Decide, prioriza y termina. El resto puede esperar.</p>
        </div>
        <button onClick={completeNext} disabled={!planned.length || Boolean(busy)} style={{ border: 0, borderRadius: 10, padding: '11px 17px', background: planned.length ? T.brand : '#E2E8F0', color: planned.length ? '#fff' : T.ink3, fontSize: 13, fontWeight: 800, cursor: planned.length ? 'pointer' : 'default' }}>
          Terminar siguiente tarea
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12, marginBottom: 22 }}>
        <Metric label="Plan de hoy" value={summary?.planned ?? 0} note={`${summary?.planned_minutes ?? 0} min estimados`} color={T.brand} />
        <Metric label="Completadas hoy" value={summary?.completed_today ?? 0} note={`${progress}% del plan`} color="#0F9F6E" />
        <Metric label="Vencidas" value={summary?.overdue ?? 0} note="requieren decisión" color="#C2413B" />
        <Metric label="Bloqueadas" value={summary?.blocked ?? 0} note="necesitan ayuda" color="#B7791F" />
      </div>

      <div style={{ height: 7, borderRadius: 99, background: '#E2E8F0', overflow: 'hidden', marginBottom: 26 }}>
        <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,#0284C7,#14B8A6)', transition: 'width .3s' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.5fr) minmax(300px,.8fr)', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 20 }}>
          <Section title="Tus 3 prioridades" subtitle="El orden visible es tu compromiso del día">
            {planned.length === 0 ? <Empty text="Aún no has armado tu plan. Añade una tarea desde las sugerencias." /> : planned.slice(0, 3).map((task, index) => (
              <TaskRow key={task.id} task={task} prefix={String(index + 1)} busy={busy === task.id} onOpen={() => setOpenId(task.id)}
                actions={<>
                  <Action label={task.is_blocked ? 'Desbloquear' : 'Bloquear'} onClick={() => update(task, { is_blocked: task.is_blocked ? 0 : 1 })} />
                  <Action label="Mañana" onClick={() => update(task, { planned_date: null, snoozed_until: isoTomorrow() })} />
                </>} />
            ))}
          </Section>

          {planned.length > 3 && <Section title="También en tu plan" subtitle={`${planned.length - 3} tareas adicionales`}>
            {planned.slice(3).map(task => <TaskRow key={task.id} task={task} busy={busy === task.id} onOpen={() => setOpenId(task.id)} actions={<Action label="Quitar de hoy" onClick={() => update(task, { planned_date: null })} />} />)}
          </Section>}

          <Section title="Qué conviene atender" subtitle="Vencidas, bloqueadas o de alta prioridad">
            {suggested.length === 0 ? <Empty text="No hay riesgos inmediatos. Tu cola está bajo control." /> : suggested.map(task => (
              <TaskRow key={task.id} task={task} busy={busy === task.id} onOpen={() => setOpenId(task.id)}
                actions={<><Action label="Planificar hoy" primary onClick={() => update(task, { planned_date: isoToday(), day_order: planned.length + 1, snoozed_until: null })} /><Action label="Posponer" onClick={() => update(task, { snoozed_until: isoTomorrow() })} /></>} />
            ))}
          </Section>
        </div>

        <Section title="Decisiones pendientes" subtitle={`${approvals.length} esperan por ti`}>
          {approvals.length === 0 ? <Empty text="No tienes aprobaciones pendientes." /> : approvals.slice(0, 6).map(item => (
            <div key={item.step_id} style={{ padding: '13px 14px', borderBottom: `1px solid ${T.line}` }}>
              <div onClick={() => navigate(`/solicitudes/${item.request_id}`)} style={{ cursor: 'pointer' }}>
                <div style={{ fontSize: 13.5, fontWeight: 750, color: T.ink }}>{item.title}</div>
                <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 3 }}>{item.requester_name} · {item.label} · nivel {item.level}/{item.total_levels}</div>
              </div>
              <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
                <Action label="Aprobar" primary disabled={busy === item.step_id} onClick={() => decide(item, 'approve')} />
                <Action label="Rechazar" disabled={busy === item.step_id} onClick={() => decide(item, 'reject')} />
              </div>
            </div>
          ))}
        </Section>
      </div>

      {openId && <TaskDetail taskId={openId} space={spaces.find(s => s.id === openTask?.space_id)} onClose={() => setOpenId(null)} onChange={() => load(true)} />}
    </div>
  );
}

function Metric({ label, value, note, color }: { label: string; value: number; note: string; color: string }) {
  return <div style={{ background: 'rgba(255,255,255,.86)', border: `1px solid ${T.line}`, borderRadius: 13, padding: '15px 17px' }}><div style={{ fontSize: 11.5, fontWeight: 700, color: T.ink3 }}>{label}</div><div style={{ fontSize: 28, fontWeight: 900, color, margin: '4px 0 1px' }}>{value}</div><div style={{ fontSize: 10.5, color: T.ink3 }}>{note}</div></div>;
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section style={{ background: 'rgba(255,255,255,.88)', border: `1px solid ${T.line}`, borderRadius: 14, overflow: 'hidden' }}><div style={{ padding: '15px 16px 11px', borderBottom: `1px solid ${T.line}` }}><h2 style={{ fontSize: 14.5, fontWeight: 800, color: T.ink }}>{title}</h2><p style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>{subtitle}</p></div>{children}</section>;
}

function Empty({ text }: { text: string }) { return <div style={{ padding: '24px 16px', color: T.ink3, fontSize: 12.5, textAlign: 'center' }}>{text}</div>; }

function TaskRow({ task, prefix, actions, onOpen, busy }: { task: Task; prefix?: string; actions: React.ReactNode; onOpen: () => void; busy: boolean }) {
  const priority = PRIORITY[task.priority] ?? PRIORITY.normal;
  const dueKey = taskDateKey(task.due_date);
  const overdue = Boolean(dueKey && dueKey < isoToday());
  return <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderBottom: `1px solid ${T.line}`, opacity: busy ? .55 : 1, flexWrap: 'wrap' }}>
    <div style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: prefix ? '#E6F1FB' : (task.space_color ?? '#E2E8F0') + '22', color: prefix ? T.brand : (task.space_color ?? T.ink2), fontSize: 11, fontWeight: 850 }}>{prefix ?? '•'}</div>
    <div onClick={onOpen} style={{ flex: '1 1 220px', minWidth: 0, cursor: 'pointer' }}><div style={{ fontSize: 13.5, color: T.ink, fontWeight: 650 }}>{task.title}</div><div style={{ display: 'flex', gap: 7, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ fontSize: 10.5, color: T.ink3 }}>{task.space_name}</span><span style={{ fontSize: 9.5, fontWeight: 750, color: priority.color, background: priority.bg, padding: '1px 6px', borderRadius: 6 }}>{priority.label}</span>{task.is_blocked ? <span style={{ fontSize: 9.5, color: '#9A6700', fontWeight: 800 }}>Bloqueada</span> : null}{dueKey ? <span style={{ fontSize: 10.5, color: overdue ? '#C2413B' : T.ink3, fontWeight: overdue ? 800 : 500 }}>{overdue ? 'Venció ' : 'Vence '}{new Date(dueKey + 'T12:00:00').toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })}</span> : null}</div></div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{actions}</div>
  </div>;
}

function Action({ label, onClick, primary, disabled }: { label: string; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return <button disabled={disabled} onClick={onClick} style={{ border: primary ? 0 : `1px solid ${T.line}`, background: primary ? T.brand : '#fff', color: primary ? '#fff' : T.ink2, borderRadius: 7, padding: '6px 9px', fontSize: 10.5, fontWeight: 750, cursor: disabled ? 'wait' : 'pointer' }}>{label}</button>;
}
