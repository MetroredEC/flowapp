import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api, Task, Space } from '../../lib/api';
import { T, PRIORITY, initials, timeAgo } from './theme';
import TaskDetail from './TaskDetail';

export default function SpaceBoard() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [tasks, setTasks]   = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView]     = useState<'board' | 'list'>('board');
  const [search, setSearch] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  const space = spaces.find(s => s.id === spaceId);

  const loadTasks = useCallback(async (silent = false) => {
    if (!spaceId) return;
    if (!silent) setLoading(true);
    try {
      const r = await api.getTasks({ space: spaceId, search: search || undefined });
      setTasks(r.data);
    } finally { setLoading(false); }
  }, [spaceId, search]);

  useEffect(() => { api.getSpaces().then(r => setSpaces(r.data)); }, []);
  useEffect(() => { void loadTasks(); }, [loadTasks]);
  useEffect(() => {
    const iv = setInterval(() => void loadTasks(true), 8000);
    return () => clearInterval(iv);
  }, [loadTasks]);

  async function move(taskId: string, status: string) {
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, status } : t));
    await api.updateTask(taskId, { status });
    void loadTasks(true);
  }

  if (loading && tasks.length === 0) {
    return <div style={{ padding: 40, color: T.ink3 }}>Cargando espacio…</div>;
  }

  const statuses = space?.statuses ?? [];

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: space?.color ?? T.brand }} />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: T.ink, letterSpacing: -0.4 }}>{space?.name ?? 'Espacio'}</h1>
        <span style={{ fontSize: 13, color: T.ink3 }}>{tasks.length} tareas</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
            style={{ border: `1px solid ${T.line}`, borderRadius: 9, padding: '8px 12px', fontSize: 13, outline: 'none', width: 180, background: '#fff' }} />
          <div style={{ display: 'flex', gap: 2, background: '#F1F5F9', padding: 3, borderRadius: 8 }}>
            {(['board', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: view === v ? '#fff' : 'transparent', color: view === v ? T.ink : T.ink3,
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{v === 'board' ? 'Tablero' : 'Lista'}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Board view */}
      {view === 'board' ? (
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
          {statuses.map(st => {
            const col = tasks.filter(t => t.status === st.key);
            return (
              <div key={st.key}
                onDragOver={e => e.preventDefault()}
                onDrop={() => { if (dragId) { move(dragId, st.key); setDragId(null); } }}
                style={{ width: 272, flexShrink: 0, background: '#F8FAFC', borderRadius: 14, padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 10px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.color }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{st.label}</span>
                  <span style={{ fontSize: 11, color: T.ink3 }}>{col.length}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {col.map(t => (
                    <TaskCard key={t.id} task={t} onClick={() => setOpenId(t.id)}
                      draggable onDragStart={() => setDragId(t.id)} />
                  ))}
                </div>

              </div>
            );
          })}
        </div>
      ) : (
        /* List view */
        <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, overflow: 'hidden' }}>
          {tasks.map(t => {
            const st = statuses.find(s => s.key === t.status);
            return (
              <div key={t.id} onClick={() => setOpenId(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                borderBottom: `1px solid ${T.line}`, cursor: 'pointer',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: st?.color ?? T.line, flexShrink: 0 }} />
                <span style={{ fontSize: 13.5, color: T.ink, fontWeight: 500, flex: 1 }}>{t.title}</span>
                <PriTag priority={t.priority} />
                <span style={{ fontSize: 12, color: T.ink3, minWidth: 80 }}>{st?.label}</span>
                {t.assignee_name
                  ? <div title={t.assignee_name} style={avatarSm}>{initials(t.assignee_name)}</div>
                  : <div style={{ ...avatarSm, background: '#F1F5F9', color: T.ink3 }}>—</div>}
              </div>
            );
          })}
          {tasks.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.ink3, fontSize: 13 }}>Sin tareas aún</div>}
        </div>
      )}

      {openId && (
        <TaskDetail taskId={openId} space={space} onClose={() => setOpenId(null)} onChange={() => loadTasks(true)} />
      )}
    </div>
  );
}

// ─── Task card ────────────────────────────────────────────────────────────────
function TaskCard({ task, onClick, draggable, onDragStart }: {
  task: Task; onClick: () => void; draggable?: boolean; onDragStart?: () => void;
}) {
  return (
    <div draggable={draggable} onDragStart={onDragStart} onClick={onClick} style={{
      background: '#fff', border: `1px solid ${T.line}`, borderRadius: 11, padding: '11px 12px',
      cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <PriTag priority={task.priority} />
        {task.source_type !== 'manual' && (
          <span style={{ fontSize: 10, fontWeight: 700, background: '#EEF2F7', color: T.ink2, padding: '2px 7px', borderRadius: 8 }}>
            {task.source_type === 'sale' ? 'venta' : task.source_type === 'request' ? 'solicitud' : task.source_type}
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: T.ink, fontWeight: 500, lineHeight: 1.4, marginBottom: 10 }}>{task.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {task.assignee_name
          ? <div title={task.assignee_name} style={avatarSm}>{initials(task.assignee_name)}</div>
          : <div style={{ ...avatarSm, background: '#F1F5F9', color: T.ink3 }}>—</div>}
        {task.due_date && <span style={{ fontSize: 11, color: T.ink3 }}>{new Date(task.due_date).toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: T.ink3 }}>{timeAgo(task.updated_at)}</span>
      </div>
    </div>
  );
}

function PriTag({ priority }: { priority: string }) {
  const p = PRIORITY[priority] ?? PRIORITY.normal;
  return <span style={{ fontSize: 10.5, fontWeight: 700, background: p.bg, color: p.color, padding: '2px 8px', borderRadius: 8 }}>{p.label}</span>;
}

const avatarSm: React.CSSProperties = {
  width: 22, height: 22, borderRadius: '50%', background: '#E6F1FB', color: T.brand,
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0,
};
