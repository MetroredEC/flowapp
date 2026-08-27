// Cómo se ve y se responde cada pregunta.
//
// Las opciones son tarjetas grandes con atajo numérico, no radios diminutos:
// se aciertan al primer intento en móvil y se responden sin soltar el teclado
// en escritorio. El resto de campos comparten foco, tamaño y ritmo.

import type { FormField } from '../../lib/api';
import type { FieldValue } from './conditions';
import { F, inputStyle } from './flowTheme';

function parseOptions(field: FormField): string[] {
  try {
    const parsed = field.options_json ? JSON.parse(field.options_json) as unknown : null;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

function fileConfig(field: FormField): { accept?: string; maxFiles?: number } {
  try {
    const parsed = field.options_json ? JSON.parse(field.options_json) as unknown : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as { accept?: string; maxFiles?: number } : {};
  } catch { return {}; }
}

function Label({ field, hint }: { field: FormField; hint?: string }) {
  const showHint = hint || (field.placeholder && !['text', 'textarea', 'number', 'date', 'email'].includes(field.field_type));
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 750, color: F.ink, letterSpacing: -0.2, lineHeight: 1.35 }}>
        {field.label}
        {field.required === 1 && <span style={{ color: F.brand, marginLeft: 5 }}>*</span>}
      </div>
      {showHint && (
        <div style={{ fontSize: 13.5, color: F.ink3, marginTop: 4 }}>{hint || field.placeholder}</div>
      )}
    </div>
  );
}

/** Tarjeta de opción. El número es también su atajo de teclado. */
function OptionCard({ label, index, selected, multiple, numbered, onPick }: {
  label: string; index: number; selected: boolean; multiple: boolean;
  /** Solo se numera cuando TODAS las opciones caben en 1-9: mezclar
   *  numeradas y sin numerar se ve como si algo estuviera roto. */
  numbered: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className="fw-opt"
      style={{
        display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left',
        padding: '14px 16px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
        border: `1.5px solid ${selected ? F.brand : F.line}`,
        background: selected ? 'rgba(2,132,199,.06)' : F.surface,
      }}
    >
      <span style={{
        width: 26, height: 26, flexShrink: 0, borderRadius: multiple ? 7 : 99,
        display: 'grid', placeItems: 'center',
        border: `1.5px solid ${selected ? F.brand : F.line}`,
        background: selected ? F.brand : F.surface,
        color: selected ? '#fff' : F.ink3, fontSize: 11.5, fontWeight: 800,
      }}>
        {selected ? <span className="fw-check">✓</span> : numbered ? index + 1 : ''}
      </span>
      <span style={{ fontSize: 15, color: F.ink, fontWeight: selected ? 700 : 550 }}>{label}</span>
    </button>
  );
}

