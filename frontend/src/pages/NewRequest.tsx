// Pedir algo en FlowApp.
//
// Un formulario largo se sufre; este recorrido intenta lo contrario. Tres ideas
// lo sostienen:
//
// 1. Una decisión por pantalla, con superficies grandes y atajos de teclado.
// 2. El recorrido se acorta al responder, y se dice en voz alta cuando ocurre:
//    es lo único que un formulario condicional puede prometer y casi ninguno
//    cumple, así que merece ser el momento central y no un adorno.
// 3. Nunca se pierde el trabajo ni se termina en el vacío: hay borrador y un
//    cierre que explica qué pasa ahora.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { api, type RequestType, type FormField, type RequesterRow } from '../lib/api';
import { alertDialog } from '../components/AppDialog';
import { useIsMobile } from '../lib/useIsMobile';
import { fieldApplies, validateFields, type FieldValue } from './request/conditions';
import { F, FLOW_CSS, ICON_PATHS, areaColor, areaLabel, inputStyle } from './request/flowTheme';
import { QuestionField, optionShortcut } from './request/Fields';

type Phase = 'intent' | 'process' | 'form' | 'review' | 'done';

interface FormStep {
  title: string;
  description?: string;
  fields: FormField[];
}

const SIN_CATEGORIA = 'Otros';

const categoryLabel = (value: string) =>
  value === SIN_CATEGORIA ? value : areaLabel(value);

function sectionDescription(field: FormField): string {
  try {
    const config = field.options_json ? JSON.parse(field.options_json) as { description?: string } : null;
    return config?.description || field.placeholder || '';
  } catch { return field.placeholder || ''; }
}

/**
 * Convierte la lista plana de campos en pasos.
 *
 * Cada `section` abre un paso. Si un paso trae muchos campos, se parte en
 * tandas de tres para sostener el ritmo de una pantalla, pocas decisiones.
 */
function buildSteps(fields: FormField[]): FormStep[] {
  const steps: FormStep[] = [];
  let current: FormStep | null = null;

  for (const field of fields) {
    if (field.field_type === 'section') {
      current = { title: field.label, description: sectionDescription(field), fields: [] };
      steps.push(current);
      continue;
    }
    if (!current) {
      current = { title: 'Cuéntanos los detalles', fields: [] };
      steps.push(current);
    }
    current.fields.push(field);
  }

  const withFields = steps.filter(step => step.fields.length > 0);
  const chunked: FormStep[] = [];
  for (const step of withFields) {
    if (step.fields.length <= 3) { chunked.push(step); continue; }
    for (let index = 0; index < step.fields.length; index += 3) {
      chunked.push({
        title: step.title,
        description: index === 0 ? step.description : undefined,
        fields: step.fields.slice(index, index + 3),
      });
    }
  }
  return chunked;
}

/** Minutos aproximados de llenado, para poder prometer algo concreto. */
const estimateMinutes = (questions: number) => Math.max(1, Math.ceil((questions + 2) / 3));

