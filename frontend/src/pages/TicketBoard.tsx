import { useEffect, useState } from 'react';
import { api, Ticket, TicketDept, TicketStatus, TicketPriority, TeamMember } from '../lib/api';
import { Spinner } from '../components/ui';
import { confirmDialog } from '../components/AppDialog';

// ─── Config ───────────────────────────────────────────────────────────────────
const COLUMNS: { key: TicketStatus; label: string; color: string }[] = [
  { key: 'todo',        label: 'Por hacer',    color: '#71717A' },
  { key: 'in_progress', label: 'En progreso',  color: '#0284C7' },
  { key: 'review',      label: 'En revisión',  color: '#D97706' },
  { key: 'done',        label: 'Completado',   color: '#059669' },
];

const PRIORITY_META: Record<TicketPriority, { label: string; color: string; dot: string }> = {
  low:    { label: 'Baja',     color: '#6B7280', dot: '#D1D5DB' },
  normal: { label: 'Normal',   color: '#3B82F6', dot: '#93C5FD' },
  high:   { label: 'Alta',     color: '#F59E0B', dot: '#FCD34D' },
  urgent: { label: 'Urgente',  color: '#EF4444', dot: '#FCA5A5' },
};

const DEPT_META: Partial<Record<TicketDept, { label: string; accent: string }>> = {
  marketing: { label: 'Diseño Marketing', accent: '#0284C7' },
  bi:        { label: 'Equipo BI',        accent: '#0EA5E9' },
};

interface TicketBoardProps { dept: TicketDept }

