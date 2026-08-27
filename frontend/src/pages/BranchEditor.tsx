// Ramificación por respuesta.
//
// Responde una pregunta distinta a la de "Mostrar solo si": aquella decide si
// una pregunta aplica, esta decide a dónde va el formulario después de
// responderla. Se pueden usar juntas, y de eso salen los árboles de varios
// niveles.
//
// Dos reglas de seguridad, ambas impuestas por la interfaz y no solo por el
// motor: el destino siempre está más adelante, para que el formulario no pueda
// entrar en bucle; y solo se ofrece en preguntas con opciones, porque saltar
// según un texto libre no es algo que se pueda configurar de forma fiable.

import type { FieldBranchConfig, WizardField } from '../lib/api';

export const BRANCH_END = '__end__';

export function BranchEditor({ field, following, color, onChange }: {
  field: WizardField;
  /** Preguntas posteriores: los únicos destinos válidos. */
  following: WizardField[];
  color: string;
  onChange: (patch: Partial<WizardField>) => void;
}) {
  const hasOptions = ['radio', 'select', 'checkbox_group'].includes(field.type)
    && (field.options?.length ?? 0) > 0;

  if (!hasOptions) return null;

  if (following.length === 0) {
    return (
      <div style={{ fontSize: 11.5, color: '#A1A1AA', marginBottom: 14 }}>
        Es la última pregunta, así que no hay a dónde ramificar.
      </div>
    );
  }

  const branch = field.branch;
  const options = field.options ?? [];

  const setRule = (value: string, goto: string) => {
    const rest = (branch?.rules ?? []).filter(rule => rule.value !== value);
    const rules = goto ? [...rest, { value, goto }] : rest;
    // Se preserva el orden de las opciones: en selección múltiple gana la
    // primera regla que coincide, así que el orden visible debe ser el real.
    rules.sort((a, b) => options.indexOf(a.value) - options.indexOf(b.value));
    const next: FieldBranchConfig = { rules, default: branch?.default ?? null };
    onChange({ branch: rules.length || next.default ? next : undefined });
  };

  const setDefault = (goto: string) => {
    const next: FieldBranchConfig = { rules: branch?.rules ?? [], default: goto || null };
    onChange({ branch: next.rules.length || next.default ? next : undefined });
  };

  const gotoOf = (value: string) =>
    branch?.rules.find(rule => rule.value === value)?.goto ?? '';

  const targets = (
    <>
      <option value="">Sigue con la siguiente pregunta</option>
      {following.map(item => (
        <option key={item.id} value={item.id}>
          Ir a: {item.label || 'Pregunta sin título'}
        </option>
      ))}
      <option value={BRANCH_END}>Terminar el formulario</option>
    </>
  );

  const active = branch?.rules.length ?? 0;

  return (
    <div style={{
      border: `1px solid ${color}40`, background: color + '06',
      borderRadius: 10, padding: 12, marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{
          fontSize: 11, fontWeight: 800, color,
          textTransform: 'uppercase', letterSpacing: 0.5, flex: 1,
        }}>
          Según la respuesta, ir a
        </span>
        {active > 0 && (
          <button
            onClick={() => onChange({ branch: undefined })}
            style={{ border: 'none', background: 'none', color: '#A1A1AA', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
          >Quitar ramificación</button>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#A1A1AA', marginBottom: 10 }}>
        Los destinos siempre van hacia adelante, para que el formulario no pueda dar vueltas.
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {options.map(option => (
          <div key={option} style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#3F3F46' }}>
              Si responde “{option}”
            </span>
            <select value={gotoOf(option)} onChange={e => setRule(option, e.target.value)} style={select}>
              {targets}
            </select>
          </div>
        ))}

        <div style={{ display: 'grid', gap: 4, borderTop: '1px solid #E4E4E7', paddingTop: 9, marginTop: 3 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#71717A' }}>
            Para cualquier otra respuesta
          </span>
          <select value={branch?.default ?? ''} onChange={e => setDefault(e.target.value)} style={select}>
            {targets}
          </select>
        </div>
      </div>

      {field.type === 'checkbox_group' && active > 1 && (
        <div style={{ fontSize: 10.5, color: '#B45309', marginTop: 9 }}>
          Como se pueden marcar varias opciones, si coinciden dos reglas manda la de más arriba.
        </div>
      )}
    </div>
  );
}

const select: React.CSSProperties = {
  border: '1px solid #E4E4E7', borderRadius: 8, padding: '8px 10px',
  fontSize: 12, fontFamily: 'inherit', background: '#fff', color: '#3F3F46', outline: 'none',
};
