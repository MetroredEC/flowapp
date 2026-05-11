import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, RequestType } from '../lib/api';
import { Card, PageHeader, Btn, Field, Input, Textarea, Select, Spinner } from '../components/ui';

export default function NewRequest() {
  const navigate = useNavigate();
  const [types, setTypes]       = useState<RequestType[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [files, setFiles]       = useState<File[]>([]);
  const [form, setForm]         = useState({
    request_type_id: '', title: '', description: '',
  });
  const [errors, setErrors]     = useState<Record<string, string>>({});

  useEffect(() => {
    api.getRequestTypes()
      .then(r => { setTypes(r.data.filter(t => t.is_active)); })
      .finally(() => setLoading(false));
  }, []);

  const set = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => { const n = { ...e }; delete n[k]; return n; });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.request_type_id) e.request_type_id = 'Selecciona un tipo';
    if (!form.title.trim())    e.title = 'El t­tulo es requerido';
    if (!form.description.trim()) e.description = 'La descripci³n es requerida';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const { data } = await api.createRequest({
        request_type_id: form.request_type_id,
        title:           form.title.trim(),
        description:     form.description.trim(),
      });
      // Subir archivos adjuntos
      for (const file of files) {
        await api.uploadFile(data.id, file);
      }
      // Confirmar y enviar (activa el flujo y env­a correo con adjuntos)
      await api.submitRequest(data.id);
      navigate(`/requests/${data.id}`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    setFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';
  };
  const removeFile = (i: number) => setFiles(prev => prev.filter((_, j) => j !== i));

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <Spinner size={32} />
    </div>
  );

  const selectedType = types.find(t => t.id === form.request_type_id);
  const isMarketing  = selectedType?.name === 'Marketing';

  return (
    <div style={{ padding: 32, maxWidth: 720, margin: '0 auto' }}>
      <PageHeader title="Nueva solicitud" subtitle="Completa la informaci³n y adjunta los respaldos" />

      <Card>
        <Field label="Tipo de solicitud" hint={errors.request_type_id}>
          <Select
            value={form.request_type_id}
            onChange={e => set('request_type_id', e.target.value)}
            style={{ borderColor: errors.request_type_id ? '#D85A30' : undefined }}
          >
            <option value="">Selecciona un tipo¦</option>
            {types.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
          {errors.request_type_id && (
            <p style={{ fontSize: 12, color: '#D85A30', marginTop: 4 }}>{errors.request_type_id}</p>
          )}
        </Field>

        <Field label="T­tulo de la solicitud">
          <Input
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Ej: Campaa BTL Q1 2026  Quito"
            style={{ borderColor: errors.title ? '#D85A30' : undefined }}
          />
          {errors.title && (
            <p style={{ fontSize: 12, color: '#D85A30', marginTop: 4 }}>{errors.title}</p>
          )}
        </Field>

        <Field label="Descripci³n y justificaci³n">
          <Textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Explica el objetivo, justificaci³n y alcance de la solicitud¦"
            style={{ minHeight: 120, borderColor: errors.description ? '#D85A30' : undefined }}
          />
          {errors.description && (
            <p style={{ fontSize: 12, color: '#D85A30', marginTop: 4 }}>{errors.description}</p>
          )}
        </Field>

        {/* Adjuntos */}
        <Field label="Archivos de respaldo" hint="PDFs, im¡genes, cotizaciones. M¡x 20 MB por archivo.">
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
            border: '1.5px dashed #ccc', borderRadius: 8, cursor: 'pointer',
            color: '#888', fontSize: 13, background: '#FAFAFA',
          }}>
            <span style={{ fontSize: 18 }}>°Å½</span>
            Adjuntar archivos
            <input type="file" multiple style={{ display: 'none' }} onChange={addFiles}
              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv" />
          </label>
          {files.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {files.map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', background: '#F8F8F6', borderRadius: 7,
                }}>
                  <span style={{ fontSize: 16 }}>°</span>
                  <span style={{ flex: 1, fontSize: 13, color: '#333',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name}
                  </span>
                  <span style={{ fontSize: 12, color: '#aaa' }}>
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                  <button onClick={() => removeFile(i)}
                    style={{ background: 'none', border: 'none', color: '#D85A30',
                      cursor: 'pointer', fontSize: 14, padding: 2 }}></button>
                </div>
              ))}
            </div>
          )}
        </Field>

        {/* Info de flujo */}
        {selectedType && (
          <div style={{
            padding: '12px 16px', background: '#E6F1FB', borderRadius: 8,
            marginBottom: 20, fontSize: 13, color: '#0C447C',
          }}>
            La solicitud de tipo <strong>{selectedType.name}</strong> seguir¡ el flujo de aprobaci³n
            configurado de hasta 4 niveles.
            {isMarketing && ' Al finalizar la aprobaci³n podr¡s registrar el costo de campaa con desglose por proveedor.'}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <Btn variant="secondary" onClick={() => navigate(-1)}>Cancelar</Btn>
          <Btn onClick={submit} disabled={saving}>
            {saving ? 'Enviando¦' : 'Enviar solicitud  '}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
