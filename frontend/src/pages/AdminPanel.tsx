import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, RequestType, FlowLevel, EntraUser, FormField, TeamMember, TicketDept, ProcessWithFlow, SysEvent, DiagnosticRun, Space, SpaceMember } from '../lib/api';
import { Card, PageHeader, Btn, Field, Input, Select, Spinner, Empty } from '../components/ui';
import { UserRow } from './ProcessBuilder';
import FormBuilder from './FormBuilder';
import { confirmDialog, alertDialog } from '../components/AppDialog';

type Tab = 'builder' | 'forms' | 'types' | 'flows' | 'team' | 'spaces' | 'logs';

export default function AdminPanel() {
  const [tab, setTab] = useState<Tab>('builder');
  const navigate = useNavigate();

  const TABS: { key: Tab; label: string }[] = [
    { key: 'builder', label: 'Procesos' },
    { key: 'forms',   label: 'Formularios' },
    { key: 'flows',   label: 'Flujos' },
    { key: 'team',    label: 'Equipos' },
    { key: 'spaces',  label: 'Líderes de área' },
    { key: 'types',   label: 'Tipos' },
    { key: 'logs',    label: 'Registro' },
  ];

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title="Administración"
        subtitle="Configura procesos, formularios, flujos y equipos"
        action={
          tab === 'builder' ? (
            <button
              onClick={() => navigate('/admin/wizard')}
              style={{
                background: '#0284C7', color: '#fff', border: 'none',
                borderRadius: 9, padding: '10px 18px', fontSize: 13,
                fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Nuevo proceso
            </button>
          ) : undefined
        }
      />
      <div style={{
        display: 'flex', gap: 4, marginBottom: 28,
        background: '#fff', padding: 4, borderRadius: 10,
        border: '1px solid #E4E4E7', width: 'fit-content',
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '9px 16px', borderRadius: 7, border: 'none',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: tab === t.key ? '#0284C7' : 'transparent',
            color: tab === t.key ? '#fff' : '#71717A',
            transition: 'all .15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'builder' && <ProcessesPanel onNew={() => navigate('/admin/wizard')} onEdit={(id) => navigate(`/admin/wizard?edit=${id}`)} />}
      {tab === 'forms'   && <FormsPanel />}
      {tab === 'flows'   && <FlowsPanel />}
      {tab === 'team'    && <TeamPanel />}
      {tab === 'spaces'  && <SpaceTeamPanel />}
      {tab === 'types'   && <TypesPanel />}
      {tab === 'logs'    && <LogsPanel />}
    </div>
  );
}

// ─── LÍDERES Y MIEMBROS POR ESPACIO ───────────────────────────────────────────
// Es la fuente de verdad de la persona "líder de área": quien aparezca como
// líder aquí entra a FlowApp por el tablero de capacidad de su área.
type DraftMember = { user_email: string; user_name: string; role: 'lead' | 'member' };

function SpaceTeamPanel() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spaceId, setSpaceId] = useState('');
  const [members, setMembers] = useState<DraftMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EntraUser[]>([]);

  useEffect(() => {
    api.getSpaces()
      .then(r => { setSpaces(r.data); setSpaceId(current => current || r.data[0]?.id || ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadMembers = useCallback(async (id: string) => {
    if (!id) return;
    const result = await api.getSpaceMembers(id);
    setMembers(result.data.map((m: SpaceMember) => ({
      user_email: m.user_email,
      user_name: m.user_name ?? m.user_email,
      role: m.role,
    })));
    setDirty(false);
  }, []);

  useEffect(() => { void loadMembers(spaceId).catch(() => setMembers([])); }, [spaceId, loadMembers]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      try { setResults((await api.searchUsers(query.trim())).data.slice(0, 6)); }
      catch { setResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const add = (user: EntraUser) => {
    const email = user.email.toLowerCase();
    if (members.some(m => m.user_email === email)) return;
    setMembers(current => [...current, { user_email: email, user_name: user.name, role: 'member' }]);
    setDirty(true);
    setQuery('');
    setResults([]);
  };

  const setRole = (email: string, role: 'lead' | 'member') => {
    setMembers(current => current.map(m => m.user_email === email ? { ...m, role } : m));
    setDirty(true);
  };

  const remove = (email: string) => {
    setMembers(current => current.filter(m => m.user_email !== email));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.saveSpaceMembers(spaceId, members);
      setDirty(false);
      await alertDialog({ title: 'Equipo actualizado', message: 'Los líderes verán el tablero de su área al iniciar sesión.' });
    } catch (error) {
      await alertDialog({ title: 'No se pudo guardar', message: (error as Error).message, tone: 'danger' });
    } finally { setSaving(false); }
  };

  if (loading) return <Card><Spinner /></Card>;

  const leads = members.filter(m => m.role === 'lead').length;

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <Field label="Espacio">
          <Select value={spaceId} onChange={e => setSpaceId(e.target.value)}>
            {spaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
          </Select>
        </Field>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Field label="Añadir persona">
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar en Microsoft 365" />
          </Field>
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #E4E4E7', borderRadius: 10, boxShadow: '0 14px 34px rgba(15,23,42,.16)', zIndex: 60, maxHeight: 260, overflowY: 'auto' }}>
              {results.map(user => <UserRow key={user.id} user={user} onPick={add} />)}
            </div>
          )}
        </div>
        <Btn onClick={save} disabled={!dirty || saving}>{saving ? 'Guardando…' : 'Guardar equipo'}</Btn>
      </div>

      <div style={{ fontSize: 12, color: '#71717A', marginBottom: 12 }}>
        {members.length} {members.length === 1 ? 'persona' : 'personas'} · {leads} {leads === 1 ? 'líder' : 'líderes'}.
        Un espacio sin líder no aparece en ningún tablero de capacidad.
      </div>

      {members.length === 0 ? (
        <Empty message="Este espacio aún no tiene equipo asignado." />
      ) : (
        <div style={{ border: '1px solid #E4E4E7', borderRadius: 10, overflow: 'hidden' }}>
          {members.map(member => (
            <div key={member.user_email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: '1px solid #F4F4F5', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#18181B' }}>{member.user_name}</div>
                <div style={{ fontSize: 11, color: '#A1A1AA' }}>{member.user_email}</div>
              </div>
              <div style={{ display: 'flex', padding: 3, background: '#F4F4F5', borderRadius: 8 }}>
                {(['member', 'lead'] as const).map(role => (
                  <button key={role} onClick={() => setRole(member.user_email, role)} style={{
                    border: 0, borderRadius: 6, padding: '5px 11px', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 11.5, fontWeight: 700,
                    background: member.role === role ? '#fff' : 'transparent',
                    color: member.role === role ? '#0284C7' : '#71717A',
                    boxShadow: member.role === role ? '0 1px 4px rgba(15,23,42,.12)' : 'none',
                  }}>{role === 'lead' ? 'Líder' : 'Miembro'}</button>
                ))}
              </div>
              <button onClick={() => remove(member.user_email)} style={{ border: 'none', background: 'none', color: '#A1A1AA', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── LISTA DE PROCESOS ────────────────────────────────────────────────────────
const STEP_COLORS_ADM = ['#10B981', '#0284C7', '#F59E0B', '#E07B3A'];

function ProcessesPanel({ onNew, onEdit }: { onNew: () => void; onEdit: (id: string) => void }) {
  const [processes, setProcesses] = useState<ProcessWithFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.getProcesses(); setProcesses(r.data); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleLifecycle = async (process: ProcessWithFlow) => {
    if (!process.is_active) {
      const ok = await confirmDialog({
        title: `¿Reactivar el proceso "${process.name}"?`,
        message: 'Volverá a estar disponible para crear nuevas solicitudes.',
        confirmLabel: 'Reactivar',
      });
      if (!ok) return;
      setDeleting(process.id);
      try {
        await api.updateProcess(process.id, { is_active: 1 });
        await load();
        await alertDialog({ title: 'Proceso reactivado', message: 'Ya está disponible para nuevas solicitudes.', tone: 'success' });
      } catch (e) {
        await alertDialog({ title: 'No se pudo reactivar', message: (e as Error).message, tone: 'danger' });
      } finally { setDeleting(null); }
      return;
    }

    const hasHistory = process.request_count > 0;
    const ok = await confirmDialog({
      title: `${hasHistory ? '¿Archivar' : '¿Eliminar'} el proceso "${process.name}"?`,
      message: hasHistory
        ? `Tiene ${process.request_count} solicitud${process.request_count === 1 ? '' : 'es'}. Se conservará todo el historial, pero no admitirá nuevas solicitudes.`
        : 'El proceso todavía no tiene solicitudes y se eliminará definitivamente.',
      confirmLabel: hasHistory ? 'Archivar' : 'Eliminar',
      danger: !hasHistory,
    });
    if (!ok) return;
    setDeleting(process.id);
    try {
      const result = await api.deleteProcess(process.id);
      await load();
      await alertDialog({
        title: result.data.archived ? 'Proceso archivado' : 'Proceso eliminado',
        message: result.data.message,
        tone: 'success',
      });
    }
    catch (e) { await alertDialog({ title: 'No se pudo eliminar', message: (e as Error).message, tone: 'danger' }); }
    finally { setDeleting(null); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spinner /></div>;

  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const visibleProcesses = normalizedQuery
    ? processes.filter(p => [p.name, p.description, ...p.levels.map(level => level.label)]
        .filter(Boolean).some(value => String(value).toLocaleLowerCase('es').includes(normalizedQuery)))
    : processes;

  return (
    <div>
      {processes.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 32px',
          background: '#fff', borderRadius: 14, border: '1.5px dashed #E4E4E7',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: '#F4F4F5',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#18181B', marginBottom: 6 }}>Sin procesos configurados</div>
          <div style={{ fontSize: 13, color: '#71717A', marginBottom: 20 }}>
            Crea tu primer proceso con el wizard interactivo
          </div>
          <button onClick={onNew} style={{
            background: '#0284C7', color: '#fff', border: 'none',
            borderRadius: 9, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            Crear primer proceso
          </button>
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            marginBottom: 16, padding: 14, background: 'rgba(255,255,255,.78)',
            border: '1px solid #E4E4E7', borderRadius: 12, backdropFilter: 'blur(12px)',
          }}>
            <div style={{ position: 'relative', flex: '1 1 280px' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#71717A" strokeWidth="2" style={{ position: 'absolute', left: 12, top: 11 }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Buscar por proceso, descripción o etapa…"
                aria-label="Buscar procesos"
                style={{
                  width: '100%', boxSizing: 'border-box', border: '1px solid #D4D4D8',
                  borderRadius: 9, padding: '10px 38px', fontSize: 13, outline: 'none',
                  color: '#18181B', background: '#fff',
                }}
              />
              {query && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery('')} style={{
                position: 'absolute', right: 8, top: 5, width: 30, height: 30, border: 0,
                borderRadius: 7, background: 'transparent', color: '#71717A', cursor: 'pointer', fontSize: 18,
              }}>×</button>}
            </div>
            <span style={{ fontSize: 12, color: '#71717A', whiteSpace: 'nowrap' }}>
              {visibleProcesses.length} de {processes.length} procesos
            </span>
          </div>
          {visibleProcesses.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#71717A', background: '#fff', border: '1px dashed #D4D4D8', borderRadius: 12 }}>
              No encontramos procesos con “{query}”.
            </div>
          ) : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
          {visibleProcesses.map(p => (
            <div key={p.id} style={{
              background: '#fff', borderRadius: 12, border: '1.5px solid #E4E4E7',
              overflow: 'hidden', transition: 'box-shadow .15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              <div style={{ height: 4, background: STEP_COLORS_ADM[0] }} />
              <div style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#18181B', marginBottom: 2 }}>{p.name}</div>
                    {p.description && <div style={{ fontSize: 12, color: '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, marginLeft: 8,
                    background: p.is_active ? '#D1FAE5' : '#F4F4F5',
                    color: p.is_active ? '#059669' : '#A1A1AA',
                  }}>
                    {p.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                {/* Flow pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
                  {p.levels.length === 0 ? (
                    <span style={{ fontSize: 11, color: '#A1A1AA' }}>Sin flujo configurado</span>
                  ) : p.levels.map((l, i) => (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{
                        background: STEP_COLORS_ADM[i] ?? '#888',
                        borderRadius: 99, padding: '3px 9px', fontSize: 11, fontWeight: 700, color: '#fff',
                      }}>
                        {l.level}. {l.label}
                      </div>
                      {i < p.levels.length - 1 && <span style={{ color: '#D4D4D8', fontSize: 12 }}>→</span>}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => onEdit(p.id)} style={{
                    flex: 1, background: '#0284C7', color: '#fff', border: 'none',
                    borderRadius: 7, padding: '8px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>
                    Editar en wizard
                  </button>
                  <button
                    onClick={() => handleLifecycle(p)}
                    disabled={deleting === p.id}
                    style={{
                      background: 'none', border: '1px solid #E4E4E7',
                      borderRadius: 7, padding: '8px 12px', fontSize: 12,
                      color: p.is_active && p.request_count === 0 ? '#EF4444' : '#52525B', cursor: 'pointer',
                    }}
                  >
                    {deleting === p.id ? '...' : !p.is_active ? 'Reactivar' : p.request_count > 0 ? 'Archivar' : 'Eliminar'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>}
        </>
      )}
    </div>
  );
}

// ─── FORMULARIOS DE SOLICITUD Y CIERRE ───────────────────────────────────────
type FormTab = 'intake' | 'close';

function FormsPanel() {
  const [types, setTypes]       = useState<RequestType[]>([]);
  const [selType, setSelType]   = useState('');
  const [formTab, setFormTab]   = useState<FormTab>('intake');
  const [intakeFields, setIntakeFields] = useState<FormField[]>([]);
  const [closeFields, setCloseFields]   = useState<FormField[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);

  useEffect(() => {
    api.getRequestTypes().then(r => setTypes(r.data.filter(t => t.is_active)));
  }, []);

  useEffect(() => {
    if (!selType) return;
    setLoadingFields(true);
    Promise.all([
      api.getFormFields(selType),
      api.getCloseFormFields(selType),
    ]).then(([intake, close]) => {
      setIntakeFields(intake.data);
      setCloseFields(close.data);
    }).finally(() => setLoadingFields(false));
  }, [selType]);

  const selectedType = types.find(t => t.id === selType);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Selector de proceso */}
      <Card style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#71717A',
              textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Tipo de proceso
            </label>
            <Select value={selType} onChange={e => { setSelType(e.target.value); setFormTab('intake'); }}>
              <option value="">Selecciona un proceso...</option>
              {types.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </div>
          {selType && (
            <div style={{ display: 'flex', gap: 4, background: '#F4F4F5', padding: 3, borderRadius: 8 }}>
              {(['intake', 'close'] as FormTab[]).map(tab => (
                <button key={tab} onClick={() => setFormTab(tab)} style={{
                  padding: '7px 16px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', transition: 'all .12s',
                  background: formTab === tab ? '#0284C7' : 'transparent',
                  color: formTab === tab ? '#fff' : '#71717A',
                }}>
                  {tab === 'intake' ? '📋 Formulario de solicitud' : '· Formulario de cierre'}
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Descripción */}
      {selType && (
        <div style={{
          background: formTab === 'intake'
            ? 'linear-gradient(135deg, #EDE9FE, #F5F3FF)'
            : 'linear-gradient(135deg, #D1FAE5, #ECFDF5)',
          border: '1px solid ' + (formTab === 'intake' ? '#DDD6FE' : '#A7F3D0'),
          borderRadius: 10, padding: '14px 18px',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span style={{ fontSize: 22 }}>{formTab === 'intake' ? '📋' : '·'}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: formTab === 'intake' ? '#5B21B6' : '#065F46' }}>
              {formTab === 'intake' ? 'Formulario de solicitud' : 'Formulario de cierre'}
              {' — '}{selectedType?.name}
            </div>
            <div style={{ fontSize: 12, color: formTab === 'intake' ? '#0284C7' : '#059669', marginTop: 2 }}>
              {formTab === 'intake'
                ? 'Define los campos que el solicitante llena al crear una solicitud de este tipo.'
                : 'Define los campos que el solicitante debe completar una vez que el proceso ha sido aprobado para certificar el cierre.'}
            </div>
          </div>
        </div>
      )}

      {/* Builder */}
      {!selType && (
        <div style={{
          background: '#fff', border: '1.5px dashed #E4E4E7',
          borderRadius: 14, padding: '48px 32px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>·</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#3F3F46', marginBottom: 4 }}>
            Selecciona un proceso para editar sus formularios
          </div>
          <div style={{ fontSize: 13, color: '#A1A1AA' }}>
            Puedes configurar el formulario de solicitud (campos de entrada) y el formulario de cierre (campos de entrega/confirmación).
          </div>
        </div>
      )}

      {selType && loadingFields && (
        <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
      )}

      {selType && !loadingFields && formTab === 'intake' && (
        <Card>
          <FormBuilder
            key={`intake-${selType}`}
            typeId={selType}
            typeName={selectedType?.name ?? ''}
            initialFields={intakeFields.map(f => ({ ...f, placeholder: f.placeholder ?? undefined, options_json: f.options_json ?? undefined }))}
            formLabel="Formulario de solicitud (ingreso)"
            apiSave={api.saveFormFields}
            onSaved={() =>
              api.getFormFields(selType).then(r => setIntakeFields(r.data))
            }
          />
        </Card>
      )}

      {selType && !loadingFields && formTab === 'close' && (
        <Card>
          <FormBuilder
            key={`close-${selType}`}
            typeId={selType}
            typeName={selectedType?.name ?? ''}
            initialFields={closeFields.map(f => ({ ...f, placeholder: f.placeholder ?? undefined, options_json: f.options_json ?? undefined }))}
            formLabel="Formulario de cierre (entrega)"
            apiSave={api.saveCloseFormFields}
            onSaved={() =>
              api.getCloseFormFields(selType).then(r => setCloseFields(r.data))
            }
          />
        </Card>
      )}
    </div>
  );
}

// ─── TIPOS DE SOLICITUD ───────────────────────────────────────────────────────
function TypesPanel() {
  const [types, setTypes]     = useState<RequestType[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState(false);
  const [form, setForm]       = useState({ name: '', description: '' });

  const load = () => {
    setLoading(true);
    api.getRequestTypes()
      .then(r => setTypes(r.data))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name.trim()) return;
    await api.createRequestType({
      name: form.name.trim(),
      description: form.description.trim(),
    });
    setForm({ name: '', description: '' });
    setAdding(false);
    load();
  };

  const toggle = async (t: RequestType) => {
    await api.updateRequestType(t.id, { is_active: t.is_active ? 0 : 1 });
    load();
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {types.map(t => (
        <Card key={t.id} style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>
                {t.name}
              </div>
              {t.description && (
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {t.description}
                </div>
              )}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: t.is_active ? '#E1F5EE' : '#F1EFE8',
              color: t.is_active ? '#085041' : '#5F5E5A',
            }}>
              {t.is_active ? 'Activo' : 'Inactivo'}
            </span>
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
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Compras internacionales"
            />
          </Field>
          <Field label="Descripcion (opcional)">
            <Input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descripcion breve"
            />
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
        }}>
          + Nuevo tipo de solicitud
        </button>
      )}
    </div>
  );
}

// ─── FLUJOS DE APROBACION ─────────────────────────────────────────────────────
function FlowsPanel() {
  const [types, setTypes]     = useState<RequestType[]>([]);
  const [selType, setSelType] = useState('');
  const [levels, setLevels]   = useState<FlowLevel[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    api.getRequestTypes().then(r => {
      setTypes(r.data.filter(t => t.is_active));
    });
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
        setLevels([{
          level: 1, label: 'Aprobador directo',
          approver_type: 'fixed_user',
          approver_value: '', approver_name: '', approver_email: '',
        }]);
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
    setLevels(ls =>
      ls.filter((_, j) => j !== i).map((l, j) => ({ ...l, level: j + 1 }))
    );
  };
  const update = (i: number, patch: Partial<FlowLevel>) => {
    setLevels(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
  };
  const save = async () => {
    if (!selType) return;
    setSaving(true);
    try {
      await api.saveFlow(selType, levels);
      await alertDialog({ title: 'Flujo guardado', message: 'Los cambios se aplicarán a las próximas solicitudes.', tone: 'success' });
    } catch (err) {
      await alertDialog({ title: 'No se pudo guardar el flujo', message: (err as Error).message, tone: 'danger' });
    } finally { setSaving(false); }
  };

  return (
    <div>
      <Card style={{ marginBottom: 20 }}>
        <Field label="Tipo de solicitud">
          <Select value={selType} onChange={e => setSelType(e.target.value)}>
            <option value="">Selecciona un tipo...</option>
            {types.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
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
              }}>
                + Agregar nivel ({levels.length}/4)
              </button>
            )}
            <Btn onClick={save} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar flujo'}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Level Editor ─────────────────────────────────────────────────────────────
function LevelEditor({ index, level, onUpdate, onRemove }: {
  index: number; level: FlowLevel;
  onUpdate: (p: Partial<FlowLevel>) => void;
  onRemove?: () => void;
}) {
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<EntraUser[]>([]);
  const [searching, setSearching] = useState(false);

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

  const pickUser = (u: EntraUser) => {
    onUpdate({
      approver_type: 'fixed_user', approver_value: u.id,
      approver_name: u.name, approver_email: u.email,
    });
    setQuery(''); setResults([]);
  };

  return (
    <Card style={{ padding: '18px 20px' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 14,
      }}>
        <span style={{
          background: '#0284C7', color: '#fff', fontSize: 12, fontWeight: 700,
          width: 26, height: 26, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {index + 1}
        </span>
        {onRemove && (
          <button onClick={onRemove} style={{
            background: 'none', border: 'none',
            color: '#D85A30', cursor: 'pointer', fontSize: 13,
          }}>
            Eliminar
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Etiqueta del nivel">
          <Input
            value={level.label}
            onChange={e => onUpdate({ label: e.target.value })}
            placeholder="Ej: Gerencia de Marketing"
          />
        </Field>
        <Field label="Tipo de aprobador">
          <Select
            value={level.approver_value === '__requester__' ? '__requester__' : level.approver_type}
            onChange={e => {
              const v = e.target.value;
              if (v === '__requester__') {
                onUpdate({ approver_type: 'job_title', approver_value: '__requester__', approver_name: 'Solicitante', approver_email: '' });
              } else {
                onUpdate({ approver_type: v as 'fixed_user' | 'job_title', approver_value: '', approver_name: '', approver_email: '' });
              }
            }}
          >
            <option value="fixed_user">Usuario específico</option>
            <option value="job_title">Por cargo</option>
            <option value="__requester__">Solicitante original</option>
          </Select>
        </Field>
      </div>

      {level.approver_value === '__requester__' ? (
        <div style={{ background: '#EDE9FE', border: '1px solid #DDD6FE', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>S</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#5B21B6' }}>Solicitante original</div>
            <div style={{ fontSize: 11, color: '#0284C7' }}>La persona que creó la solicitud confirmará en este paso.</div>
          </div>
        </div>
      ) : level.approver_type === 'fixed_user' ? (
        <div>
          <Field label="Buscar aprobador">
            <div style={{ position: 'relative' }}>
              <Input
                value={query || level.approver_name || ''}
                onChange={e => {
                  setQuery(e.target.value);
                  if (!e.target.value) {
                    onUpdate({ approver_value: '', approver_name: '', approver_email: '' });
                  }
                }}
                placeholder="Escribe nombre o cargo..."
              />
              {searching && (
                <div style={{
                  position: 'absolute', right: 10, top: '50%',
                  transform: 'translateY(-50%)',
                }}>
                  <Spinner size={16} />
                </div>
              )}
              {results.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  background: '#fff', border: '1px solid #E4E4E7',
                  borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                  zIndex: 100, maxHeight: 240, overflowY: 'auto',
                }}>
                  {results.map(u => (
                    <UserRow key={u.id} user={u} onPick={pickUser} />
                  ))}
                </div>
              )}
            </div>
          </Field>
          {level.approver_value && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'center',
              padding: '8px 12px', background: '#E1F5EE',
              borderRadius: 8, fontSize: 13,
            }}>
              <span style={{ fontSize: 16 }}>✓</span>
              <div>
                <span style={{ fontWeight: 700, color: '#085041' }}>
                  {level.approver_name}
                </span>
                <span style={{ color: '#0F6E56', marginLeft: 8 }}>
                  {level.approver_email}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Field label="Cargo en Entra ID">
          <Input
            value={level.approver_value}
            onChange={e => onUpdate({ approver_value: e.target.value })}
            placeholder="Ej: Gerente de Marketing"
          />
        </Field>
      )}
    </Card>
  );
}

// ─── GESTIÓN DE EQUIPOS (Marketing / BI) ─────────────────────────────────────
function TeamPanel() {
  const [dept, setDept]         = useState<TicketDept>('marketing');
  const [members, setMembers]   = useState<TeamMember[]>([]);
  const [loading, setLoading]   = useState(true);
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<EntraUser[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api.getTeamMembers(dept);
    setMembers(r.data);
    setLoading(false);
  }, [dept]);

  useEffect(() => { void load(); }, [load]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try { const r = await api.searchUsers(q); setResults(r.data); } finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 350);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const addMember = async (u: EntraUser) => {
    await api.addTeamMember({ user_id: u.id, user_name: u.name, user_email: u.email, department: dept });
    setQuery(''); setResults([]);
    void load();
  };

  const removeMember = async (id: string) => {
    await api.removeTeamMember(id);
    void load();
  };

  const DEPT_LABELS: Record<TicketDept, string> = {
    comercial: 'Comercial',
    marketing: 'Marketing',
    bi: 'BI',
    sso: 'SSO',
    operaciones: 'Operaciones',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Selector de área */}
      <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 10, border: '1px solid #E4E4E7', width: 'fit-content' }}>
        {(['comercial', 'marketing', 'bi', 'sso', 'operaciones'] as TicketDept[]).map(d => (
          <button key={d} onClick={() => setDept(d)} style={{
            padding: '8px 20px', borderRadius: 7, border: 'none', fontSize: 13,
            fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
            background: dept === d ? '#0284C7' : 'transparent',
            color: dept === d ? '#fff' : '#71717A',
          }}>
            {DEPT_LABELS[d]}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
        {/* Members list */}
        <Card>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#71717A', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 14 }}>
            Miembros del equipo — {DEPT_LABELS[dept]}
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}><Spinner /></div>
          ) : members.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#A1A1AA', fontSize: 13 }}>
              Sin miembros configurados.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {members.map(m => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', background: '#F9F9FB',
                  borderRadius: 9, border: '1px solid #F4F4F5',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: dept === 'marketing' ? '#EDE9FE' : '#E0F2FE',
                    color: dept === 'marketing' ? '#0284C7' : '#0284C7',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800, flexShrink: 0,
                  }}>
                    {m.user_name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#18181B' }}>{m.user_name}</div>
                    <div style={{ fontSize: 11, color: '#A1A1AA' }}>{m.user_email}</div>
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    color: (m.open_tickets ?? 0) === 0 ? '#059669' : (m.open_tickets ?? 0) <= 2 ? '#D97706' : '#DC2626',
                    background: (m.open_tickets ?? 0) === 0 ? '#D1FAE5' : (m.open_tickets ?? 0) <= 2 ? '#FEF3C7' : '#FEE2E2',
                    padding: '3px 10px', borderRadius: 99,
                  }}>
                    {m.open_tickets ?? 0} abiertos
                  </div>
                  <button onClick={() => removeMember(m.id)} style={{
                    background: 'none', border: '1px solid #E4E4E7',
                    borderRadius: 6, padding: '4px 10px', fontSize: 11,
                    color: '#EF4444', cursor: 'pointer', fontWeight: 600,
                  }}>
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Add member */}
        <Card>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#71717A', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 14 }}>
            Agregar miembro
          </div>
          <div style={{ position: 'relative' }}>
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por nombre..."
            />
            {searching && (
              <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                <Spinner size={16} />
              </div>
            )}
            {results.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: '#fff', border: '1px solid #E4E4E7',
                borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                zIndex: 100, maxHeight: 240, overflowY: 'auto',
              }}>
                {results.map(u => (
                  <UserRow key={u.id} user={u} onPick={addMember} />
                ))}
              </div>
            )}
          </div>
          <p style={{ fontSize: 12, color: '#A1A1AA', marginTop: 8 }}>
            Los tickets se auto-asignan al miembro con menor carga (menos tickets abiertos).
          </p>
        </Card>
      </div>
    </div>
  );
}

// ─── REGISTRO DEL SISTEMA (sys_events) ───────────────────────────────────────
const LOG_CATS = [
  { key: '',         label: 'Todo' },
  { key: 'request',  label: 'Solicitudes' },
  { key: 'approval', label: 'Aprobaciones' },
  { key: 'email',    label: 'Correo' },
  { key: 'teams',    label: 'Teams' },
  { key: 'task',     label: 'Tareas' },
  { key: 'notify',   label: 'Bandeja' },
  { key: 'http',     label: 'API' },
  { key: 'diagnostic', label: 'Pruebas' },
];

function LogsPanel() {
  const [events, setEvents] = useState<SysEvent[]>([]);
  const [cat, setCat] = useState('');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [search, setSearch] = useState('');
  const [trace, setTrace] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticRun | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await api.getSysLogs({
        category: cat || undefined, errors: onlyErrors,
        trace: trace || undefined, q: search.trim() || undefined,
      });
      setEvents(r.data);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  }, [cat, onlyErrors, search, trace]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const iv = setInterval(() => void load(true), 8000);
    return () => clearInterval(iv);
  }, [load]);

  const fmtTime = (iso: string) => {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    return d.toLocaleString('es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const prettyDetail = (detail: string | null): string => {
    if (!detail) return '';
    try {
      const o = JSON.parse(detail) as Record<string, unknown>;
      return Object.entries(o).map(([k, v]) => `${k}: ${String(v)}`).join(' · ');
    } catch { return detail; }
  };

  const runIntegralTest = async () => {
    const ok = await confirmDialog({
      title: '¿Ejecutar prueba integral?',
      message: 'Se enviará un correo a tu cuenta y una tarjeta al canal de Teams configurado. También se validarán Graph, D1, KV y el enlace público de aprobación.',
      confirmLabel: 'Ejecutar prueba',
    });
    if (!ok) return;
    setRunning(true); setError(''); setDiagnostic(null);
    try {
      const result = await api.runDiagnostics();
      setDiagnostic(result.data);
      setTrace(result.data.run_id);
      setCat('');
      await load(true);
    } catch (e) {
      setError((e as Error).message);
    } finally { setRunning(false); }
  };

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, rgba(2,132,199,.09), rgba(14,165,233,.03))',
        border: '1px solid rgba(2,132,199,.22)', borderRadius: 14, padding: 18, marginBottom: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0F172A', fontSize: 15 }}>Centro de diagnóstico</div>
            <div style={{ color: '#64748B', fontSize: 12.5, marginTop: 4 }}>
              Valida la operación completa y agrupa todos los resultados bajo una sola referencia.
            </div>
          </div>
          <button onClick={runIntegralTest} disabled={running} style={{
            border: 0, borderRadius: 9, padding: '10px 16px', background: '#0284C7', color: '#fff',
            fontWeight: 750, cursor: running ? 'wait' : 'pointer', opacity: running ? .7 : 1,
          }}>{running ? 'Probando canales…' : 'Nueva prueba integral'}</button>
        </div>
        {diagnostic && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{
                borderRadius: 99, padding: '5px 10px', fontSize: 11, fontWeight: 800,
                background: diagnostic.status === 'passed' ? '#DCFCE7' : diagnostic.status === 'partial' ? '#FEF3C7' : '#FEE2E2',
                color: diagnostic.status === 'passed' ? '#166534' : diagnostic.status === 'partial' ? '#92400E' : '#991B1B',
              }}>{diagnostic.passed}/{diagnostic.total} validaciones correctas</span>
              <button onClick={() => navigator.clipboard.writeText(diagnostic.run_id)} style={{
                border: '1px solid #CBD5E1', background: '#fff', borderRadius: 7, padding: '5px 9px',
                fontFamily: 'monospace', fontSize: 10.5, color: '#475569', cursor: 'pointer',
              }}>Copiar referencia {diagnostic.run_id.slice(-12)}</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 8 }}>
              {diagnostic.checks.map(item => (
                <div key={item.name} style={{ background: '#fff', border: `1px solid ${item.ok ? '#BBF7D0' : '#FECACA'}`, borderRadius: 9, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 750, color: '#1E293B' }}>{item.ok ? 'Correcto' : 'Revisar'} · {item.label}</span>
                    <span style={{ fontSize: 10, color: '#94A3B8' }}>{item.duration_ms} ms</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: item.ok ? '#64748B' : '#B91C1C', marginTop: 4, lineHeight: 1.4 }}>{item.detail}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar acción, usuario o detalle…" style={{
          flex: '1 1 260px', border: '1px solid #CBD5E1', borderRadius: 9, padding: '9px 12px', fontSize: 12.5,
        }} />
        {trace && <button onClick={() => setTrace('')} style={{
          border: '1px solid #7DD3FC', background: '#F0F9FF', color: '#0369A1', borderRadius: 9,
          padding: '7px 11px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace',
        }}>Referencia: {trace.slice(-14)} ×</button>}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {LOG_CATS.map(c => (
          <button key={c.key} onClick={() => setCat(c.key)} style={{
            border: cat === c.key ? '1.5px solid #0284C7' : '1px solid #E2E8F0',
            background: cat === c.key ? 'rgba(2,132,199,0.08)' : '#fff',
            color: cat === c.key ? '#0284C7' : '#475569',
            borderRadius: 99, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>{c.label}</button>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#475569', cursor: 'pointer', marginLeft: 8 }}>
          <input type="checkbox" checked={onlyErrors} onChange={e => setOnlyErrors(e.target.checked)} style={{ accentColor: '#DC2626' }} />
          Solo errores
        </label>
        <button onClick={() => load()} style={{
          marginLeft: 'auto', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8,
          padding: '7px 14px', fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer',
        }}>Actualizar</button>
      </div>

      {error ? (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>{error}</div>
      ) : loading && events.length === 0 ? (
        <div style={{ padding: 30, color: '#94A3B8' }}>Cargando registro…</div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', border: '1.5px dashed #E2E8F0', borderRadius: 12, color: '#94A3B8', fontSize: 13 }}>
          Sin eventos {onlyErrors ? 'con error' : ''} todavía. Crea o aprueba una solicitud y aparecerán aquí.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
          {events.map(ev => (
            <div key={ev.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
              borderBottom: '1px solid #F1F5F9',
              background: ev.ok === 0 ? '#FEF7F7' : 'transparent',
            }}>
              <span style={{
                marginTop: 2, width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: ev.ok === 0 ? '#E24B4A' : '#1D9E75',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: '#0284C7' }}>{ev.category}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: ev.ok === 0 ? '#A32D2D' : '#0F172A' }}>{ev.action.replace(/_/g, ' ')}</span>
                  {ev.actor && <span style={{ fontSize: 11, color: '#94A3B8' }}>por {ev.actor}</span>}
                  {ev.http_status && <span style={{ fontSize: 10.5, color: '#64748B' }}>HTTP {ev.http_status}</span>}
                  {ev.duration_ms != null && <span style={{ fontSize: 10.5, color: '#94A3B8' }}>{ev.duration_ms} ms</span>}
                </div>
                {ev.detail && (
                  <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2, lineHeight: 1.5, wordBreak: 'break-word' }}>
                    {prettyDetail(ev.detail)}
                  </div>
                )}
                {ev.trace_id && (
                  <button onClick={() => setTrace(ev.trace_id || '')} style={{
                    marginTop: 4, border: 0, background: 'transparent', padding: 0, color: '#0284C7',
                    fontFamily: 'monospace', fontSize: 10, cursor: 'pointer',
                  }}>ver recorrido · {ev.trace_id.slice(-16)}</button>
                )}
              </div>
              <span style={{ fontSize: 10.5, color: '#94A3B8', flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtTime(ev.at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
