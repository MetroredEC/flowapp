import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, Space, Task } from '../../lib/api';
import { useIsMobile } from '../../lib/useIsMobile';
import { PRIORITY, T } from './theme';
import TaskDetail from './TaskDetail';

const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const taskDateKey = (value?: string | null) => {
  if (!value) return null;
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : localDateKey(parsed);
};
const formatTaskDate = (value?: string | null, options?: Intl.DateTimeFormatOptions) => {
  const key = taskDateKey(value);
  return key ? new Date(key + 'T12:00:00').toLocaleDateString('es-EC', options) : 'Sin fecha';
};

type View = 'list' | 'board' | 'calendar';
type Scope = 'open' | 'done' | 'all';

export default function MyTasksPage() {
  const isMobile = useIsMobile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [scope, setScope] = useState<Scope>('open');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [taskResult, spaceResult] = await Promise.all([api.getMyTasks(), api.getSpaces()]);
      setTasks(taskResult.data); setSpaces(spaceResult.data);
    } finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = setInterval(() => void load(true), 12000); return () => clearInterval(timer); }, [load]);

  const isDone = useCallback((task: Task) => {
    const space = spaces.find(item => item.id === task.space_id);
    return Boolean(space?.statuses.find(status => status.key === task.status)?.is_done);
  }, [spaces]);

  const filtered = useMemo(() => tasks.filter(task => {
    if (scope === 'open' && isDone(task)) return false;
    if (scope === 'done' && !isDone(task)) return false;
    if (query && !`${task.title} ${task.description ?? ''} ${task.space_name ?? ''}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [tasks, scope, query, isDone]);

  const openCount = tasks.filter(task => !isDone(task)).length;
  const doneCount = tasks.length - openCount;
  const openTask = tasks.find(task => task.id === openId);

  async function setStatus(task: Task, status: string) {
    setTasks(items => items.map(item => item.id === task.id ? { ...item, status } : item));
    await api.updateTask(task.id, { status });
    void load(true);
  }

  async function planToday(task: Task) {
    await api.updateTask(task.id, { planned_date: localDateKey(), snoozed_until: null });
    void load(true);
  }

  return (
    <div style={{ padding: isMobile ? '20px 14px' : 32, maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div><div style={{ fontSize: 12, fontWeight: 800, color: T.brand, textTransform: 'uppercase', letterSpacing: .8 }}>Ejecución personal</div><h1 style={{ fontSize: 26, fontWeight: 850, color: T.ink, margin: '4px 0' }}>Trabajo</h1><p style={{ fontSize: 13, color: T.ink3 }}>Todas tus tareas, sin mezclar decisiones ni notificaciones.</p></div>
        <div style={{ display: 'flex', padding: 3, background: '#E9EEF5', borderRadius: 9 }}>
          {([['list','Lista'],['board','Tablero'],['calendar','Calendario']] as const).map(([key, label]) => <button key={key} onClick={() => setView(key)} style={{ border: 0, borderRadius: 7, padding: '7px 11px', background: view === key ? '#fff' : 'transparent', color: view === key ? T.ink : T.ink3, boxShadow: view === key ? '0 1px 4px rgba(15,23,42,.12)' : 'none', fontSize: 11.5, fontWeight: 750, cursor: 'pointer' }}>{label}</button>)}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: 12, background: 'rgba(255,255,255,.82)', border: `1px solid ${T.line}`, borderRadius: 12, marginBottom: 20 }}>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar en mi trabajo…" style={{ flex: '1 1 240px', border: `1px solid ${T.line}`, borderRadius: 8, padding: '9px 11px', fontSize: 12.5, outline: 'none' }} />
        {([['open',`Abiertas ${openCount}`],['done',`Completadas ${doneCount}`],['all',`Todas ${tasks.length}`]] as const).map(([key, label]) => <button key={key} onClick={() => setScope(key)} style={{ border: scope === key ? `1px solid ${T.brand}` : `1px solid ${T.line}`, background: scope === key ? '#E6F1FB' : '#fff', color: scope === key ? T.brand : T.ink2, borderRadius: 99, padding: '6px 11px', fontSize: 11.5, fontWeight: 750, cursor: 'pointer' }}>{label}</button>)}
      </div>

      {loading && !tasks.length ? <Empty text="Cargando tu trabajo…" /> : !filtered.length ? <Empty text="No hay tareas que coincidan con esta vista." /> : view === 'list' ? (
        <ListView tasks={filtered} spaces={spaces} isDone={isDone} onOpen={setOpenId} onStatus={setStatus} onPlan={planToday} />
      ) : view === 'board' ? (
        <BoardView tasks={filtered} spaces={spaces} isDone={isDone} onOpen={setOpenId} />
      ) : (
        <CalendarView tasks={filtered} onOpen={setOpenId} />
      )}

      {openId && <TaskDetail taskId={openId} space={spaces.find(space => space.id === openTask?.space_id)} onClose={() => setOpenId(null)} onChange={() => load(true)} />}
    </div>
  );
}

function ListView({ tasks, spaces, isDone, onOpen, onStatus, onPlan }: { tasks: Task[]; spaces: Space[]; isDone: (task: Task) => boolean; onOpen: (id: string) => void; onStatus: (task: Task, status: string) => void; onPlan: (task: Task) => void }) {
  const today = localDateKey();
  const sorted = [...tasks].sort((a, b) => (taskDateKey(a.due_date) ?? '9999').localeCompare(taskDateKey(b.due_date) ?? '9999'));
  return <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 13, overflow: 'hidden' }}>{sorted.map(task => {
    const space = spaces.find(item => item.id === task.space_id);
    const priority = PRIORITY[task.priority] ?? PRIORITY.normal;
    const dueKey = taskDateKey(task.due_date);
    const overdue = Boolean(dueKey && dueKey < today && !isDone(task));
    return <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderBottom: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: task.space_color ?? space?.color ?? T.line }} />
      <div onClick={() => onOpen(task.id)} style={{ flex: '1 1 260px', cursor: 'pointer', minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 650, color: isDone(task) ? T.ink3 : T.ink, textDecoration: isDone(task) ? 'line-through' : 'none' }}>{task.title}</div><div style={{ fontSize: 10.5, color: T.ink3, marginTop: 2 }}>{task.space_name ?? space?.name} · {task.source_type === 'request' ? 'Solicitud vinculada' : 'Trabajo del área'}</div></div>
      {task.is_blocked ? <span style={{ fontSize: 9.5, fontWeight: 800, color: '#9A6700', background: '#FEF3C7', padding: '2px 7px', borderRadius: 7 }}>Bloqueada</span> : null}
      <span style={{ fontSize: 9.5, fontWeight: 800, color: priority.color, background: priority.bg, padding: '2px 7px', borderRadius: 7 }}>{priority.label}</span>
      {!task.planned_date && !isDone(task) ? <button onClick={() => onPlan(task)} style={smallButton}>Hoy</button> : null}
      <select value={task.status} onChange={event => onStatus(task, event.target.value)} style={{ ...smallButton, background: '#fff', maxWidth: 130 }}>{space?.statuses.map(status => <option key={status.key} value={status.key}>{status.label}</option>)}</select>
      <span style={{ minWidth: 58, textAlign: 'right', fontSize: 10.5, color: overdue ? '#C2413B' : T.ink3, fontWeight: overdue ? 800 : 500 }}>{formatTaskDate(task.due_date, { day: 'numeric', month: 'short' })}</span>
    </div>;
  })}</div>;
}

function BoardView({ tasks, spaces, isDone, onOpen }: { tasks: Task[]; spaces: Space[]; isDone: (task: Task) => boolean; onOpen: (id: string) => void }) {
  const columns = [
    { key: 'blocked', label: 'Bloqueadas', color: '#B7791F', tasks: tasks.filter(task => task.is_blocked && !isDone(task)) },
    { key: 'todo', label: 'Por hacer', color: '#64748B', tasks: tasks.filter(task => !task.is_blocked && !task.started_at && !isDone(task)) },
    { key: 'doing', label: 'En curso', color: T.brand, tasks: tasks.filter(task => !task.is_blocked && task.started_at && !isDone(task)) },
    { key: 'done', label: 'Completadas', color: '#0F9F6E', tasks: tasks.filter(isDone) },
  ];
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(220px,1fr))', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>{columns.map(column => <section key={column.key} style={{ minWidth: 220, background: '#F1F5F9', borderRadius: 13, padding: 10 }}><div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 4px 10px' }}><span style={{ width: 7, height: 7, borderRadius: 99, background: column.color }} /><strong style={{ fontSize: 12, color: T.ink }}>{column.label}</strong><span style={{ marginLeft: 'auto', fontSize: 10.5, color: T.ink3 }}>{column.tasks.length}</span></div>{column.tasks.map(task => <div key={task.id} onClick={() => onOpen(task.id)} style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 10, padding: 11, marginBottom: 8, cursor: 'pointer' }}><div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{task.title}</div><div style={{ fontSize: 10.5, color: T.ink3, marginTop: 6 }}>{task.space_name ?? spaces.find(space => space.id === task.space_id)?.name}</div>{taskDateKey(task.due_date) ? <div style={{ fontSize: 10, color: T.ink3, marginTop: 3 }}>Vence {formatTaskDate(task.due_date)}</div> : null}</div>)}</section>)}</div>;
}

function CalendarView({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) { const key = taskDateKey(task.due_date) ?? 'Sin fecha'; groups.set(key, [...(groups.get(key) ?? []), task]); }
  const entries = [...groups.entries()].sort(([a], [b]) => a === 'Sin fecha' ? 1 : b === 'Sin fecha' ? -1 : a.localeCompare(b));
  return <div style={{ display: 'grid', gap: 12 }}>{entries.map(([date, dayTasks]) => <section key={date} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14 }}><div style={{ padding: '12px 4px', fontSize: 12, fontWeight: 800, color: date < localDateKey() ? '#C2413B' : T.ink2 }}>{date === 'Sin fecha' ? date : new Date(date + 'T12:00:00').toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' })}</div><div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, overflow: 'hidden' }}>{dayTasks.map(task => <div key={task.id} onClick={() => onOpen(task.id)} style={{ padding: '11px 13px', borderBottom: `1px solid ${T.line}`, cursor: 'pointer' }}><div style={{ fontSize: 13, fontWeight: 650, color: T.ink }}>{task.title}</div><div style={{ fontSize: 10.5, color: T.ink3, marginTop: 2 }}>{task.space_name}</div></div>)}</div></section>)}</div>;
}

function Empty({ text }: { text: string }) { return <div style={{ padding: 52, textAlign: 'center', background: '#fff', border: `1px dashed ${T.line}`, borderRadius: 13, color: T.ink3, fontSize: 13 }}>{text}</div>; }
const smallButton: React.CSSProperties = { border: `1px solid ${T.line}`, borderRadius: 7, padding: '5px 8px', fontSize: 10.5, fontWeight: 700, color: T.ink2, background: '#fff', cursor: 'pointer' };
