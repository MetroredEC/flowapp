import { Hono } from 'hono';
import { AppEnv } from '../types';
import { createRequestWithSteps } from '../utils/approvals';

const router = new Hono<AppEnv>();

// GET /requests — listar (con filtros)
router.get('/', async (c) => {
  const { status, type, q } = c.req.query();
  const userId = c.get('userId');
  const roles  = c.get('userRoles');
  const isAdmin = roles.includes('flowapp-admin') || roles.includes('flowapp-approver');

  let sql = `SELECT r.*, 
    (SELECT COUNT(*) FROM attachments WHERE request_id = r.id) as attachment_count,
    (SELECT json_group_array(json_object(
      'level', level, 'approver_name', approver_name, 'status', status, 'decided_at', decided_at
    )) FROM approval_steps WHERE request_id = r.id ORDER BY level) as steps
    FROM requests r WHERE 1=1`;
  const params: string[] = [];

  if (!isAdmin) { sql += ' AND r.requester_id = ?'; params.push(userId); }
  if (status)   { sql += ' AND r.status = ?'; params.push(status); }
  if (type)     { sql += ' AND r.request_type_id = ?'; params.push(type); }
  if (q)        { sql += ' AND (r.title LIKE ? OR r.description LIKE ?)';
                  params.push(`%${q}%`, `%${q}%`); }

  sql += ' ORDER BY r.created_at DESC LIMIT 100';

  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ data: rows.results });
});

// GET /requests/:id
router.get('/:id', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const roles  = c.get('userRoles');
  const isAdmin = roles.includes('flowapp-admin') || roles.includes('flowapp-approver');

  const request = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
  if (!request) return c.json({ error: 'not_found' }, 404);
  if (!isAdmin && (request as { requester_id: string }).requester_id !== userId) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const [steps, attachments, campaignCost] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM approval_steps WHERE request_id = ? ORDER BY level')
      .bind(id).all(),
    c.env.DB.prepare('SELECT id, filename, content_type, size_bytes, is_selected, created_at FROM attachments WHERE request_id = ?')
      .bind(id).all(),
    c.env.DB.prepare('SELECT cc.*, json_group_array(json_object(\'vendor_name\',cv.vendor_name,\'amount\',cv.amount,\'is_selected\',cv.is_selected)) as vendors FROM campaign_costs cc LEFT JOIN campaign_vendors cv ON cv.campaign_cost_id = cc.id WHERE cc.request_id = ? GROUP BY cc.id')
      .bind(id).first(),
  ]);

  return c.json({
    data: {
      ...request,
      steps: steps.results,
      attachments: attachments.results,
      campaign_cost: campaignCost ?? null,
    }
  });
});

// POST /requests
router.post('/', async (c) => {
  const body = await c.req.json<{
    request_type_id: string; title: string; description: string; campaign_data?: unknown;
  }>();

  if (!body.request_type_id || !body.title?.trim() || !body.description?.trim()) {
    return c.json({ error: 'Campos requeridos: request_type_id, title, description' }, 400);
  }

  const requestId = await createRequestWithSteps({
    requestTypeId:  body.request_type_id,
    title:          body.title.trim(),
    description:    body.description.trim(),
    requesterId:    c.get('userId'),
    requesterName:  c.get('userName'),
    requesterEmail: c.get('userEmail'),
    campaignData:   body.campaign_data,
  }, c.env);

  return c.json({ data: { id: requestId } }, 201);
});

// POST /requests/:id/attachments — upload de archivos a R2
router.post('/:id/attachments', async (c) => {
  const requestId = c.req.param('id');
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return c.json({ error: 'file requerido' }, 400);

  const maxSize = 20 * 1024 * 1024; // 20 MB
  if (file.size > maxSize) return c.json({ error: 'Archivo demasiado grande (máx 20 MB)' }, 400);

  const key = `${requestId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  await c.env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const attId = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO attachments (id, request_id, filename, r2_key, content_type, size_bytes, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(attId, requestId, file.name, key, file.type, file.size, c.get('userId')).run();

  return c.json({ data: { id: attId, filename: file.name, size_bytes: file.size } }, 201);
});

// PATCH /requests/:id/cancel
router.patch('/:id/cancel', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const req = await c.env.DB.prepare('SELECT requester_id, status FROM requests WHERE id = ?')
    .bind(id).first<{ requester_id: string; status: string }>();
  if (!req) return c.json({ error: 'not_found' }, 404);
  if (req.requester_id !== userId) return c.json({ error: 'forbidden' }, 403);
  if (!['pending','in_progress'].includes(req.status)) {
    return c.json({ error: 'Solo se puede cancelar solicitudes activas' }, 400);
  }
  await c.env.DB.prepare("UPDATE requests SET status='cancelled', updated_at=datetime('now') WHERE id=?")
    .bind(id).run();
  return c.json({ data: { cancelled: true } });
});

export default router;
