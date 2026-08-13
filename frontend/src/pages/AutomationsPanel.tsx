// Automatizaciones sin código: Cuando ocurra X, si se cumple Y, hacer Z.
//
// La interfaz se construye desde el catálogo que publica el backend. Si el
// motor no sabe evaluar algo, aquí no aparece: así nadie puede guardar una
// regla que después no se dispara.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api, Automation, AutomationAction, AutomationCatalog, AutomationCondition,
  AutomationInput, AutomationRun, ProcessWithFlow, Space,
} from '../lib/api';
import { Card, Btn, Field, Input, Select, Spinner, Empty } from '../components/ui';
import { alertDialog, confirmDialog } from '../components/AppDialog';

const parseJson = <T,>(raw: string, fallback: T): T => {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
};

export default function AutomationsPanel() {
  const [catalog, setCatalog] = useState<AutomationCatalog | null>(null);
  const [rules, setRules] = useState<Automation[]>([]);
  const [processes, setProcesses] = useState<ProcessWithFlow[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Automation | 'new' | null>(null);
  const [runsFor, setRunsFor] = useState<Automation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, list, procs, sp] = await Promise.all([
        api.getAutomationCatalog(), api.getAutomations(),
        api.getProcesses(), api.getSpaces(),
      ]);
      setCatalog(cat.data); setRules(list.data);
      setProcesses(procs.data); setSpaces(sp.data);
    } catch (e) {
      await alertDialog({ title: 'No se pudieron cargar las automatizaciones', message: (e as Error).message, tone: 'danger' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (rule: Automation) => {
    setBusy(rule.id);
    try {
      await api.updateAutomation(rule.id, { is_active: rule.is_active ? 0 : 1 });
      await load();
    } catch (e) {
      await alertDialog({ title: 'No se pudo cambiar el estado', message: (e as Error).message, tone: 'danger' });
    } finally { setBusy(null); }
  };

  const remove = async (rule: Automation) => {
    const ok = await confirmDialog({
      title: `¿Eliminar "${rule.name}"?`,
      message: rule.runs_total > 0
        ? `Se ejecutó ${rule.runs_total} vez${rule.runs_total === 1 ? '' : 'es'}. Su bitácora se conserva como evidencia.`
        : 'Todavía no se ha ejecutado nunca.',
      confirmLabel: 'Eliminar', danger: true,
    });
    if (!ok) return;
    setBusy(rule.id);
    try { await api.deleteAutomation(rule.id); await load(); }
    catch (e) { await alertDialog({ title: 'No se pudo eliminar', message: (e as Error).message, tone: 'danger' }); }
    finally { setBusy(null); }
  };

  if (loading) return <Card><div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div></Card>;
  if (!catalog) return <Card><Empty message="El catálogo de automatizaciones no está disponible." /></Card>;

  const triggerLabel = (event: string) =>
    catalog.triggers.find(t => t.event === event)?.label ?? event;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13, color: '#71717A' }}>
            Cuando ocurra algo, si se cumplen las condiciones, FlowApp actúa solo.
            Cada ejecución queda registrada.
          </div>
        </div>
        <Btn onClick={() => setEditing('new')}>Nueva automatización</Btn>
      </div>

      {rules.length === 0 ? (
        <Card><Empty message="Todavía no hay automatizaciones. Crea la primera para dejar de coordinar a mano." /></Card>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rules.map(rule => (
            <Card key={rule.id} style={{ opacity: rule.is_active ? 1 : 0.62 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#18181B' }}>{rule.name}</span>
                    {!rule.is_active && <span style={badge('#71717A', '#F4F4F5')}>PAUSADA</span>}
                    {rule.errors > 0 && <span style={badge('#A32D2D', '#FEE2E2')}>{rule.errors} ERROR(ES)</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#71717A', marginTop: 4 }}>
                    Cuando: {triggerLabel(rule.trigger_event)}
                    {' · '}
                    {parseJson<AutomationCondition[]>(rule.conditions_json, []).length} condición(es)
                    {' · '}
                    {parseJson<AutomationAction[]>(rule.actions_json, []).length} acción(es)
                  </div>
                  <div style={{ fontSize: 11, color: '#A1A1AA', marginTop: 3 }}>
                    {rule.runs30} ejecución(es) en 30 días · {rule.runs_total} en total
                    {rule.last_run_at ? ` · última ${new Date(String(rule.last_run_at).replace(' ', 'T') + 'Z').toLocaleString('es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  <button onClick={() => setRunsFor(rule)} style={mini}>Bitácora</button>
                  <button onClick={() => setEditing(rule)} style={mini}>Editar</button>
                  <button onClick={() => toggle(rule)} disabled={busy === rule.id} style={mini}>
                    {rule.is_active ? 'Pausar' : 'Activar'}
                  </button>
                  <button onClick={() => remove(rule)} disabled={busy === rule.id} style={{ ...mini, color: '#DC2626' }}>
                    Eliminar
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <AutomationEditor
          catalog={catalog}
          processes={processes}
          spaces={spaces}
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}

      {runsFor && <RunsDrawer rule={runsFor} onClose={() => setRunsFor(null)} />}
    </div>
  );
}

// ─── EDITOR ───────────────────────────────────────────────────────────────────
function AutomationEditor({ catalog, processes, spaces, rule, onClose, onSaved }: {
  catalog: AutomationCatalog;
  processes: ProcessWithFlow[];
  spaces: Space[];
  rule: Automation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? '');
  const [trigger, setTrigger] = useState(rule?.trigger_event ?? catalog.triggers[0]?.event ?? '');
  const [processId, setProcessId] = useState(rule?.process_id ?? '');
  const [spaceId, setSpaceId] = useState(rule?.space_id ?? '');
  const [conditions, setConditions] = useState<AutomationCondition[]>(
    rule ? parseJson<AutomationCondition[]>(rule.conditions_json, []) : []);
  const [actions, setActions] = useState<AutomationAction[]>(
    rule ? parseJson<AutomationAction[]>(rule.actions_json, []) : []);
  const [saving, setSaving] = useState(false);

  const fieldMeta = useCallback((field: string) =>
    catalog.fields.find(f => f.field === field), [catalog]);

  const canSave = name.trim().length > 0 && trigger && actions.length > 0;

  const save = async () => {
    setSaving(true);
    const payload: AutomationInput = {
      name: name.trim(),
      trigger_event: trigger,
      process_id: processId || null,
      space_id: spaceId || null,
      conditions,
      actions,
    };
    try {
      if (rule) await api.updateAutomation(rule.id, payload);
      else await api.createAutomation(payload);
      onSaved();
    } catch (e) {
      await alertDialog({ title: 'No se pudo guardar', message: (e as Error).message, tone: 'danger' });
    } finally { setSaving(false); }
  };

  return (
    <Drawer title={rule ? 'Editar automatización' : 'Nueva automatización'} onClose={onClose} width={620}>
      <div style={{ padding: '18px 22px', display: 'grid', gap: 16 }}>
        <Field label="Nombre">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Urgentes avisan al líder" />
        </Field>

        <section style={block}>
          <div style={blockTitle}>Cuando</div>
          <Select value={trigger} onChange={e => setTrigger(e.target.value)}>
            {catalog.triggers.map(t => <option key={t.event} value={t.event}>{t.label}</option>)}
          </Select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <Field label="Solo en el proceso">
              <Select value={processId} onChange={e => setProcessId(e.target.value)}>
                <option value="">Cualquier proceso</option>
                {processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Solo en el espacio">
              <Select value={spaceId} onChange={e => setSpaceId(e.target.value)}>
                <option value="">Cualquier espacio</option>
                {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          </div>
        </section>

        <section style={block}>
          <div style={blockTitle}>Si se cumple</div>
          {conditions.length === 0 && (
            <div style={{ fontSize: 11.5, color: '#A1A1AA', marginBottom: 9 }}>
              Sin condiciones, la automatización actúa siempre que ocurra el disparador.
            </div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {conditions.map((condition, index) => {
              const meta = fieldMeta(condition.field);
              const needsValue = catalog.operators.find(o => o.op === condition.op)?.needsValue ?? true;
              const update = (patch: Partial<AutomationCondition>) =>
                setConditions(list => list.map((c, i) => i === index ? { ...c, ...patch } : c));
              return (
                <div key={index} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={condition.field} onChange={e => update({ field: e.target.value, value: '' })} style={{ ...selectSm, flex: '1 1 150px' }}>
                    {catalog.fields.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
                  </select>
                  <select value={condition.op} onChange={e => update({ op: e.target.value as AutomationCondition['op'] })} style={{ ...selectSm, flex: '0 1 130px' }}>
                    {catalog.operators.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
                  </select>
                  {needsValue && (meta?.kind === 'choice' ? (
                    <select value={String(condition.value ?? '')} onChange={e => update({ value: e.target.value })} style={{ ...selectSm, flex: '1 1 110px' }}>
                      <option value="">Elegir…</option>
                      {(meta.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input
                      value={String(condition.value ?? '')}
                      onChange={e => update({ value: e.target.value })}
                      type={meta?.kind === 'number' ? 'number' : 'text'}
                      placeholder="Valor"
                      style={{ ...selectSm, flex: '1 1 110px' }}
                    />
                  ))}
                  <button onClick={() => setConditions(list => list.filter((_, i) => i !== index))} style={removeBtn}>×</button>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => setConditions(list => [...list, { field: catalog.fields[0].field, op: 'eq', value: '' }])}
            style={addBtn}
          >+ Añadir condición</button>
        </section>

        <section style={block}>
          <div style={blockTitle}>Entonces</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {actions.map((action, index) => (
              <ActionRow
                key={index}
                action={action}
                catalog={catalog}
                onChange={next => setActions(list => list.map((a, i) => i === index ? next : a))}
                onRemove={() => setActions(list => list.filter((_, i) => i !== index))}
              />
            ))}
          </div>
          <button
            onClick={() => setActions(list => [...list, { type: 'notify', to: 'assignee', body: '' }])}
            style={addBtn}
          >+ Añadir acción</button>
          {actions.length === 0 && (
            <div style={{ fontSize: 11.5, color: '#A32D2D', marginTop: 8 }}>
              Necesita al menos una acción para poder guardarse.
            </div>
          )}
        </section>

        <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={mini}>Cancelar</button>
          <Btn onClick={save} disabled={!canSave || saving}>{saving ? 'Guardando…' : 'Guardar'}</Btn>
        </div>
      </div>
    </Drawer>
  );
}

function ActionRow({ action, catalog, onChange, onRemove }: {
  action: AutomationAction;
  catalog: AutomationCatalog;
  onChange: (next: AutomationAction) => void;
  onRemove: () => void;
}) {
  const hint = catalog.actions.find(a => a.type === action.type)?.hint;

  // Cambiar de tipo reconstruye la acción con sus valores por defecto, para no
  // arrastrar campos que la acción nueva no entiende.
  const changeType = (type: AutomationAction['type']) => {
    const defaults: Record<AutomationAction['type'], AutomationAction> = {
      notify:          { type: 'notify', to: 'assignee', body: '' },
      set_priority:    { type: 'set_priority', value: 'high' },
      set_due_in_days: { type: 'set_due_in_days', value: 1 },
      assign_to:       { type: 'assign_to', email: '' },
      block:           { type: 'block', reason: '' },
      unblock:         { type: 'unblock' },
      comment:         { type: 'comment', body: '' },
    };
    onChange(defaults[type]);
  };

  return (
    <div style={{ border: '1px solid #E4E4E7', borderRadius: 9, padding: 11, background: '#fff' }}>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <select value={action.type} onChange={e => changeType(e.target.value as AutomationAction['type'])} style={{ ...selectSm, flex: 1 }}>
          {catalog.actions.map(a => <option key={a.type} value={a.type}>{a.label}</option>)}
        </select>
        <button onClick={onRemove} style={removeBtn}>×</button>
      </div>
      {hint && <div style={{ fontSize: 10.5, color: '#A1A1AA', marginTop: 5 }}>{hint}</div>}

      <div style={{ display: 'grid', gap: 7, marginTop: 9 }}>
        {action.type === 'notify' && (
          <>
            <select value={action.to} onChange={e => onChange({ ...action, to: e.target.value as typeof action.to })} style={selectSm}>
              <option value="assignee">Al responsable del trabajo</option>
              <option value="requester">Al solicitante</option>
              <option value="lead">Al líder del área</option>
              <option value="email">A un correo fijo</option>
            </select>
            {action.to === 'email' && (
              <input value={action.email ?? ''} onChange={e => onChange({ ...action, email: e.target.value })} placeholder="correo@metrored.med.ec" style={selectSm} />
            )}
            <input value={action.body} onChange={e => onChange({ ...action, body: e.target.value })} placeholder="Mensaje. Puedes usar {{request.request_type_name}}" style={selectSm} />
          </>
        )}
        {action.type === 'set_priority' && (
          <select value={action.value} onChange={e => onChange({ ...action, value: e.target.value as typeof action.value })} style={selectSm}>
            <option value="low">Baja</option><option value="normal">Normal</option>
            <option value="high">Alta</option><option value="urgent">Urgente</option>
          </select>
        )}
        {action.type === 'set_due_in_days' && (
          <input type="number" min={0} max={365} value={action.value} onChange={e => onChange({ ...action, value: Number(e.target.value) })} placeholder="Días desde hoy" style={selectSm} />
        )}
        {action.type === 'assign_to' && (
          <>
            <input value={action.email} onChange={e => onChange({ ...action, email: e.target.value })} placeholder="correo@metrored.med.ec" style={selectSm} />
            <input value={action.name ?? ''} onChange={e => onChange({ ...action, name: e.target.value })} placeholder="Nombre visible (opcional)" style={selectSm} />
          </>
        )}
        {action.type === 'block' && (
          <input value={action.reason} onChange={e => onChange({ ...action, reason: e.target.value })} placeholder="Motivo del bloqueo" style={selectSm} />
        )}
        {action.type === 'comment' && (
          <input value={action.body} onChange={e => onChange({ ...action, body: e.target.value })} placeholder="Texto del comentario" style={selectSm} />
        )}
      </div>
    </div>
  );
}

// ─── BITÁCORA ─────────────────────────────────────────────────────────────────
function RunsDrawer({ rule, onClose }: { rule: Automation; onClose: () => void }) {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAutomationRuns(rule.id)
      .then(r => setRuns(r.data))
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, [rule.id]);

  const summary = useMemo(() => ({
    ok: runs.filter(r => !r.error).length,
    failed: runs.filter(r => r.error).length,
  }), [runs]);

  return (
    <Drawer title={`Bitácora · ${rule.name}`} onClose={onClose} width={540}>
      {loading ? (
        <div style={{ padding: 50, textAlign: 'center' }}><Spinner /></div>
      ) : runs.length === 0 ? (
        <div style={{ padding: 32 }}><Empty message="Esta automatización todavía no se ha ejecutado." /></div>
      ) : (
        <>
          <div style={{ padding: '12px 22px', borderBottom: '1px solid #E4E4E7', fontSize: 12, color: '#71717A' }}>
            {summary.ok} correcta(s) · {summary.failed} con error · últimas {runs.length}
          </div>
          {runs.map(run => (
            <div key={run.id} style={{ padding: '12px 22px', borderBottom: '1px solid #F4F4F5' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: run.error ? '#A32D2D' : '#18181B' }}>
                  {run.error ? 'Error' : (run.actions_applied || 'Sin cambios')}
                </span>
                <span style={{ fontSize: 10.5, color: '#A1A1AA' }}>{run.event_type}</span>
              </div>
              {run.error && <div style={{ fontSize: 11, color: '#A32D2D', marginTop: 3 }}>{run.error}</div>}
              <div style={{ fontSize: 10.5, color: '#A1A1AA', marginTop: 3 }}>
                {new Date(String(run.created_at).replace(' ', 'T') + 'Z').toLocaleString('es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </>
      )}
    </Drawer>
  );
}

// ─── Piezas compartidas ───────────────────────────────────────────────────────
function Drawer({ title, width, onClose, children }: {
  title: string; width: number; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1500,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <aside onClick={e => e.stopPropagation()} style={{
        width, maxWidth: '96vw', background: '#fff', height: '100%',
        overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #E4E4E7', display: 'flex', gap: 12, alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: '#18181B' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#A1A1AA', cursor: 'pointer' }}>✕</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

const badge = (color: string, bg: string): React.CSSProperties => ({
  fontSize: 9.5, fontWeight: 800, color, background: bg,
  padding: '2px 7px', borderRadius: 6,
});

const mini: React.CSSProperties = {
  border: '1px solid #E4E4E7', background: '#fff', color: '#52525B',
  borderRadius: 7, padding: '6px 11px', fontSize: 11.5, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
};

const selectSm: React.CSSProperties = {
  border: '1px solid #E4E4E7', borderRadius: 7, padding: '7px 9px',
  fontSize: 12, fontFamily: 'inherit', background: '#fff', color: '#3F3F46',
  outline: 'none', minWidth: 0,
};

const removeBtn: React.CSSProperties = {
  border: 'none', background: 'none', color: '#A1A1AA',
  fontSize: 18, cursor: 'pointer', padding: '0 4px',
};

const addBtn: React.CSSProperties = {
  width: '100%', marginTop: 10, border: '1.5px dashed #C7D2DE',
  background: '#fff', color: '#0284C7', borderRadius: 8,
  padding: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};

const block: React.CSSProperties = {
  border: '1px solid #E4E4E7', borderRadius: 11, padding: 14, background: '#FAFAFA',
};

const blockTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: '#18181B',
  textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 9,
};