export default function TicketBoard({ dept }: TicketBoardProps) {
  const [tickets, setTickets]   = useState<Ticket[]>([]);
  const [team, setTeam]         = useState<TeamMember[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState<TicketStatus | null>(null);
  const [editId, setEditId]     = useState<string | null>(null);
  const [q, setQ]               = useState('');

  const meta = DEPT_META[dept] ?? { label: dept, accent: '#0284C7' };

  const load = async () => {
    const [t, tm] = await Promise.all([
      api.getTickets(dept),
      api.getTeamMembers(dept),
    ]);
    setTickets(t.data);
    setTeam(tm.data);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [dept]);

  const filtered = q.trim()
    ? tickets.filter(t =>
        t.title.toLowerCase().includes(q.toLowerCase()) ||
        (t.description ?? '').toLowerCase().includes(q.toLowerCase())
      )
    : tickets;

  const byStatus = (status: TicketStatus) =>
    filtered.filter(t => t.status === status);

  const moveTicket = async (id: string, status: TicketStatus) => {
    setTickets(ts => ts.map(t => t.id === id ? { ...t, status } : t));
    await api.updateTicket(id, { status });
  };

  const deleteTicket = async (id: string) => {
    setTickets(ts => ts.filter(t => t.id !== id));
    await api.deleteTicket(id);
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <Spinner size={28} />
    </div>
  );

  return (
    <div style={{ padding: '28px 32px', minHeight: '100vh', background: '#F9F9FB' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 8, height: 28, borderRadius: 99,
              background: meta.accent,
            }} />
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#18181B', letterSpacing: -0.4 }}>
              {meta.label}
            </h1>
          </div>
          <p style={{ fontSize: 13, color: '#71717A', marginLeft: 18 }}>
            {tickets.filter(t => t.status !== 'done').length} tickets activos
            {' · '}
            {team.length} miembros del equipo
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <SearchBox value={q} onChange={setQ} />
          <button
            onClick={() => setCreating('todo')}
            style={{
              background: meta.accent, color: '#fff', border: 'none',
              borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'opacity .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            <PlusIcon /> Nuevo ticket
          </button>
        </div>
      </div>

      {/* Carga de equipo */}
      {team.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {team.map(m => (
            <MemberPill key={m.id} member={m} accent={meta.accent} />
          ))}
        </div>
      )}

      {team.length === 0 && (
        <div style={{
          background: '#FEF3C7', border: '1px solid #FDE68A',
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          fontSize: 13, color: '#92400E', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <WarnIcon />
          No hay miembros del equipo configurados. Los tickets se crearán sin asignar.
          Ve a Administrar para añadir miembros.
        </div>
      )}

      {/* Kanban board */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 14,
        alignItems: 'start',
      }}>
        {COLUMNS.map(col => (
          <Column
            key={col.key}
            col={col}
            tickets={byStatus(col.key)}
            accent={meta.accent}
            onMove={moveTicket}
            onDelete={deleteTicket}
            onEdit={setEditId}
            onAddHere={() => setCreating(col.key)}
          />
        ))}
      </div>

      {/* Modal crear ticket */}
      {creating && (
        <CreateModal
          dept={dept}
          onClose={() => setCreating(null)}
          onCreated={() => { setCreating(null); void load(); }}
        />
      )}

      {/* Modal editar ticket */}
      {editId && (
        <EditModal
          ticket={tickets.find(t => t.id === editId)!}
          team={team}
          onClose={() => setEditId(null)}
          onSaved={() => { setEditId(null); void load(); }}
        />
      )}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────
function Column({ col, tickets, accent, onMove, onDelete, onEdit, onAddHere }: {
  col: typeof COLUMNS[0];
  tickets: Ticket[];
  accent: string;
  onMove: (id: string, s: TicketStatus) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onAddHere: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Column header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', background: '#fff',
        borderRadius: 10, border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: col.color }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#3F3F46', letterSpacing: 0.3 }}>
            {col.label.toUpperCase()}
          </span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 800, color: col.color,
          background: col.color + '18', padding: '2px 7px', borderRadius: 99,
        }}>
          {tickets.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tickets.map(t => (
          <TicketCard
            key={t.id} ticket={t}
            onMove={onMove} onDelete={onDelete} onEdit={onEdit}
          />
        ))}
      </div>

      {/* Add button */}
      <button
        onClick={onAddHere}
        style={{
          width: '100%', border: '1.5px dashed #D4D4D8',
          background: 'transparent', borderRadius: 9,
          padding: '9px 0', cursor: 'pointer', color: '#A1A1AA',
          fontSize: 12, fontWeight: 600, transition: 'all .12s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4D4D8'; e.currentTarget.style.color = '#A1A1AA'; }}
      >
        <PlusIcon size={12} /> Añadir
      </button>
    </div>
  );
}

// ─── TicketCard ───────────────────────────────────────────────────────────────
function TicketCard({ ticket: t, onMove, onDelete, onEdit }: {
  ticket: Ticket;
  onMove: (id: string, s: TicketStatus) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const p = PRIORITY_META[t.priority];
  const isOverdue = t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date();
  const tags: string[] = t.tags_json ? JSON.parse(t.tags_json) : [];

  const statusFlow: TicketStatus[] = ['todo', 'in_progress', 'review', 'done'];
  const currentIdx = statusFlow.indexOf(t.status);
  const nextStatus = statusFlow[currentIdx + 1] ?? null;
  const prevStatus = statusFlow[currentIdx - 1] ?? null;

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 10,
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        transition: 'box-shadow .15s, transform .15s',
        position: 'relative',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
    >
      {/* Priority bar */}
      <div style={{ height: 3, background: p.dot }} />

      <div style={{ padding: '12px 14px' }}>
        {/* Priority + menu */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: p.color,
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            {p.label}
          </span>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setMenu(m => !m)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#A1A1AA', padding: '2px 4px', borderRadius: 4,
              }}
            >
              <DotsIcon />
            </button>
            {menu && (
              <CardMenu
                ticket={t}
                onMove={onMove} onDelete={onDelete} onEdit={onEdit}
                onClose={() => setMenu(false)}
                nextStatus={nextStatus}
                prevStatus={prevStatus}
              />
            )}
          </div>
        </div>

        {/* Title */}
        <div
          onClick={() => onEdit(t.id)}
          style={{ fontSize: 13, fontWeight: 700, color: '#18181B', lineHeight: 1.4,
            marginBottom: 6, cursor: 'pointer' }}
        >
          {t.title}
        </div>

        {/* Description */}
        {t.description && (
          <div style={{
            fontSize: 12, color: '#71717A', lineHeight: 1.5, marginBottom: 8,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {t.description}
          </div>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {tags.slice(0, 3).map(tag => (
              <span key={tag} style={{
                fontSize: 10, fontWeight: 600, color: '#6B7280',
                background: '#F4F4F5', padding: '2px 7px', borderRadius: 99,
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          {/* Assignee */}
          {t.assigned_to_name ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Avatar name={t.assigned_to_name} size={22} />
              <span style={{ fontSize: 11, color: '#71717A', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.assigned_to_name.split(' ')[0]}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: '#D4D4D8', fontStyle: 'italic' }}>Sin asignar</span>
          )}

          {/* Due date */}
          {t.due_date && (
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: isOverdue ? '#DC2626' : '#6B7280',
              background: isOverdue ? '#FEF2F2' : '#F4F4F5',
              padding: '2px 8px', borderRadius: 99,
            }}>
              {formatDate(t.due_date)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Card Menu ────────────────────────────────────────────────────────────────
function CardMenu({ ticket, onMove, onDelete, onEdit, onClose, nextStatus, prevStatus }: {
  ticket: Ticket;
  onMove: (id: string, s: TicketStatus) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onClose: () => void;
  nextStatus: TicketStatus | null;
  prevStatus: TicketStatus | null;
}) {
  const STATUS_LABELS: Record<TicketStatus, string> = {
    todo: 'Por hacer', in_progress: 'En progreso', review: 'En revisión', done: 'Completado',
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
      <div style={{
        position: 'absolute', right: 0, top: '100%', zIndex: 10,
        background: '#fff', border: '1px solid #E4E4E7',
        borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        minWidth: 160, overflow: 'hidden',
      }}>
        <MenuItem onClick={() => { onEdit(ticket.id); onClose(); }}>Editar</MenuItem>
        {nextStatus && (
          <MenuItem onClick={() => { onMove(ticket.id, nextStatus); onClose(); }}>
            Mover a {STATUS_LABELS[nextStatus]}
          </MenuItem>
        )}
        {prevStatus && (
          <MenuItem onClick={() => { onMove(ticket.id, prevStatus); onClose(); }}>
            Regresar a {STATUS_LABELS[prevStatus]}
          </MenuItem>
        )}
        <MenuItem onClick={async () => {
          const ok = await confirmDialog({
            title: '¿Eliminar este ticket?',
            message: `"${ticket.title}" se eliminará permanentemente.`,
            confirmLabel: 'Eliminar', danger: true,
          });
          if (ok) { onDelete(ticket.id); onClose(); }
        }} danger>
          Eliminar
        </MenuItem>
      </div>
    </>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '9px 14px', fontSize: 13, cursor: 'pointer',
        color: danger ? '#DC2626' : '#18181B',
        background: hover ? (danger ? '#FEF2F2' : '#F4F4F5') : 'transparent',
        borderBottom: '1px solid #F4F4F5',
        transition: 'background .1s',
      }}
    >
      {children}
    </div>
  );
}

// ─── Create Modal ─────────────────────────────────────────────────────────────
function CreateModal({ dept, onClose, onCreated }: {
  dept: TicketDept;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle]       = useState('');
  const [desc, setDesc]         = useState('');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [dueDate, setDueDate]   = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const submit = async () => {
    if (!title.trim()) { setError('El título es requerido.'); return; }
    setSaving(true);
    try {
      const tags = tagsInput.split(',').map((t: string) => t.trim()).filter(Boolean);
      await api.createTicket({
        department: dept, title: title.trim(),
        description: desc.trim() || undefined,
        priority, due_date: dueDate || undefined,
        tags: tags.length ? tags : undefined,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear ticket');
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Nuevo ticket" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Título *</label>
          <input
            autoFocus value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Describe brevemente el trabajo..."
            style={inputStyle}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
        </div>
        <div>
          <label style={labelStyle}>Descripción</label>
          <textarea
            value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Detalles, referencias, notas..."
            rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Prioridad</label>
            <select value={priority} onChange={e => setPriority(e.target.value as TicketPriority)} style={inputStyle}>
              <option value="low">Baja</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Fecha límite</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Etiquetas (separadas por coma)</label>
          <input
            value={tagsInput} onChange={e => setTagsInput(e.target.value)}
            placeholder="diseño, digital, urgente..."
            style={inputStyle}
          />
        </div>
        {error && <p style={{ color: '#DC2626', fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button onClick={onClose} style={btnSecStyle}>Cancelar</button>
          <button onClick={submit} disabled={saving} style={btnPrimStyle}>
            {saving ? 'Creando...' : 'Crear ticket'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ ticket, team, onClose, onSaved }: {
  ticket: Ticket;
  team: TeamMember[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle]           = useState(ticket.title);
  const [desc, setDesc]             = useState(ticket.description ?? '');
  const [priority, setPriority]     = useState<TicketPriority>(ticket.priority);
  const [status, setStatus]         = useState<TicketStatus>(ticket.status);
  const [dueDate, setDueDate]       = useState(ticket.due_date ?? '');
  const [tagsInput, setTagsInput]   = useState(() => {
    try { return ticket.tags_json ? JSON.parse(ticket.tags_json).join(', ') : ''; } catch { return ''; }
  });
  const [assigneeId, setAssigneeId] = useState(ticket.assigned_to_id ?? '');
  const [saving, setSaving]         = useState(false);

  const submit = async () => {
    setSaving(true);
    const assignee = team.find(m => m.user_id === assigneeId);
    const tags = tagsInput.split(',').map((t: string) => t.trim()).filter(Boolean);
    await api.updateTicket(ticket.id, {
      title, description: desc || undefined,
      priority, status, due_date: dueDate || null,
      tags_json: tags.length ? JSON.stringify(tags) : null,
      assigned_to_id: assigneeId || null,
      assigned_to_name: assignee?.user_name ?? null,
      assigned_to_email: assignee?.user_email ?? null,
    } as Partial<Ticket>);
    setSaving(false);
    onSaved();
  };

  return (
    <Modal title="Editar ticket" onClose={onClose} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Título</label>
          <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Descripción</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Estado</label>
            <select value={status} onChange={e => setStatus(e.target.value as TicketStatus)} style={inputStyle}>
              <option value="todo">Por hacer</option>
              <option value="in_progress">En progreso</option>
              <option value="review">En revisión</option>
              <option value="done">Completado</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Prioridad</label>
            <select value={priority} onChange={e => setPriority(e.target.value as TicketPriority)} style={inputStyle}>
              <option value="low">Baja</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Fecha límite</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Asignado a</label>
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} style={inputStyle}>
              <option value="">Sin asignar</option>
              {team.map(m => (
                <option key={m.id} value={m.user_id}>{m.user_name} ({m.open_tickets ?? 0} abiertos)</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Etiquetas (separadas por coma)</label>
            <input value={tagsInput} onChange={e => setTagsInput(e.target.value)}
              placeholder="diseño, digital..." style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button onClick={onClose} style={btnSecStyle}>Cancelar</button>
          <button onClick={submit} disabled={saving} style={btnPrimStyle}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────
function Modal({ title, children, onClose, wide }: {
  title: string; children: React.ReactNode; onClose: () => void; wide?: boolean;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.35)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%',
        maxWidth: wide ? 640 : 480,
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #F4F4F5',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#18181B', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#A1A1AA', padding: 4, borderRadius: 6,
            fontSize: 18, lineHeight: 1, display: 'flex',
          }}>
            <CloseIcon />
          </button>
        </div>
        <div style={{ padding: '20px 24px 24px' }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────
function MemberPill({ member: m, accent }: { member: TeamMember; accent: string }) {
  const load = m.open_tickets ?? 0;
  const loadColor = load === 0 ? '#10B981' : load <= 2 ? '#F59E0B' : '#EF4444';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      background: '#fff', border: '1px solid #E4E4E7',
      borderRadius: 99, padding: '5px 10px 5px 5px',
    }}>
      <Avatar name={m.user_name} size={22} color={accent} />
      <span style={{ fontSize: 12, fontWeight: 600, color: '#3F3F46' }}>
        {m.user_name.split(' ')[0]}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 800, color: loadColor,
        background: loadColor + '18', padding: '1px 6px', borderRadius: 99,
      }}>
        {load}
      </span>
    </div>
  );
}

function Avatar({ name, size = 28, color = '#0284C7' }: { name: string; size?: number; color?: string }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color + '20', color,
      fontSize: size * 0.38, fontWeight: 800,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, border: `1.5px solid ${color}30`,
    }}>
      {initials}
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#A1A1AA' }}>
        <SearchIcon />
      </div>
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder="Buscar ticket..."
        style={{
          padding: '9px 12px 9px 32px', border: '1.5px solid #E4E4E7',
          borderRadius: 9, fontSize: 13, outline: 'none',
          fontFamily: 'inherit', width: 200, color: '#18181B',
          transition: 'border-color .15s',
        }}
        onFocus={e => e.target.style.borderColor = '#0284C7'}
        onBlur={e => e.target.style.borderColor = '#E4E4E7'}
      />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('es-EC', { day: 'numeric', month: 'short' });
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#52525B',
  textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1.5px solid #E4E4E7',
  borderRadius: 8, fontSize: 13, outline: 'none',
  fontFamily: 'inherit', color: '#18181B', boxSizing: 'border-box',
};
const btnPrimStyle: React.CSSProperties = {
  background: '#0284C7', color: '#fff', border: 'none',
  borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700,
  cursor: 'pointer',
};
const btnSecStyle: React.CSSProperties = {
  background: 'transparent', color: '#52525B',
  border: '1.5px solid #E4E4E7', borderRadius: 8,
  padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

// ─── Icons ────────────────────────────────────────────────────────────────────
function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}
function WarnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}