export function QuestionField({ field, value, files, onChange, onFiles, autoFocus, shortcuts }: {
  field: FormField;
  value: FieldValue;
  files: File[];
  onChange: (value: FieldValue) => void;
  onFiles: (files: File[]) => void;
  autoFocus?: boolean;
  /** Los atajos solo actúan sobre una pregunta a la vez; si la pantalla trae
   *  varias, no se anuncian: prometer una tecla que no responde es peor que
   *  no ofrecerla. */
  shortcuts?: boolean;
}) {
  // Opción única y múltiple: tarjetas.
  if (field.field_type === 'radio' || field.field_type === 'select' || field.field_type === 'checkbox_group') {
    const options = parseOptions(field);
    const multiple = field.field_type === 'checkbox_group';
    const selected = Array.isArray(value) ? value : [];
    const numbered = Boolean(shortcuts) && options.length <= 9;

    return (
      <div>
        <Label field={field} hint={multiple ? 'Puedes elegir varias' : undefined} />
        <div style={{ display: 'grid', gap: 9 }} role={multiple ? 'group' : 'radiogroup'}>
          {options.map((option, index) => (
            <OptionCard
              key={option} label={option} index={index} multiple={multiple} numbered={numbered}
              selected={multiple ? selected.includes(option) : value === option}
              onPick={() => {
                if (!multiple) { onChange(option); return; }
                onChange(selected.includes(option)
                  ? selected.filter(item => item !== option)
                  : [...selected, option]);
              }}
            />
          ))}
          {options.length === 0 && (
            <div style={{ fontSize: 13, color: F.ink3 }}>Esta pregunta no tiene opciones configuradas.</div>
          )}
        </div>
        {numbered && options.length > 1 && (
          <div style={{ fontSize: 11.5, color: F.ink3, marginTop: 10 }}>
            Puedes usar las teclas 1 a {options.length} para elegir.
          </div>
        )}
      </div>
    );
  }

  // Sí / no.
  if (field.field_type === 'checkbox') {
    return (
      <div>
        <Label field={field} />
        <div style={{ display: 'grid', gap: 9 }}>
          <OptionCard label="Sí" index={0} multiple={false} numbered={false} selected={value === true} onPick={() => onChange(true)} />
          <OptionCard label="No" index={1} multiple={false} numbered={false} selected={value === false} onPick={() => onChange(false)} />
        </div>
      </div>
    );
  }

  // Archivos.
  if (field.field_type === 'file') {
    const config = fileConfig(field);
    const maxFiles = Math.max(1, config.maxFiles || 5);
    return (
      <div>
        <Label field={field} hint={`Hasta ${maxFiles} archivo(s), 20 MB cada uno`} />
        <label
          className="fw-card"
          style={{
            display: 'block', border: `1.5px dashed ${F.line}`, borderRadius: 14,
            padding: 26, textAlign: 'center', cursor: 'pointer', background: F.sunken,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: F.brand }}>Elegir archivos</div>
          <div style={{ fontSize: 12.5, color: F.ink3, marginTop: 4 }}>o arrástralos aquí</div>
          <input
            type="file" multiple accept={config.accept} style={{ display: 'none' }}
            onChange={event => {
              onFiles([...files, ...Array.from(event.target.files ?? [])].slice(0, maxFiles));
              event.target.value = '';
            }}
          />
        </label>
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="fw-pop" style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px',
              background: F.surface, border: `1px solid ${F.line}`, borderRadius: 10,
            }}>
              <span style={{ fontSize: 13.5, color: F.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name}
              </span>
              <span style={{ fontSize: 11, color: F.ink3 }}>{Math.max(1, Math.round(file.size / 1024))} KB</span>
              <button
                type="button"
                onClick={() => onFiles(files.filter((_, i) => i !== index))}
                style={{ border: 0, background: 'none', color: F.danger, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
              >Quitar</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Texto largo.
  if (field.field_type === 'textarea') {
    return (
      <div>
        <Label field={field} />
        <textarea
          className="fw-input" autoFocus={autoFocus} rows={5}
          value={String(value ?? '')} onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? ''}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 120, lineHeight: 1.55 }}
        />
      </div>
    );
  }

  // Texto, número, fecha, correo.
  return (
    <div>
      <Label field={field} />
      <input
        className="fw-input" autoFocus={autoFocus}
        type={field.field_type === 'number' ? 'number'
          : field.field_type === 'date' ? 'date'
          : field.field_type === 'email' ? 'email' : 'text'}
        value={String(value ?? '')} onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder ?? ''}
        style={inputStyle}
      />
    </div>
  );
}

/** Atajos 1 a 9 para elegir opción sin soltar el teclado. */
export function optionShortcut(field: FormField, key: string, value: FieldValue): FieldValue | null {
  if (!/^[1-9]$/.test(key)) return null;
  if (!['radio', 'select', 'checkbox_group'].includes(field.field_type)) return null;
  const options = parseOptions(field);
  const option = options[Number(key) - 1];
  if (!option) return null;

  if (field.field_type !== 'checkbox_group') return option;
  const selected = Array.isArray(value) ? value : [];
  return selected.includes(option) ? selected.filter(item => item !== option) : [...selected, option];
}
