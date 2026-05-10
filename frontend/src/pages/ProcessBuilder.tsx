import { useEffect, useState } from 'react';
import { api, type ProcessBlueprint } from '../lib/api';

export default function ProcessBuilder() {
  const [items, setItems] = useState<ProcessBlueprint[]>([]);
  const [name, setName] = useState('Nuevo proceso');
  const [sourceText, setSourceText] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    const res = await api.processBlueprints();
    setItems(res.data);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createAndAnalyze() {
    const created = await api.createProcessBlueprint({
      name,
      source_text: sourceText,
    });

    await api.analyzeProcessBlueprint(created.data.id);
    setMessage('Proceso creado y analizado.');
    setSourceText('');
    await load();
  }

  async function deploy(id: string) {
    await api.deployProcessBlueprint(id);
    setMessage('Proceso desplegado.');
    await load();
  }

  return (
    <div style={{ padding: 32, display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Constructor de procesos</h1>
        <p style={{ color: '#666' }}>
          Describe un proceso, genera una propuesta y despliégala al motor BPM.
        </p>
      </div>

      {message && (
        <div style={{ background: '#ECFFF6', color: '#116B48', padding: 12, borderRadius: 10, fontWeight: 800 }}>
          {message}
        </div>
      )}

      <section style={card}>
        <h2 style={title}>Nuevo proceso</h2>

        <div style={{ padding: 18, display: 'grid', gap: 12 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={input}
            placeholder="Nombre del proceso"
          />

          <textarea
            value={sourceText}
            onChange={e => setSourceText(e.target.value)}
            style={{ ...input, minHeight: 160 }}
            placeholder="Ej. El solicitante crea la solicitud, compras cotiza, contabilidad valida presupuesto, compras despacha y el solicitante recibe."
          />

          <button onClick={createAndAnalyze} disabled={!sourceText.trim()} style={button}>
            Crear y analizar
          </button>
        </div>
      </section>

      <section style={card}>
        <h2 style={title}>Procesos creados</h2>

        <div style={{ display: 'grid' }}>
          {items.map(bp => (
            <div key={bp.id} style={{ padding: 16, borderBottom: '1px solid #EEE', display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <strong>{bp.name}</strong>
                <span>{bp.status}</span>
              </div>

              <pre style={{
                background: '#F8FAFC',
                padding: 12,
                borderRadius: 8,
                overflow: 'auto',
                fontSize: 12,
                maxHeight: 220,
              }}>
                {bp.proposed_process_json || 'Sin propuesta'}
              </pre>

              <button onClick={() => deploy(bp.id)} disabled={bp.status === 'deployed'} style={button}>
                Desplegar
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E6E4DE',
  borderRadius: 16,
  overflow: 'hidden',
  boxShadow: '0 8px 24px rgba(0,0,0,.05)',
};

const title: React.CSSProperties = {
  padding: 18,
  borderBottom: '1px solid #ECECEA',
  fontSize: 16,
  fontWeight: 900,
};

const input: React.CSSProperties = {
  width: '100%',
  border: '1px solid #D8D6CE',
  borderRadius: 8,
  padding: '10px 11px',
  font: 'inherit',
};

const button: React.CSSProperties = {
  background: '#185FA5',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '11px 16px',
  fontWeight: 900,
  cursor: 'pointer',
};
