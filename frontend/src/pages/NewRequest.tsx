// Pedir algo en FlowApp.
//
// Antes esta pantalla mostraba todos los procesos en un desplegable y luego el
// formulario entero de una sola vez. Quien no sabía qué proceso elegir se
// equivocaba, y quien sí sabía se encontraba con un muro de campos.
//
// Ahora avanza como una conversación: primero qué necesitas, después con qué
// proceso se resuelve, y por último las preguntas en tandas cortas. Los pasos
// del formulario salen de las secciones que el administrador ya definió en el
// wizard, así que respetan la estructura pensada para cada proceso sin pedir
// configuración nueva.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type RequestType, type FormField } from '../lib/api';
import { alertDialog } from '../components/AppDialog';

type FieldValue = string | boolean | string[];
type Phase = 'intent' | 'process' | 'form' | 'review';

/** Una comparacion suelta contra la respuesta de otra pregunta. */
interface VisibleRule { field: string; op?: string; value?: string }

/**
 * Condicion completa. Se acepta tambien el formato antiguo de una sola regla
 * suelta: las condiciones guardadas antes del soporte de Y/O siguen valiendo
 * sin necesidad de reescribirlas.
 */
interface VisibleIf { match?: 'all' | 'any'; rules?: VisibleRule[] }

/** Texto comparable de cualquier respuesta, para evaluar la condicion. */
function asText(value: FieldValue | undefined): string {
  if (Array.isArray(value)) return value.join(',');
  if (value === true) return 'true';
  if (value === false) return 'false';
  return String(value ?? '');
}

/**
 * Decide si una pregunta aplica segun lo ya respondido.
 *
 * Ante una condicion ilegible se muestra la pregunta: es preferible pedir un
 * dato de mas que ocultar en silencio algo que el proceso necesitaba.
 */
function ruleHolds(rule: VisibleRule, values: Record<string, FieldValue>): boolean {
  const actual = values[rule.field];
  const expected = rule.value ?? '';
  const text = asText(actual);

  switch (rule.op) {
    case 'neq':          return text !== expected;
    case 'contains':     return text.toLocaleLowerCase('es').includes(expected.toLocaleLowerCase('es'));
    case 'is_empty':     return !text.trim();
    case 'is_not_empty': return Boolean(text.trim());
    default:
      // En seleccion multiple basta con que la opcion este marcada.
      return Array.isArray(actual) ? actual.includes(expected) : text === expected;
  }
}

function fieldApplies(field: FormField, values: Record<string, FieldValue>): boolean {
  if (!field.visible_if_json) return true;

  let parsed: (VisibleIf & VisibleRule) | null = null;
  try { parsed = JSON.parse(field.visible_if_json) as VisibleIf & VisibleRule; } catch { return true; }
  if (!parsed) return true;

  // Formato antiguo: una regla suelta sin envoltorio.
  const rules: VisibleRule[] = Array.isArray(parsed.rules)
    ? parsed.rules.filter(rule => rule?.field)
    : parsed.field ? [{ field: parsed.field, op: parsed.op, value: parsed.value }] : [];

  if (rules.length === 0) return true;
  return parsed.match === 'any'
    ? rules.some(rule => ruleHolds(rule, values))
    : rules.every(rule => ruleHolds(rule, values));
}

// Animaciones del recorrido. Se respeta prefers-reduced-motion: quien pidio
// menos movimiento en su sistema ve los mismos pasos, sin desplazamientos.
const MOTION_CSS = `
@keyframes flowStepIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes flowFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes flowPopIn  { from { opacity: 0; transform: scale(.97); } to { opacity: 1; transform: none; } }
.flow-step { animation: flowStepIn .32s cubic-bezier(.22,.8,.3,1) both; }
.flow-item { animation: flowPopIn .28s cubic-bezier(.22,.8,.3,1) both; }
.flow-fade { animation: flowFadeIn .3s ease both; }
.flow-card { transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease; }
.flow-card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(15,23,42,.10); border-color: #9CC9F0; }
.flow-bar { transition: width .45s cubic-bezier(.22,.8,.3,1); }
@media (prefers-reduced-motion: reduce) {
  .flow-step, .flow-item, .flow-fade { animation: none !important; }
  .flow-card:hover { transform: none; }
  .flow-bar { transition: none; }
}
`;

