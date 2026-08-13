/**
 * ProcessWizard — Configurador completo de proceso de inicio a fin.
 * 5 pasos: Identidad → Formulario → Aprobación → Correo → Resumen
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, EntraUser, Space, WizardField, FormFieldType, FormField, FormFieldInput } from '../lib/api';
import { Spinner } from '../components/ui';
import { alertDialog } from '../components/AppDialog';
import { useIsMobile } from '../lib/useIsMobile';

// ─── Paleta de colores del proceso ───────────────────────────────────────────
const COLORS = [
  '#0284C7', '#2563EB', '#0891B2', '#059669',
  '#D97706', '#DC2626', '#DB2777', '#0284C7',
  '#4F46E5', '#0284C7', '#0F766E', '#15803D',
];

// ─── Iconos de proceso ────────────────────────────────────────────────────────
const PROCESS_ICONS: { key: string; label: string; svg: string }[] = [
  { key: 'flow',    label: 'Flujo',      svg: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { key: 'doc',     label: 'Documento',  svg: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
  { key: 'brush',   label: 'Diseño',     svg: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L3 14.67V21h6.33l10.06-10.06a5.5 5.5 0 0 0 0-7.78v-.55z' },
  { key: 'chart',   label: 'BI',         svg: 'M18 20V10M12 20V4M6 20v-6' },
  { key: 'users',   label: 'RRHH',       svg: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { key: 'shop',    label: 'Compras',    svg: 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0' },
];

// ─── Tipos de campo disponibles ───────────────────────────────────────────────
const FIELD_TYPES: { type: FormFieldType; label: string; desc: string; color: string }[] = [
  { type: 'text',          label: 'Texto corto',      desc: 'Una línea de texto',          color: '#6B7280' },
  { type: 'email',         label: 'Correo',           desc: 'Dirección de email',          color: '#2563EB' },
  { type: 'textarea',      label: 'Texto largo',      desc: 'Párrafo multilínea',          color: '#0284C7' },
  { type: 'radio',         label: 'Opción única',     desc: 'Selecciona una opción',       color: '#0891B2' },
  { type: 'checkbox_group',label: 'Múltiple',         desc: 'Varias opciones',             color: '#059669' },
  { type: 'select',        label: 'Desplegable',      desc: 'Lista select',                color: '#D97706' },
  { type: 'number',        label: 'Número',           desc: 'Valor numérico',              color: '#DC2626' },
  { type: 'date',          label: 'Fecha',            desc: 'Selector de fecha',           color: '#DB2777' },
  { type: 'file',          label: 'Archivo',          desc: 'Adjuntar documentos',         color: '#0284C7' },
  { type: 'section',       label: 'Sección',          desc: 'Título o separador',          color: '#374151' },
];

// ─── Variables de correo ──────────────────────────────────────────────────────
const EMAIL_VARS = [
  { key: '{{solicitante}}',    label: 'Nombre solicitante' },
  { key: '{{correo}}',         label: 'Correo solicitante' },
  { key: '{{titulo}}',         label: 'Título solicitud' },
  { key: '{{proceso}}',        label: 'Nombre del proceso' },
  { key: '{{fecha}}',          label: 'Fecha de aprobación' },
  { key: '{{nivel_actual}}',   label: 'Nivel actual' },
  { key: '{{aprobadores}}',    label: 'Lista aprobadores' },
  { key: '{{url_solicitud}}',  label: 'Enlace a solicitud' },
];

const DEFAULT_SUBJECT = 'Tu solicitud "{{titulo}}" ha sido aprobada';
const DEFAULT_BODY = `Hola {{solicitante}},

Tu solicitud de {{proceso}} ha sido aprobada exitosamente.

Detalles:
• Título: {{titulo}}
• Fecha: {{fecha}}
• Aprobado por: {{aprobadores}}

Puedes consultar el estado en el siguiente enlace:
{{url_solicitud}}

Saludos,
Equipo FlowApp`;

// ─── Utils ────────────────────────────────────────────────────────────────────
let _id = 0;
const uid = () => `f${++_id}_${Math.random().toString(36).slice(2, 6)}`;

function makeField(type: FormFieldType): WizardField {
  const base: WizardField = { id: uid(), type, label: '', required: false };
  if (['radio', 'checkbox_group', 'select'].includes(type)) {
    base.options = ['Opción 1', 'Opción 2', 'Opción 3'];
  }
  if (type === 'section') base.label = 'Nueva sección';
  return base;
}

// ─── Conversión entre el formulario legacy (request_type_fields) y el wizard ──
function legacyToWizard(f: FormField): WizardField {
  let options: string[] | undefined;
  let fileConfig: { accept?: string; maxFiles?: number; description?: string } = {};
  try {
    const parsed = f.options_json ? JSON.parse(f.options_json) as unknown : undefined;
    if (Array.isArray(parsed)) options = parsed.map(String);
    else if (parsed && typeof parsed === 'object') fileConfig = parsed as typeof fileConfig;
  } catch { options = undefined; }
  return {
    id: f.field_key,
    type: (f.field_type as FormFieldType) || 'text',
    label: f.label,
    placeholder: f.placeholder ?? undefined,
    required: f.required === 1,
    options,
    accept: fileConfig.accept,
    maxFiles: fileConfig.maxFiles,
    description: fileConfig.description,
  };
}

const slugify = (s: string) => s.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

function wizardToLegacy(fields: WizardField[]): FormFieldInput[] {
  const used = new Set<string>();
  const out: FormFieldInput[] = [];
  for (const f of fields) {
    // Conservar la key original si viene del formulario existente; si es id generado, derivar de la etiqueta
    const isGenerated = /^f\d+_/.test(f.id);
    let key = isGenerated ? (slugify(f.label) || f.id) : f.id;
    let k = key; let i = 2;
    while (used.has(k)) k = `${key}_${i++}`;
    used.add(k);
    out.push({
      field_key: k,
      label: f.label || 'Campo',
      field_type: f.type,
      placeholder: f.placeholder || undefined,
      required: f.required ? 1 : 0,
      options_json: f.options?.length
        ? JSON.stringify(f.options)
        : (f.type === 'file' || f.type === 'section')
          ? JSON.stringify({ accept: f.accept, maxFiles: f.maxFiles, description: f.description })
          : undefined,
      sort_order: out.length,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN WIZARD
// ─────────────────────────────────────────────────────────────────────────────
interface ApprovalLevel {
  _key: string;
  level: number; label: string;
  approver_type: 'fixed_user' | 'job_title';
  approver_value: string; approver_name: string; approver_email: string;
}

interface ExecutionRequirement {
  id: string;
  label: string;
  required: boolean;
}

export default function ProcessWizard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const compact = useIsMobile(1120);
  const mobileLayout = useIsMobile(768);

  const [step, setStep]     = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone]     = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [loadError, setLoadError] = useState('');

  // Step 1 — Identidad
  const [name, setName]         = useState('');
  const [desc, setDesc]         = useState('');
  const [color, setColor]       = useState(COLORS[0]);
  const [icon, setIcon]         = useState('flow');
  const [category, setCategory] = useState('');
  const [slaDays, setSlaDays] = useState(5);

  // Step 2 — Formulario
  const [formTitle, setFormTitle]   = useState('');
  const [formSubtitle, setFormSubtitle] = useState('');
  const [fields, setFields]         = useState<WizardField[]>([]);
  const [selectedField, setSelectedField] = useState<string | null>(null);

  // Step 3 — Aprobación
  const [levels, setLevels] = useState<ApprovalLevel[]>([{
    _key: crypto.randomUUID(),
    level: 1, label: '', approver_type: 'fixed_user',
    approver_value: '', approver_name: '', approver_email: '',
  }]);

  // Step 4 — Ejecución
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [assignmentMode, setAssignmentMode] = useState<'auto_load' | 'manual' | 'fixed_user'>('auto_load');
  const [fixedAssignee, setFixedAssignee] = useState<EntraUser | null>(null);
  const [executionSlaDays, setExecutionSlaDays] = useState(5);
  const [checklist, setChecklist] = useState<ExecutionRequirement[]>([]);
  const [deliverables, setDeliverables] = useState<ExecutionRequirement[]>([]);
  const [requireRequesterConfirmation, setRequireRequesterConfirmation] = useState(true);

  // Step 4 — Correo
  const [emailSubject, setEmailSubject] = useState(DEFAULT_SUBJECT);
  const [emailBody, setEmailBody]       = useState(DEFAULT_BODY);
  const [emailPreview, setEmailPreview] = useState(false);

  const [loadingEdit, setLoadingEdit] = useState(!!editId);

  useEffect(() => {
    api.getSpaces().then(result => {
      setSpaces(result.data);
      setWorkspaceId(current => current || result.data[0]?.id || '');
    }).catch(() => setSpaces([]));
  }, []);

  // Load for edit mode — carga TODO el proceso existente
  useEffect(() => {
    if (!editId) return;
    setLoadingEdit(true);
    Promise.all([
      api.getProcesses(),
      api.getProcessConfig(editId),
      api.getFlow(editId),
      api.getFormFields(editId),
    ]).then(([procs, cfg, flow, formFields]) => {
      // Identidad
      const proc = procs.data.find(p => p.id === editId);
      if (proc) {
        setName(proc.name);
        setDesc(proc.description ?? '');
      }

      if (cfg.data) {
        setColor(cfg.data.color);
        setIcon(cfg.data.icon);
        setCategory(cfg.data.category ?? '');
        setSlaDays(cfg.data.default_sla_days || 5);
        if (cfg.data.email_subject) setEmailSubject(cfg.data.email_subject);
        if (cfg.data.email_body) setEmailBody(cfg.data.email_body);
        setWorkspaceId(cfg.data.workspace_id ?? '');
        setAssignmentMode(cfg.data.assignment_mode ?? 'auto_load');
        setExecutionSlaDays(cfg.data.execution_sla_days || cfg.data.default_sla_days || 5);
        setRequireRequesterConfirmation(cfg.data.require_requester_confirmation !== 0);
        if (cfg.data.fixed_assignee_email) {
          setFixedAssignee({
            id: cfg.data.fixed_assignee_id ?? cfg.data.fixed_assignee_email,
            name: cfg.data.fixed_assignee_name ?? cfg.data.fixed_assignee_email,
            email: cfg.data.fixed_assignee_email,
            jobTitle: '', department: '',
          });
        }
        try { setChecklist(JSON.parse(cfg.data.checklist_json || '[]')); } catch { setChecklist([]); }
        try { setDeliverables(JSON.parse(cfg.data.deliverables_json || '[]')); } catch { setDeliverables([]); }
      }

      // Formulario: preferir el schema del wizard; si está vacío,
      // cargar el formulario real de solicitudes (request_type_fields)
      let wizardFields: WizardField[] = [];
      try {
        const parsed = cfg.data ? JSON.parse(cfg.data.form_schema_json) : [];
        if (Array.isArray(parsed)) wizardFields = parsed;
      } catch { /* ignore */ }
      if (wizardFields.length === 0 && formFields.data.length > 0) {
        wizardFields = formFields.data.map(legacyToWizard);
      }
      if (wizardFields.length > 0) setFields(wizardFields);

      if (flow.data.length) {
        setLevels(flow.data.map(l => ({
          _key: crypto.randomUUID(),
          level: l.level, label: l.label,
          approver_type: l.approver_type,
          approver_value: l.approver_value,
          approver_name: l.approver_name ?? '',
          approver_email: l.approver_email ?? '',
        })));
      }
      setLoadError('');
    }).catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : 'No se pudo cargar el proceso.');
    }).finally(() => setLoadingEdit(false));
  }, [editId]);

  const STEPS = ['Identidad', 'Formulario', 'Aprobación', 'Ejecución', 'Correo', editId ? 'Guardar' : 'Crear'];

  const stepIssues = (targetStep = step): string[] => {
    if (targetStep === 0 && name.trim().length < 2) return ['Escribe un nombre de al menos 2 caracteres.'];
    if (targetStep === 1) {
      const issues: string[] = [];
      fields.forEach((field, index) => {
        if (!field.label.trim()) issues.push(`La pregunta ${index + 1} no tiene texto.`);
        if (['radio', 'checkbox_group', 'select'].includes(field.type) && !(field.options?.some(option => option.trim()))) {
          issues.push(`La pregunta ${index + 1} necesita al menos una opción.`);
        }
      });
      return issues;
    }
    if (targetStep === 2) {
      const issues: string[] = [];
      levels.forEach((level, index) => {
        if (!level.label.trim()) issues.push(`Ponle nombre al nivel ${index + 1}.`);
        if (!level.approver_value.trim()) issues.push(`Selecciona el aprobador del nivel ${index + 1}.`);
        if (level.approver_type === 'fixed_user' && level.approver_value && !level.approver_email.trim()) {
          issues.push(`El aprobador del nivel ${index + 1} no tiene correo.`);
        }
      });
      return issues;
    }
    if (targetStep === 3) {
      const issues: string[] = [];
      if (!workspaceId) issues.push('Selecciona el espacio que ejecutará el trabajo.');
      if (assignmentMode === 'fixed_user' && !fixedAssignee?.email) issues.push('Selecciona la persona responsable fija.');
      if (executionSlaDays < 1 || executionSlaDays > 365) issues.push('El SLA de ejecución debe estar entre 1 y 365 días.');
      checklist.forEach((item, index) => { if (!item.label.trim()) issues.push(`El paso ${index + 1} del checklist no tiene nombre.`); });
      deliverables.forEach((item, index) => { if (!item.label.trim()) issues.push(`El entregable ${index + 1} no tiene nombre.`); });
      return issues;
    }
    if (targetStep === 4) {
      const issues: string[] = [];
      if (!emailSubject.trim()) issues.push('Escribe el asunto del correo final.');
      if (!emailBody.trim()) issues.push('Escribe el contenido del correo final.');
      return issues;
    }
    return [];
  };

  const goNext = () => {
    const issues = stepIssues();
    if (issues.length) {
      setValidationMessage(issues.slice(0, 3).join('\n'));
      return;
    }
    setValidationMessage('');
    setStep(current => current + 1);
  };

  const handleCreate = async () => {
    const allIssues = [0, 1, 2, 3, 4].flatMap(stepNumber => stepIssues(stepNumber));
    if (allIssues.length) {
      setValidationMessage(allIssues.slice(0, 3).join('\n'));
      await alertDialog({ title: 'Falta completar el proceso', message: allIssues.slice(0, 5).join('\n'), tone: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await api.saveFullProcess({
        id: editId || undefined,
        name: name.trim(), description: desc.trim() || undefined,
        levels: levels.map(l => ({
          level: l.level, label: l.label,
          approver_type: l.approver_type,
          approver_value: l.approver_value,
          approver_name: l.approver_name,
          approver_email: l.approver_email,
        })),
        fields: wizardToLegacy(fields), form_schema_json: JSON.stringify(fields),
        email_subject: emailSubject, email_body: emailBody,
        color, icon, category: category || undefined, default_sla_days: slaDays,
        workspace_id: workspaceId || undefined,
        assignment_mode: assignmentMode,
        fixed_assignee_id: fixedAssignee?.id,
        fixed_assignee_name: fixedAssignee?.name,
        fixed_assignee_email: fixedAssignee?.email,
        execution_sla_days: executionSlaDays,
        checklist_json: JSON.stringify(checklist),
        deliverables_json: JSON.stringify(deliverables),
        require_requester_confirmation: requireRequesterConfirmation ? 1 : 0,
      });
      setDone(true);
    } catch (error) {
      await alertDialog({
        title: 'No se pudo guardar',
        message: error instanceof Error ? error.message : 'No se pudo guardar el proceso.',
        tone: 'danger',
      });
    } finally { setSaving(false); }
  };

  if (done) return <SuccessScreen name={name} color={color} edited={!!editId} onGoAdmin={() => navigate('/admin')} />;

  if (loadingEdit) {
    return (
      <div style={{ minHeight: '100vh', background: '#F9F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
        <Spinner size={28} />
        <span style={{ fontSize: 13, color: '#71717A' }}>Cargando proceso…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ maxWidth: 460, background: '#fff', border: '1px solid #FECACA', borderRadius: 14, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#991B1B' }}>No se pudo abrir el proceso</div>
          <div style={{ marginTop: 8, color: '#64748B', fontSize: 13 }}>{loadError}</div>
          <button onClick={() => navigate('/admin')} style={{ ...btnPrimStyle, marginTop: 18 }}>Volver a Administración</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F9F9FB', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #E4E4E7',
        padding: compact ? '10px 16px' : '0 32px', minHeight: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: compact ? 'wrap' : 'nowrap', gap: compact ? 10 : 0,
        position: 'sticky', top: mobileLayout ? 56 : 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => navigate('/admin')} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#71717A', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
          }}>
            <ArrowLeftIcon /> Volver
          </button>
          <div style={{ width: 1, height: 20, background: '#E4E4E7' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#18181B' }}>
            {editId ? 'Editar proceso' : 'Nuevo proceso'}
          </span>
        </div>

        {/* Step pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, order: compact ? 3 : 0, width: compact ? '100%' : 'auto', overflowX: compact ? 'auto' : 'visible', paddingBottom: compact ? 2 : 0 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => i < step ? setStep(i) : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 99, border: 'none',
                  fontSize: 12, fontWeight: 600, cursor: i < step ? 'pointer' : 'default',
                  background: i === step ? color : i < step ? color + '20' : '#F4F4F5',
                  color: i === step ? '#fff' : i < step ? color : '#A1A1AA',
                  transition: 'all .2s',
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  background: i === step ? 'rgba(255,255,255,0.3)' : i < step ? color : '#E4E4E7',
                  color: i < step ? '#fff' : i === step ? '#fff' : '#A1A1AA',
                  fontSize: 10, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {i < step ? '✓' : i + 1}
                </span>
                {s}
              </button>
              {i < STEPS.length - 1 && (
                <div style={{ width: 20, height: 1, background: i < step ? color : '#E4E4E7' }} />
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} style={btnGhostStyle}>
              Anterior
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              onClick={goNext}
              style={{ ...btnPrimStyle, background: color }}
            >
              Siguiente
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={saving}
              style={{ ...btnPrimStyle, background: color }}
            >
              {saving ? <Spinner size={16} /> : (editId ? 'Guardar cambios' : 'Crear proceso')}
            </button>
          )}
        </div>
      </div>

      {validationMessage && (
        <div style={{ background: '#FFFBEB', borderBottom: '1px solid #FDE68A', color: '#92400E', padding: '9px 24px', fontSize: 12.5, fontWeight: 650, whiteSpace: 'pre-line' }}>
          {validationMessage}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {step === 0 && (
          <StepIdentity
            name={name} setName={setName}
            desc={desc} setDesc={setDesc}
            color={color} setColor={setColor}
            icon={icon} setIcon={setIcon}
            category={category} setCategory={setCategory}
            slaDays={slaDays} setSlaDays={setSlaDays}
            formTitle={formTitle} setFormTitle={setFormTitle}
          />
        )}
        {step === 1 && (
          <StepFormCanvas
            processName={name}
            formTitle={formTitle} setFormTitle={setFormTitle}
            formSubtitle={formSubtitle} setFormSubtitle={setFormSubtitle}
            fields={fields} setFields={setFields}
            selectedField={selectedField} setSelectedField={setSelectedField}
            color={color}
            compact={compact}
          />
        )}
        {step === 2 && (
          <StepApproval
            levels={levels} setLevels={setLevels} color={color}
          />
        )}
        {step === 3 && (
          <StepExecution
            spaces={spaces} workspaceId={workspaceId} setWorkspaceId={setWorkspaceId}
            assignmentMode={assignmentMode} setAssignmentMode={setAssignmentMode}
            fixedAssignee={fixedAssignee} setFixedAssignee={setFixedAssignee}
            executionSlaDays={executionSlaDays} setExecutionSlaDays={setExecutionSlaDays}
            checklist={checklist} setChecklist={setChecklist}
            deliverables={deliverables} setDeliverables={setDeliverables}
            requireRequesterConfirmation={requireRequesterConfirmation}
            setRequireRequesterConfirmation={setRequireRequesterConfirmation}
            color={color}
          />
        )}
        {step === 4 && (
          <StepEmail
            subject={emailSubject} setSubject={setEmailSubject}
            body={emailBody} setBody={setEmailBody}
            preview={emailPreview} setPreview={setEmailPreview}
            color={color}
          />
        )}
        {step === 5 && (
          <StepReview
            name={name} desc={desc} color={color} icon={icon}
            fields={fields} levels={levels}
            emailSubject={emailSubject}
            workspaceName={spaces.find(space => space.id === workspaceId)?.name ?? workspaceId}
            checklistCount={checklist.length} deliverablesCount={deliverables.length}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 1: IDENTIDAD
// ─────────────────────────────────────────────────────────────────────────────
function StepIdentity({ name, setName, desc, setDesc, color, setColor, icon, setIcon, category, setCategory, slaDays, setSlaDays, formTitle, setFormTitle }: {
  name: string; setName: (v: string) => void;
  desc: string; setDesc: (v: string) => void;
  color: string; setColor: (v: string) => void;
  icon: string; setIcon: (v: string) => void;
  category: string; setCategory: (v: string) => void;
  slaDays: number; setSlaDays: (v: number) => void;
  formTitle: string; setFormTitle: (v: string) => void;
}) {
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 32px' }}>
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: '#18181B', letterSpacing: -0.5, marginBottom: 8 }}>
          Identidad del proceso
        </h2>
        <p style={{ color: '#71717A', fontSize: 15 }}>
          Dale nombre y personalidad al proceso. Esto aparecerá en el formulario y en los correos.
        </p>
      </div>

      {/* Preview badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 36,
        background: '#fff', borderRadius: 14, padding: '16px 20px',
        border: '1px solid #E4E4E7', boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={PROCESS_ICONS.find(i => i.key === icon)?.svg ?? ''} />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#18181B' }}>
            {name || 'Nombre del proceso'}
          </div>
          <div style={{ fontSize: 13, color: '#71717A', marginTop: 2 }}>
            {desc || 'Descripción del proceso'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <label style={lbl}>Nombre del proceso *</label>
          <input
            autoFocus value={name} onChange={e => setName(e.target.value)}
            placeholder="Ej: Solicitud de artes Marketing"
            style={{ ...inp, fontSize: 16, fontWeight: 600 }}
          />
        </div>
        <div>
          <label style={lbl}>Descripción (aparece en el formulario)</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Llena este formulario para iniciar tu solicitud..."
            rows={2} style={{ ...inp, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div>
            <label style={lbl}>Título del formulario</label>
            <input value={formTitle || name} onChange={e => setFormTitle(e.target.value)}
              placeholder="Igual al nombre del proceso"
              style={inp}
            />
          </div>
          <div>
            <label style={lbl}>Categoría</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={inp}>
              <option value="">Sin categoría</option>
              <option value="marketing">Marketing</option>
              <option value="bi">Business Intelligence</option>
              <option value="comercial">Comercial</option>
              <option value="operaciones">Operaciones</option>
              <option value="rrhh">Recursos Humanos</option>
              <option value="compras">Compras</option>
            </select>
          </div>
          <div>
            <label style={lbl}>SLA total (días laborables)</label>
            <input type="number" min={1} max={365} value={slaDays}
              onChange={e => setSlaDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
              style={inp}
            />
          </div>
        </div>

        {/* Color picker */}
        <div>
          <label style={lbl}>Color del proceso</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COLORS.filter((_c, i) => i < 8).map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                width: 32, height: 32, borderRadius: 8, background: c, border: 'none',
                cursor: 'pointer', outline: c === color ? `3px solid ${c}` : 'none',
                outlineOffset: 2, transform: c === color ? 'scale(1.15)' : 'scale(1)',
                transition: 'all .15s',
              }} />
            ))}
          </div>
        </div>

        {/* Icon picker */}
        <div>
          <label style={lbl}>Ícono</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {PROCESS_ICONS.map(i => (
              <button key={i.key} onClick={() => setIcon(i.key)} style={{
                width: 44, height: 44, borderRadius: 10, border: 'none',
                background: icon === i.key ? color : '#F4F4F5',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .15s',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke={icon === i.key ? '#fff' : '#71717A'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={i.svg} />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 2: FORM CANVAS (Google Forms-like)
// ─────────────────────────────────────────────────────────────────────────────
function StepFormCanvas({ processName, formTitle, setFormTitle, formSubtitle, setFormSubtitle, fields, setFields, selectedField, setSelectedField, color, compact }: {
  processName: string;
  formTitle: string; setFormTitle: (v: string) => void;
  formSubtitle: string; setFormSubtitle: (v: string) => void;
  fields: WizardField[]; setFields: (f: WizardField[]) => void;
  selectedField: string | null; setSelectedField: (id: string | null) => void;
  color: string;
  compact: boolean;
}) {
  const addField = (type: FormFieldType) => {
    const f = makeField(type);
    setFields([...fields, f]);
    setSelectedField(f.id);
  };

  const removeField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
    if (selectedField === id) setSelectedField(null);
  };

  const updateField = (id: string, patch: Partial<WizardField>) => {
    setFields(fields.map(f => f.id === id ? { ...f, ...patch } : f));
  };

  const moveField = (id: string, dir: -1 | 1) => {
    const idx = fields.findIndex(f => f.id === id);
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === fields.length - 1)) return;
    const copy = [...fields];
    [copy[idx], copy[idx + dir]] = [copy[idx + dir], copy[idx]];
    setFields(copy);
  };

  return (
    <div style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', minHeight: compact ? 0 : 'calc(100vh - 60px)', height: compact ? 'auto' : 'calc(100vh - 60px)', overflow: compact ? 'visible' : 'hidden' }}>
      {/* Left: Field palette */}
      <div style={{
        width: compact ? 'auto' : 220, background: '#fff', borderRight: compact ? 'none' : '1px solid #E4E4E7', borderBottom: compact ? '1px solid #E4E4E7' : 'none',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        <div style={{ padding: '16px 16px 8px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: 1 }}>
            Tipos de campo
          </div>
        </div>
        <div style={{ padding: '0 10px 16px', display: 'grid', gridTemplateColumns: compact ? 'repeat(auto-fit,minmax(145px,1fr))' : '1fr', gap: 3 }}>
          {FIELD_TYPES.map(ft => (
            <button key={ft.type} onClick={() => addField(ft.type)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 8, border: 'none',
              cursor: 'pointer', background: 'transparent', textAlign: 'left',
              transition: 'background .12s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#F4F4F5'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 7, background: ft.color + '18',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <FieldTypeIcon type={ft.type} color={ft.color} size={13} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#18181B' }}>{ft.label}</div>
                <div style={{ fontSize: 10, color: '#A1A1AA' }}>{ft.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Center: Canvas */}
      <div style={{ flex: 1, overflowY: compact ? 'visible' : 'auto', padding: compact ? '20px 14px' : '32px 24px' }}>
        <div style={{ maxWidth: 660, margin: '0 auto' }}>
          {/* Form header card */}
          <div style={{
            background: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: 16,
            border: `2px solid ${color}`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          }}>
            <div style={{ height: 10, background: color }} />
            <div style={{ padding: '24px 28px' }}>
              <input
                value={formTitle || processName}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="Título del formulario"
                style={{
                  width: '100%', border: 'none', outline: 'none',
                  fontSize: 24, fontWeight: 800, color: '#18181B',
                  fontFamily: 'inherit', marginBottom: 8,
                }}
              />
              <textarea
                value={formSubtitle}
                onChange={e => setFormSubtitle(e.target.value)}
                placeholder="Descripción del formulario (opcional)"
                rows={2}
                style={{
                  width: '100%', border: 'none', outline: 'none', resize: 'none',
                  fontSize: 14, color: '#71717A', fontFamily: 'inherit',
                }}
              />
              <div style={{
                fontSize: 12, color: '#A1A1AA', marginTop: 8, borderTop: '1px solid #F4F4F5', paddingTop: 8
              }}>
                Obligatorio marcado con *
              </div>
            </div>
          </div>

          {/* Fields */}
          {fields.map((f, idx) => (
            <FieldCard
              key={f.id}
              field={f}
              index={idx}
              total={fields.length}
              selected={selectedField === f.id}
              color={color}
              onSelect={() => setSelectedField(selectedField === f.id ? null : f.id)}
              onChange={p => updateField(f.id, p)}
              onRemove={() => removeField(f.id)}
              onMove={dir => moveField(f.id, dir)}
            />
          ))}

          {/* Add field button */}
          <div
            onClick={() => addField('text')}
            style={{
              border: `2px dashed ${color}40`,
              borderRadius: 14, padding: '20px',
              textAlign: 'center', cursor: 'pointer',
              color: color, fontSize: 13, fontWeight: 600,
              transition: 'all .15s', marginTop: 4,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = color + '08'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
          >
            + Añadir pregunta
          </div>
        </div>
      </div>

      {/* Right: empty state / field count */}
      <div style={{
        width: compact ? 'auto' : 180, background: '#F9F9FB', borderLeft: compact ? 'none' : '1px solid #E4E4E7', borderTop: compact ? '1px solid #E4E4E7' : 'none',
        padding: '20px 16px',
        display: compact ? 'none' : 'block',
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
          Resumen
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#18181B', letterSpacing: -1 }}>
          {fields.length}
        </div>
        <div style={{ fontSize: 12, color: '#71717A', marginBottom: 20 }}>
          {fields.length === 1 ? 'pregunta' : 'preguntas'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {FIELD_TYPES.filter(ft => fields.some(f => f.type === ft.type)).map(ft => (
            <div key={ft.type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: ft.color }} />
              <span style={{ fontSize: 11, color: '#71717A' }}>
                {fields.filter(f => f.type === ft.type).length} {ft.label.toLowerCase()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Field Card ───────────────────────────────────────────────────────────────
function FieldCard({ field: f, index, total, selected, color, onSelect, onChange, onRemove, onMove }: {
  field: WizardField; index: number; total: number; selected: boolean; color: string;
  onSelect: () => void; onChange: (p: Partial<WizardField>) => void;
  onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const ft = FIELD_TYPES.find(t => t.type === f.type)!;

  if (f.type === 'section') {
    return (
      <div onClick={onSelect} style={{
        marginBottom: 12, cursor: 'pointer',
        borderLeft: `4px solid ${selected ? color : '#E4E4E7'}`,
        paddingLeft: 16, paddingTop: 8, paddingBottom: 8,
      }}>
        {selected ? (
          <input value={f.label} onChange={e => onChange({ label: e.target.value })}
            placeholder="Título de sección"
            style={{ border: 'none', outline: 'none', fontSize: 18, fontWeight: 800, color: '#18181B', fontFamily: 'inherit', width: '100%' }}
          />
        ) : (
          <div style={{ fontSize: 18, fontWeight: 800, color: '#18181B' }}>
            {f.label || 'Sección sin título'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff', borderRadius: 12, marginBottom: 10,
      border: `1.5px solid ${selected ? color : '#E4E4E7'}`,
      boxShadow: selected ? `0 0 0 3px ${color}15` : '0 1px 4px rgba(0,0,0,0.04)',
      overflow: 'hidden', cursor: 'pointer',
      transition: 'border-color .15s, box-shadow .15s',
    }} onClick={onSelect}>
      {/* Card header */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6, background: ft.color + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginTop: 2,
        }}>
          <FieldTypeIcon type={f.type} color={ft.color} size={11} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: ft.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {index + 1}. {ft.label}
            </span>
            {f.required && (
              <span style={{ fontSize: 10, color: '#DC2626', fontWeight: 700 }}>* Obligatorio</span>
            )}
          </div>
          {selected ? (
            <input
              value={f.label} onChange={e => onChange({ label: e.target.value })}
              onClick={e => e.stopPropagation()}
              placeholder="Escribe la pregunta..."
              style={{ border: 'none', outline: 'none', fontSize: 15, fontWeight: 600, color: '#18181B', fontFamily: 'inherit', width: '100%', marginBottom: 4 }}
            />
          ) : (
            <div style={{ fontSize: 14, fontWeight: 600, color: f.label ? '#18181B' : '#A1A1AA' }}>
              {f.label || 'Pregunta sin texto...'}
            </div>
          )}

          {/* Field preview */}
          {!selected && <FieldPreview field={f} />}
        </div>
      </div>

      {/* Expanded settings */}
      {selected && (
        <div onClick={e => e.stopPropagation()} style={{
          borderTop: '1px solid #F4F4F5', padding: '14px 16px',
          background: '#FAFAFA', display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Placeholder */}
          {['text', 'email', 'textarea', 'number'].includes(f.type) && (
            <div>
              <label style={{ ...lbl, fontSize: 10 }}>Placeholder</label>
              <input value={f.placeholder ?? ''} onChange={e => onChange({ placeholder: e.target.value })}
                placeholder="Texto de ayuda..."
                style={{ ...inp, fontSize: 13, padding: '7px 10px' }} />
            </div>
          )}

          {/* Options */}
          {['radio', 'checkbox_group', 'select'].includes(f.type) && (
            <div>
              <label style={{ ...lbl, fontSize: 10 }}>Opciones (una por línea)</label>
              <textarea
                value={(f.options ?? []).join('\n')}
                onChange={e => onChange({ options: e.target.value.split('\n').filter(o => o.trim()) })}
                rows={Math.min((f.options?.length ?? 3) + 1, 8)}
                style={{ ...inp, resize: 'vertical', fontSize: 13, padding: '7px 10px', minHeight: 80 }}
              />
            </div>
          )}

          {/* File accept */}
          {f.type === 'file' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ ...lbl, fontSize: 10 }}>Tipos permitidos</label>
                <input value={f.accept ?? ''} onChange={e => onChange({ accept: e.target.value })}
                  placeholder="Word, PDF, Imagen..."
                  style={{ ...inp, fontSize: 13, padding: '7px 10px' }} />
              </div>
              <div>
                <label style={{ ...lbl, fontSize: 10 }}>Máximo archivos</label>
                <input type="number" value={f.maxFiles ?? 5} onChange={e => onChange({ maxFiles: parseInt(e.target.value) })}
                  style={{ ...inp, fontSize: 13, padding: '7px 10px' }} />
              </div>
            </div>
          )}

          {/* Required toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onMove(-1)} disabled={index === 0}
                style={{ ...iconBtn, opacity: index === 0 ? 0.3 : 1 }}>↑</button>
              <button onClick={() => onMove(1)} disabled={index === total - 1}
                style={{ ...iconBtn, opacity: index === total - 1 ? 0.3 : 1 }}>↓</button>
              <button onClick={onRemove} style={{ ...iconBtn, color: '#EF4444' }}>Eliminar</button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <span style={{ color: '#52525B' }}>Obligatorio</span>
              <div onClick={() => onChange({ required: !f.required })} style={{
                width: 40, height: 22, borderRadius: 99,
                background: f.required ? color : '#D4D4D8',
                position: 'relative', cursor: 'pointer', transition: 'background .2s',
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 2,
                  left: f.required ? 20 : 2, transition: 'left .2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldPreview({ field: f }: { field: WizardField }) {
  if (f.type === 'text' || f.type === 'email' || f.type === 'number') {
    return <div style={prevInput}>{f.placeholder || 'Tu respuesta'}</div>;
  }
  if (f.type === 'textarea') {
    return <div style={{ ...prevInput, height: 48 }}>{f.placeholder || 'Tu respuesta'}</div>;
  }
  if (f.type === 'date') {
    return <div style={prevInput}>dd/mm/aaaa</div>;
  }
  if (f.type === 'radio') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {(f.options ?? []).slice(0, 3).map(o => (
          <div key={o} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #D4D4D8' }} />
            <span style={{ fontSize: 13, color: '#3F3F46' }}>{o}</span>
          </div>
        ))}
        {(f.options?.length ?? 0) > 3 && <span style={{ fontSize: 11, color: '#A1A1AA' }}>+{(f.options?.length ?? 0) - 3} más...</span>}
      </div>
    );
  }
  if (f.type === 'checkbox_group') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {(f.options ?? []).slice(0, 3).map(o => (
          <div key={o} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, border: '1.5px solid #D4D4D8' }} />
            <span style={{ fontSize: 13, color: '#3F3F46' }}>{o}</span>
          </div>
        ))}
        {(f.options?.length ?? 0) > 3 && <span style={{ fontSize: 11, color: '#A1A1AA' }}>+{(f.options?.length ?? 0) - 3} más...</span>}
      </div>
    );
  }
  if (f.type === 'select') {
    return <div style={prevInput}>Selecciona una opción ▾</div>;
  }
  if (f.type === 'file') {
    return (
      <div style={{
        marginTop: 8, border: '1.5px dashed #D4D4D8', borderRadius: 8,
        padding: '10px 14px', fontSize: 12, color: '#A1A1AA', textAlign: 'center',
      }}>
        Cargar archivo — {f.accept ?? 'cualquier tipo'} (máx. {f.maxFiles ?? 5})
      </div>
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 3: APROBACIÓN
// ─────────────────────────────────────────────────────────────────────────────
function StepApproval({ levels, setLevels, color }: {
  levels: ApprovalLevel[]; setLevels: (ls: ApprovalLevel[]) => void; color: string;
}) {
  const addLevel = () => {
    if (levels.length >= 4) return;
    setLevels([...levels, {
      _key: crypto.randomUUID(),
      level: levels.length + 1, label: '',
      approver_type: 'fixed_user', approver_value: '',
      approver_name: '', approver_email: '',
    }]);
  };

  const removeLevel = (i: number) => {
    setLevels(levels.filter((_, j) => j !== i).map((l, j) => ({ ...l, level: j + 1 })));
  };

  const updateLevel = (i: number, patch: Partial<ApprovalLevel>) => {
    setLevels(levels.map((l, j) => j === i ? { ...l, ...patch } : l));
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 32px' }}>
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: '#18181B', letterSpacing: -0.5, marginBottom: 8 }}>
          Flujo de aprobación
        </h2>
        <p style={{ color: '#71717A', fontSize: 15 }}>
          Define quiénes deben aprobar la solicitud y en qué orden. Máximo 4 niveles.
        </p>
      </div>

      {/* Visual pipeline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}>
        <div style={{
          background: '#F4F4F5', borderRadius: 99, padding: '6px 12px',
          fontSize: 12, fontWeight: 600, color: '#71717A',
        }}>
          Solicitante
        </div>
        {levels.map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowRightIcon color={color} />
            <div style={{
              background: color, borderRadius: 99, padding: '6px 14px',
              fontSize: 12, fontWeight: 700, color: '#fff',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                background: 'rgba(255,255,255,0.25)', borderRadius: '50%',
                width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 900,
              }}>{i + 1}</span>
              {l.label || `Nivel ${i + 1}`}
              {l.approver_name && (
                <span style={{ opacity: 0.75 }}>— {l.approver_name.split(' ')[0]}</span>
              )}
            </div>
          </div>
        ))}
        <ArrowRightIcon color="#10B981" />
        <div style={{ background: '#D1FAE5', borderRadius: 99, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#059669' }}>
          Aprobado
        </div>
      </div>

      {/* Level cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {levels.map((l, i) => (
          <ApprovalLevelCard
            key={l._key} index={i} level={l} color={color}
            canRemove={levels.length > 1}
            onUpdate={p => updateLevel(i, p)}
            onRemove={() => removeLevel(i)}
          />
        ))}
      </div>

      {levels.length < 4 && (
        <button onClick={addLevel} style={{
          marginTop: 12, width: '100%', border: `2px dashed ${color}40`,
          background: 'transparent', borderRadius: 12, padding: '14px',
          cursor: 'pointer', color: color, fontSize: 13, fontWeight: 700,
          transition: 'background .15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = color + '08'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          + Agregar nivel de aprobación ({levels.length}/4)
        </button>
      )}
    </div>
  );
}

function ApprovalLevelCard({ index, level, color, canRemove, onUpdate, onRemove }: {
  index: number; level: ApprovalLevel; color: string; canRemove: boolean;
  onUpdate: (p: Partial<ApprovalLevel>) => void; onRemove: () => void;
}) {
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState<EntraUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const requestSequence = useRef(0);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setSearchError(''); return; }
    const sequence = ++requestSequence.current;
    setSearching(true);
    try {
      const r = await api.searchUsers(q.trim());
      if (sequence === requestSequence.current) {
        setResults(r.data);
        setSearchError(r.data.length ? '' : 'No se encontraron usuarios.');
      }
    } catch (error) {
      if (sequence === requestSequence.current) {
        setResults([]);
        setSearchError(error instanceof Error ? error.message : 'No se pudo buscar en Microsoft 365.');
      }
    } finally {
      if (sequence === requestSequence.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 350);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  const pickUser = (u: EntraUser) => {
    onUpdate({ approver_type: 'fixed_user', approver_value: u.id, approver_name: u.name, approver_email: u.email });
    setQuery(''); setResults([]); setSearchError('');
  };

  return (
    <div style={{
      background: '#fff', borderRadius: 12, border: '1.5px solid #E4E4E7',
      overflow: 'visible', position: 'relative', zIndex: results.length ? 30 : 1,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 18px', borderBottom: '1px solid #F4F4F5',
        background: `linear-gradient(135deg, ${color}08, transparent)`,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: color,
          color: '#fff', fontSize: 13, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{index + 1}</div>
        <input
          value={level.label} onChange={e => onUpdate({ label: e.target.value })}
          placeholder={`Nombre del paso ${index + 1} (ej. Coordinación de Marketing)`}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', background: 'transparent' }}
        />
        {canRemove && (
          <button onClick={onRemove} style={{ background: 'none', border: 'none', color: '#A1A1AA', cursor: 'pointer', fontSize: 18 }}>×</button>
        )}
      </div>

      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <select
          value={level.approver_value === '__requester__' ? '__requester__' : level.approver_type}
          onChange={e => {
            const v = e.target.value;
            if (v === '__requester__') {
              onUpdate({ approver_type: 'job_title', approver_value: '__requester__', approver_name: 'Solicitante original', approver_email: '' });
            } else {
              onUpdate({ approver_type: v as 'fixed_user' | 'job_title', approver_value: '', approver_name: '', approver_email: '' });
            }
          }}
          style={{ ...inp, fontSize: 13, padding: '8px 12px' }}
        >
          <option value="fixed_user">Usuario específico</option>
          <option value="job_title">Por cargo (Entra ID)</option>
          <option value="__requester__">Solicitante original</option>
        </select>

        {level.approver_value === '__requester__' ? (
          <div style={{ background: color + '10', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: color, fontWeight: 600 }}>
            El solicitante confirmará en este paso
          </div>
        ) : level.approver_type === 'fixed_user' ? (
          level.approver_value ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F0FDF4', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: color, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {level.approver_name.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#065F46' }}>{level.approver_name}</div>
                <div style={{ fontSize: 11, color: '#6B7280' }}>{level.approver_email}</div>
              </div>
              <button onClick={() => onUpdate({ approver_value: '', approver_name: '', approver_email: '' })}
                style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: 12 }}>
                Cambiar
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar aprobador por nombre..."
                style={{ ...inp, fontSize: 13, padding: '8px 12px' }}
              />
              {searching && <div style={{ position: 'absolute', right: 10, top: 10 }}><Spinner size={14} /></div>}
              {results.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  background: '#fff', border: '1px solid #E4E4E7',
                  borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  zIndex: 1000, maxHeight: 260, overflowY: 'auto', marginTop: 4,
                }}>
                  {results.map(u => (
                    <div key={u.id} onClick={() => pickUser(u)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F4F4F5' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F4F4F5'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#18181B' }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: '#A1A1AA' }}>{u.jobTitle} · {u.email}</div>
                    </div>
                  ))}
                </div>
              )}
              {searchError && !searching && (
                <div style={{ color: '#B45309', fontSize: 11, marginTop: 6 }}>{searchError}</div>
              )}
            </div>
          )
        ) : (
          <input
            value={level.approver_value}
            onChange={e => onUpdate({ approver_value: e.target.value })}
            placeholder="Ej: Gerente de Marketing"
            style={{ ...inp, fontSize: 13, padding: '8px 12px' }}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 4: EJECUCIÓN
// ─────────────────────────────────────────────────────────────────────────────
function StepExecution({
  spaces, workspaceId, setWorkspaceId, assignmentMode, setAssignmentMode,
  fixedAssignee, setFixedAssignee, executionSlaDays, setExecutionSlaDays,
  checklist, setChecklist, deliverables, setDeliverables,
  requireRequesterConfirmation, setRequireRequesterConfirmation, color,
}: {
  spaces: Space[]; workspaceId: string; setWorkspaceId: (value: string) => void;
  assignmentMode: 'auto_load' | 'manual' | 'fixed_user';
  setAssignmentMode: (value: 'auto_load' | 'manual' | 'fixed_user') => void;
  fixedAssignee: EntraUser | null; setFixedAssignee: (value: EntraUser | null) => void;
  executionSlaDays: number; setExecutionSlaDays: (value: number) => void;
  checklist: ExecutionRequirement[]; setChecklist: React.Dispatch<React.SetStateAction<ExecutionRequirement[]>>;
  deliverables: ExecutionRequirement[]; setDeliverables: React.Dispatch<React.SetStateAction<ExecutionRequirement[]>>;
  requireRequesterConfirmation: boolean; setRequireRequesterConfirmation: (value: boolean) => void;
  color: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EntraUser[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try { setResults((await api.searchUsers(query.trim())).data.slice(0, 6)); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '42px 32px 64px' }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: '#18181B', marginBottom: 8 }}>Diseña cómo se ejecuta</h2>
        <p style={{ color: '#71717A', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          Al aprobarse una solicitud, FlowApp creará el trabajo con estas reglas y requisitos.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div style={studioCard}>
          <div style={studioTitle}>Equipo responsable</div>
          <select value={workspaceId} onChange={event => setWorkspaceId(event.target.value)} style={inp}>
            <option value="">Selecciona un espacio</option>
            {spaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}
          </select>
          <div style={{ ...studioTitle, marginTop: 18 }}>Asignación</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {[
              { value: 'auto_load', title: 'Automática por carga', text: 'Elige a quien tenga menos trabajo abierto.' },
              { value: 'manual', title: 'Manual', text: 'La tarea entra sin responsable para triage.' },
              { value: 'fixed_user', title: 'Responsable fijo', text: 'Siempre se asigna a la misma persona.' },
            ].map(option => (
              <button key={option.value} onClick={() => setAssignmentMode(option.value as typeof assignmentMode)} style={{
                textAlign: 'left', border: `1.5px solid ${assignmentMode === option.value ? color : '#E4E4E7'}`,
                background: assignmentMode === option.value ? color + '0D' : '#fff', borderRadius: 10,
                padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <div style={{ fontSize: 13, fontWeight: 750, color: '#18181B' }}>{option.title}</div>
                <div style={{ fontSize: 11.5, color: '#71717A', marginTop: 2 }}>{option.text}</div>
              </button>
            ))}
          </div>
          {assignmentMode === 'fixed_user' && (
            <div style={{ position: 'relative', marginTop: 12, zIndex: results.length ? 50 : 1 }}>
              {fixedAssignee ? (
                <div style={{ background: '#F0FDF4', borderRadius: 9, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: color, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{fixedAssignee.name.charAt(0)}</div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 700 }}>{fixedAssignee.name}</div><div style={{ fontSize: 11, color: '#71717A' }}>{fixedAssignee.email}</div></div>
                  <button onClick={() => setFixedAssignee(null)} style={{ border: 'none', background: 'none', color: color, cursor: 'pointer' }}>Cambiar</button>
                </div>
              ) : (
                <>
                  <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar responsable en Microsoft 365" style={inp} />
                  {searching && <div style={{ position: 'absolute', right: 12, top: 11 }}><Spinner size={14} /></div>}
                  {results.length > 0 && (
                    <div style={{ position: 'absolute', inset: 'calc(100% + 4px) 0 auto', background: '#fff', border: '1px solid #E4E4E7', borderRadius: 10, boxShadow: '0 14px 34px rgba(15,23,42,.16)', maxHeight: 240, overflowY: 'auto', zIndex: 1000 }}>
                      {results.map(user => <button key={user.id} onClick={() => { setFixedAssignee(user); setQuery(''); setResults([]); }} style={{ width: '100%', border: 'none', borderBottom: '1px solid #F4F4F5', background: '#fff', padding: '10px 12px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#18181B' }}>{user.name}</div>
                        <div style={{ fontSize: 11, color: '#71717A' }}>{user.jobTitle || user.email}</div>
                      </button>)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div style={studioCard}>
          <div style={studioTitle}>Compromiso de ejecución</div>
          <label style={{ display: 'grid', gap: 7, fontSize: 12.5, color: '#3F3F46' }}>
            Días para completar el trabajo
            <input type="number" min={1} max={365} value={executionSlaDays} onChange={event => setExecutionSlaDays(Number(event.target.value))} style={inp} />
          </label>
          <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="checkbox" checked={requireRequesterConfirmation} onChange={event => setRequireRequesterConfirmation(event.target.checked)} style={{ marginTop: 2 }} />
              <span><strong style={{ display: 'block', fontSize: 12.5, color: '#18181B' }}>Confirmación del solicitante</strong><span style={{ fontSize: 11.5, color: '#71717A' }}>Solicita validación antes del cierre definitivo.</span></span>
            </label>
          </div>
          <div style={{ marginTop: 18, fontSize: 11.5, color: '#71717A', lineHeight: 1.55 }}>
            El SLA empieza cuando finaliza la aprobación. La fecha aparecerá automáticamente en Mi día y Trabajo.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <RequirementEditor title="Checklist de ejecución" hint="Pasos que el equipo debe completar" items={checklist} setItems={setChecklist} color={color} addLabel="Añadir paso" />
        <RequirementEditor title="Entregables" hint="Evidencias necesarias para cerrar" items={deliverables} setItems={setDeliverables} color={color} addLabel="Añadir entregable" />
      </div>
    </div>
  );
}

function RequirementEditor({ title, hint, items, setItems, color, addLabel }: {
  title: string; hint: string; items: ExecutionRequirement[];
  setItems: React.Dispatch<React.SetStateAction<ExecutionRequirement[]>>;
  color: string; addLabel: string;
}) {
  const update = (id: string, patch: Partial<ExecutionRequirement>) => setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  return (
    <div style={studioCard}>
      <div style={studioTitle}>{title}</div>
      <div style={{ fontSize: 11.5, color: '#71717A', marginTop: -7, marginBottom: 12 }}>{hint}</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((item, index) => (
          <div key={item.id} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            <span style={{ width: 20, textAlign: 'center', fontSize: 11, color: '#A1A1AA' }}>{index + 1}</span>
            <input value={item.label} onChange={event => update(item.id, { label: event.target.value })} placeholder="Describe el requisito" style={{ ...inp, flex: 1 }} />
            <label title="Obligatorio" style={{ display: 'flex', alignItems: 'center' }}><input type="checkbox" checked={item.required} onChange={event => update(item.id, { required: event.target.checked })} /></label>
            <button onClick={() => setItems(current => current.filter(currentItem => currentItem.id !== item.id))} style={{ border: 'none', background: 'none', color: '#A1A1AA', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
        ))}
      </div>
      <button onClick={() => setItems(current => [...current, { id: crypto.randomUUID(), label: '', required: true }])} style={{ width: '100%', marginTop: 12, border: `1.5px dashed ${color}60`, background: color + '08', color, borderRadius: 9, padding: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ {addLabel}</button>
      {items.length > 0 && <div style={{ fontSize: 10.5, color: '#A1A1AA', marginTop: 8 }}>La casilla indica si es obligatorio para completar la tarea.</div>}
    </div>
  );
}

const studioCard: React.CSSProperties = { background: '#fff', border: '1px solid #E4E4E7', borderRadius: 14, padding: 20, boxShadow: '0 4px 18px rgba(15,23,42,.035)' };
const studioTitle: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: '#18181B', textTransform: 'uppercase', letterSpacing: .6, marginBottom: 12 };

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 5: CORREO
// ─────────────────────────────────────────────────────────────────────────────
function StepEmail({ subject, setSubject, body, setBody, preview, setPreview, color }: {
  subject: string; setSubject: (v: string) => void;
  body: string; setBody: (v: string) => void;
  preview: boolean; setPreview: (v: boolean) => void;
  color: string;
}) {
  const insertVar = (setter: (v: string) => void, current: string, v: string) => {
    setter(current + v);
  };

  const previewBody = body
    .replace(/{{solicitante}}/g, 'María Paula García')
    .replace(/{{correo}}/g, 'mpgarcia@metrored.com')
    .replace(/{{titulo}}/g, 'Arte para campaña cardiología')
    .replace(/{{proceso}}/g, 'Solicitud de artes Marketing')
    .replace(/{{fecha}}/g, new Date().toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' }))
    .replace(/{{nivel_actual}}/g, '2')
    .replace(/{{aprobadores}}/g, 'Coordinación Marketing, Gerencia Comercial')
    .replace(/{{url_solicitud}}/g, 'https://metroredec.github.io/flowapp/#/requests/abc123');

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 40 }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: '#18181B', letterSpacing: -0.5, marginBottom: 8 }}>
            Correo de entrega
          </h2>
          <p style={{ color: '#71717A', fontSize: 15 }}>
            Define el correo que se enviará cuando el proceso sea aprobado.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#F4F4F5', padding: 3, borderRadius: 8 }}>
          {[{ v: false, l: 'Editar' }, { v: true, l: 'Vista previa' }].map(o => (
            <button key={String(o.v)} onClick={() => setPreview(o.v)} style={{
              padding: '7px 14px', borderRadius: 6, border: 'none', fontSize: 12,
              fontWeight: 600, cursor: 'pointer', transition: 'all .12s',
              background: preview === o.v ? '#fff' : 'transparent',
              color: preview === o.v ? '#18181B' : '#71717A',
              boxShadow: preview === o.v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!preview ? (
            <>
              <div>
                <label style={lbl}>Asunto del correo</label>
                <input value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="Asunto..."
                  style={{ ...inp, fontSize: 14 }} />
              </div>
              <div>
                <label style={lbl}>Cuerpo del mensaje</label>
                <textarea
                  value={body} onChange={e => setBody(e.target.value)}
                  rows={14} style={{ ...inp, resize: 'vertical', fontSize: 13, lineHeight: 1.7, fontFamily: 'monospace' }}
                />
              </div>
            </>
          ) : (
            <div style={{
              background: '#fff', borderRadius: 12, border: '1px solid #E4E4E7',
              overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            }}>
              <div style={{ height: 6, background: color }} />
              <div style={{ padding: '24px 32px' }}>
                <div style={{ fontSize: 11, color: '#A1A1AA', marginBottom: 4 }}>ASUNTO</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#18181B', marginBottom: 24, borderBottom: '1px solid #F4F4F5', paddingBottom: 16 }}>
                  {subject.replace(/{{titulo}}/g, 'Arte para campaña cardiología').replace(/{{proceso}}/g, 'Solicitud de artes Marketing')}
                </div>
                <pre style={{
                  fontSize: 14, color: '#3F3F46', lineHeight: 1.7,
                  whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0,
                }}>
                  {previewBody}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Variable reference */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Variables disponibles
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {EMAIL_VARS.map(v => (
              <button key={v.key} onClick={() => insertVar(setBody, body, v.key)} style={{
                textAlign: 'left', border: '1px solid #E4E4E7', borderRadius: 7,
                padding: '7px 10px', background: '#fff', cursor: 'pointer',
                transition: 'border-color .12s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = color}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#E4E4E7'}
              >
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: color, fontWeight: 700 }}>{v.key}</div>
                <div style={{ fontSize: 10, color: '#A1A1AA', marginTop: 1 }}>{v.label}</div>
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: '#A1A1AA', marginTop: 10, lineHeight: 1.5 }}>
            Haz clic en una variable para insertarla en el cuerpo del mensaje.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 5: RESUMEN
// ─────────────────────────────────────────────────────────────────────────────
function StepReview({ name, desc, color, icon, fields, levels, emailSubject, workspaceName, checklistCount, deliverablesCount }: {
  name: string; desc: string; color: string; icon: string;
  fields: WizardField[]; levels: ApprovalLevel[]; emailSubject: string;
  workspaceName: string; checklistCount: number; deliverablesCount: number;
}) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 32px' }}>
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: '#18181B', letterSpacing: -0.5, marginBottom: 8 }}>
          Resumen del proceso
        </h2>
        <p style={{ color: '#71717A', fontSize: 15 }}>
          Todo listo. Revisa la configuración y crea el proceso.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Process card */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #E4E4E7', overflow: 'hidden' }}>
          <div style={{ height: 6, background: color }} />
          <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"><path d={PROCESS_ICONS.find(i => i.key === icon)?.svg ?? ''} /></svg>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#18181B' }}>{name}</div>
              <div style={{ fontSize: 13, color: '#71717A', marginTop: 2 }}>{desc}</div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
          {[
            { label: 'Preguntas', value: fields.length, icon: '?' },
            { label: 'Niveles de aprobación', value: levels.length, icon: '→' },
            { label: 'Pasos y entregables', value: checklistCount + deliverablesCount, icon: '✓' },
            { label: 'Correo configurado', value: emailSubject ? 'Sí' : 'No', icon: '@' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #E4E4E7', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: color, letterSpacing: -1 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#71717A', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #E4E4E7', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#71717A' }}>Equipo que ejecuta</span>
          <strong style={{ fontSize: 13, color: '#18181B' }}>{workspaceName || 'Sin definir'}</strong>
        </div>

        {/* Approval flow */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', border: '1px solid #E4E4E7' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
            Flujo de aprobación
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {['Solicitante', ...levels.map(l => l.label || `Nivel ${l.level}`), 'Aprobado'].map((s, i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                  background: i === 0 ? '#F4F4F5' : i === arr.length - 1 ? '#D1FAE5' : color,
                  color: i === 0 ? '#71717A' : i === arr.length - 1 ? '#059669' : '#fff',
                }}>
                  {s}
                </div>
                {i < arr.length - 1 && <span style={{ color: '#D4D4D8', fontSize: 16 }}>→</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUCCESS SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function SuccessScreen({ name, color, edited, onGoAdmin }: { name: string; color: string; edited?: boolean; onGoAdmin: () => void }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 24,
      background: `radial-gradient(ellipse at 50% 40%, ${color}12 0%, #F9F9FB 60%)`,
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: 20, background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 16px 48px ${color}50`,
      }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: '#18181B', letterSpacing: -0.5, marginBottom: 8 }}>
          {edited ? 'Cambios guardados' : 'Proceso creado'}
        </h1>
        <p style={{ color: '#71717A', fontSize: 16 }}>
          <strong style={{ color: '#18181B' }}>{name}</strong> {edited ? 'quedó actualizado. Los cambios aplican a las próximas solicitudes.' : 'está listo para recibir solicitudes.'}
        </p>
      </div>
      <button onClick={onGoAdmin} style={{ ...btnPrimStyle, background: color, fontSize: 15, padding: '14px 32px' }}>
        Ir al panel de administración
      </button>
    </div>
  );
}

// ─── Icons & Helpers ──────────────────────────────────────────────────────────
function FieldTypeIcon({ type, color, size = 14 }: { type: FormFieldType; color: string; size?: number }) {
  const paths: Partial<Record<FormFieldType, string>> = {
    text:          'M21 6H3M15 12H3M17 18H3',
    email:         'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
    textarea:      'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    number:        'M12 20V10m0 10l-3-3m3 3l3-3M16 4h-4v2h4V4zM8 10V4',
    date:          'M8 2v3M16 2v3M3 8h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    radio:         'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    checkbox_group:'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    select:        'M3 6h18M3 12h18M3 18h12',
    file:          'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
    section:       'M4 6h16M4 12h16M4 18h7',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[type] ?? 'M3 6h18'} />
    </svg>
  );
}

function ArrowLeftIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>;
}
function ArrowRightIcon({ color }: { color: string }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>;
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 800, color: '#52525B',
  textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
};
const inp: React.CSSProperties = {
  width: '100%', padding: '10px 14px', border: '1.5px solid #E4E4E7',
  borderRadius: 9, fontSize: 14, outline: 'none',
  fontFamily: 'inherit', color: '#18181B', boxSizing: 'border-box',
  background: '#fff',
};
const prevInput: React.CSSProperties = {
  marginTop: 8, borderBottom: '1.5px solid #D4D4D8',
  padding: '4px 0', fontSize: 13, color: '#A1A1AA', minHeight: 24,
};
const btnPrimStyle: React.CSSProperties = {
  background: '#0284C7', color: '#fff', border: 'none',
  borderRadius: 9, padding: '10px 22px', fontSize: 13, fontWeight: 700,
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
};
const btnGhostStyle: React.CSSProperties = {
  background: 'transparent', color: '#52525B',
  border: '1.5px solid #E4E4E7', borderRadius: 9,
  padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const iconBtn: React.CSSProperties = {
  background: 'none', border: '1px solid #E4E4E7', borderRadius: 6,
  padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#52525B',
};
