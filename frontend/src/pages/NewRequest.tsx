import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type RequestType, type FormField } from '../lib/api';

type FieldValue = string | boolean | string[];

export default function NewRequest() {
  const navigate = useNavigate();

  const [types, setTypes]           = useState<RequestType[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [requestTypeId, setRequestTypeId] = useState('');
  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles]           = useState<File[]>([]);
  const [fieldFiles, setFieldFiles] = useState<Record<string, File[]>>({});
  const [error, setError]           = useState('');
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>({});
  const [loadingFields, setLoadingFields] = useState(false);

  useEffect(() => {
    api.getRequestTypes()
      .then(r => setTypes(r.data.filter(t => t.is_active)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!requestTypeId) { setFormFields([]); setFieldValues({}); return; }
    setLoadingFields(true);
    api.getFormFields(requestTypeId)
      .then(r => {
        setFormFields(r.data);
        const defaults: Record<string, FieldValue> = {};
        r.data.forEach(f => {
          defaults[f.field_key] = f.field_type === 'checkbox' ? false
            : f.field_type === 'checkbox_group' ? [] : '';
        });
        setFieldValues(defaults);
        setFieldFiles({});
      })
      .catch(() => setFormFields([]))
      .finally(() => setLoadingFields(false));
  }, [requestTypeId]);

  function setFieldValue(key: string, val: FieldValue) {
    setFieldValues(prev => ({ ...prev, [key]: val }));
  }

  function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(prev => [...prev, ...Array.from(e.target.files ?? [])]);
    e.target.value = '';
  }

  async function submit() {
    setSaving(true);
    setError('');
    try {
      if (!requestTypeId) throw new Error('Selecciona un tipo de solicitud.');
      if (!title.trim())  throw new Error('Ingresa un titulo.');
      if (!description.trim()) throw new Error('Ingresa una descripcion.');

      // Validate required custom fields
      for (const f of formFields) {
        if (f.required) {
          const v = fieldValues[f.field_key];
          if (f.field_type === 'section') continue;
          if (f.field_type === 'file' && !(fieldFiles[f.field_key]?.length)) {
            throw new Error('Adjunta al menos un archivo en "' + f.label + '".');
          }
          if (f.field_type === 'checkbox' && v !== true) {
            throw new Error('El campo "' + f.label + '" es obligatorio.');
          }
          if (f.field_type === 'checkbox_group' && (!Array.isArray(v) || v.length === 0)) {
            throw new Error('Selecciona al menos una opción en "' + f.label + '".');
          }
          if (!['checkbox', 'checkbox_group', 'file'].includes(f.field_type) && !String(v ?? '').trim()) {
            throw new Error('El campo "' + f.label + '" es obligatorio.');
          }
        }
      }

      const campaign_data = formFields.length > 0
        ? {
            fields: fieldValues,
            file_fields: Object.fromEntries(Object.entries(fieldFiles).map(([key, value]) => [key, value.map(file => file.name)])),
          }
        : undefined;

      const created = await api.createRequest({
        request_type_id: requestTypeId,
        title: title.trim(),
        description: description.trim(),
        campaign_data,
      });

      const allFiles = [...files, ...Object.values(fieldFiles).flat()];
      for (const file of allFiles) {
        await api.uploadFile(created.data.id, file);
      }

      await api.submitRequest(created.data.id);
      navigate('/requests/' + created.data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la solicitud.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 32, color: '#777' }}>Cargando...</div>;

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, color: '#111', marginBottom: 6 }}>Nueva solicitud</h1>
      <p style={{ color: '#667085', fontSize: 14, marginBottom: 28 }}>
        Completa la informacion y adjunta los respaldos necesarios.
      </p>

      {error && <Alert>{error}</Alert>}

      <div style={panel}>
        {/* DATOS GENERALES */}
        <Section title="DATOS GENERALES">
          <div style={{ display: 'grid', gap: 16 }}>
            <Field label="Tipo de solicitud *">
              <select value={requestTypeId} onChange={e => setRequestTypeId(e.target.value)} style={input}>
                <option value="">Selecciona...</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Titulo de la solicitud *">
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Describe brevemente lo que solicitas" style={input} />
            </Field>
            <Field label="Descripcion y justificacion *">
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Explica el motivo, contexto y necesidad de esta solicitud..."
                style={{ ...input, minHeight: 110, resize: 'vertical' }} />
            </Field>
          </div>
        </Section>

        {/* CAMPOS DINAMICOS */}
        {loadingFields && (
          <div style={{ padding: '20px 32px', color: '#888', fontSize: 13 }}>
            Cargando campos del formulario...
          </div>
        )}

        {!loadingFields && formFields.length > 0 && (
          <Section title="INFORMACION ESPECIFICA">
            <div style={{ display: 'grid', gap: 16 }}>
              {formFields.map(f => (
                f.field_type === 'file' ? (
                  <FileField key={f.field_key} field={f} files={fieldFiles[f.field_key] ?? []}
                    onChange={next => setFieldFiles(previous => ({ ...previous, [f.field_key]: next }))} />
                ) : <DynamicField
                    key={f.field_key}
                    field={f}
                    value={fieldValues[f.field_key] ?? ''}
                    onChange={v => setFieldValue(f.field_key, v)}
                  />
              ))}
            </div>
          </Section>
        )}

        {/* ARCHIVOS */}
        <Section title="ARCHIVOS DE RESPALDO">
          <label style={dropZone}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📎</div>
            <strong>Adjuntar archivos</strong>
            <div style={{ color: '#667085', marginTop: 6, fontSize: 13 }}>
              PDFs, imagenes, cotizaciones. Max 20 MB por archivo.
            </div>
            <input type="file" multiple onChange={onFilesChange} style={{ display: 'none' }} />
          </label>
          {files.length > 0 && (
            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              {files.map((file, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
                  padding: '8px 12px', fontSize: 13,
                }}>
                  <span style={{ color: '#344054' }}>{file.name}</span>
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', color: '#F0997B', cursor: 'pointer', fontSize: 16 }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ACCIONES */}
        <div style={{ padding: '20px 32px', display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid #EAECF0' }}>
          <button onClick={() => navigate('/requests')} style={cancelButton}>Cancelar</button>
          <button onClick={submit} disabled={saving} style={submitButton}>
            {saving ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dynamic field renderer ───────────────────────────────────────────────────
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

  if (f.field_type === 'section') {
    let description = f.placeholder ?? '';
    try {
      const config = f.options_json ? JSON.parse(f.options_json) as { description?: string } : null;
      description = config?.description || description;
    } catch { /* usa el placeholder */ }
    return (
      <div style={{ paddingTop: 8, borderBottom: '1px solid #E4E4E7', paddingBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 17, color: '#18181B' }}>{f.label}</h3>
        {description && <p style={{ margin: '5px 0 0', fontSize: 13, color: '#667085' }}>{description}</p>}
      </div>
    );
  }

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: 32, borderBottom: '1px solid #EAECF0' }}>
      <h2 style={{ color: '#0284C7', fontSize: 16, fontWeight: 900, marginBottom: 20 }}>{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6, fontSize: 14, fontWeight: 700, color: '#101828' }}>
      {label}
      {children}
    </label>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#FFF2EC', border: '1px solid #F0997B', color: '#993C1D', borderRadius: 10, padding: 14, fontWeight: 700, marginBottom: 18, fontSize: 14 }}>
      {children}
    </div>
  );
}

const panel: React.CSSProperties = { background: '#fff', border: '1px solid #DDE3EA', borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,.04)' };
const input: React.CSSProperties = { width: '100%', border: '1px solid #CBD5E1', borderRadius: 8, padding: '11px 14px', fontSize: 14, font: 'inherit', background: '#fff', boxSizing: 'border-box' };
const dropZone: React.CSSProperties = { border: '1.5px dashed #CBD5E1', borderRadius: 10, padding: 28, textAlign: 'center', display: 'block', cursor: 'pointer', background: '#FAFAF8' };
const cancelButton: React.CSSProperties = { background: '#fff', color: '#0284C7', border: '1.5px solid #B5D4F4', borderRadius: 8, padding: '11px 24px', fontWeight: 700, cursor: 'pointer', fontSize: 14 };
const submitButton: React.CSSProperties = { background: '#0284C7', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 28px', fontWeight: 900, cursor: 'pointer', fontSize: 14 };