interface FormStep {
  title: string;
  description?: string;
  fields: FormField[];
}

const SIN_CATEGORIA = 'Otros';

/** Título legible de una categoría; el wizard las guarda en minúscula. */
const categoryLabel = (value: string) =>
  value === SIN_CATEGORIA ? value : value.charAt(0).toUpperCase() + value.slice(1);

function sectionDescription(field: FormField): string {
  try {
    const config = field.options_json ? JSON.parse(field.options_json) as { description?: string } : null;
    return config?.description || field.placeholder || '';
  } catch { return field.placeholder || ''; }
}

/**
 * Convierte la lista plana de campos en pasos.
 *
 * Cada `section` abre un paso. Si el proceso no usa secciones y tiene muchos
 * campos, se parte en tandas para no reproducir el muro que queremos evitar.
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
      current = { title: 'Detalles de la solicitud', fields: [] };
      steps.push(current);
    }
    current.fields.push(field);
  }

  const withFields = steps.filter(step => step.fields.length > 0);
  if (withFields.length === 1 && withFields[0].fields.length > 5) {
    const all = withFields[0].fields;
    const chunks: FormStep[] = [];
    for (let index = 0; index < all.length; index += 4) {
      chunks.push({
        title: withFields[0].title,
        description: chunks.length === 0 ? withFields[0].description : undefined,
        fields: all.slice(index, index + 4),
      });
    }
    return chunks;
  }
  return withFields;
}

/** Devuelve el primer error de un conjunto de campos, o null si están bien. */
function validateFields(
  fields: FormField[], values: Record<string, FieldValue>, files: Record<string, File[]>,
): string | null {
  for (const field of fields) {
    if (!field.required || field.field_type === 'section') continue;
    const value = values[field.field_key];
    if (field.field_type === 'file' && !files[field.field_key]?.length) {
      return `Adjunta al menos un archivo en "${field.label}".`;
    }
    if (field.field_type === 'checkbox' && value !== true) {
      return `El campo "${field.label}" es obligatorio.`;
    }
    if (field.field_type === 'checkbox_group' && (!Array.isArray(value) || value.length === 0)) {
      return `Selecciona al menos una opción en "${field.label}".`;
    }
    if (!['checkbox', 'checkbox_group', 'file'].includes(field.field_type) && !String(value ?? '').trim()) {
      return `El campo "${field.label}" es obligatorio.`;
    }
  }
  return null;
}

