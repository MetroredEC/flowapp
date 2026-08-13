import { useEffect, useState, useCallback, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import { api, Task, TaskComment, TaskActivity, TaskChecklistItem, TaskDeliverable, Space, EntraUser } from '../../lib/api';
import { T, PRIORITY, initials, timeAgo } from './theme';
import { alertDialog } from '../../components/AppDialog';

interface Props {
  taskId: string;
  space?: Space;
  onClose: () => void;
  onChange?: () => void;
}

const ACTION_LABEL: Record<string, string> = {
  created: 'creó la tarea',
  status: 'cambió el estado',
  assigned: 'reasignó',
  priority: 'cambió la prioridad',
  comment: 'comentó',
  approved: 'aprobó',
  rejected: 'rechazó',
  due: 'cambió la fecha',
};

export default function TaskDetail({ taskId, space, onClose, onChange }: Props) {
  const { accounts } = useMsal();
  const me = accounts[0];
  const myEmail = me?.username ?? '';

  const [task, setTask]         = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>([]);
  const [deliverables, setDeliverables] = useState<TaskDeliverable[]>([]);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);
  const [draft, setDraft]       = useState('');
  const [sending, setSending]   = useState(false);
  const [tab, setTab]           = useState<'comments' | 'activity'>('comments');

  // Mención autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<EntraUser[]>([]);
  const [picked, setPicked] = useState<Record<string, string>>({});  // name -> email
  const taRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await api.getTask(taskId);
      setTask(r.data.task);
      setComments(r.data.comments);
      setActivity(r.data.activity);
      setChecklist(r.data.checklist ?? []);
      setDeliverables(r.data.deliverables ?? []);
      setEvidence(current => ({
        ...Object.fromEntries((r.data.deliverables ?? []).map(item => [item.id, item.evidence_url ?? ''])),
        ...current,
      }));
    } finally { setLoading(false); }
  }, [taskId]);

  useEffect(() => { void load(); }, [load]);

  // Polling en vivo cada 6s
  useEffect(() => {
    const iv = setInterval(() => void load(true), 6000);
    return () => clearInterval(iv);
  }, [load]);

  // Búsqueda de menciones
  useEffect(() => {
    if (mentionQuery === null || mentionQuery.length < 2) { setMentionResults([]); return; }
    const t = setTimeout(async () => {
      const r = await api.searchUsers(mentionQuery);
      setMentionResults(r.data.slice(0, 5));
    }, 250);
    return () => clearTimeout(t);
  }, [mentionQuery]);

  function onDraftChange(v: string) {
    setDraft(v);
    const m = v.match(/@([\wáéíóúñ]*)$/i);
    setMentionQuery(m ? m[1] : null);
  }

  function insertMention(u: EntraUser) {
    const v = draft.replace(/@([\wáéíóúñ]*)$/i, `@${u.name} `);
    setDraft(v);
    setPicked(p => ({ ...p, [u.name]: u.email }));
    setMentionQuery(null);
    taRef.current?.focus();
  }

  async function patch(body: Partial<Task>) {
    if (!task) return;
    const previous = task;
    setTask({ ...task, ...body });
    try {
      await api.updateTask(task.id, body);
      void load(true);
      onChange?.();
    } catch (error) {
      setTask(previous);
      await alertDialog({
        title: 'No se pudo actualizar',
        message: error instanceof Error ? error.message : 'Revisa los requisitos de la tarea.',
        tone: 'warning',
      });
    }
  }

  async function toggleChecklist(item: TaskChecklistItem) {
    await api.updateChecklistItem(taskId, item.id, item.is_done !== 1);
    await load(true);
    onChange?.();
  }

  async function toggleDeliverable(item: TaskDeliverable) {
    try {
      await api.updateDeliverable(taskId, item.id, {
        is_completed: item.is_completed !== 1,
        evidence_url: evidence[item.id]?.trim() || item.evidence_url || undefined,
      });
      await load(true);
      onChange?.();
    } catch (error) {
      await alertDialog({
        title: 'Falta evidencia',
        message: error instanceof Error ? error.message : 'Añade el enlace o ubicación del entregable.',
        tone: 'warning',
      });
    }
  }

  async function send() {
    if (!draft.trim() || !task) return;
    setSending(true);
    try {
      const mentions = Object.entries(picked)
        .filter(([name]) => draft.includes('@' + name))
        .map(([, email]) => email);
      await api.addComment(task.id, draft.trim(), mentions);
      setDraft(''); setPicked({});
      await load(true);
      onChange?.();
    } finally { setSending(false); }
  }

  if (loading || !task) {
    return (
      <Backdrop onClose={onClose}>
        <div style={{ padding: 60, textAlign: 'center', color: T.ink3 }}>Cargando…</div>
      </Backdrop>
    );
  }

  const statuses = space?.statuses ?? [];
  const custom = task.custom_fields_json ? safeParse(task.custom_fields_json) : null;

  return (
    <Backdrop onClose={onClose}>
      <div style={{
        width: 620, maxWidth: '94vw', maxHeight: '92vh', background: T.card,
        borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.24)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: space?.color ?? T.brand }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: T.ink2 }}>{space?.name ?? task.space_id}</span>
              {task.source_type !== 'manual' && (
                <span style={{ fontSize: 10, fontWeight: 700, background: '#F1F5F9', color: T.ink2, padding: '2px 7px', borderRadius: 6 }}>
                  {task.source_type === 'sale' ? 'DE VENTA' : task.source_type === 'request' ? 'DE SOLICITUD' : task.source_type.toUpperCase()}
                </span>
              )}
            </div>
            <input
              value={task.title}
              onChange={e => setTask({ ...task, title: e.target.value })}
              onBlur={e => patch({ title: e.target.value })}
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 19, fontWeight: 800, color: T.ink, fontFamily: 'inherit' }}
            />
          </div>
          <button onClick={onClose} style={iconBtn}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* Controles */}
          <div style={{ padding: '16px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, borderBottom: `1px solid ${T.line}` }}>
            <Ctrl label="Estado">
              <select value={task.status} onChange={e => patch({ status: e.target.value })} style={selStyle}>
                {statuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                {statuses.length === 0 && <option value={task.status}>{task.status}</option>}
              </select>
            </Ctrl>
            <Ctrl label="Prioridad">
              <select value={task.priority} onChange={e => patch({ priority: e.target.value as Task['priority'] })} style={selStyle}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Ctrl>
            <Ctrl label="Responsable">
              <AssigneePicker
                current={task.assignee_name}
                onPick={u => patch({ assignee_id: u.id, assignee_name: u.name, assignee_email: u.email })}
                onSelf={() => patch({ assignee_id: me?.localAccountId, assignee_name: me?.name, assignee_email: myEmail })}
              />
            </Ctrl>
            <Ctrl label="Vence">
              <input type="date" value={task.due_date ?? ''} onChange={e => patch({ due_date: e.target.value })} style={selStyle} />
            </Ctrl>
          </div>

          {/* Descripción */}
          <div style={{ padding: '16px 22px', borderBottom: `1px solid ${T.line}` }}>
            <div style={lblStyle}>Descripción</div>
            <textarea
              value={task.description ?? ''}
              onChange={e => setTask({ ...task, description: e.target.value })}
              onBlur={e => patch({ description: e.target.value })}
              placeholder="Añade detalles…"
              rows={2}
              style={{ width: '100%', border: `1px solid ${T.line}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', color: T.ink, outline: 'none' }}
            />
          </div>

          {/* Campos personalizados (de solicitud/venta) */}
          {custom && Object.keys(custom).length > 0 && (
            <div style={{ padding: '16px 22px', borderBottom: `1px solid ${T.line}` }}>
              <div style={lblStyle}>Datos del formulario</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {Object.entries(custom).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: 10, fontSize: 12.5 }}>
                    <span style={{ color: T.ink3, minWidth: 120, textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                    <span style={{ color: T.ink, fontWeight: 500 }}>{String(v || '—')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(checklist.length > 0 || deliverables.length > 0) && (
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={lblStyle}>Plan de ejecución</div>
                <span style={{ fontSize: 11, color: T.ink3 }}>
                  {checklist.filter(i => i.is_done).length + deliverables.filter(i => i.is_completed).length}/{checklist.length + deliverables.length} completos
                </span>
              </div>
              {checklist.length > 0 && (
                <div style={{ display: 'grid', gap: 7, marginBottom: deliverables.length ? 16 : 0 }}>
                  {checklist.map(item => (
                    <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: item.is_done ? T.ink3 : T.ink, cursor: 'pointer' }}>
                      <input type="checkbox" checked={item.is_done === 1} onChange={() => void toggleChecklist(item)} />
                      <span style={{ textDecoration: item.is_done ? 'line-through' : 'none' }}>{item.label}</span>
                      {item.is_required === 1 && <span style={{ color: '#C2410C', fontSize: 10, fontWeight: 700 }}>OBLIGATORIO</span>}
                    </label>
                  ))}
                </div>
              )}
              {deliverables.length > 0 && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 750, color: T.ink2 }}>Entregables</div>
                  {deliverables.map(item => (
                    <div key={item.id} style={{ padding: 10, border: `1px solid ${item.is_completed ? '#A7F3D0' : T.line}`, background: item.is_completed ? '#ECFDF5' : '#fff', borderRadius: 9 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: item.is_completed ? 0 : 8 }}>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 650, color: T.ink }}>{item.label}</span>
                        {item.is_required === 1 && <span style={{ color: '#C2410C', fontSize: 10, fontWeight: 700 }}>OBLIGATORIO</span>}
                        <button onClick={() => void toggleDeliverable(item)} style={{ ...smallBtn, border: 'none', background: item.is_completed ? '#D1FAE5' : T.brand, color: item.is_completed ? '#047857' : '#fff' }}>
                          {item.is_completed ? 'Validado' : 'Validar'}
                        </button>
                      </div>
                      {!item.is_completed && (
                        <input
                          value={evidence[item.id] ?? ''}
                          onChange={event => setEvidence(current => ({ ...current, [item.id]: event.target.value }))}
                          placeholder="Enlace o ubicación de la evidencia"
                          style={{ ...selStyle, padding: '7px 9px', fontSize: 12 }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Aprobación */}
          {task.needs_approval === 1 && task.approval_status === 'pending' && task.approver_email === myEmail && (
            <div style={{ padding: '14px 22px', borderBottom: `1px solid ${T.line}`, display: 'flex', gap: 8, alignItems: 'center', background: '#FFFBEB' }}>
              <span style={{ fontSize: 12.5, color: '#854F0B', flex: 1 }}>Requiere tu aprobación</span>
              <button onClick={() => patch({ approval_status: 'approved' })} style={{ ...smallBtn, background: '#1D9E75', color: '#fff', border: 'none' }}>Aprobar</button>
              <button onClick={() => patch({ approval_status: 'rejected' })} style={{ ...smallBtn, background: '#fff', color: '#A32D2D', border: '1px solid #F09595' }}>Rechazar</button>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, padding: '12px 22px 0' }}>
            {(['comments', 'activity'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px',
                fontSize: 13, fontWeight: 700, borderBottom: `2px solid ${tab === t ? T.brand : 'transparent'}`,
                color: tab === t ? T.brand : T.ink3,
              }}>
                {t === 'comments' ? `Comentarios (${comments.length})` : 'Actividad'}
              </button>
            ))}
          </div>

          {/* Contenido tab */}
          <div style={{ padding: '14px 22px 20px' }}>
            {tab === 'comments' ? (
              comments.length === 0 ? (
                <div style={{ color: T.ink3, fontSize: 13, padding: '16px 0', textAlign: 'center' }}>
                  Sé el primero en comentar. Usa @ para mencionar.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {comments.map(cm => (
                    <div key={cm.id} style={{ display: 'flex', gap: 10 }}>
                      <Avatar name={cm.author_name} email={cm.author_email} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{cm.author_name}</span>
                          <span style={{ fontSize: 11, color: T.ink3 }}>{timeAgo(cm.created_at)}</span>
                        </div>
                        <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.5, marginTop: 2 }}
                          dangerouslySetInnerHTML={{ __html: highlightMentions(cm.body) }} />
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activity.map(ac => (
                  <div key={ac.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: T.ink2 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.line, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: T.ink }}>{ac.actor_name}</span>
                    <span>{ACTION_LABEL[ac.action] ?? ac.action}</span>
                    {ac.meta_json && metaText(ac.meta_json, statuses) && (
                      <span style={{ color: T.ink3 }}>{metaText(ac.meta_json, statuses)}</span>
                    )}
                    <span style={{ marginLeft: 'auto', color: T.ink3, fontSize: 11 }}>{timeAgo(ac.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        {tab === 'comments' && (
          <div style={{ borderTop: `1px solid ${T.line}`, padding: '12px 22px', position: 'relative' }}>
            {mentionResults.length > 0 && (
              <div style={{ position: 'absolute', bottom: '100%', left: 22, right: 22, background: '#fff', border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', marginBottom: 4, zIndex: 5 }}>
                {mentionResults.map(u => (
                  <div key={u.id} onClick={() => insertMention(u)} style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Avatar name={u.name} email={u.email} sm />
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: T.ink3 }}>{u.jobTitle ?? u.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <textarea
                ref={taRef} value={draft} onChange={e => onDraftChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
                placeholder="Escribe un comentario… @ para mencionar"
                rows={1}
                style={{ flex: 1, border: `1px solid ${T.line}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, resize: 'none', fontFamily: 'inherit', outline: 'none', color: T.ink, minHeight: 20 }}
              />
              <button onClick={send} disabled={sending || !draft.trim()} style={{
                background: T.brand, color: '#fff', border: 'none', borderRadius: 10,
                padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                opacity: sending || !draft.trim() ? 0.5 : 1,
              }}>
                {sending ? '…' : 'Enviar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Backdrop>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────
function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
    }}>
      {children}
    </div>
  );
}

