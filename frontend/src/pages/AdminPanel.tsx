import { useEffect, useState, useCallback } from 'react';
import { api, RequestType, FlowConfig, FlowLevel, EntraUser } from '../lib/api';
import { Card, PageHeader, Btn, Field, Input, Textarea, Select, Spinner, Btn as Button } from '../components/ui';

type Tab = 'types' | 'flows' | 'stats';

export default function AdminPanel() {
  const [tab, setTab] = useState<Tab>('types');

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader title="Administración" subtitle="Tipos de solicitud, flujos de aprobación y configuración" />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#fff',
        padding: 4, borderRadius: 10, border: '1px solid #E8E8E4', width: 'fit-content' }}>
        {(['types','flows'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 20px', borderRadius: 7, border: 'none', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', background: tab === t ? '#0C447C' : 'transparent',
            color: tab === t ? '#fff' : '#888', transition: 'all .15s',
          }}>
            {{ types: 'Tipos de solicitud', flows: 'Flujos de aprobación' }[t]}
          </button>
        ))}
      </div>

      {tab === 'types' && <TypesPanel />}
      {tab === 'flows' && <FlowsPanel />}
    </div>
  );
}

// ─── Panel: Tipos de solicitud ────────────────────────────────────────────────
function TypesPanel() {
  const [types, setTypes] = useState<RequestType[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState(false);
  const [form, setForm]       = useState({ name: '', description: '' });

  const load = () => api.getRequestTypes().then(r => setTypes(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name.trim()) return;
    await api.createRequestType({ name: form.name.trim(), description: form.description.trim() });
    setForm({ name: '', description: '' });
    setAdding(false);
    load();
  };

  const toggle = async (t: RequestType) => {
    await api.updateRequestType(t.id, { is_active: t.is_active ? 0 : 1 });
    load();
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {types.map(t => (
        <Card key={t.id} style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{t.name}</div>
              {t.description && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{t.description}</div>}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: t.is_active ? '#E1F5EE' : '#F1EFE8',
              color: t.is_active ? '#085041' : '#5F5E5A',
            }}>{t.is_active ? 'Activo' : 'Inactivo'}</span>
            <Btn variant="ghost" onClick={() => toggle(t)} style={{ fontSize: 12 }}>
              {t.is_active ? 'Desactivar' : 'Activar'}
            </Btn>
          </div>
        </Card>
      ))}

      {adding ? (
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Nuevo tipo</h3>
          <Field label="Nombre">
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Compras internacionales" />
          </Field>
          <Field label="Descripción (opcional)">
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descripción breve" />
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn onClick={save}>Guardar</Btn>
            <Btn variant="secondary" onClick={() => setAdding(false)}>Cancelar</Btn>
          </div>
        </Card>
      ) : (
        <button onClick={() => setAdding(true)} style={{
          border: '1.5px dashed #ccc', background: 'none', borderRadius: 10,
          padding: '14px', cursor: 'pointer', color: '#888', fontSize: 13,
        }}>+ Nuevo tipo de solicitud</button>
      )}
    </div>
  );
}

