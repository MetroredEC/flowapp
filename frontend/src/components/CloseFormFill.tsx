import { useEffect, useState } from 'react';
import { api, FormField, RequestClosure } from '../lib/api';
import { Btn, Spinner } from './ui';

interface CloseFormFillProps {
  requestId: string;
  onClosed: () => void;
}

export default function CloseFormFill({ requestId, onClosed }: CloseFormFillProps) {
  const [fields, setFields]     = useState<FormField[]>([]);
  const [closure, setClosure]   = useState<RequestClosure | null>(null);
  const [values, setValues]     = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.getRequestCloseForm(requestId).then(r => {
      setFields(r.data.fields);
      setClosure(r.data.closure);
      if (r.data.closure) {
        try {
          const parsed = JSON.parse(r.data.closure.form_data_json) as Record<string, string>;
          setValues(parsed);
        } catch { /* ignore */ }
      }
    }).finally(() => setLoading(false));
  }, [requestId]);

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><Spinner /></div>;

  // ── Si ya está cerrado ──────────────────────────────────────────────────────
  if (closure) {
    return (
      <ClosureView closure={closure} fields={fields} values={values} />
    );
  }

  // ── Sin campos configurados ─────────────────────────────────────────────────
  if (fields.length === 0) {
    return (
      <div style={{
        border: '1.5px dashed #D4D4D8', borderRadius: 12,
        padding: '28px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
        <div style={{ fontSize: 13, color: '#71717A', marginBottom: 16 }}>
          Este proceso no tiene campos de cierre configurados.
        </div>
        <Btn onClick={async () => {
          setSaving(true);
          try {
            await api.submitRequestClose(requestId, {});
            onClosed();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Error al cerrar');
          } finally { setSaving(false); }
        }} disabled={saving}>
          {saving ? 'Cerrando...' : 'Marcar como cerrado'}
        </Btn>
        {error && <p style={{ color: '#DC2626', fontSize: 13, marginTop: 10 }}>{error}</p>}
      </div>
    );
  }

  // ── Formulario de cierre ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError('');
    // Validate required
    const missing = fields.filter(f => f.required === 1 && !values[f.field_key]?.trim());
    if (missing.length > 0) {
      setError(`Campos requeridos: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      await api.submitRequestClose(requestId, values as Record<string, unknown>);
      onClosed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally { setSaving(false); }
  };

  const set = (key: string, val: string) =>
    setValues(v => ({ ...v, [key]: val }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {fields.map(f => (
        <div key={f.id}>
          <label style={{
            display: 'block', fontSize: 12, fontWeight: 700,
            color: '#52525B', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4,
          }}>
            {f.label}
            {f.required === 1 && <span style={{ color: '#DC2626', marginLeft: 3 }}>*</span>}
          </label>

          {f.field_type === 'text' && (
            <input
              value={values[f.field_key] ?? ''}
              onChange={e => set(f.field_key, e.target.value)}
              placeholder={f.placeholder ?? ''}
              style={inputStyle}
            />
          )}
          {f.field_type === 'textarea' && (
            <textarea
              value={values[f.field_key] ?? ''}
              onChange={e => set(f.field_key, e.target.value)}
              placeholder={f.placeholder ?? ''}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
            />
          )}
          {f.field_type === 'number' && (
            <input
              type="number"
              value={values[f.field_key] ?? ''}
              onChange={e => set(f.field_key, e.target.value)}
              placeholder={f.placeholder ?? '0'}
              style={inputStyle}
            />
          )}
          {f.field_type === 'date' && (
            <input
              type="date"
              value={values[f.field_key] ?? ''}
              onChange={e => set(f.field_key, e.target.value)}
              style={inputStyle}
            />
          )}
          {f.field_type === 'select' && (
            <select
              value={values[f.field_key] ?? ''}
              onChange={e => set(f.field_key, e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">{f.placeholder ?? 'Selecciona...'}</option>
              {f.options_json ? (() => {
                try {
                  return (JSON.parse(f.options_json) as string[]).map(o => (
                    <option key={o} value={o}>{o}</option>
                  ));
                } catch { return null; }
              })() : null}
            </select>
          )}
          {f.field_type === 'checkbox' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={values[f.field_key] === 'true'}
                onChange={e => set(f.field_key, String(e.target.checked))}
                style={{ width: 16, height: 16, accentColor: '#0284C7' }}
              />
              <span style={{ fontSize: 13, color: '#3F3F46' }}>
                {f.placeholder ?? f.label}
              </span>
            </label>
          )}
        </div>
      ))}

      {error && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA',
          color: '#991B1B', borderRadius: 8, padding: '10px 14px', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn onClick={handleSubmit} disabled={saving}>
          {saving ? 'Guardando...' : 'Cerrar proceso'}
        </Btn>
      </div>
    </div>
  );
}

// ── Vista de cierre ya realizado ────────────────────────────────────────────
function ClosureView({ closure, fields, values }: {
  closure: RequestClosure;
  fields: FormField[];
  values: Record<string, string>;
}) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#F0FDF4', border: '1px solid #BBF7D0',
        borderRadius: 10, padding: '12px 16px', marginBottom: 16,
      }}>
        <span style={{ fontSize: 20 }}>·</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>
            Proceso cerrado por {closure.closed_by_name}
          </div>
          <div style={{ fontSize: 11, color: '#16A34A' }}>
            {new Date(closure.closed_at).toLocaleString('es-EC', {
              day: 'numeric', month: 'long', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </div>
        </div>
      </div>

      {fields.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {fields.map(f => (
            <div key={f.id}>
              <div style={{ fontSize: 11, color: '#A1A1AA', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {f.label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#18181B' }}>
                {values[f.field_key]
                  ? (f.field_type === 'checkbox' ? (values[f.field_key] === 'true' ? '✓ Sí' : '✗ No') : values[f.field_key])
                  : <span style={{ color: '#A1A1AA' }}>—</span>
                }
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1.5px solid #E4E4E7',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
  background: '#fff',
  color: '#18181B',
  boxSizing: 'border-box',
};
