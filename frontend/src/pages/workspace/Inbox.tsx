import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../../lib/useIsMobile';
import { api, Notification, Space } from '../../lib/api';
import { T, timeAgo } from './theme';
import TaskDetail from './TaskDetail';

const TYPE_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  mention:    { icon: '@', color: '#185FA5', bg: '#E6F1FB', label: 'Mención' },
  assignment: { icon: '→', color: '#0F6E56', bg: '#E1F5EE', label: 'Asignación' },
  approval:   { icon: '✓', color: '#854F0B', bg: '#FAEEDA', label: 'Aprobación' },
  comment:    { icon: '💬', color: '#475569', bg: '#F1F5F9', label: 'Comentario' },
  status:     { icon: '•', color: '#534AB7', bg: '#EEEDFE', label: 'Estado' },
};

export default function Inbox() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [items, setItems]   = useState<Notification[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'mention' | 'assignment'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [openSpace, setOpenSpace] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { const r = await api.getInbox(); setItems(r.data); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { api.getSpaces().then(r => setSpaces(r.data)); }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const iv = setInterval(() => void load(true), 6000);
    return () => clearInterval(iv);
  }, [load]);

  async function openNotif(n: Notification) {
    if (!n.is_read) { await api.markRead({ id: n.id }); void load(true); }
    if (!n.task_id) return;
    if (n.task_id.startsWith('req:')) {
      // Notificación de solicitud → ir al detalle de la solicitud
      navigate(`/solicitudes/${n.task_id.slice(4)}`);
    } else {
      setOpenId(n.task_id); setOpenSpace(n.space_id);
    }
  }

  const unread = items.filter(i => !i.is_read).length;

  const shown = useMemo(() => {
    if (filter === 'unread') return items.filter(i => !i.is_read);
    if (filter === 'mention') return items.filter(i => i.type === 'mention');
    if (filter === 'assignment') return items.filter(i => i.type === 'assignment' || i.type === 'approval');
    return items;
  }, [items, filter]);

  // Agrupar por día
  const groups = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today.getTime() - 86400000);
    const week = new Date(today.getTime() - 6 * 86400000);
    const g: { label: string; items: Notification[] }[] = [
      { label: 'Hoy', items: [] }, { label: 'Ayer', items: [] },
      { label: 'Esta semana', items: [] }, { label: 'Anteriores', items: [] },
    ];
    for (const n of shown) {
      const d = new Date((n.created_at.includes('T') ? n.created_at : n.created_at.replace(' ', 'T') + 'Z'));
      if (d >= today) g[0].items.push(n);
      else if (d >= yesterday) g[1].items.push(n);
      else if (d >= week) g[2].items.push(n);
      else g[3].items.push(n);
    }
    return g.filter(x => x.items.length > 0);
  }, [shown]);

  const FILTERS = [
    { k: 'all', l: 'Todo' }, { k: 'unread', l: `Sin leer${unread ? ` (${unread})` : ''}` },
    { k: 'mention', l: 'Menciones' }, { k: 'assignment', l: 'Asignaciones' },
  ] as const;

  return (
    <div style={{ padding: isMobile ? '20px 14px' : 32, maxWidth: 680, margin: '0 auto' }}>
      {/* Header — feed style */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: T.ink, letterSpacing: -0.4 }}>Bandeja</h1>
        {unread > 0 && <span style={{ background: T.brand, color: '#fff', fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 10 }}>{unread}</span>}
        {unread > 0 && (
          <button onClick={async () => { await api.markRead({ all: true }); void load(true); }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: T.brand, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            Marcar todo leído
          </button>
        )}
      </div>
      <p style={{ color: T.ink3, fontSize: 13, marginBottom: 16 }}>Menciones, asignaciones y novedades de tus tareas.</p>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)} style={{
            border: filter === f.k ? `1.5px solid ${T.brand}` : `1px solid ${T.line}`,
            background: filter === f.k ? 'rgba(2,132,199,0.08)' : '#fff',
            color: filter === f.k ? T.brand : T.ink2,
            borderRadius: 99, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>{f.l}</button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <div style={{ color: T.ink3, padding: 20 }}>Cargando…</div>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 20px' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', background: '#E1F5EE', color: '#0F6E56',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, margin: '0 auto 14px',
          }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink2, marginBottom: 4 }}>Todo al día</div>
          <div style={{ fontSize: 13, color: T.ink3 }}>Te avisaremos cuando alguien te mencione o te asigne trabajo.</div>
        </div>
      ) : (
        groups.map(g => (
          <div key={g.label} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, paddingLeft: 4 }}>
              {g.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {g.items.map(n => {
                const m = TYPE_META[n.type] ?? TYPE_META.comment;
                const sp = spaces.find(s => s.id === n.space_id);
                return (
                  <div key={n.id} onClick={() => openNotif(n)} style={{
                    display: 'flex', gap: 12, padding: '12px 14px', cursor: 'pointer',
                    background: '#fff', borderRadius: 12,
                    border: n.is_read ? `1px solid ${T.line}` : `1.5px solid ${T.brand}40`,
                    boxShadow: n.is_read ? 'none' : '0 2px 8px rgba(2,132,199,0.08)',
                    transition: 'all .12s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: m.bg, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{m.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.45 }}>
                        <span style={{ fontWeight: 700 }}>{n.actor_name}</span>{' '}
                        <span style={{ color: T.ink2 }}>{n.body}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        {sp && <><span style={{ width: 6, height: 6, borderRadius: '50%', background: sp.color }} /><span style={{ fontSize: 11, color: T.ink3 }}>{sp.name}</span><span style={{ color: T.line }}>·</span></>}
                        <span style={{ fontSize: 11, color: T.ink3 }}>{m.label}</span>
                        <span style={{ color: T.line }}>·</span>
                        <span style={{ fontSize: 11, color: T.ink3 }}>{timeAgo(n.created_at)}</span>
                      </div>
                    </div>
                    {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.brand, flexShrink: 0, marginTop: 4 }} />}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {openId && (
        <TaskDetail taskId={openId} space={spaces.find(s => s.id === openSpace)} onClose={() => setOpenId(null)} onChange={() => load(true)} />
      )}
    </div>
  );
}
