import { useState } from 'react';
import { api } from '../lib/api';

type Line = {
  item_id: string;
  quantity_requested: string;
  notes: string;
};

const CENTERS = [
  ['loc-alborada', 'ALBORADA'],
  ['loc-amazonas', 'AMAZONAS'],
  ['loc-calderon', 'CALDERON'],
  ['loc-carcelen', 'CARCELEN'],
  ['loc-carolina', 'CAROLINA'],
  ['loc-chillos', 'CHILLOS'],
  ['loc-ciudad-celeste', 'CIUDAD-CELESTE'],
  ['loc-condado', 'CONDADO'],
  ['loc-cumbaya', 'CUMBAYA'],
  ['loc-kennedy', 'KENNEDY'],
  ['loc-q-sur', 'Q-SUR'],
  ['loc-admin', 'ADMINISTRACION'],
];

export default function SupplyRequest() {
  const [center, setCenter] = useState('loc-alborada');
  const [requiredDate, setRequiredDate] = useState('');
  const [justification, setJustification] = useState('');
  const [lines, setLines] = useState<Line[]>([
    { item_id: 'item-med-001', quantity_requested: '1', notes: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function updateLine(index: number, patch: Partial<Line>) {
    setLines(prev => prev.map((line, i) => i === index ? { ...line, ...patch } : line));
  }

  function addLine() {
    setLines(prev => [...prev, { item_id: '', quantity_requested: '1', notes: '' }]);
  }

  function removeLine(index: number) {
    setLines(prev => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const cleanLines = lines
        .map(line => ({
          item_id: line.item_id.trim(),
          quantity_requested: Number(line.quantity_requested),
          notes: line.notes.trim(),
        }))
        .filter(line => line.item_id && line.quantity_requested > 0);

      if (!cleanLines.length) {
        throw new Error('Debe ingresar al menos un item con cantidad mayor a cero.');
      }

      const res = await api.createSupplyRequest({
        center_location_id: center,
        required_date: requiredDate || null,
        justification,
        lines: cleanLines,
      });

      setMessage('Solicitud creada: ' + res.data.request_number);
      setJustification('');
      setRequiredDate('');
      setLines([{ item_id: 'item-med-001', quantity_requested: '1', notes: '' }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la solicitud.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 32, display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>Solicitud de suministros</h1>
        <p style={{ color: '#666', fontSize: 14 }}>
          Solicitud de compra de insumos por centro. Al recibir, se cargará automáticamente al Kardex.
        </p>
      </div>

      {message && <Alert kind="ok">{message}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <div style={cardStyle}>
        <h2 style={sectionTitle}>Datos generales</h2>
        <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <Field label="Centro">
            <select value={center} onChange={e => setCenter(e.target.value)} style={inputStyle}>
              {CENTERS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </Field>

          <Field label="Fecha requerida">
            <input type="date" value={requiredDate} onChange={e => setRequiredDate(e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Justificación">
            <input value={justification} onChange={e => setJustification(e.target.value)} placeholder="Ej. reposición semanal" style={inputStyle} />
          </Field>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ ...sectionTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Items solicitados</span>
          <button onClick={addLine} style={smallButton}>+ Agregar item</button>
        </div>

        <div style={{ padding: 18, display: 'grid', gap: 12 }}>
          {lines.map((line, index) => (
            <div key={index} style={{
              display: 'grid',
              gridTemplateColumns: '2fr 120px 2fr 90px',
              gap: 10,
              alignItems: 'end',
            }}>
              <Field label="Item ID">
                <input
                  value={line.item_id}
                  onChange={e => updateLine(index, { item_id: e.target.value })}
                  placeholder="Ej. item-med-001"
                  style={inputStyle}
                />
              </Field>

              <Field label="Cantidad">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.quantity_requested}
                  onChange={e => updateLine(index, { quantity_requested: e.target.value })}
                  style={inputStyle}
                />
              </Field>

              <Field label="Notas">
                <input
                  value={line.notes}
                  onChange={e => updateLine(index, { notes: e.target.value })}
                  placeholder="Opcional"
                  style={inputStyle}
                />
              </Field>

              <button onClick={() => removeLine(index)} style={dangerButton} disabled={lines.length === 1}>
                Quitar
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <button onClick={submit} disabled={saving} style={primaryButton}>
          {saving ? 'Enviando...' : 'Enviar solicitud'}
        </button>
      </div>
    </div>
  );
}

function Alert({ children, kind }: { children: React.ReactNode; kind: 'ok' | 'error' }) {
  return (
    <div style={{
      background: kind === 'ok' ? '#ECFFF6' : '#FFF2EC',
      border: '1px solid ' + (kind === 'ok' ? '#72C7A0' : '#F0997B'),
      color: kind === 'ok' ? '#116B48' : '#993C1D',
      borderRadius: 10,
      padding: 12,
      fontSize: 14,
      fontWeight: 800,
    }}>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#555', fontWeight: 800 }}>
      {label}
      {children}
    </label>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E6E4DE',
  borderRadius: 16,
  overflow: 'hidden',
  boxShadow: '0 8px 24px rgba(0,0,0,.05)',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 900,
  padding: 18,
  borderBottom: '1px solid #ECECEA',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #D8D6CE',
  borderRadius: 8,
  padding: '10px 11px',
  fontSize: 13,
  font: 'inherit',
  background: '#fff',
};

const primaryButton: React.CSSProperties = {
  background: '#0284C7',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '12px 20px',
  fontWeight: 900,
  cursor: 'pointer',
};

const smallButton: React.CSSProperties = {
  background: '#0284C7',
  color: '#fff',
  border: 'none',
  borderRadius: 9,
  padding: '8px 12px',
  fontWeight: 800,
  cursor: 'pointer',
};

const dangerButton: React.CSSProperties = {
  background: '#FFF2EC',
  color: '#993C1D',
  border: '1px solid #F0997B',
  borderRadius: 8,
  padding: '10px 11px',
  fontWeight: 800,
  cursor: 'pointer',
};
