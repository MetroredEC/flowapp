import { useEffect, useState, useCallback } from 'react';
import { api, EntraUser, ProcessWithFlow, CreateProcessBody } from '../lib/api';
import { Card, Btn, Field, Input, Select, Spinner } from '../components/ui';
import FormBuilder from './FormBuilder';
import { confirmDialog, alertDialog } from '../components/AppDialog';

// ─── Types ────────────────────────────────────────────────────────────────────
type TemplateLevel = {
  level: number; label: string;
  approver_type: 'fixed_user' | 'job_title';
  approver_value: string; approver_name: string; approver_email: string;
};
type Template = {
  icon: string; name: string; description: string;
  color: string; levels: TemplateLevel[];
};
export type BuilderLevel = TemplateLevel & { _key: number };

// ─── Constants ────────────────────────────────────────────────────────────────
export const STEP_COLORS = ['#10B981', '#0284C7', '#9B59B6', '#E07B3A'];
let _seq = 0;
export const nextKey = () => ++_seq;
export const mkLevel = (n: number, label = ''): BuilderLevel => ({
  _key: nextKey(), level: n, label,
  approver_type: 'fixed_user',
  approver_value: '', approver_name: '', approver_email: '',
});

const TEMPLATES: Template[] = [
  {
    icon: '01', name: 'Aprobacion express', color: '#10B981',
    description: '1 nivel. Solicitudes simples de bajo impacto.',
    levels: [
      { level: 1, label: 'Aprobador directo', approver_type: 'fixed_user',
        approver_value: '', approver_name: '', approver_email: '' },
    ],
  },
  {
    icon: '02', name: 'Campana de marketing', color: '#9B59B6',
    description: '2 niveles. Coordinacion de Marketing y Gerencia Comercial.',
    levels: [
      { level: 1, label: 'Coordinacion de Marketing',
        approver_type: 'fixed_user',
        approver_value: '', approver_name: '', approver_email: '' },
      { level: 2, label: 'Gerencia Comercial',
        approver_type: 'fixed_user',
        approver_value: '', approver_name: '', approver_email: '' },
    ],
  },
  {
    icon: '03', name: 'Compras y adquisiciones', color: '#E07B3A',
    description: '3 niveles. Gerencia de area, Gerencia General y Finanzas.',
    levels: [
      { level: 1, label: 'Gerencia de area', approver_type: 'fixed_user',
        approver_value: '', approver_name: '', approver_email: '' },
      { level: 2, label: 'Gerencia General', approver_type: 'fixed_user',
        approver_value: '', approver_name: '', approver_email: '' },
      { level: 3, label: 'Finanzas / Tesoreria', approver_type: 'fixed_user',
        approver_value: '', approver_name: '', approver_email: '' },
    ],
  },
  {
    icon: '04', name: 'Aprobacion ejecutiva', color: '#0284C7',
    description: '2 niveles. Direccion de area y Direccion General.',
    levels: [
      { level: 1, label: 'Direccion de area', approver_type: 'fixed_user',
        approver_value: '', approver_name: '', approver_email: '' },
      { level: 2, label: 'Direccion General', approver_type: 'fixed_user',
        approver_value: '', approver_name: '', approver_email: '' },
    ],
  },
  {
    icon: '05', name: 'Proceso administrativo', color: '#5A7F9B',
    description: '3 niveles. Jefatura, Gerencia y Direccion.',
    levels: [
      { level: 1, label: 'Jefatura', approver_type: 'fixed_user',
        approver_value: '', approver_name: '', approver_email: '' },
      { level: 2, label: 'Gerencia', approver_type: 'fixed_user',
        approver_value: '', approver_name: '', approver_email: '' },
      { level: 3, label: 'Direccion', approver_type: 'fixed_user',
        approver_value: '', approver_name: '', approver_email: '' },
    ],
  },
  {
    icon: '06', name: 'Doble control', color: '#C0392B',
    description: '4 niveles. Control completo para procesos criticos.',
    levels: [
      { level: 1, label: 'Supervisor', approver_type: 'fixed_user',
        approver_value: '', approver_name: '', approver_email: '' },
      { level: 2, label: 'Jefatura', approver_type: 'fixed_user',
        approver_value: '', approver_name: '', approver_email: '' },
      { level: 3, label: 'Gerencia', approver_type: 'fixed_user',
        approver_value: '', approver_name: '', approver_email: '' },
      { level: 4, label: 'Direccion', approver_type: 'fixed_user',
        approver_value: '', approver_name: '', approver_email: '' },
    ],
  },
];

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function ProcessBuilderPanel() {
  const [processes, setProcesses] = useState<ProcessWithFlow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [name, setName]           = useState('');
  const [createdTypeId, setCreatedTypeId] = useState<string | null>(null);
  const [createdTypeName, setCreatedTypeName] = useState<string | null>(null);
  const [desc, setDesc]           = useState('');
  const [levels, setLevels]       = useState<BuilderLevel[]>([mkLevel(1)]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try { const r = await api.getProcesses(); setProcesses(r.data); }
    catch { /* silencioso */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  function applyTemplate(tpl: Template) {
    setName(tpl.name);
    setDesc(tpl.description);
    setLevels(tpl.levels.map(l => ({ ...l, _key: nextKey() })));
    setError(''); setSuccess('');
  }

  function reset() {
    setName(''); setDesc('');
    setLevels([mkLevel(1)]);
    setError(''); setSuccess('');
  }

  function addLevel() {
    if (levels.length >= 4) return;
    setLevels(ls => [...ls, mkLevel(ls.length + 1)]);
  }
  function removeLevel(key: number) {
    setLevels(ls =>
      ls.filter(l => l._key !== key).map((l, i) => ({ ...l, level: i + 1 }))
    );
  }
  function updateLevel(key: number, patch: Partial<BuilderLevel>) {
    setLevels(ls => ls.map(l => l._key === key ? { ...l, ...patch } : l));
  }

  async function handleSave() {
    setError(''); setSuccess('');
    if (!name.trim()) { setError('El nombre del proceso es obligatorio.'); return; }
    if (levels.some(l => !l.label.trim())) {
      setError('Todos los pasos deben tener etiqueta.'); return;
    }
    if (levels.some(l => l.approver_type === 'fixed_user' && !l.approver_value)) {
      setError('Asigna un aprobador a cada paso o cambia a "Por cargo" o "Solicitante".'); return;
    }
    if (levels.some(l => l.approver_type === 'job_title' && !l.approver_value)) {
      setError('Ingresa el cargo para los pasos de tipo "Por cargo".'); return;
    }
    setSaving(true);
    try {
      const body: CreateProcessBody = {
        name: name.trim(),
        description: desc.trim() || undefined,
        levels: levels.map(l => ({
          level: l.level, label: l.label,
          approver_type: l.approver_type,
          approver_value: l.approver_value,
          approver_name: l.approver_name || undefined,
          approver_email: l.approver_email || undefined,
        })),
      };
      const result = await api.createProcess(body);
      const pname = name.trim();
      setCreatedTypeId(result.data.id);
      setCreatedTypeName(pname);
      setSuccess('Proceso "' + pname + '" creado. Ahora configura el formulario de ingreso.');
      reset();
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar.');
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string, pname: string) {
    const ok = await confirmDialog({
      title: `¿Eliminar el proceso "${pname}"?`,
      message: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar', danger: true,
    });
    if (!ok) return;
    setDeleting(id);
    try { await api.deleteProcess(id); await loadAll(); }
    catch (e) { await alertDialog({ title: 'No se pudo eliminar', message: e instanceof Error ? e.message : 'Error.', tone: 'danger' }); }
    finally { setDeleting(null); }
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 360px',
      gap: 24, alignItems: 'start',
    }}>
      {/* Editor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <TemplatesGrid onApply={applyTemplate} />
        <BuilderForm
          name={name} desc={desc} levels={levels}
          saving={saving} error={error} success={success}
          onName={setName} onDesc={setDesc}
          onAdd={addLevel}
          onRemove={removeLevel}
          onUpdate={updateLevel}
          onReset={reset}
          onSave={handleSave}
        />
        {createdTypeId && createdTypeName && (
          <div style={{ border: '2px solid #10B981', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: '#10B981', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>·</span>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 13 }}>
                  Proceso creado — Configura el formulario de ingreso
                </span>
              </div>
              <button onClick={() => { setCreatedTypeId(null); setCreatedTypeName(null); }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 18 }}>
                ✕
              </button>
            </div>
            <div style={{ padding: 16, background: '#F9FFFE' }}>
              <FormBuilder
                typeId={createdTypeId}
                typeName={createdTypeName}
                onSaved={() => { setCreatedTypeId(null); setCreatedTypeName(null); setSuccess('Proceso y formulario guardados correctamente.'); }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Lista */}
      <div>
        <div style={{
          fontSize: 11, fontWeight: 800, color: '#888',
          letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
        }}>
          Procesos cargados ({processes.length})
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
        ) : processes.length === 0 ? (
          <div style={{
            background: '#fff', border: '1px solid #E4E4E7',
            borderRadius: 12, padding: 32, textAlign: 'center', color: '#aaa',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>—</div>
            <div style={{ fontSize: 13 }}>
              Sin procesos aun. Usa una plantilla para comenzar.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {processes.map(p => (
              <ProcessCard
                key={p.id} process={p}
                expanded={expanded === p.id}
                deleting={deleting === p.id}
                onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                onDelete={() => handleDelete(p.id, p.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Templates grid ───────────────────────────────────────────────────────────
function TemplatesGrid({ onApply }: { onApply: (t: Template) => void }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 800, color: '#888',
        letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
      }}>
        Plantillas de inicio rapido
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10,
      }}>
        {TEMPLATES.map(tpl => (
          <TplCard key={tpl.name} tpl={tpl} onApply={() => onApply(tpl)} />
        ))}
      </div>
    </div>
  );
}

function TplCard({ tpl, onApply }: { tpl: Template; onApply: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onApply}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? '#FAFAF8' : '#fff',
        border: '2px solid ' + (hover ? tpl.color : '#E4E4E7'),
        borderRadius: 10, padding: '12px 14px',
        cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 900, color: tpl.color,
          background: tpl.color + '15', padding: '2px 7px',
          borderRadius: 5, letterSpacing: 1, fontFamily: 'monospace',
        }}>{tpl.icon}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#18181B' }}>{tpl.name}</span>
      </div>
      <div style={{ fontSize: 11, color: '#888', lineHeight: 1.4, marginBottom: 8 }}>
        {tpl.description}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {tpl.levels.map((_, i) => (
          <div key={i} style={{
            width: 18, height: 18, borderRadius: '50%',
            fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: tpl.color, color: '#fff',
          }}>
            {i + 1}
          </div>
        ))}
      </div>
    </button>
  );
}

// ─── Builder form ─────────────────────────────────────────────────────────────
function BuilderForm({ name, desc, levels, saving, error, success,
  onName, onDesc, onAdd, onRemove, onUpdate, onReset, onSave }: {
  name: string; desc: string; levels: BuilderLevel[];
  saving: boolean; error: string; success: string;
  onName: (v: string) => void; onDesc: (v: string) => void;
  onAdd: () => void;
  onRemove: (key: number) => void;
  onUpdate: (key: number, p: Partial<BuilderLevel>) => void;
  onReset: () => void; onSave: () => void;
}) {
  return (
    <Card style={{ padding: '22px 24px' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 20,
      }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#111', margin: 0 }}>
            Nuevo proceso de aprobacion
          </h2>
          <p style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
            Define nombre y pasos del flujo.
          </p>
        </div>
        <button onClick={onReset} style={{
          background: 'none', border: 'none', color: '#aaa',
          cursor: 'pointer', fontSize: 12,
        }}>
          Limpiar
        </button>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 14, marginBottom: 20,
      }}>
        <Field label="Nombre del proceso">
          <Input
            value={name}
            onChange={e => onName(e.target.value)}
            placeholder="Ej: Aprobacion de campana digital"
          />
        </Field>
        <Field label="Descripcion (opcional)">
          <Input
            value={desc}
            onChange={e => onDesc(e.target.value)}
            placeholder="Breve descripcion del proceso"
          />
        </Field>
      </div>

      <div style={{
        fontSize: 11, fontWeight: 800, color: '#888',
        letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12,
      }}>
        Pasos de aprobacion ({levels.length}/4)
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {levels.map((lv, idx) => (
          <BuilderStep
            key={lv._key} index={idx} level={lv}
            canRemove={levels.length > 1}
            onUpdate={p => onUpdate(lv._key, p)}
            onRemove={() => onRemove(lv._key)}
          />
        ))}
      </div>

      {levels.length < 4 && (
        <button onClick={onAdd} style={{
          width: '100%', border: '1.5px dashed #ccc',
          background: '#FAFAF8', borderRadius: 8, padding: '10px',
          cursor: 'pointer', color: '#888', fontSize: 13, marginBottom: 16,
        }}>
          + Agregar paso
        </button>
      )}

      {error && (
        <div style={{
          background: '#FFF2EC', border: '1px solid #F0997B',
          color: '#993C1D', borderRadius: 8,
          padding: '10px 14px', fontSize: 13, marginBottom: 14,
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          background: '#E6F7F1', border: '1px solid #B5E0D0',
          color: '#1D7A5A', borderRadius: 8,
          padding: '10px 14px', fontSize: 13, marginBottom: 14,
        }}>
          {success}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn onClick={onSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Crear proceso'}
        </Btn>
      </div>
    </Card>
  );
}

// ─── Builder step ─────────────────────────────────────────────────────────────
function BuilderStep({ index, level, canRemove, onUpdate, onRemove }: {
  index: number; level: BuilderLevel; canRemove: boolean;
  onUpdate: (p: Partial<BuilderLevel>) => void; onRemove: () => void;
}) {
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<EntraUser[]>([]);
  const [searching, setSearching] = useState(false);
  const color = STEP_COLORS[index] ?? '#888';

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try { const r = await api.searchUsers(q); setResults(r.data); }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 350);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  function pickUser(u: EntraUser) {
    onUpdate({
      approver_type: 'fixed_user', approver_value: u.id,
      approver_name: u.name, approver_email: u.email,
    });
    setQuery(''); setResults([]);
  }

  return (
    <div style={{
      border: '1.5px solid #E4E4E7', borderRadius: 10,
      padding: '14px 16px', background: '#FAFAF8',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: color, color: '#fff',
          fontSize: 12, fontWeight: 800,
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0,
        }}>
          {index + 1}
        </div>
        <div style={{ flex: 1 }}>
          <Input
            value={level.label}
            onChange={e => onUpdate({ label: e.target.value })}
            placeholder={'Nombre del paso ' + (index + 1)}
            style={{ fontSize: 13, padding: '7px 10px' }}
          />
        </div>
        <Select
          value={
            level.approver_value === '__requester__' ? '__requester__' : level.approver_type
          }
          onChange={e => {
            const v = e.target.value;
            if (v === '__requester__') {
              onUpdate({ approver_type: 'job_title', approver_value: '__requester__', approver_name: 'Solicitante', approver_email: '' });
            } else {
              onUpdate({ approver_type: v as 'fixed_user' | 'job_title', approver_value: '', approver_name: '', approver_email: '' });
            }
          }}
          style={{ width: 165, fontSize: 12, padding: '7px 10px' }}
        >
          <option value="fixed_user">Usuario fijo</option>
          <option value="job_title">Por cargo</option>
          <option value="__requester__">Solicitante</option>
        </Select>
        {canRemove && (
          <button onClick={onRemove} style={{
            background: 'none', border: 'none',
            color: '#ccc', cursor: 'pointer', fontSize: 16, padding: 2,
          }}>
            ✕
          </button>
        )}
      </div>

      {level.approver_value === '__requester__' ? (
        <div style={{ background: '#E8F4FD', border: '1px solid #B5D4F4', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>👤</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0284C7' }}>Solicitante original</div>
            <div style={{ fontSize: 11, color: '#5A90B2' }}>La persona que creo la solicitud confirmara la recepcion final.</div>
          </div>
        </div>
      ) : level.approver_type === 'fixed_user' ? (
        <div style={{ position: 'relative' }}>
          {level.approver_value ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#E1F5EE', borderRadius: 8, padding: '8px 12px',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: color, color: '#fff',
                fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {level.approver_name?.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#085041' }}>
                  {level.approver_name}
                </div>
                <div style={{ fontSize: 11, color: '#0F6E56' }}>
                  {level.approver_email}
                </div>
              </div>
              <button
                onClick={() => onUpdate({ approver_value: '', approver_name: '', approver_email: '' })}
                style={{ background: 'none', border: 'none', color: '#0F6E56', cursor: 'pointer', fontSize: 12 }}
              >
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar aprobador por nombre..."
                style={{ fontSize: 13, padding: '8px 10px' }}
              />
              {searching && (
                <span style={{
                  position: 'absolute', right: 10, top: 8,
                  fontSize: 11, color: '#aaa',
                }}>...</span>
              )}
              {results.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  background: '#fff', border: '1px solid #E4E4E7',
                  borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.1)',
                  zIndex: 100, maxHeight: 200, overflowY: 'auto',
                }}>
                  {results.map(u => (
                    <UserRow key={u.id} user={u} onPick={pickUser} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <Input
          value={level.approver_value === '__requester__' ? '' : level.approver_value}
          onChange={e => onUpdate({ approver_value: e.target.value })}
          placeholder="Ej: Gerente de Marketing"
          style={{ fontSize: 13, padding: '8px 10px' }}
        />
      )}
    </div>
  );
}

// ─── User row ─────────────────────────────────────────────────────────────────
export function UserRow(
  { user: u, onPick }: { user: EntraUser; onPick: (u: EntraUser) => void }
) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={() => onPick(u)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '9px 12px', cursor: 'pointer',
        borderBottom: '1px solid #F9F9FB',
        display: 'flex', gap: 8, alignItems: 'center',
        background: hover ? '#F8F8F6' : 'transparent',
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: '#E6F1FB', color: '#0284C7',
        fontSize: 11, fontWeight: 700,
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0,
      }}>
        {u.name.charAt(0)}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{u.name}</div>
        <div style={{ fontSize: 11, color: '#888' }}>
          {u.jobTitle ? u.jobTitle + ' · ' : ''}{u.email}
        </div>
      </div>
    </div>
  );
}

// ─── Process card ─────────────────────────────────────────────────────────────
function ProcessCard({ process: p, expanded, deleting, onToggle, onDelete }: {
  process: ProcessWithFlow; expanded: boolean; deleting: boolean;
  onToggle: () => void; onDelete: () => void;
}) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E4E4E7',
      borderRadius: 12, overflow: 'hidden',
    }}>
      <div onClick={onToggle} style={{
        padding: '14px 16px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {p.levels.length === 0 ? (
            <span style={{ fontSize: 11, color: '#aaa' }}>Sin pasos</span>
          ) : p.levels.map((l, i) => (
            <div key={l.id} title={l.label} style={{
              width: 20, height: 20, borderRadius: '50%',
              background: STEP_COLORS[i] ?? '#888',
              color: '#fff', fontSize: 10, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {l.level}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: '#111',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {p.name}
          </div>
          {p.description && (
            <div style={{
              fontSize: 11, color: '#888',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {p.description}
            </div>
          )}
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12,
          background: p.is_active ? '#E1F5EE' : '#F1EFE8',
          color: p.is_active ? '#085041' : '#5F5E5A', flexShrink: 0,
        }}>
          {p.is_active ? 'Activo' : 'Inactivo'}
        </span>
        <span style={{ color: '#aaa', fontSize: 14, flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {expanded && (
        <div style={{
          borderTop: '1px solid #F9F9FB',
          padding: '14px 16px', background: '#FAFAF8',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            gap: 6, marginBottom: 14, flexWrap: 'wrap',
          }}>
            {p.levels.map((l, i) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  background: STEP_COLORS[i] ?? '#888',
                  borderRadius: 8, padding: '6px 10px',
                  fontSize: 12, color: '#fff',
                }}>
                  <div style={{ fontWeight: 800 }}>{l.label}</div>
                  <div style={{ fontSize: 10, opacity: 0.85 }}>
                    {l.approver_value === '__requester__'
                      ? 'Solicitante original'
                      : l.approver_type === 'fixed_user'
                        ? (l.approver_name ?? 'Sin asignar')
                        : 'Cargo: ' + l.approver_value}
                  </div>
                </div>
                {i < p.levels.length - 1 && (
                  <span style={{ color: '#ccc', fontSize: 16, fontWeight: 800 }}>
                    {String.fromCharCode(8594)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onDelete} disabled={deleting}
              style={{
                background: 'none', border: '1px solid #F0997B',
                color: '#993C1D', borderRadius: 7,
                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                cursor: deleting ? 'wait' : 'pointer',
                opacity: deleting ? 0.6 : 1,
              }}
            >
              {deleting ? 'Eliminando...' : 'Eliminar proceso'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
