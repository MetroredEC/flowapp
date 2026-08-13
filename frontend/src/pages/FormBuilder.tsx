import { useState } from 'react';
import { api, FormField, FormFieldInput, FormFieldType } from '../lib/api';
import { Input, Select, Btn } from '../components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────
type DraftField = FormFieldInput & { _key: number };
let _seq = 0;
const nk = () => ++_seq;

const FIELD_TYPES: { value: FormFieldType; label: string; icon: string }[] = [
  { value: 'text',     label: 'Texto corto',    icon: 'txt' },
  { value: 'textarea', label: 'Texto largo',     icon: '·' },
  { value: 'number',   label: 'Numero',          icon: '123' },
  { value: 'date',     label: 'Fecha',           icon: 'cal' },
  { value: 'select',   label: 'Lista desplegable', icon: '📋' },
  { value: 'checkbox', label: 'Casilla (Si/No)', icon: 'yn' },
];

function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9\s_]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40);
}

function mkField(sort_order = 0): DraftField {
  return {
    _key: nk(), field_key: '', label: '', field_type: 'text',
    placeholder: '', required: 0, options_json: '', sort_order,
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface FormBuilderProps {
  typeId: string;
  typeName: string;
  initialFields?: FormFieldInput[];
  onSaved?: () => void;
  /** Override the default save function (used by close form builder) */
  apiSave?: (typeId: string, fields: FormFieldInput[]) => Promise<{ data: { saved: number } }>;
  /** Label override for the header section */
  formLabel?: string;
}

// Exported helper types for external use
export type { FormField, FormFieldInput };

// ─── Component ────────────────────────────────────────────────────────────────
export default function FormBuilder({ typeId, typeName, initialFields = [], onSaved, apiSave, formLabel }: FormBuilderProps) {
  const [fields, setFields] = useState<DraftField[]>(
    initialFields.length > 0
      ? initialFields.map((f, i) => ({ ...f, _key: nk(), sort_order: i }))
      : []
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  function addField() {
    setFields(fs => [...fs, mkField(fs.length)]);
  }

  function removeField(key: number) {
    setFields(fs => fs.filter(f => f._key !== key).map((f, i) => ({ ...f, sort_order: i })));
  }

  function updateField(key: number, patch: Partial<DraftField>) {
    setFields(fs => fs.map(f => {
      if (f._key !== key) return f;
      const updated = { ...f, ...patch };
      // Auto-generar field_key desde label si no fue editado manualmente
      if ('label' in patch && !('field_key' in patch)) {
        updated.field_key = slugify(patch.label ?? '');
      }
      return updated;
    }));
  }

  function moveUp(key: number) {
    setFields(fs => {
      const idx = fs.findIndex(f => f._key === key);
      if (idx <= 0) return fs;
      const copy = [...fs];
      [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
      return copy.map((f, i) => ({ ...f, sort_order: i }));
    });
  }

  function moveDown(key: number) {
    setFields(fs => {
      const idx = fs.findIndex(f => f._key === key);
      if (idx >= fs.length - 1) return fs;
      const copy = [...fs];
      [copy[idx], copy[idx + 1]] = [copy[idx + 1], copy[idx]];
      return copy.map((f, i) => ({ ...f, sort_order: i }));
    });
  }

  async function handleSave() {
    setMsg('');
    const invalid = fields.find(f => !f.label.trim());
    if (invalid) { setMsg('Todos los campos necesitan una etiqueta.'); return; }
    const withKeys = fields.map((f, i) => ({
      ...f,
      field_key: f.field_key.trim() || slugify(f.label) || 'campo_' + i,
      sort_order: i,
    }));
    setSaving(true);
    try {
      const saveFn = apiSave ?? api.saveFormFields;
      await saveFn(typeId, withKeys);
      setMsg('Formulario guardado.');
      onSaved?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error al guardar.');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {formLabel ?? 'Formulario de ingreso'}
          </div>
          <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
            {typeName} — {fields.length} {fields.length === 1 ? 'campo' : 'campos'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={addField} style={{
            background: '#fff', border: '1px solid #B5D4F4',
            color: '#0284C7', borderRadius: 8, padding: '7px 14px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            + Agregar campo
          </button>
          <Btn onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar formulario'}
          </Btn>
        </div>
      </div>

      {/* Mensaje */}
      {msg && (
        <div style={{
          background: msg === 'Formulario guardado.' ? '#E6F7F1' : '#FFF2EC',
          border: '1px solid ' + (msg === 'Formulario guardado.' ? '#B5E0D0' : '#F0997B'),
          color: msg === 'Formulario guardado.' ? '#1D7A5A' : '#993C1D',
          borderRadius: 8, padding: '8px 14px', fontSize: 13,
        }}>
          {msg}
        </div>
      )}

      {/* Empty state */}
      {fields.length === 0 && (
        <div style={{
          border: '1.5px dashed #D8D6CE', borderRadius: 12,
          padding: 32, textAlign: 'center', color: '#aaa',
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
          <div style={{ fontSize: 13 }}>
            Sin campos configurados. Este proceso usara solo titulo y descripcion.
          </div>
          <button onClick={addField} style={{
            marginTop: 12, background: '#0284C7', color: '#fff',
            border: 'none', borderRadius: 8, padding: '8px 18px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            + Agregar primer campo
          </button>
        </div>
      )}

      {/* Fields */}
      {fields.map((f, idx) => (
        <FieldRow
          key={f._key}
          field={f}
          index={idx}
          total={fields.length}
          onChange={p => updateField(f._key, p)}
          onRemove={() => removeField(f._key)}
          onUp={() => moveUp(f._key)}
          onDown={() => moveDown(f._key)}
        />
      ))}

      {/* Preview */}
      {fields.length > 0 && (
        <FormPreview fields={fields} />
      )}
    </div>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────
function FieldRow({ field: f, index, total, onChange, onRemove, onUp, onDown }: {
  field: DraftField; index: number; total: number;
  onChange: (p: Partial<DraftField>) => void;
  onRemove: () => void; onUp: () => void; onDown: () => void;
}) {
  const typeInfo = FIELD_TYPES.find(t => t.value === f.field_type);
  const [open, setOpen] = useState(true);

  return (
    <div style={{
      border: '1.5px solid #E4E4E7', borderRadius: 10,
      background: '#FAFAF8', overflow: 'hidden',
    }}>
      {/* Row header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', cursor: 'pointer',
      }} onClick={() => setOpen(o => !o)}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: '#0284C7', color: '#fff',
          fontSize: 11, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {index + 1}
        </div>
        <span style={{ fontSize: 14 }}>{typeInfo?.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>
            {f.label || <span style={{ color: '#aaa', fontWeight: 400 }}>Sin etiqueta...</span>}
          </span>
          {f.required === 1 && (
            <span style={{
              marginLeft: 8, fontSize: 10, fontWeight: 800,
              color: '#993C1D', background: '#FFF2EC',
              padding: '1px 6px', borderRadius: 4,
            }}>
              Requerido
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: '#aaa' }}>{typeInfo?.label}</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button disabled={index === 0} onClick={e => { e.stopPropagation(); onUp(); }}
            style={{ background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', color: index === 0 ? '#ddd' : '#888', padding: '2px 4px' }}>
            ▲
          </button>
          <button disabled={index === total - 1} onClick={e => { e.stopPropagation(); onDown(); }}
            style={{ background: 'none', border: 'none', cursor: index === total - 1 ? 'default' : 'pointer', color: index === total - 1 ? '#ddd' : '#888', padding: '2px 4px' }}>
            ▼
          </button>
          <button onClick={e => { e.stopPropagation(); onRemove(); }}
            style={{ background: 'none', border: 'none', color: '#F0997B', cursor: 'pointer', padding: '2px 6px', fontSize: 14 }}>
            ✕
          </button>
        </div>
        <span style={{ color: '#bbb', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Row body */}
      {open && (
        <div style={{ padding: '12px 14px 14px', borderTop: '1px solid #E4E4E7', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Etiqueta *</label>
              <Input
                value={f.label}
                onChange={e => onChange({ label: e.target.value })}
                placeholder="Ej: Codigo de campana"
                style={{ fontSize: 13, padding: '7px 10px', marginTop: 4 }}
              />
            </div>
            <div>
              <label style={lbl}>Tipo de campo</label>
              <Select
                value={f.field_type}
                onChange={e => onChange({ field_type: e.target.value as FormFieldType })}
                style={{ fontSize: 13, padding: '7px 10px', marginTop: 4 }}
              >
                {FIELD_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <label style={lbl}>Clave interna</label>
              <Input
                value={f.field_key}
                onChange={e => onChange({ field_key: e.target.value })}
                placeholder="auto_generado"
                style={{ fontSize: 12, padding: '7px 10px', marginTop: 4, fontFamily: 'monospace', color: '#5A7F9B' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Placeholder / ayuda</label>
              <Input
                value={f.placeholder ?? ''}
                onChange={e => onChange({ placeholder: e.target.value })}
                placeholder="Texto de ayuda para el usuario..."
                style={{ fontSize: 13, padding: '7px 10px', marginTop: 4 }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={lbl}>Obligatorio</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                {[{ v: 1, l: 'Si' }, { v: 0, l: 'No' }].map(opt => (
                  <button
                    key={opt.v}
                    onClick={() => onChange({ required: opt.v })}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 13, fontWeight: 700,
                      cursor: 'pointer',
                      background: f.required === opt.v ? (opt.v ? '#FFF2EC' : '#E6F7F1') : '#fff',
                      color: f.required === opt.v ? (opt.v ? '#993C1D' : '#1D7A5A') : '#888',
                      border: '1px solid ' + (f.required === opt.v ? (opt.v ? '#F0997B' : '#B5E0D0') : '#D8D6CE'),
                    }}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {f.field_type === 'select' && (
            <div>
              <label style={lbl}>Opciones (una por linea)</label>
              <textarea
                value={
                  f.options_json
                    ? (() => { try { return (JSON.parse(f.options_json) as string[]).join('\n'); } catch { return f.options_json; } })()
                    : ''
                }
                onChange={e => {
                  const lines = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
                  onChange({ options_json: JSON.stringify(lines) });
                }}
                placeholder={'Opcion A\nOpcion B\nOpcion C'}
                rows={4}
                style={{
                  width: '100%', border: '1.5px solid #ddd', borderRadius: 8,
                  padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
                  resize: 'vertical', marginTop: 4,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Preview ──────────────────────────────────────────────────────────────────
function FormPreview({ fields }: { fields: DraftField[] }) {
  return (
    <div style={{ border: '1px solid #E6E4DE', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{
        background: '#18181B', padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 0.3 }}>
          VISTA PREVIA
        </span>
      </div>
      <div style={{ padding: '16px', display: 'grid', gap: 14, background: '#FAFAF8' }}>
        {fields.map(f => (
          <div key={f._key}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 6 }}>
              {f.label || 'Sin etiqueta'}
              {f.required === 1 && <span style={{ color: '#993C1D', marginLeft: 4 }}>*</span>}
            </label>
            {f.field_type === 'text' && (
              <input disabled placeholder={f.placeholder ?? ''} style={previewInput} />
            )}
            {f.field_type === 'textarea' && (
              <textarea disabled placeholder={f.placeholder ?? ''} rows={3} style={{ ...previewInput, resize: 'none' }} />
            )}
            {f.field_type === 'number' && (
              <input type="number" disabled placeholder={f.placeholder ?? '0'} style={previewInput} />
            )}
            {f.field_type === 'date' && (
              <input type="date" disabled style={previewInput} />
            )}
            {f.field_type === 'select' && (
              <select disabled style={previewInput}>
                <option>{f.placeholder || 'Selecciona una opcion...'}</option>
                {f.options_json ? (() => {
                  try { return (JSON.parse(f.options_json) as string[]).map(o => <option key={o}>{o}</option>); }
                  catch { return null; }
                })() : null}
              </select>
            )}
            {f.field_type === 'checkbox' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" disabled style={{ width: 16, height: 16 }} />
                <span style={{ fontSize: 13, color: '#555' }}>{f.placeholder || f.label}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: '#666',
  textTransform: 'uppercase', letterSpacing: 0.5,
};
const previewInput: React.CSSProperties = {
  width: '100%', border: '1px solid #D8D6CE', borderRadius: 8,
  padding: '8px 12px', fontSize: 13, background: '#fff',
  color: '#999', boxSizing: 'border-box',
};