export default function NewRequest() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { accounts } = useMsal();
  const firstName = accounts[0]?.name?.split(' ')[0] ?? '';

  const [types, setTypes] = useState<RequestType[]>([]);
  const [recent, setRecent] = useState<RequesterRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [phase, setPhase] = useState<Phase>('intent');
  const [direction, setDirection] = useState<'fwd' | 'back'>('fwd');
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [requestTypeId, setRequestTypeId] = useState('');
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>({});
  const [fieldFiles, setFieldFiles] = useState<Record<string, File[]>>({});

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState('');
  const [shrinkNote, setShrinkNote] = useState('');

  useEffect(() => {
    Promise.all([
      api.getRequestTypes().then(r => setTypes(r.data.filter(type => type.is_active))).catch(() => {}),
      api.getMyRequests().then(r => setRecent(r.data.slice(0, 3))).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!requestTypeId) { setFormFields([]); setFieldValues({}); return; }
    setLoadingFields(true);
    api.getFormFields(requestTypeId)
      .then(r => {
        setFormFields(r.data);
        const defaults: Record<string, FieldValue> = {};
        r.data.forEach(field => {
          defaults[field.field_key] = field.field_type === 'checkbox_group' ? [] : '';
        });
        setFieldValues(defaults);
        setFieldFiles({});
      })
      .catch(() => setFormFields([]))
      .finally(() => setLoadingFields(false));
  }, [requestTypeId]);

  const selected = types.find(type => type.id === requestTypeId) ?? null;

  // El recorrido se recalcula con cada respuesta: lo que deja de aplicar
  // desaparece y, si un paso se queda sin preguntas, deja de existir.
  const visibleFields = useMemo(
    () => formFields.filter(field => fieldApplies(field, fieldValues)),
    [formFields, fieldValues]);
  const steps = useMemo(() => buildSteps(visibleFields), [visibleFields]);
  const totalSteps = steps.length + 1;

  const remainingQuestions = useMemo(
    () => steps.slice(Math.max(0, stepIndex - 1)).reduce((sum, step) => sum + step.fields.length, 0),
    [steps, stepIndex]);

  // Cuando una respuesta elimina preguntas, se dice. Es la promesa del árbol
  // hecha visible: el formulario se acortó por lo que acabas de elegir.
  const previousCount = useRef<number | null>(null);
  useEffect(() => {
    const count = visibleFields.filter(field => field.field_type !== 'section').length;
    const before = previousCount.current;
    previousCount.current = count;
    if (before === null || phase !== 'form' || count >= before) return;
    const diff = before - count;
    setShrinkNote(`${diff} pregunta${diff === 1 ? '' : 's'} menos`);
    const timer = setTimeout(() => setShrinkNote(''), 2200);
    return () => clearTimeout(timer);
  }, [visibleFields, phase]);

  useEffect(() => {
    if (stepIndex > steps.length) setStepIndex(steps.length);
  }, [steps.length, stepIndex]);

  const go = useCallback((to: Phase, dir: 'fwd' | 'back' = 'fwd') => {
    setDirection(dir); setError(''); setPhase(to);
  }, []);

  function chooseProcess(type: RequestType) {
    setRequestTypeId(type.id);
    setStepIndex(0);
    previousCount.current = null;
    go('form');
  }

  const next = useCallback(() => {
    setError('');
    if (stepIndex === 0) {
      if (!title.trim()) { setError('Escribe en una línea qué necesitas.'); return; }
      if (!description.trim()) { setError('Cuéntanos un poco más para que el equipo lo entienda.'); return; }
    } else {
      const invalid = validateFields(steps[stepIndex - 1].fields, fieldValues, fieldFiles);
      if (invalid) { setError(invalid); return; }
    }
    setDirection('fwd');
    if (stepIndex + 1 >= totalSteps) setPhase('review');
    else setStepIndex(stepIndex + 1);
  }, [stepIndex, title, description, steps, fieldValues, fieldFiles, totalSteps]);

  const back = useCallback(() => {
    setError(''); setDirection('back');
    if (phase === 'review') { setStepIndex(totalSteps - 1); setPhase('form'); return; }
    if (stepIndex === 0) { setPhase('process'); return; }
    setStepIndex(stepIndex - 1);
  }, [phase, stepIndex, totalSteps]);

  // Teclado: Enter avanza, Escape retrocede y 1 a 9 eligen opción. Quien ya
  // conoce el proceso puede completarlo sin tocar el ratón.
  useEffect(() => {
    if (phase !== 'form') return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

      if (event.key === 'Escape') { event.preventDefault(); back(); return; }
      if (event.key === 'Enter' && tag !== 'TEXTAREA') { event.preventDefault(); next(); return; }
      if (typing || stepIndex === 0) return;

      const step = steps[stepIndex - 1];
      if (!step || step.fields.length !== 1) return;
      const field = step.fields[0];
      const shortcut = optionShortcut(field, event.key, fieldValues[field.field_key]);
      if (shortcut !== null) {
        event.preventDefault();
        setFieldValues(prev => ({ ...prev, [field.field_key]: shortcut }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, stepIndex, steps, fieldValues, next, back]);

  async function persist(mode: 'draft' | 'submit') {
    setSaving(true); setError('');
    try {
      const applicable = formFields.filter(field => fieldApplies(field, fieldValues));
      const invalid = validateFields(applicable, fieldValues, fieldFiles);
      if (mode === 'submit' && invalid) throw new Error(invalid);

      // Solo se guardan las respuestas de las preguntas que aplicaban: lo
      // contestado en una rama descartada contradiría el camino real.
      const keys = new Set(applicable.map(field => field.field_key));
      const campaign_data = applicable.length > 0
        ? {
            fields: Object.fromEntries(Object.entries(fieldValues).filter(([key]) => keys.has(key))),
            file_fields: Object.fromEntries(
              Object.entries(fieldFiles).filter(([key]) => keys.has(key))
                .map(([key, value]) => [key, value.map(file => file.name)])),
          }
        : undefined;

      const created = await api.createRequest({
        request_type_id: requestTypeId,
        title: title.trim(),
        description: description.trim(),
        campaign_data,
      });

      const attached = Object.entries(fieldFiles)
        .filter(([key]) => keys.has(key)).flatMap(([, value]) => value);
      for (const file of [...files, ...attached]) {
        await api.uploadFile(created.data.id, file);
      }

      setCreatedId(created.data.id);
      if (mode === 'submit') {
        await api.submitRequest(created.data.id);
        setDirection('fwd');
        setPhase('done');
      } else {
        await alertDialog({
          title: 'Guardada como borrador',
          message: 'Puedes retomarla desde Mis solicitudes cuando quieras. Nadie la revisará hasta que la envíes.',
          tone: 'success',
        });
        navigate('/solicitudes/' + created.data.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la solicitud.');
    } finally {
      setSaving(false);
    }
  }

  async function repeat(row: RequesterRow) {
    setSaving(true);
    try {
      const created = await api.duplicateRequest(row.id);
      navigate('/solicitudes/' + created.data.id);
    } catch (e) {
      await alertDialog({ title: 'No se pudo duplicar', message: (e as Error).message, tone: 'danger' });
    } finally { setSaving(false); }
  }

  const categories = useMemo(() => {
    const map = new Map<string, RequestType[]>();
    for (const type of types) {
      const key = (type.category || '').trim() || SIN_CATEGORIA;
      map.set(key, [...(map.get(key) ?? []), type]);
    }
    return [...map.entries()].sort(([a], [b]) =>
      a === SIN_CATEGORIA ? 1 : b === SIN_CATEGORIA ? -1 : a.localeCompare(b));
  }, [types]);

  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es');
    if (term.length < 2) return [];
    return types.filter(type =>
      `${type.name} ${type.description ?? ''} ${type.category ?? ''}`
        .toLocaleLowerCase('es').includes(term));
  }, [query, types]);

  const anim = direction === 'fwd' ? 'fw-fwd' : 'fw-back';
  const shell: React.CSSProperties = {
    padding: isMobile ? '22px 16px 80px' : '40px 24px 80px',
    maxWidth: 720, margin: '0 auto',
  };

  if (loading) {
    return <div style={{ ...shell, color: F.ink3, paddingTop: 60 }}>Preparando el catálogo…</div>;
  }

  if (types.length === 0) {
    return (
      <div style={{ ...shell, textAlign: 'center', paddingTop: 60 }}>
        <h1 style={{ fontSize: 22, fontWeight: 850, color: F.ink, marginBottom: 10 }}>
          No hay procesos disponibles
        </h1>
        <p style={{ color: F.ink3, fontSize: 14.5, lineHeight: 1.6 }}>
          Ahora mismo no hay ningún proceso activo para crear solicitudes.
          Un administrador puede activarlos desde Administrar → Procesos.
        </p>
        <button onClick={() => navigate('/solicitudes')} style={{ ...ghostBtn, marginTop: 22 }}>
          Ver mis solicitudes
        </button>
      </div>
    );
  }

  return (
    <div style={shell}>
      <style>{FLOW_CSS}</style>

      {phase === 'intent' && (
        <div className={anim}>
          <Greeting name={firstName} />

          <input
            className="fw-input"
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Descríbelo en tus palabras… arte, reporte, convenio"
            style={{ ...inputStyle, marginBottom: 22 }}
          />

          {matches.length > 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <SectionLabel>{matches.length} coincidencia(s)</SectionLabel>
              {matches.map((type, index) => (
                <ProcessCard key={type.id} type={type} index={index} onPick={() => chooseProcess(type)} />
              ))}
            </div>
          ) : (
            <>
              <SectionLabel>¿Con qué tiene que ver?</SectionLabel>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 12, marginBottom: 26,
              }}>
                {categories.map(([name, list], index) => (
                  <AreaCard
                    key={name} name={name} count={list.length} index={index}
                    onPick={() => { setCategory(name); go('process'); }}
                  />
                ))}
              </div>

              {recent.length > 0 && (
                <>
                  <SectionLabel>O repite algo que ya pediste</SectionLabel>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {recent.map((row, index) => (
                      <button
                        key={row.id} onClick={() => repeat(row)} disabled={saving}
                        className="fw-card fw-rise"
                        style={{
                          ...cardBase, display: 'flex', alignItems: 'center', gap: 12,
                          animationDelay: `${index * 50}ms`, padding: '13px 15px',
                        }}
                      >
                        <span style={{ fontSize: 17, color: F.ink3 }}>↺</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: F.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.title}
                          </span>
                          <span style={{ display: 'block', fontSize: 11.5, color: F.ink3, marginTop: 2 }}>
                            {row.request_type_name}
                          </span>
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: F.brand }}>Pedir de nuevo</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {phase === 'process' && (
        <div className={anim}>
          <button onClick={() => { setCategory(null); go('intent', 'back'); }} style={{ ...linkBtn, marginBottom: 16 }}>
            ← Cambiar de área
          </button>
          <h1 style={{ fontSize: 27, fontWeight: 850, color: F.ink, letterSpacing: -0.6, margin: '0 0 6px' }}>
            {categoryLabel(category ?? '')}
          </h1>
          <p style={{ color: F.ink3, fontSize: 14.5, margin: '0 0 22px' }}>
            Cada opción dice qué te va a pedir y cuánto suele tardar.
          </p>
          <div style={{ display: 'grid', gap: 11 }}>
            {types
              .filter(type => ((type.category || '').trim() || SIN_CATEGORIA) === category)
              .map((type, index) => (
                <ProcessCard key={type.id} type={type} index={index} onPick={() => chooseProcess(type)} />
              ))}
          </div>
        </div>
      )}

      {(phase === 'form' || phase === 'review') && selected && (
        <>
          <Progress
            processName={selected.name}
            current={phase === 'review' ? totalSteps : stepIndex}
            total={totalSteps}
            remaining={phase === 'review' ? 0 : remainingQuestions}
            onExit={() => { setRequestTypeId(''); go('process', 'back'); }}
          />

          {shrinkNote && (
            <div className="fw-toast" style={{
              position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 96, zIndex: 60,
              background: F.ink, color: '#fff', padding: '9px 16px', borderRadius: 99,
              fontSize: 12.5, fontWeight: 700, boxShadow: '0 10px 30px rgba(15,23,42,.3)',
            }}>
              Se acortó · {shrinkNote}
            </div>
          )}

          {error && (
            <div className="fw-pop" style={{
              background: F.dangerBg, border: `1px solid ${F.danger}40`, color: '#8B2F2A',
              borderRadius: 12, padding: '12px 15px', fontSize: 13.5, fontWeight: 650, marginBottom: 16,
            }}>{error}</div>
          )}

          {phase === 'form' && (
            loadingFields ? (
              <div style={{ padding: 40, color: F.ink3 }}>Cargando el formulario…</div>
            ) : (
              <section key={stepIndex} className={anim} style={card}>
                {stepIndex === 0 ? (
                  <>
                    <StepHeading
                      title="¿Qué necesitas?"
                      description="Resúmelo en una línea. Es lo que verá quien lo apruebe."
                    />
                    <div style={{ display: 'grid', gap: 20 }}>
                      <div>
                        <div style={fieldLabel}>En una línea</div>
                        <input
                          className="fw-input" autoFocus value={title}
                          onChange={e => setTitle(e.target.value)}
                          placeholder="Ej. Arte para la campaña de vacunación"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <div style={fieldLabel}>Cuéntanos un poco más</div>
                        <textarea
                          className="fw-input" value={description}
                          onChange={e => setDescription(e.target.value)}
                          placeholder="Para qué es, cuándo lo necesitas y cualquier detalle que ayude a resolverlo bien."
                          rows={5}
                          style={{ ...inputStyle, resize: 'vertical', minHeight: 120, lineHeight: 1.55 }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <StepHeading
                      title={steps[stepIndex - 1].title}
                      description={steps[stepIndex - 1].description}
                    />
                    <div style={{ display: 'grid', gap: 26 }}>
                      {steps[stepIndex - 1].fields.map((field, index) => (
                        <div key={field.id} className="fw-rise" style={{ animationDelay: `${index * 60}ms` }}>
                          <QuestionField
                            field={field}
                            value={fieldValues[field.field_key]}
                            files={fieldFiles[field.field_key] ?? []}
                            autoFocus={index === 0}
                            onChange={value => setFieldValues(prev => ({ ...prev, [field.field_key]: value }))}
                            onFiles={list => setFieldFiles(prev => ({ ...prev, [field.field_key]: list }))}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )
          )}

          {phase === 'review' && (
            <section className={anim} style={card}>
              <StepHeading
                title="Revisa antes de enviar"
                description={`Se enviará como "${selected.name}".`}
              />
              <div style={{ display: 'grid', gap: 12 }}>
                <ReviewBlock label="Tu pedido" onEdit={() => { setStepIndex(0); go('form', 'back'); }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: F.ink }}>{title}</div>
                  <div style={{ fontSize: 13.5, color: F.ink2, marginTop: 5, whiteSpace: 'pre-line', lineHeight: 1.55 }}>
                    {description}
                  </div>
                </ReviewBlock>

                {steps.map((step, index) => (
                  <ReviewBlock key={index} label={step.title} onEdit={() => { setStepIndex(index + 1); go('form', 'back'); }}>
                    <div style={{ display: 'grid', gap: 7 }}>
                      {step.fields.map(field => (
                        <div key={field.id} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                          <span style={{ minWidth: 140, color: F.ink3 }}>{field.label}</span>
                          <span style={{ color: F.ink2, flex: 1 }}>
                            {field.field_type === 'file'
                              ? (fieldFiles[field.field_key]?.map(f => f.name).join(', ') || '—')
                              : showValue(fieldValues[field.field_key])}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ReviewBlock>
                ))}

                <div>
                  <div style={fieldLabel}>Adjuntos adicionales (opcional)</div>
                  <label className="fw-card" style={{
                    display: 'block', border: `1.5px dashed ${F.line}`, borderRadius: 14,
                    padding: 22, textAlign: 'center', cursor: 'pointer', background: F.sunken,
                  }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: F.brand }}>Elegir archivos</span>
                    <input type="file" multiple style={{ display: 'none' }} onChange={event => {
                      setFiles(prev => [...prev, ...Array.from(event.target.files ?? [])]);
                      event.target.value = '';
                    }} />
                  </label>
                  {files.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="fw-pop" style={{
                      display: 'flex', alignItems: 'center', gap: 10, marginTop: 7,
                      padding: '10px 13px', background: F.surface, border: `1px solid ${F.line}`, borderRadius: 10,
                    }}>
                      <span style={{ fontSize: 13, color: F.ink, flex: 1 }}>{file.name}</span>
                      <button onClick={() => setFiles(prev => prev.filter((_, i) => i !== index))}
                        style={{ border: 0, background: 'none', color: F.danger, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={back} disabled={saving} style={ghostBtn}>Atrás</button>
            <div style={{ flex: 1 }} />
            <button onClick={() => persist('draft')} disabled={saving || !title.trim()} style={ghostBtn}>
              Guardar y seguir después
            </button>
            {phase === 'form' ? (
              <button onClick={next} disabled={saving} style={primaryBtn}>
                Continuar <span style={{ opacity: 0.6, fontWeight: 600, marginLeft: 4 }}>↵</span>
              </button>
            ) : (
              <button onClick={() => persist('submit')} disabled={saving} style={primaryBtn}>
                {saving ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            )}
          </div>
        </>
      )}

      {phase === 'done' && selected && (
        <Success
          process={selected}
          title={title}
          onOpen={() => navigate('/solicitudes/' + createdId)}
          onAnother={() => {
            setRequestTypeId(''); setTitle(''); setDescription('');
            setFiles([]); setFieldFiles({}); setStepIndex(0);
            setCategory(null); setQuery(''); setCreatedId('');
            previousCount.current = null;
            go('intent');
          }}
        />
      )}
    </div>
  );
}

// ─── Piezas de la pantalla ────────────────────────────────────────────────────
function Greeting({ name }: { name: string }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: F.brand, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        Nueva solicitud
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 850, color: F.ink, letterSpacing: -0.8, margin: '6px 0 8px', lineHeight: 1.15 }}>
        {greeting}{name ? `, ${name}` : ''}. ¿Qué necesitas?
      </h1>
      <p style={{ color: F.ink3, fontSize: 15, lineHeight: 1.55, margin: 0 }}>
        Te llevo al proceso correcto y solo te pregunto lo que aplica a tu caso.
      </p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11.5, fontWeight: 800, color: F.ink3,
      textTransform: 'uppercase', letterSpacing: 0.7, margin: '4px 0 11px',
    }}>{children}</div>
  );
}

function AreaCard({ name, count, index, onPick }: {
  name: string; count: number; index: number; onPick: () => void;
}) {
  const color = areaColor(name);
  return (
    <button onClick={onPick} className="fw-card fw-rise" style={{
      ...cardBase, padding: '18px 16px', animationDelay: `${index * 45}ms`,
      display: 'grid', gap: 10, justifyItems: 'start',
    }}>
      <span style={{
        width: 38, height: 38, borderRadius: 11, background: color + '18',
        display: 'grid', placeItems: 'center',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICON_PATHS.flow} />
        </svg>
      </span>
      <span>
        <span style={{ display: 'block', fontSize: 15.5, fontWeight: 800, color: F.ink }}>
          {categoryLabel(name)}
        </span>
        <span style={{ display: 'block', fontSize: 12, color: F.ink3, marginTop: 3 }}>
          {count} {count === 1 ? 'proceso' : 'procesos'}
        </span>
      </span>
    </button>
  );
}

function ProcessCard({ type, index, onPick }: { type: RequestType; index: number; onPick: () => void }) {
  const color = type.color || areaColor(type.category || '');
  const minutes = estimateMinutes(type.required_fields ?? 3);
  const chips = [
    `~${minutes} min`,
    type.document_fields ? `${type.document_fields} documento(s)` : null,
    type.approval_levels ? `${type.approval_levels} aprobación(es)` : null,
    type.default_sla_days ? `entrega ~${type.default_sla_days} días` : null,
  ].filter(Boolean) as string[];

  return (
    <button onClick={onPick} className="fw-card fw-rise" style={{
      ...cardBase, padding: '17px 18px', animationDelay: `${index * 45}ms`,
      display: 'flex', gap: 14, alignItems: 'flex-start', width: '100%',
    }}>
      <span style={{
        width: 40, height: 40, borderRadius: 12, background: color + '18',
        display: 'grid', placeItems: 'center', flexShrink: 0,
      }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
          stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICON_PATHS[type.icon || 'flow'] ?? ICON_PATHS.flow} />
        </svg>
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: F.ink, letterSpacing: -0.2 }}>
          {type.name}
        </span>
        {type.description && (
          <span style={{ display: 'block', fontSize: 13, color: F.ink3, marginTop: 4, lineHeight: 1.5 }}>
            {type.description}
          </span>
        )}
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
          {chips.map(chip => (
            <span key={chip} style={{
              fontSize: 10.5, fontWeight: 700, color: F.ink2,
              background: F.sunken, border: `1px solid ${F.line}`,
              padding: '3px 8px', borderRadius: 99,
            }}>{chip}</span>
          ))}
        </span>
      </span>
      <span style={{ color: F.ink3, fontSize: 18, alignSelf: 'center' }}>›</span>
    </button>
  );
}

function Progress({ processName, current, total, remaining, onExit }: {
  processName: string; current: number; total: number; remaining: number; onExit: () => void;
}) {
  const pct = Math.round((current / total) * 100);
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: F.brand }}>{processName}</span>
        <span style={{ fontSize: 12, color: F.ink3 }}>
          {remaining > 0 ? `${remaining} pregunta${remaining === 1 ? '' : 's'} por delante` : 'Ya casi'}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onExit} style={linkBtn}>Cambiar de proceso</button>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: total }, (_, index) => (
          <div key={index} className="fw-dot" style={{
            flex: 1, height: 5, borderRadius: 99,
            background: index < current ? F.brand : index === current ? F.accent : F.line,
            transform: index === current ? 'scaleY(1.6)' : 'none',
          }} />
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: F.ink3, marginTop: 6, textAlign: 'right' }}>{pct}%</div>
    </div>
  );
}

function StepHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 22, fontWeight: 830, color: F.ink, letterSpacing: -0.4, margin: 0, lineHeight: 1.25 }}>
        {title}
      </h2>
      {description && (
        <p style={{ fontSize: 14, color: F.ink3, margin: '7px 0 0', lineHeight: 1.55 }}>{description}</p>
      )}
    </div>
  );
}

function ReviewBlock({ label, onEdit, children }: {
  label: string; onEdit: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{ border: `1px solid ${F.line}`, borderRadius: 12, padding: 15 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
        <span style={{
          fontSize: 10.5, fontWeight: 800, color: F.ink3,
          textTransform: 'uppercase', letterSpacing: 0.6, flex: 1,
        }}>{label}</span>
        <button onClick={onEdit} style={linkBtn}>Editar</button>
      </div>
      {children}
    </div>
  );
}

function Success({ process, title, onOpen, onAnother }: {
  process: RequestType; title: string; onOpen: () => void; onAnother: () => void;
}) {
  const steps = [
    process.approval_levels
      ? `Pasa por ${process.approval_levels} nivel(es) de aprobación`
      : 'Pasa directo al equipo que la resuelve',
    'El equipo la ejecuta y adjunta lo entregado',
    'Te avisamos para que confirmes la recepción',
  ];

  return (
    <div className="fw-fwd" style={{ textAlign: 'center', paddingTop: 24 }}>
      <div style={{
        width: 76, height: 76, borderRadius: 99, margin: '0 auto 20px',
        background: F.okBg, display: 'grid', placeItems: 'center',
        animation: 'checkIn .4s cubic-bezier(.34,1.56,.64,1) both, glow 2.4s ease-in-out .4s 2',
      }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none"
          stroke={F.ok} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>

      <h1 style={{ fontSize: 27, fontWeight: 850, color: F.ink, letterSpacing: -0.6, margin: '0 0 8px' }}>
        Listo, ya está en camino
      </h1>
      <p style={{ color: F.ink3, fontSize: 15, lineHeight: 1.55, margin: '0 0 26px' }}>
        “{title}” se envió como {process.name}.
      </p>

      <div style={{ ...card, textAlign: 'left', marginBottom: 22 }}>
        <SectionLabel>Qué pasa ahora</SectionLabel>
        <div style={{ display: 'grid', gap: 13 }}>
          {steps.map((step, index) => (
            <div key={index} className="fw-rise" style={{
              display: 'flex', gap: 12, alignItems: 'flex-start', animationDelay: `${150 + index * 90}ms`,
            }}>
              <span style={{
                width: 24, height: 24, borderRadius: 99, flexShrink: 0,
                background: index === 0 ? F.brand : F.sunken,
                color: index === 0 ? '#fff' : F.ink3,
                display: 'grid', placeItems: 'center', fontSize: 11.5, fontWeight: 800,
              }}>{index + 1}</span>
              <span style={{ fontSize: 14, color: F.ink2, lineHeight: 1.5, paddingTop: 2 }}>{step}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={onAnother} style={ghostBtn}>Pedir otra cosa</button>
        <button onClick={onOpen} style={primaryBtn}>Ver mi solicitud</button>
      </div>
    </div>
  );
}

function showValue(value: FieldValue): string {
  if (value === true) return 'Sí';
  if (value === false) return 'No';
  if (Array.isArray(value)) return value.join(', ') || '—';
  return String(value ?? '').trim() || '—';
}

// ─── Estilos compartidos ──────────────────────────────────────────────────────
const cardBase: React.CSSProperties = {
  background: F.surface, border: `1px solid ${F.line}`, borderRadius: 14,
  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
  boxShadow: '0 2px 10px rgba(15,23,42,.04)',
};

const card: React.CSSProperties = {
  background: F.surface, border: `1px solid ${F.line}`, borderRadius: 16,
  padding: 26, boxShadow: '0 6px 24px rgba(15,23,42,.05)',
};

const fieldLabel: React.CSSProperties = {
  fontSize: 15, fontWeight: 750, color: F.ink, marginBottom: 9,
};

const primaryBtn: React.CSSProperties = {
  background: F.brand, color: '#fff', border: 'none', borderRadius: 12,
  padding: '13px 26px', fontSize: 14.5, fontWeight: 800, cursor: 'pointer',
  fontFamily: 'inherit', boxShadow: '0 6px 18px rgba(2,132,199,.28)',
};

const ghostBtn: React.CSSProperties = {
  background: F.surface, color: F.ink2, border: `1.5px solid ${F.line}`,
  borderRadius: 12, padding: '13px 20px', fontSize: 13.5, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
};

const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: F.brand,
  fontSize: 12.5, fontWeight: 750, cursor: 'pointer', padding: 0, fontFamily: 'inherit',
};
