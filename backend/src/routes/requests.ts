import { Hono } from 'hono';
import { AppEnv } from '../types';
import { notifyApprover, createRequestWithSteps } from '../utils/approvals';
import { startProcessByKey } from '../utils/bpm-engine';

const router = new Hono<AppEnv>();

// GET /requests - listar solicitudes
router.get('/', async (c) => {
 const { status, type, q } = c.req.query();
 const userId = c.get('userId');
 const roles = c.get('userRoles');
 const isAdmin = isPrivileged(roles);

 let sql = `SELECT r.*,
  (SELECT COUNT(*) FROM attachments WHERE request_id = r.id) as attachment_count,
  (SELECT json_group_array(json_object(
   'level', level, 'approver_name', approver_name, 'status', status, 'decided_at', decided_at
  )) FROM approval_steps WHERE request_id = r.id ORDER BY level) as steps
  FROM requests r WHERE 1=1`;
 const params: unknown[] = [];

 if (!isAdmin) { sql += ' AND r.requester_id = ?'; params.push(userId); }
 if (status) { sql += ' AND r.status = ?'; params.push(status); }
 if (type) { sql += ' AND r.request_type_id = ?'; params.push(type); }
 if (q) {
  sql += ' AND (r.title LIKE ? OR r.description LIKE ?)';
  params.push(`%${q}%`, `%${q}%`);
 }
 sql += ' ORDER BY r.created_at DESC LIMIT 100';

 const rows = await c.env.DB.prepare(sql).bind(...params).all();
 const data = (rows.results ?? []).map((r: Record<string, unknown>) => ({
 ...r,
  steps: typeof r.steps === 'string' ? safeJsonParse(r.steps, []): (r.steps ?? []),
 }));
 return c.json({ data });
});

// GET /requests/:id
router.get('/:id', async (c) => {
 const id = c.req.param('id');
 const userId = c.get('userId');
 const roles = c.get('userRoles');
 const isAdmin = isPrivileged(roles);

 const request = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first<{ requester_id: string } & Record<string, unknown>>();
 if (!request) return c.json({ error: 'not_found' }, 404);
 if (!isAdmin && request.requester_id !== userId) return c.json({ error: 'forbidden' }, 403);

 const [steps, attachments, campaignCost] = await Promise.all([
  c.env.DB.prepare('SELECT * FROM approval_steps WHERE request_id = ? ORDER BY level').bind(id).all(),
  c.env.DB.prepare('SELECT id, filename, r2_key, content_type, size_bytes, is_selected, created_at FROM attachments WHERE request_id = ? ORDER BY created_at').bind(id).all(),
  c.env.DB.prepare('SELECT cc.*, json_group_array(json_object(\'vendor_name\',cv.vendor_name,\'amount\',cv.amount,\'is_selected\',cv.is_selected)) as vendors FROM campaign_costs cc LEFT JOIN campaign_vendors cv ON cv.campaign_cost_id = cc.id WHERE cc.request_id = ? GROUP BY cc.id').bind(id).first(),
 ]);

 return c.json({
  data: {
  ...request,
   steps: steps.results,
   attachments: attachments.results,
   campaign_cost: campaignCost ?? null,
  },
 });
});

// POST /requests - crear solicitud en borrador
router.post('/', async (c) => {
 const body = await c.req.json();
 if (!body.request_type_id || !body.title?.trim() || !body.description?.trim()) {
  return c.json({ error: 'Campos requeridos: request_type_id, title, description' }, 400);
 }

 const requestId = await createRequestWithSteps({
  requestTypeId: body.request_type_id,
  title: body.title.trim(),
  description: body.description.trim(),
  requesterId: c.get('userId'),
  requesterName: c.get('userName'),
  requesterEmail: c.get('userEmail'),
  campaignData: body.campaign_data,
 }, c.env);

 console.log('BPM_TRIGGER', requestId);

 try {
  await startProcessByKey(
   'compras',
   requestId,
   body.campaign_data || {},
   c.env
  );
 } catch (e) {
  console.error('BPM_START_ERROR', e instanceof Error ? e.message: String(e));
 }

 return c.json({ data: { id: requestId } }, 201);
});