export default function NewRequest() {
  const navigate = useNavigate();

  const [types, setTypes] = useState<RequestType[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('intent');
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

  useEffect(() => {
    api.getRequestTypes()
      .then(r => setTypes(r.data.filter(type => type.is_active)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!requestTypeId) { setFormFields([]); setFieldValues({}); return; }
    setLoadingFields(true);
    api.getFormFields(requestTypeId)
      .then(r => {
        setFormFields(r.data);
        const defaults: Record<string, FieldValue> = {};
        r.data.forEach(field => {
          defaults[field.field_key] = field.field_type === 'checkbox' ? false
            : field.field_type === 'checkbox_group' ? [] : '';
        });
        setFieldValues(defaults);
        setFieldFiles({});
      })
      .catch(() => setFormFields([]))
      .finally(() => setLoadingFields(false));
  }, [requestTypeId]);

  const selected = types.find(type => type.id === requestTypeId) ?? null;

  // El recorrido se recalcula con cada respuesta: las preguntas que dejan de
  // aplicar desaparecen y, si un paso se queda sin preguntas, deja de existir.
  // Por eso el formulario se acorta solo segun el caso de cada persona.
  const visibleFields = useMemo(
    () => formFields.filter(field => fieldApplies(field, fieldValues)),
    [formFields, fieldValues]);
  const steps = useMemo(() => buildSteps(visibleFields), [visibleFields]);

  // El paso 0 siempre es el resumen en palabras del solicitante; después vienen
  // los pasos del formulario del proceso.
  const totalSteps = steps.length + 1;

  // Si una respuesta elimina pasos, el indice puede quedar fuera de rango.
  useEffect(() => {
    if (stepIndex > steps.length) setStepIndex(steps.length);
  }, [steps.length, stepIndex]);

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

  function chooseProcess(type: RequestType) {
    setRequestTypeId(type.id);
    setStepIndex(0);
    setError('');
    setPhase('form');
  }

  function next() {
    setError('');
    if (stepIndex === 0) {
      if (!title.trim()) { setError('Escribe en una línea qué necesitas.'); return; }
      if (!description.trim()) { setError('Cuenta un poco más para que el equipo entienda el pedido.'); return; }
    } else {
      const invalid = validateFields(steps[stepIndex - 1].fields, fieldValues, fieldFiles);
      if (invalid) { setError(invalid); return; }
    }
    if (stepIndex + 1 >= totalSteps) setPhase('review');
    else setStepIndex(stepIndex + 1);
  }

  function back() {
    setError('');
    if (phase === 'review') { setStepIndex(totalSteps - 1); setPhase('form'); return; }
    if (stepIndex === 0) { setPhase('process'); return; }
    setStepIndex(stepIndex - 1);
  }

  /** Crea la solicitud. En borrador no se envía a aprobación: queda guardada. */
  async function persist(mode: 'draft' | 'submit') {
    setSaving(true);
    setError('');
    try {
      const applicable = formFields.filter(field => fieldApplies(field, fieldValues));
      const invalid = validateFields(applicable, fieldValues, fieldFiles);
      if (mode === 'submit' && invalid) throw new Error(invalid);

      // Solo se guardan las respuestas de las preguntas que aplicaban. Enviar
      // lo contestado en una rama descartada dejaria datos que contradicen el
      // camino que la solicitud siguio de verdad.
      const applicableKeys = new Set(applicable.map(field => field.field_key));
      const campaign_data = applicable.length > 0
        ? {
            fields: Object.fromEntries(
              Object.entries(fieldValues).filter(([key]) => applicableKeys.has(key))),
            file_fields: Object.fromEntries(
              Object.entries(fieldFiles)
                .filter(([key]) => applicableKeys.has(key))
                .map(([key, value]) => [key, value.map(file => file.name)])),
          }
        : undefined;

      const created = await api.createRequest({
        request_type_id: requestTypeId,
        title: title.trim(),
        description: description.trim(),
        campaign_data,
      });

      const applicableFiles = Object.entries(fieldFiles)
        .filter(([key]) => applicableKeys.has(key))
        .flatMap(([, value]) => value);
      for (const file of [...files, ...applicableFiles]) {
        await api.uploadFile(created.data.id, file);
      }

      if (mode === 'submit') {
        await api.submitRequest(created.data.id);
      } else {
        await alertDialog({
          title: 'Guardada como borrador',
          message: 'Puedes retomarla desde Mis solicitudes cuando quieras. Nadie la revisará hasta que la envíes.',
          tone: 'success',
        });
      }
      navigate('/solicitudes/' + created.data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la solicitud.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 48, color: '#667085' }}>Preparando el catálogo…</div>;

  // Sin procesos activos no hay nada que pedir. Antes esto se veía como una
  // pantalla vacía sin explicación; conviene decir qué pasa y a quién acudir.
  if (types.length === 0) {
    return (
      <div style={{ padding: '48px 20px', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 850, color: '#101828', marginBottom: 10 }}>
          No hay procesos disponibles
        </h1>
        <p style={{ color: '#667085', fontSize: 14.5, lineHeight: 1.6 }}>
          Ahora mismo no hay ningún proceso activo para crear solicitudes. Todos
          están archivados. Un administrador puede reactivarlos desde
          Administrar → Procesos.
        </p>
        <button onClick={() => navigate('/solicitudes')} style={{ ...cancelButton, marginTop: 20 }}>
          Ver mis solicitudes
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 20px 64px', maxWidth: 760, margin: '0 auto' }}>
      <style>{MOTION_CSS}</style>

      {phase === 'intent' && (
        <IntentStep
          categories={categories}
          matches={matches}
          query={query}
          onQuery={setQuery}
          onPickCategory={value => { setCategory(value); setPhase('process'); }}
          onPickProcess={chooseProcess}
        />
      )}

      {phase === 'process' && (
        <ProcessStep
          category={category}
          types={types.filter(type => ((type.category || '').trim() || SIN_CATEGORIA) === category)}
          onBack={() => { setPhase('intent'); setCategory(null); }}
          onPick={chooseProcess}
        />
      )}

      {(phase === 'form' || phase === 'review') && selected && (
        <>
          <Header
            processName={selected.name}
            current={phase === 'review' ? totalSteps : stepIndex}
            total={totalSteps}
            onExit={() => { setPhase('process'); setRequestTypeId(''); }}
          />

          {error && <Alert>{error}</Alert>}

          {phase === 'form' && (
            loadingFields ? (
              <div className="flow-fade" style={{ padding: 40, color: '#667085' }}>Cargando el formulario…</div>
            ) : stepIndex === 0 ? (
              <StepCard
                title="¿Qué necesitas?"
                description="Resúmelo en una línea. Es lo que verá quien lo apruebe."
              >
                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>En una línea</label>
                    <input
                      autoFocus value={title} onChange={e => setTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') next(); }}
                      placeholder="Ej. Arte para la campaña de vacunación"
                      style={input}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Cuéntanos un poco más</label>
                    <textarea
                      value={description} onChange={e => setDescription(e.target.value)}
                      placeholder="Para qué es, cuándo lo necesitas y cualquier detalle que ayude a resolverlo bien."
                      rows={5} style={{ ...input, resize: 'vertical' }}
                    />
                  </div>
                </div>
              </StepCard>
            ) : (
              <StepCard
                title={steps[stepIndex - 1].title}
                description={steps[stepIndex - 1].description}
              >
                <div style={{ display: 'grid', gap: 22 }}>
                  {steps[stepIndex - 1].fields.map((field, index) => (
                    <div key={field.id} className="flow-item" style={{ animationDelay: `${index * 55}ms` }}>
                    {field.field_type === 'file' ? (
                      <FileField
                        field={field}
                        files={fieldFiles[field.field_key] ?? []}
                        onChange={next => setFieldFiles(prev => ({ ...prev, [field.field_key]: next }))}
                      />
                    ) : (
                      <DynamicField
                        field={field}
                        value={fieldValues[field.field_key]}
                        onChange={value => setFieldValues(prev => ({ ...prev, [field.field_key]: value }))}
                      />
                    )}
                    </div>
                  ))}
                </div>
              </StepCard>
            )
          )}

          {phase === 'review' && (
            <ReviewStep
              process={selected}
              title={title}
              description={description}
              steps={steps}
              values={fieldValues}
              fieldFiles={fieldFiles}
              files={files}
              onAddFiles={list => setFiles(prev => [...prev, ...list])}
              onRemoveFile={index => setFiles(prev => prev.filter((_, i) => i !== index))}
              onEditStep={index => { setStepIndex(index); setPhase('form'); }}
            />
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
            <button onClick={back} disabled={saving} style={cancelButton}>Atrás</button>
            <div style={{ flex: 1 }} />
            <button onClick={() => persist('draft')} disabled={saving || !title.trim()} style={cancelButton}>
              Guardar y seguir después
            </button>
            {phase === 'form' ? (
              <button onClick={next} disabled={saving} style={submitButton}>Continuar</button>
            ) : (
              <button onClick={() => persist('submit')} disabled={saving} style={submitButton}>
                {saving ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Paso 1: qué necesitas ────────────────────────────────────────────────────
function IntentStep({ categories, matches, query, onQuery, onPickCategory, onPickProcess }: {
  categories: [string, RequestType[]][];
  matches: RequestType[];
  query: string;
  onQuery: (value: string) => void;
  onPickCategory: (value: string) => void;
  onPickProcess: (type: RequestType) => void;
}) {
  return (
    <div>
      <h1 style={{ fontSize: 27, fontWeight: 850, color: '#101828', letterSpacing: -.6, margin: '0 0 8px' }}>
        ¿Qué necesitas hacer?
      </h1>
      <p style={{ color: '#667085', fontSize: 15, lineHeight: 1.55, margin: '0 0 24px' }}>
        Elige el área que resuelve tu pedido y te llevo al proceso correcto.
        Si no sabes cuál es, descríbelo en tus palabras.
      </p>

      <input
        value={query} onChange={e => onQuery(e.target.value)}
        placeholder="Describe lo que necesitas… por ejemplo: arte, reporte, convenio"
        style={{ ...input, marginBottom: 20 }}
      />

      {matches.length > 0 ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#667085' }}>
            {matches.length} proceso(s) coinciden
          </div>
          {matches.map(type => (
            <ProcessCard key={type.id} type={type} onPick={() => onPickProcess(type)} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
          {categories.map(([name, list], index) => (
            <button key={name} onClick={() => onPickCategory(name)} className="flow-card flow-item"
              style={{ ...cardButton, animationDelay: `${index * 45}ms` }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#101828' }}>{categoryLabel(name)}</div>
              <div style={{ fontSize: 12.5, color: '#667085', marginTop: 4 }}>
                {list.length} {list.length === 1 ? 'proceso disponible' : 'procesos disponibles'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Paso 2: con qué proceso ──────────────────────────────────────────────────
function ProcessStep({ category, types, onBack, onPick }: {
  category: string | null;
  types: RequestType[];
  onBack: () => void;
  onPick: (type: RequestType) => void;
}) {
  return (
    <div>
      <button onClick={onBack} style={{ ...linkButton, marginBottom: 14 }}>← Cambiar de área</button>
      <h1 style={{ fontSize: 24, fontWeight: 850, color: '#101828', margin: '0 0 6px' }}>
        {categoryLabel(category ?? '')}
      </h1>
      <p style={{ color: '#667085', fontSize: 14.5, margin: '0 0 22px' }}>
        Elige el proceso que mejor describe lo que necesitas. Cada uno indica qué te va a pedir.
      </p>
      <div style={{ display: 'grid', gap: 11 }}>
        {types.length === 0 ? (
          <div style={{ color: '#667085', fontSize: 14 }}>No hay procesos disponibles en esta área.</div>
        ) : types.map(type => (
          <ProcessCard key={type.id} type={type} onPick={() => onPick(type)} />
        ))}
      </div>
    </div>
  );
}

/** Tarjeta de proceso: dice de antemano qué van a pedirte y cuánto tarda. */
function ProcessCard({ type, onPick }: { type: RequestType; onPick: () => void }) {
  const requirements = [
    type.required_fields ? `${type.required_fields} dato(s) obligatorio(s)` : null,
    type.document_fields ? `${type.document_fields} documento(s)` : null,
    type.approval_levels ? `${type.approval_levels} nivel(es) de aprobación` : null,
  ].filter(Boolean) as string[];

  return (
    <button onClick={onPick} className="flow-card flow-item" style={{ ...cardButton, textAlign: 'left', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ width: 9, height: 9, borderRadius: 99, background: type.color || '#0284C7' }} />
        <span style={{ fontSize: 15, fontWeight: 800, color: '#101828' }}>{type.name}</span>
        {type.default_sla_days ? (
          <span style={{ fontSize: 10.5, fontWeight: 800, color: '#185FA5', background: '#E6F1FB', padding: '2px 7px', borderRadius: 6 }}>
            ~{type.default_sla_days} días
          </span>
        ) : null}
      </div>
      {type.description && (
        <div style={{ fontSize: 13, color: '#667085', marginTop: 5, lineHeight: 1.5 }}>{type.description}</div>
      )}
      {requirements.length > 0 && (
        <div style={{ fontSize: 11.5, color: '#98A2B3', marginTop: 7 }}>
          Te pedirá: {requirements.join(' · ')}
        </div>
      )}
    </button>
  );
}

// ─── Paso final: revisar y enviar ─────────────────────────────────────────────
function ReviewStep({ process, title, description, steps, values, fieldFiles, files, onAddFiles, onRemoveFile, onEditStep }: {
  process: RequestType;
  title: string;
  description: string;
  steps: FormStep[];
  values: Record<string, FieldValue>;
  fieldFiles: Record<string, File[]>;
  files: File[];
  onAddFiles: (list: File[]) => void;
  onRemoveFile: (index: number) => void;
  onEditStep: (index: number) => void;
}) {
  const show = (value: FieldValue) =>
    value === true ? 'Sí' : value === false ? 'No'
    : Array.isArray(value) ? (value.join(', ') || '—')
    : String(value ?? '').trim() || '—';

  return (
    <StepCard title="Revisa antes de enviar" description={`Se enviará como "${process.name}".`}>
      <div style={{ display: 'grid', gap: 16 }}>
        <ReviewBlock label="Tu pedido" onEdit={() => onEditStep(0)}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#101828' }}>{title}</div>
          <div style={{ fontSize: 13, color: '#667085', marginTop: 4, whiteSpace: 'pre-line' }}>{description}</div>
        </ReviewBlock>

        {steps.map((step, index) => (
          <ReviewBlock key={index} label={step.title} onEdit={() => onEditStep(index + 1)}>
            <div style={{ display: 'grid', gap: 5 }}>
              {step.fields.map(field => (
                <div key={field.id} style={{ display: 'flex', gap: 10, fontSize: 12.5 }}>
                  <span style={{ minWidth: 130, color: '#98A2B3' }}>{field.label}</span>
                  <span style={{ color: '#344054', flex: 1 }}>
                    {field.field_type === 'file'
                      ? (fieldFiles[field.field_key]?.map(f => f.name).join(', ') || '—')
                      : show(values[field.field_key])}
                  </span>
                </div>
              ))}
            </div>
          </ReviewBlock>
        ))}

        <div>
          <label style={labelStyle}>Adjuntos adicionales (opcional)</label>
          <label style={dropZone}>
            <strong>Seleccionar archivos</strong>
            <div style={{ color: '#667085', marginTop: 5, fontSize: 12 }}>Máximo 20 MB cada uno.</div>
            <input type="file" multiple style={{ display: 'none' }} onChange={event => {
              onAddFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }} />
          </label>
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', fontSize: 12, borderBottom: '1px solid #EAECF0' }}>
              <span>{file.name}</span>
              <button type="button" onClick={() => onRemoveFile(index)} style={{ border: 0, background: 'transparent', color: '#B42318', cursor: 'pointer' }}>Quitar</button>
            </div>
          ))}
        </div>
      </div>
    </StepCard>
  );
}

function ReviewBlock({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid #EAECF0', borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#98A2B3', textTransform: 'uppercase', letterSpacing: .5, flex: 1 }}>{label}</span>
        <button onClick={onEdit} style={linkButton}>Editar</button>
      </div>
      {children}
    </div>
  );
}

// ─── Piezas de la conversación ────────────────────────────────────────────────
function Header({ processName, current, total, onExit }: {
  processName: string; current: number; total: number; onExit: () => void;
}) {
  const progress = Math.round((current / total) * 100);
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0284C7' }}>{processName}</span>
        <span style={{ fontSize: 11.5, color: '#98A2B3' }}>Paso {Math.min(current + 1, total)} de {total}</span>
        <div style={{ flex: 1 }} />
        <button onClick={onExit} style={linkButton}>Cambiar de proceso</button>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: '#EAECF0', overflow: 'hidden' }}>
        <div className="flow-bar" style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,#0284C7,#14B8A6)' }} />
      </div>
    </div>
  );
}

function StepCard({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <section className="flow-step" style={{ ...panel, padding: 26 }}>
      <h2 style={{ fontSize: 20, fontWeight: 820, color: '#101828', margin: '0 0 4px' }}>{title}</h2>
      {description && <p style={{ fontSize: 13.5, color: '#667085', margin: '0 0 20px', lineHeight: 1.5 }}>{description}</p>}
      {!description && <div style={{ height: 16 }} />}
      {children}
    </section>
  );
}

function DynamicField({ field: f, value, onChange }: {
  field: FormField;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  const label = (
    <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#101828', marginBottom: 6 }}>
      {f.label}
      {f.required === 1 && <span style={{ color: '#993C1D', marginLeft: 4 }}>*</span>}
    </label>
  );

  if (f.field_type === 'checkbox') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            id={f.field_key}
            checked={value === true}
            onChange={e => onChange(e.target.checked)}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
          <label htmlFor={f.field_key} style={{ fontSize: 14, color: '#101828', fontWeight: 600, cursor: 'pointer' }}>
            {f.label}
            {f.required === 1 && <span style={{ color: '#993C1D', marginLeft: 4 }}>*</span>}
          </label>
        </div>
        {f.placeholder && <p style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>{f.placeholder}</p>}
      </div>
    );
  }

  if (f.field_type === 'textarea') {
    return (
      <div>
        {label}
        <textarea
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          placeholder={f.placeholder ?? ''}
          rows={4}
          style={{ ...input, resize: 'vertical', minHeight: 90 }}
        />
      </div>
    );
  }

  if (f.field_type === 'select') {
    const options: string[] = (() => {
      try { return f.options_json ? JSON.parse(f.options_json) as string[] : []; }
      catch { return []; }
    })();
    return (
      <div>
        {label}
        <select value={String(value ?? '')} onChange={e => onChange(e.target.value)} style={input}>
          <option value="">{f.placeholder || 'Selecciona una opcion...'}</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  if (f.field_type === 'radio' || f.field_type === 'checkbox_group') {
    const options: string[] = (() => {
      try { return f.options_json ? JSON.parse(f.options_json) as string[] : []; }
      catch { return []; }
    })();
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 14, fontWeight: 700, color: '#101828', marginBottom: 8 }}>
          {f.label}{f.required === 1 && <span style={{ color: '#993C1D', marginLeft: 4 }}>*</span>}
        </legend>
        <div style={{ display: 'grid', gap: 8 }}>
          {options.map(option => {
            const checked = f.field_type === 'radio' ? value === option : selected.includes(option);
            return <label key={option} style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 14, color: '#344054', cursor: 'pointer' }}>
              <input type={f.field_type === 'radio' ? 'radio' : 'checkbox'} name={f.field_key} checked={checked}
                onChange={event => {
                  if (f.field_type === 'radio') onChange(option);
                  else onChange(event.target.checked ? [...selected, option] : selected.filter(item => item !== option));
                }} />
              {option}
            </label>;
          })}
        </div>
      </fieldset>
    );
  }

  return (
    <div>
      {label}
      <input
        type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : f.field_type === 'email' ? 'email' : 'text'}
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        placeholder={f.placeholder ?? ''}
        style={input}
      />
    </div>
  );
}

function FileField({ field, files, onChange }: { field: FormField; files: File[]; onChange: (files: File[]) => void }) {
  let config: { accept?: string; maxFiles?: number } = {};
  try { config = field.options_json ? JSON.parse(field.options_json) as typeof config : {}; } catch { config = {}; }
  const maxFiles = Math.max(1, config.maxFiles || 5);
  return <div>
    <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#101828', marginBottom: 6 }}>
      {field.label}{field.required === 1 && <span style={{ color: '#993C1D', marginLeft: 4 }}>*</span>}
    </label>
    <label style={{ ...dropZone, display: 'block', padding: 20 }}>
      <strong>Seleccionar archivos</strong>
      <div style={{ color: '#667085', marginTop: 5, fontSize: 12 }}>Hasta {maxFiles} archivos, máximo 20 MB cada uno.</div>
      <input type="file" multiple accept={config.accept} style={{ display: 'none' }} onChange={event => {
        const next = [...files, ...Array.from(event.target.files ?? [])].slice(0, maxFiles);
        onChange(next);
        event.target.value = '';
      }} />
    </label>
    {files.map((file, index) => <div key={`${file.name}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', fontSize: 12, borderBottom: '1px solid #EAECF0' }}>
      <span>{file.name}</span>
      <button type="button" onClick={() => onChange(files.filter((_, itemIndex) => itemIndex !== index))} style={{ border: 0, background: 'transparent', color: '#B42318', cursor: 'pointer' }}>Quitar</button>
    </div>)}
  </div>;
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#FFF2EC', border: '1px solid #F0997B', color: '#993C1D', borderRadius: 10, padding: 14, fontWeight: 700, marginBottom: 18, fontSize: 14 }}>
      {children}
    </div>
  );
}

const panel: React.CSSProperties = { background: '#fff', border: '1px solid #DDE3EA', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,.04)' };
const input: React.CSSProperties = { width: '100%', border: '1px solid #CBD5E1', borderRadius: 8, padding: '11px 14px', fontSize: 14, font: 'inherit', background: '#fff', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 700, color: '#101828', marginBottom: 6 };
const dropZone: React.CSSProperties = { border: '1.5px dashed #CBD5E1', borderRadius: 10, padding: 28, textAlign: 'center', display: 'block', cursor: 'pointer', background: '#FAFAF8' };
const cancelButton: React.CSSProperties = { background: '#fff', color: '#0284C7', border: '1.5px solid #B5D4F4', borderRadius: 8, padding: '11px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 13.5 };
const submitButton: React.CSSProperties = { background: '#0284C7', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 28px', fontWeight: 900, cursor: 'pointer', fontSize: 14 };
const linkButton: React.CSSProperties = { background: 'none', border: 'none', color: '#0284C7', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit' };
const cardButton: React.CSSProperties = { background: '#fff', border: '1px solid #DDE3EA', borderRadius: 11, padding: '15px 17px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(0,0,0,.03)' };
