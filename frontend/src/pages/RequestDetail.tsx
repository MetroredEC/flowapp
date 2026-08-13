import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, RequestDetail as RD } from '../lib/api';
import {
  Card, PageHeader, StatusBadge, StepBadge, Spinner, Btn, LevelStepper, Field, Input
} from '../components/ui';
import CloseFormFill from '../components/CloseFormFill';
import { confirmDialog, alertDialog, promptDialog } from '../components/AppDialog';
import { useIsMobile } from '../lib/useIsMobile';

const API = String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile(900);
  const [data, setData]           = useState<RD | null>(null);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showCampaign, setShowCampaign] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
    api.getRequest(id).then(r => setData(r.data)).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    try {
      await api.uploadFile(id, file);
      load();
    } catch (err) {
      await alertDialog({ title: 'No se pudo subir el archivo', message: (err as Error).message, tone: 'danger' });
    } finally {
      setUploading(false);
    }
  };

  if (loading || !data) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <Spinner size={32} />
    </div>
  );

  const canCancel = ['pending','in_progress'].includes(data.status);
  const isDraft = data.status === 'draft';

  return (
    <div style={{ padding: isMobile ? 16 : 32, maxWidth: 1040, margin: '0 auto' }}>
      <PageHeader
        title={data.title}
        subtitle={`${data.request_type_name} · ${data.requester_name}`}
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            {isDraft && (
              <Btn onClick={async () => {
                try {
                  await api.submitRequest(data.id);
                  await alertDialog({ title: 'Solicitud enviada', message: 'El aprobador fue notificado.', tone: 'success' });
                  load();
                } catch (err) {
                  await alertDialog({ title: 'No se pudo enviar', message: (err as Error).message, tone: 'danger' });
                }
              }}>Enviar solicitud</Btn>
            )}
            {canCancel && (
              <Btn variant="danger" onClick={async () => {
                // Un borrador es privado; cancelar algo que ya movió a un
                // aprobador exige explicar por qué (el backend lo valida igual).
                const isDraft = data.status === 'draft';
                let reason = '';
                if (isDraft) {
                  const ok = await confirmDialog({
                    title: '¿Cancelar este borrador?',
                    message: 'El borrador quedará cancelado y no se enviará a aprobación.',
                    confirmLabel: 'Cancelar borrador', cancelLabel: 'Volver', danger: true,
                  });
                  if (!ok) return;
                } else {
                  const answer = await promptDialog({
                    title: '¿Por qué cancelas la solicitud?',
                    message: 'Quien ya la revisó verá tu explicación en la línea de tiempo.',
                    confirmLabel: 'Cancelar solicitud', cancelLabel: 'Volver',
                    danger: true, minLength: 10,
                  });
                  if (answer === null) return;
                  reason = answer;
                }
                try {
                  await api.cancelRequest(data.id, reason);
                  navigate('/solicitudes');
                } catch (err) {
                  await alertDialog({ title: 'No se pudo cancelar', message: (err as Error).message, tone: 'danger' });
                }
              }}>Cancelar</Btn>
            )}
            <Btn variant="secondary" onClick={() => navigate(-1)}>Volver</Btn>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 320px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700 }}>Detalle</h2>
              <StatusBadge status={data.status} />
            </div>
            <p style={{ fontSize: 14, color: '#444', lineHeight: 1.6, marginBottom: 16 }}>
              {data.description}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <InfoRow label="Tipo"        value={data.request_type_name} />
              <InfoRow label="Solicitante" value={data.requester_name} />
              <InfoRow label="Creada"
                value={new Date(data.created_at).toLocaleDateString('es-EC', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })} />
              <InfoRow label="Actualizada"
                value={new Date(data.updated_at).toLocaleDateString('es-EC', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })} />
              <InfoRow label="Versión del proceso" value={data.process_version ? `v${data.process_version}` : 'Proceso anterior'} />
              <InfoRow label="SLA" value={slaLabel(data.sla_due_at, data.closed_at)} />
            </div>
            {data.linked_task && (
              <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: '#F0F9FF', border: '1px solid #BAE6FD', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#075985' }}>Trabajo del área</div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                    {data.linked_task.assignee_name ? `Responsable: ${data.linked_task.assignee_name}` : 'Pendiente de asignación'}
                  </div>
                </div>
                <Btn variant="secondary" onClick={() => navigate(`/espacio/${data.linked_task?.space_id}`)}>Ver tablero</Btn>
              </div>
            )}
          </Card>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700 }}>Línea de tiempo</h2>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>{data.timeline?.length ?? 0} eventos</span>
            </div>
            {(data.timeline ?? []).length === 0 ? (
              <p style={{ fontSize: 13, color: '#94A3B8' }}>Todavía no hay actividad registrada.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(data.timeline ?? []).map((event, index) => (
                  <div key={event.id} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', gap: 12, minHeight: 58 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: eventColor(event.event_type), marginTop: 5, flexShrink: 0 }} />
                      {index < data.timeline.length - 1 && <div style={{ width: 1, flex: 1, background: '#E2E8F0', marginTop: 4 }} />}
                    </div>
                    <div style={{ paddingBottom: 16, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 750, color: '#1E293B' }}>{event.title}</div>
                      <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 3 }}>
                        {event.actor_name || 'FlowApp'} · {new Date(event.created_at).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                      {Boolean(event.detail?.comment) && <div style={{ fontSize: 12, color: '#475569', marginTop: 5, fontStyle: 'italic' }}>{String(event.detail?.comment)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700 }}>Archivos adjuntos</h2>
              <label style={{
                background: '#E6F1FB', color: '#0284C7', fontSize: 12, fontWeight: 600,
                padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
              }}>
                {uploading ? 'Subiendo...' : '+ Adjuntar'}
                <input type="file" style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
            {data.attachments.length === 0 ? (
              <p style={{ fontSize: 13, color: '#aaa' }}>Sin archivos adjuntos</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.attachments.map(a => (
                  <a key={a.id}
                    href={`${API}/api/files/${encodeURIComponent((a as any).r2_key || a.id)}`}
                    target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', background: '#F8F8F6', borderRadius: 8,
                      textDecoration: 'none' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#888' }}>DOC</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0284C7',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.filename}
                      </div>
                      <div style={{ fontSize: 11, color: '#aaa' }}>
                        {(a.size_bytes / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    {a.is_selected === 1 && (
                      <span style={{ fontSize: 11, background: '#E1F5EE', color: '#085041',
                        padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>Seleccionada</span>
                    )}
                  </a>
                ))}
              </div>
            )}
          </Card>

          {data.request_type_name === 'Marketing' && (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700 }}>Costo de campana</h2>
                {!data.campaign_cost && data.status === 'approved' && (
                  <Btn variant="secondary" onClick={() => setShowCampaign(true)}>+ Registrar costo</Btn>
                )}
              </div>
              {data.campaign_cost ? (
                <CampaignCostView cost={data.campaign_cost} />
              ) : showCampaign ? (
                <CampaignCostForm requestId={data.id} onSaved={load} />
              ) : (
                <p style={{ fontSize: 13, color: '#aaa' }}>
                  {data.status === 'approved'
                    ? 'Solicitud aprobada. Registra el costo de campana.'
                    : 'El costo de campana se registra al completar la aprobacion.'}
                </p>
              )}
            </Card>
          )}

          {/* ── Cierre de proceso ─────────────────────────────────────────── */}
          {data.status === 'approved' && (
            <Card style={{
              border: data.closure
                ? '1.5px solid #A7F3D0'
                : '1.5px solid #DDD6FE',
              background: data.closure ? '#F0FDF4' : '#FAFAF8',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: data.closure
                    ? 'linear-gradient(135deg, #10B981, #059669)'
                    : 'linear-gradient(135deg, #0284C7, #4F46E5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 16 }}>{data.closure ? '✅' : '📋'}</span>
                </div>
                <div>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: '#18181B', margin: 0 }}>
                    {data.closure ? 'Proceso cerrado' : 'Cierre del proceso'}
                  </h2>
                  <p style={{ fontSize: 12, color: '#71717A', margin: 0, marginTop: 2 }}>
                    {data.closure
                      ? 'El solicitante ha completado el formulario de cierre.'
                      : 'La solicitud fue aprobada. Completa el formulario de cierre para finalizar el proceso.'}
                  </p>
                </div>
              </div>
              <CloseFormFill
                requestId={data.id}
                onClosed={load}
              />
            </Card>
          )}
        </div>

        <Card style={{ alignSelf: 'start', order: isMobile ? -1 : 0 }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Flujo de aprobacion</h2>
            <LevelStepper
              current={data.current_level}
              total={data.total_levels}
              steps={data.steps?.map(s => ({
                level: s.level, approver_name: s.approver_name, status: s.status
              }))}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
            {data.steps?.map(step => (
              <div key={step.id} style={{
                padding: '12px 14px', background: '#F8F8F6', borderRadius: 8,
                borderLeft: `3px solid ${
                  step.status === 'approved' ? '#10B981' :
                  step.status === 'rejected' ? '#D85A30' :
                  step.level === data.current_level ? '#0284C7' : '#D3D1C7'
                }`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>
                    Nivel {step.level} - {step.label}
                  </span>
                  <StepBadge status={step.status} />
                </div>
                <div style={{ fontSize: 13, color: '#333' }}>{step.approver_name}</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>{step.approver_email}</div>
                {step.comment && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: '#fff',
                    borderRadius: 6, fontSize: 12, color: '#555', fontStyle: 'italic' }}>
                    "{step.comment}"
                  </div>
                )}
                {step.decided_at && (
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 6 }}>
                    {new Date(step.decided_at).toLocaleString('es-EC')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function slaLabel(dueAt?: string | null, closedAt?: string | null): string {
  if (!dueAt) return 'Se calcula al enviar';
  const due = new Date(dueAt);
  if (closedAt) return new Date(closedAt) <= due ? 'Cumplido' : 'Cerrado fuera de SLA';
  const diffDays = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  if (diffDays < 0) return `Vencido hace ${Math.abs(diffDays)} día${Math.abs(diffDays) === 1 ? '' : 's'}`;
  if (diffDays === 0) return 'Vence hoy';
  return `Vence en ${diffDays} día${diffDays === 1 ? '' : 's'}`;
}

function eventColor(type: string): string {
  if (type.includes('rejected') || type.includes('cancelled')) return '#DC2626';
  if (type.includes('approved') || type.includes('completed') || type.includes('closed')) return '#059669';
  if (type.includes('assigned') || type.includes('submitted')) return '#0284C7';
  return '#94A3B8';
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{value}</div>
    </div>
  );
}

function CampaignCostView({ cost }: { cost: NonNullable<RD['campaign_cost']> }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <InfoRow label="Codigo de campana"    value={cost.campaign_code} />
        <InfoRow label="Monto total"          value={`${cost.currency} ${cost.total_amount.toLocaleString('es-EC')}`} />
        <InfoRow label="Fecha de ejecucion"   value={cost.execution_date} />
        <InfoRow label="Fecha de facturacion" value={cost.billing_date} />
      </div>
      {cost.vendors?.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>Proveedores</div>
          {cost.vendors.map((v, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
              padding: '8px 0', borderBottom: '1px solid #F9F9FB', fontSize: 13 }}>
              <span style={{ color: '#333' }}>{v.vendor_name}
                {v.is_selected === 1 && (
                  <span style={{ marginLeft: 6, fontSize: 11, background: '#E1F5EE',
                    color: '#085041', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>
                    Seleccionado
                  </span>
                )}
              </span>
              <span style={{ fontWeight: 700, color: '#0284C7' }}>
                {cost.currency} {v.amount.toLocaleString('es-EC')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignCostForm({ requestId, onSaved }: { requestId: string; onSaved: () => void }) {
  const [form, setForm] = useState({
    campaign_code: '', total_amount: '', currency: 'USD',
    execution_date: '', billing_date: '', notes: '',
  });
  const [vendors, setVendors] = useState([
    { vendor_name: '', amount: '', is_selected: true },
    { vendor_name: '', amount: '', is_selected: false },
  ]);
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.saveCampaignCost({
        request_id:     requestId,
        campaign_code:  form.campaign_code,
        total_amount:   parseFloat(form.total_amount),
        currency:       form.currency,
        execution_date: form.execution_date,
        billing_date:   form.billing_date,
        notes:          form.notes || undefined,
        vendors: vendors
          .filter(v => v.vendor_name && v.amount)
          .map(v => ({ vendor_name: v.vendor_name, amount: parseFloat(v.amount), is_selected: v.is_selected })),
      });
      onSaved();
    } catch (err) {
      await alertDialog({ title: 'No se pudo guardar', message: (err as Error).message, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Codigo de campana">
          <Input value={form.campaign_code} onChange={e => set('campaign_code', e.target.value)}
            placeholder="MKT-2026-001" />
        </Field>
        <Field label="Monto total">
          <Input type="number" value={form.total_amount} onChange={e => set('total_amount', e.target.value)}
            placeholder="0.00" />
        </Field>
        <Field label="Fecha de ejecucion">
          <Input type="date" value={form.execution_date} onChange={e => set('execution_date', e.target.value)} />
        </Field>
        <Field label="Fecha de facturacion">
          <Input type="date" value={form.billing_date} onChange={e => set('billing_date', e.target.value)} />
        </Field>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 10 }}>Proveedores</div>
        {vendors.map((v, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <Input placeholder="Nombre del proveedor" value={v.vendor_name}
              onChange={e => setVendors(vs => vs.map((x, j) => j === i ? { ...x, vendor_name: e.target.value } : x))}
              style={{ flex: 2 }} />
            <Input type="number" placeholder="Monto" value={v.amount}
              onChange={e => setVendors(vs => vs.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
              style={{ flex: 1 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
              <input type="radio" name="selected_vendor" checked={v.is_selected}
                onChange={() => setVendors(vs => vs.map((x, j) => ({ ...x, is_selected: j === i })))} />
              Seleccionado
            </label>
          </div>
        ))}
        <button onClick={() => setVendors(v => [...v, { vendor_name: '', amount: '', is_selected: false }])}
          style={{ fontSize: 12, color: '#0284C7', background: 'none', border: 'none', cursor: 'pointer' }}>
          + Agregar proveedor
        </button>
      </div>
      <Btn onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar costo de campana'}</Btn>
    </div>
  );
}