// POST /requests/:id/attachments - subir archivo
router.post('/:id/attachments', async (c) => {
 const requestId = c.req.param('id');
 const userId = c.get('userId');
 const roles = c.get('userRoles');
 const req = await c.env.DB.prepare('SELECT requester_id, status FROM requests WHERE id = ?')
 .bind(requestId).first<{ requester_id: string; status: string }>();
 if (!req) return c.json({ error: 'not_found', message: 'Solicitud no encontrada' }, 404);
 if (!isPrivileged(roles) && req.requester_id !== userId) return c.json({ error: 'forbidden' }, 403);
 if (!['draft', 'pending', 'in_progress'].includes(req.status)) {
  return c.json({ error: 'invalid_status', message: 'Solo se pueden adjuntar archivos a solicitudes activas' }, 400);
 }

 const formData = await c.req.formData();
 const file = formData.get('file') as File | null;
 if (!file) return c.json({ error: 'file requerido' }, 400);
 if (file.size <= 0) return c.json({ error: 'Archivo vacio' }, 400);
 if (file.size > 20 * 1024 * 1024) return c.json({ error: 'Archivo demasiado grande (max 20 MB)' }, 400);

 const filename = safeFileName(file.name || 'archivo');
 const key = `${requestId}/${crypto.randomUUID()}-${filename}`;
 const contentType = file.type || 'application/octet-stream';
 await c.env.FILES.put(key, file.stream(), {
  httpMetadata: { contentType },
  customMetadata: { filename: file.name || filename, uploadedBy: userId },
 });

 const attId = crypto.randomUUID();
 await c.env.DB.prepare(
  'INSERT INTO attachments (id, request_id, filename, r2_key, content_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
 ).bind(attId, requestId, file.name || filename, key, contentType, file.size, userId).run();
 await writeAudit(c.env.DB, 'requests', requestId, 'attachment_uploaded', userId, c.get('userName'), {
  attachment_id: attId,
  filename: file.name || filename,
  size_bytes: file.size,
 });

 return c.json({ data: { id: attId, filename: file.name || filename, size_bytes: file.size } }, 201);
});

// PATCH /requests/:id/submit - confirmar borrador y enviar
router.patch('/:id/submit', async (c) => {
 const id = c.req.param('id');
 const userId = c.get('userId');
 const req = await c.env.DB.prepare('SELECT requester_id, status FROM requests WHERE id = ?')
 .bind(id).first<{ requester_id: string; status: string }>();
 if (!req) return c.json({ error: 'not_found' }, 404);
 if (req.requester_id !== userId) return c.json({ error: 'forbidden' }, 403);
 if (req.status !== 'draft') return c.json({ error: 'Solo se pueden enviar solicitudes en borrador' }, 400);

 await c.env.DB.prepare("UPDATE requests SET status='in_progress', current_level=1, updated_at=datetime('now') WHERE id=?")
 .bind(id).run();

 try {
  await notifyApprover(id, 1, c.env);
  await writeAudit(c.env.DB, 'requests', id, 'request_submitted', userId, c.get('userName'));
  return c.json({ data: { submitted: true } });
 } catch (e) {
  const message = e instanceof Error ? e.message: String(e);
  console.error('SUBMIT_NOTIFY_FAILED', message);
  await c.env.DB.prepare("UPDATE requests SET status='draft', current_level=1, updated_at=datetime('now') WHERE id=?")
  .bind(id).run();
  await writeAudit(c.env.DB, 'requests', id, 'notification_failed', userId, c.get('userName'), { message });
  return c.json({
   error: 'notification_failed',
   message: 'La solicitud se guardo con sus adjuntos, pero no se pudo enviar el correo al aprobador: ' + message,
  }, 502);
 }
});

// PATCH /requests/:id/cancel
router.patch('/:id/cancel', async (c) => {
 const id = c.req.param('id');
 const userId = c.get('userId');
 const req = await c.env.DB.prepare('SELECT requester_id, status FROM requests WHERE id = ?').bind(id).first<{ requester_id: string; status: string }>();
 if (!req) return c.json({ error: 'not_found' }, 404);
 if (req.requester_id !== userId) return c.json({ error: 'forbidden' }, 403);
 if (!['draft', 'pending', 'in_progress'].includes(req.status)) {
  return c.json({ error: 'Solo se puede cancelar solicitudes activas' }, 400);
 }
 await c.env.DB.prepare("UPDATE requests SET status='cancelled', updated_at=datetime('now') WHERE id=?").bind(id).run();
 await writeAudit(c.env.DB, 'requests', id, 'request_cancelled', userId, c.get('userName'));
 return c.json({ data: { cancelled: true } });
});

function isPrivileged(roles: string[]): boolean {
 return roles.includes('flowapp-admin') || roles.includes('flowapp-approver');
}

function safeFileName(name: string): string {
 const cleaned = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
 return cleaned.replace(/_+/g, '_').slice(0, 120) || 'archivo';
}

function safeJsonParse(value: string, fallback: unknown): unknown {
 try { return JSON.parse(value); }
 catch { return fallback; }
}

async function writeAudit(db: D1Database, entity: string, entityId: string, action: string, actorId: string, actorName: string, details?: unknown): Promise<void> {
 await db.prepare('INSERT INTO audit_log (entity, entity_id, action, actor_id, actor_name, details) VALUES (?, ?, ?, ?, ?, ?)')
 .bind(entity, entityId, action, actorId, actorName, details ? JSON.stringify(details): null)
 .run();
}

export default router;