function AssigneePicker({ current, onPick, onSelf }: {
  current: string | null; onPick: (u: EntraUser) => void; onSelf: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<EntraUser[]>([]);
  useEffect(() => {
    if (q.length < 2) { setRes([]); return; }
    const t = setTimeout(async () => { const r = await api.searchUsers(q); setRes(r.data.slice(0, 6)); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ ...selStyle, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
        {current ? <><Avatar name={current} sm /> <span>{current}</span></> : <span style={{ color: T.ink3 }}>Sin asignar</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 10, marginTop: 4, overflow: 'hidden' }}>
          <div style={{ padding: 6 }}>
            <button onClick={() => { onSelf(); setOpen(false); }} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', color: T.brand, fontWeight: 600, borderRadius: 6 }}>
              Asignarme a mí
            </button>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" style={{ width: '100%', border: `1px solid ${T.line}`, borderRadius: 6, padding: '7px 10px', fontSize: 12.5, marginTop: 4, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {res.map(u => (
            <div key={u.id} onClick={() => { onPick(u); setOpen(false); setQ(''); }} style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <Avatar name={u.name} sm />
              <span style={{ fontSize: 12.5, color: T.ink }}>{u.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Avatar({ name, email, sm }: { name?: string | null; email?: string; sm?: boolean }) {
  const sz = sm ? 22 : 30;
  return (
    <div title={email} style={{
      width: sz, height: sz, borderRadius: '50%', background: '#E6F1FB', color: T.brand,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      fontSize: sm ? 10 : 12, fontWeight: 700,
    }}>{initials(name)}</div>
  );
}

function Ctrl({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div style={lblStyle}>{label}</div>{children}</div>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function safeParse(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s); } catch { return null; }
}
function highlightMentions(body: string): string {
  const esc = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/@([\wáéíóúñ]+(?:\s[\wáéíóúñ]+)?)/gi, `<span style="color:${T.brand};font-weight:600">@$1</span>`);
}
function metaText(json: string, statuses: { key: string; label: string }[]): string {
  try {
    const m = JSON.parse(json);
    const lbl = (v: string) => statuses.find(s => s.key === v)?.label ?? v;
    if (m.from && m.to) return `${lbl(m.from)} → ${lbl(m.to)}`;
    if (m.to) return `a ${m.to}`;
    if (m.source) return `(${m.source})`;
    return '';
  } catch { return ''; }
}

const iconBtn: React.CSSProperties = { background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', fontSize: 18, padding: 4 };
const lblStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 };
const selStyle: React.CSSProperties = { width: '100%', border: `1px solid ${T.line}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff', color: T.ink, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const smallBtn: React.CSSProperties = { borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