// ─── Panel: Flujos de aprobación ──────────────────────────────────────────────
function FlowsPanel() {
  const [types, setTypes]     = useState<RequestType[]>([]);
  const [selType, setSelType] = useState('');
  const [levels, setLevels]   = useState<FlowLevel[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    api.getRequestTypes().then(r => setTypes(r.data.filter(t => t.is_active)));
  }, []);

  useEffect(() => {
    if (!selType) return;
    setLoading(true);
    api.getFlow(selType).then(r => {
      if (r.data.length) {
        setLevels(r.data.map(fc => ({
          level: fc.level, label: fc.label,
          approver_type: fc.approver_type,
          approver_value: fc.approver_value,
          approver_name: fc.approver_name ?? '',
          approver_email: fc.approver_email ?? '',
        })));
      } else {
        setLevels([{ level: 1, label: 'Aprobador directo', approver_type: 'fixed_user', approver_value: '', approver_name: '', approver_email: '' }]);
      }
    }).finally(() => setLoading(false));
  }, [selType]);

  const addLevel = () => {
    if (levels.length >= 4) return;
    setLevels(ls => [...ls, {
      level: ls.length + 1, label: '', approver_type: 'fixed_user',
      approver_value: '', approver_name: '', approver_email: '',
    }]);
  };
  const removeLevel = (i: number) => {
    setLevels(ls => ls.filter((_, j) => j !== i).map((l, j) => ({ ...l, level: j + 1 })));
  };
  const update = (i: number, patch: Partial<FlowLevel>) => {
    setLevels(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
  };

  const save = async () => {
    if (!selType) return;
    setSaving(true);
    try {
      await api.saveFlow(selType, levels);
      alert('Flujo guardado correctamente');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Card style={{ marginBottom: 20 }}>
        <Field label="Tipo de solicitud">
          <Select value={selType} onChange={e => setSelType(e.target.value)}>
            <option value="">Selecciona un tipo…</option>
            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      </Card>

      {loading && <div style={{ textAlign: 'center', padding: 32 }}><Spinner /></div>}

      {selType && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {levels.map((level, i) => (
            <LevelEditor
              key={i} index={i} level={level}
              onUpdate={p => update(i, p)}
              onRemove={levels.length > 1 ? () => removeLevel(i) : undefined}
            />
          ))}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {levels.length < 4 && (
              <button onClick={addLevel} style={{
                border: '1.5px dashed #ccc', background: 'none', borderRadius: 8,
                padding: '10px 20px', cursor: 'pointer', color: '#888', fontSize: 13,
              }}>+ Agregar nivel ({levels.length}/4)</button>
            )}
            <Btn onClick={save} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar flujo'}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Editor de un nivel ───────────────────────────────────────────────────────
function LevelEditor({ index, level, onUpdate, onRemove }: {
  index: number; level: FlowLevel;
  onUpdate: (p: Partial<FlowLevel>) => void;
  onRemove?: () => void;
}) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<EntraUser[]>([]);
  const [searching, setSearching] = useState(false);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const r = await api.searchUsers(q);
      setResults(r.data);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 350);
    return () => clearTimeout(t);
  }, [query, search]);

  const pickUser = (u: EntraUser) => {
    onUpdate({
      approver_type: 'fixed_user',
      approver_value: u.id,
      approver_name: u.name,
      approver_email: u.email,
    });
    setQuery('');
    setResults([]);
  };

  return (
    <Card style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{
          background: '#0C447C', color: '#fff', fontSize: 12, fontWeight: 700,
          width: 26, height: 26, borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>{index + 1}</span>
        {onRemove && (
          <button onClick={onRemove} style={{ background: 'none', border: 'none',
            color: '#D85A30', cursor: 'pointer', fontSize: 13 }}>✕ Eliminar</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Etiqueta del nivel">
          <Input value={level.label} onChange={e => onUpdate({ label: e.target.value })}
            placeholder="Ej: Gerencia de Marketing" />
        </Field>
        <Field label="Tipo de aprobador">
          <Select value={level.approver_type} onChange={e => onUpdate({ approver_type: e.target.value as 'fixed_user' | 'job_title' })}>
            <option value="fixed_user">Usuario específico</option>
            <option value="job_title">Por cargo</option>
          </Select>
        </Field>
      </div>

      {level.approver_type === 'fixed_user' ? (
        <div>
          {/* Buscador Entra ID */}
          <Field label="Buscar aprobador por nombre o cargo">
            <div style={{ position: 'relative' }}>
              <Input
                value={query || level.approver_name || ''}
                onChange={e => { setQuery(e.target.value); if (!e.target.value) onUpdate({ approver_value: '', approver_name: '', approver_email: '' }); }}
                placeholder="Escribe nombre o cargo…"
              />
              {searching && (
                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                  <Spinner size={16} />
                </div>
              )}
              {results.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  background: '#fff', border: '1px solid #E8E8E4', borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 240, overflowY: 'auto',
                }}>
                  {results.map(u => (
                    <div key={u.id}
                      onClick={() => pickUser(u)}
                      style={{
                        padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F2F2F0',
                        display: 'flex', gap: 10, alignItems: 'center',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F8F8F6')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', background: '#E6F1FB',
                        color: '#0C447C', fontSize: 13, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>{u.name.charAt(0).toUpperCase()}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>
                          {u.jobTitle && <span>{u.jobTitle} · </span>}{u.email}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Field>
          {level.approver_value && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px',
              background: '#E1F5EE', borderRadius: 8, fontSize: 13,
            }}>
              <span style={{ fontSize: 16 }}>✓</span>
              <div>
                <span style={{ fontWeight: 700, color: '#085041' }}>{level.approver_name}</span>
                <span style={{ color: '#0F6E56', marginLeft: 8 }}>{level.approver_email}</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Field label="Cargo (job title en Entra ID)" hint="El sistema resolverá el aprobador con este cargo al momento de crear la solicitud">
          <Input value={level.approver_value}
            onChange={e => onUpdate({ approver_value: e.target.value })}
            placeholder="Ej: Gerente de Marketing" />
        </Field>
      )}
    </Card>
  );
}
