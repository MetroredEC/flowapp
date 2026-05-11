import { useEffect, useMemo, useState } from 'react';
import { api, BpmTask, BpmTaskDetail } from '../lib/api';

const API_BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

type Action = 'approve' | 'reject';

export default function MyTasks() {
  const [tasks, setTasks] = useState<BpmTask[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [detail, setDetail] = useState<BpmTaskDetail | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  const selectedTask = useMemo(
    () => tasks.find(t => t.id === selectedId) ?? null,
    [tasks, selectedId]
  );

  async function loadTasks() {
    setLoading(true);
    setError('');
    try {
      const res = await api.bpmTasksMine(showAll);
      setTasks(res.data);
      if (!selectedId && res.data.length) setSelectedId(res.data[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las tareas.');
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    if (!id) return;
    setDetailLoading(true);
    setError('');
    try {
      const res = await api.bpmTaskDetail(id);
      setDetail(res.data);
      setComment('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el detalle.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function complete(action: Action) {
    if (!selectedId) return;
    if (action === 'reject' && !comment.trim()) {
      setError('El comentario es obligatorio para rechazar.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api.completeBpmTask(selectedId, { action, comment });
      setDetail(null);
      setSelectedId('');
      await loadTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la tarea.');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, [showAll]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId]);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111', marginBottom: 6 }}>Mis tareas</h1>
        <p style={{ color: '#666', fontSize: 14 }}>
          Bandeja de tareas BPM pendientes.
        </p>

        <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowAll(false)}
            style={{
              border: '1px solid #D8D6CE',
              background: !showAll ? '#185FA5' : '#fff',
              color: !showAll ? '#fff' : '#333',
              borderRadius: 999,
              padding: '8px 14px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Mis tareas
          </button>
          <button
            onClick={() => setShowAll(true)}
            style={{
              border: '1px solid #D8D6CE',
              background: showAll ? '#185FA5' : '#fff',
              color: showAll ? '#fff' : '#333',
              borderRadius: 999,
              padding: '8px 14px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Todas
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: '#FFF2EC',
          border: '1px solid #F0997B',
          color: '#993C1D',
          borderRadius: 10,
          padding: 12,
          fontSize: 14,
          fontWeight: 600,
        }}>
          {error}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 380px) 1fr',
        gap: 20,
        alignItems: 'start',
      }}>
        <section style={{
          background: '#fff',
          border: '1px solid #E6E4DE',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,.05)',
        }}>
          <div style={{ padding: 18, borderBottom: '1px solid #ECECEA' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800 }}>Pendientes</h2>
            <p style={{ fontSize: 12, color: '#777', marginTop: 4 }}>{tasks.length} tarea(s)</p>
          </div>

          {loading ? (
            <div style={{ padding: 18, color: '#777' }}>Cargando tareas...</div>
          ) : tasks.length === 0 ? (
            <div style={{ padding: 18, color: '#777' }}>No tienes tareas pendientes.</div>
          ) : (
            <div>
              {tasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => setSelectedId(task.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    borderBottom: '1px solid #F0EFEA',
                    background: selectedId === task.id ? '#EAF2FA' : '#fff',
                    padding: 16,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 800, color: '#111', marginBottom: 5 }}>{task.title}</div>
                  <div style={{ fontSize: 13, color: '#555', lineHeight: 1.45 }}>
                    {task.request_title || 'Solicitud sin t­tulo'}
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
                    {task.request_type_name || 'Proceso'} ‚· {task.requester_name || 'Solicitante'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section style={{
          background: '#fff',
          border: '1px solid #E6E4DE',
          borderRadius: 16,
          padding: 22,
          boxShadow: '0 8px 24px rgba(0,0,0,.05)',
          minHeight: 360,
        }}>
          {!selectedTask ? (
            <div style={{ color: '#777' }}>Selecciona una tarea para revisarla.</div>
          ) : detailLoading ? (
            <div style={{ color: '#777' }}>Cargando detalle...</div>
          ) : (
            <>
              <div style={{
                display: 'inline-block',
                background: '#EAF2FA',
                color: '#185FA5',
                fontSize: 12,
                fontWeight: 800,
                padding: '6px 10px',
                borderRadius: 999,
                marginBottom: 12,
              }}>
                {selectedTask.status}
              </div>

              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
                {selectedTask.request_title || selectedTask.title}
              </h2>

              <p style={{ color: '#666', fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
                {String(detail?.task?.request_description ?? 'Sin descripci³n.')}
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 22,
              }}>
                <Info label="Tipo" value={selectedTask.request_type_name || '-'} />
                <Info label="Solicitante" value={selectedTask.requester_name || '-'} />
                <Info label="Tarea" value={selectedTask.title} />
                <Info label="Asignado a" value={selectedTask.assignee_email || '-'} />
              </div>

              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Adjuntos</h3>
              <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
                {detail?.attachments?.length ? detail.attachments.map((a, idx) => {
                  const key = String(a.r2_key ?? a.id ?? '');
                  const href = API_BASE + '/api/files/' + encodeURIComponent(key);
                  return (
                    <a
                      key={idx}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        border: '1px solid #ECECEA',
                        background: '#FAFAF8',
                        borderRadius: 10,
                        padding: 12,
                        fontSize: 13,
                        color: '#185FA5',
                        fontWeight: 800,
                        textDecoration: 'none',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <span>{String(a.filename ?? 'Archivo')}</span>
                      <span style={{ color: '#777', fontWeight: 500 }}>Abrir</span>
                    </a>
                  );
                }) : (
                  <div style={{ color: '#777', fontSize: 13 }}>Sin adjuntos.</div>
                )}
              </div>

              <label style={{ display: 'block', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                Comentario
              </label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                maxLength={1200}
                placeholder="Escribe un comentario para la decisi³n..."
                style={{
                  width: '100%',
                  minHeight: 110,
                  border: '1.5px solid #D8D6CE',
                  borderRadius: 10,
                  padding: 12,
                  resize: 'vertical',
                  font: 'inherit',
                  marginBottom: 14,
                }}
              />

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  disabled={saving}
                  onClick={() => complete('approve')}
                  style={buttonStyle('#1D9E75')}
                >
                  Aprobar
                </button>
                <button
                  disabled={saving}
                  onClick={() => complete('reject')}
                  style={buttonStyle('#993C1D')}
                >
                  Rechazar
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: '#F8FAFC',
      border: '1px solid #ECECEA',
      borderRadius: 10,
      padding: 12,
    }}>
      <div style={{ fontSize: 11, color: '#777', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: '#222', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function buttonStyle(background: string): React.CSSProperties {
  return {
    flex: 1,
    border: 'none',
    background,
    color: '#fff',
    borderRadius: 10,
    padding: '13px 18px',
    fontSize: 14,
    fontWeight: 900,
    cursor: 'pointer',
  };
}
