import { Hono } from 'hono';
import { AppEnv } from '../types';
import { getAppToken, searchUsers } from '../utils/graph';

const router = new Hono<AppEnv>();

// ─── Tipos de solicitud ───────────────────────────────────────────────────────
router.get('/request-types', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM request_types ORDER BY name').all();
  return c.json({ data: rows.results });
});

router.post('/request-types', async (c) => {
  const { name, description } = await c.req.json<{ name: string; description?: string }>();
  if (!name?.trim()) return c.json({ error: 'name requerido' }, 400);
  const id = crypto.randomUUID().slice(0, 8);
  await c.env.DB.prepare('INSERT INTO request_types (id, name, description) VALUES (?, ?, ?)')
    .bind(id, name.trim(), description ?? null).run();
  return c.json({ data: { id } }, 201);
});

router.patch('/request-types/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; description?: string; is_active?: number }>();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.name !== undefined)      { sets.push('name = ?');        vals.push(body.name); }
  if (body.description !== undefined){ sets.push('description = ?'); vals.push(body.description); }
  if (body.is_active !== undefined)  { sets.push('is_active = ?');   vals.push(body.is_active); }
  if (!sets.length) return c.json({ error: 'nada que actualizar' }, 400);
  vals.push(id);
  await c.env.DB.prepare(`UPDATE request_types SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ data: { updated: true } });
});

// ─── Configuración de flujos ──────────────────────────────────────────────────
router.get('/flows/:typeId', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM flow_configs WHERE request_type_id = ? ORDER BY level'
  ).bind(c.req.param('typeId')).all();
  return c.json({ data: rows.results });
});

router.put('/flows/:typeId', async (c) => {
  const typeId = c.req.param('typeId');
  const levels = await c.req.json<Array<{
    level: number; label: string;
    approver_type: 'fixed_user' | 'job_title';
    approver_value: string; approver_name?: string; approver_email?: string;
  }>>();

  if (!Array.isArray(levels) || levels.length === 0 || levels.length > 4) {
    return c.json({ error: 'Se requieren entre 1 y 4 niveles' }, 400);
  }

  // Borrar configuración actual y reemplazar (transacción)
  const stmts = [
    c.env.DB.prepare('DELETE FROM flow_configs WHERE request_type_id = ?').bind(typeId),
    ...levels.map(l =>
      c.env.DB.prepare(`
        INSERT INTO flow_configs
          (id, request_type_id, level, label, approver_type, approver_value, approver_name, approver_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID().slice(0, 8), typeId, l.level, l.label,
        l.approver_type, l.approver_value,
        l.approver_name ?? null, l.approver_email ?? null
      )
    ),
  ];
  await c.env.DB.batch(stmts);
  return c.json({ data: { saved: levels.length } });
});

// ─── Buscador de usuarios Entra ID ───────────────────────────────────────────
router.get('/users/search', async (c) => {
  const q = c.req.query('q') ?? '';
  if (q.length < 2) return c.json({ data: [] });

  const token = await getAppToken(
    c.env.ENTRA_TENANT_ID, c.env.ENTRA_CLIENT_ID, c.env.ENTRA_CLIENT_SECRET, c.env.KV
  );
  const users = await searchUsers(q, token);
  return c.json({
    data: users.map(u => ({
      id:          u.id,
      name:        u.displayName,
      email:       u.mail ?? u.userPrincipalName,
      jobTitle:    u.jobTitle ?? '',
      department:  u.department ?? '',
    }))
  });
});

// ─── Dashboard stats ──────────────────────────────────────────────────────────
router.get('/stats', async (c) => {
  const [totals, byStatus, byType] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as total FROM requests').first<{ total: number }>(),
    c.env.DB.prepare('SELECT status, COUNT(*) as count FROM requests GROUP BY status').all(),
    c.env.DB.prepare('SELECT request_type_name, COUNT(*) as count FROM requests GROUP BY request_type_name').all(),
  ]);
  return c.json({ data: { totals, byStatus: byStatus.results, byType: byType.results } });
});

// ─── Lista de todas las solicitudes (admin) ───────────────────────────────────
router.get('/requests', async (c) => {
  const { status, type, q, page = '1' } = c.req.query();
  const limit = 50;
  const offset = (parseInt(page) - 1) * limit;

  let sql = 'SELECT * FROM requests WHERE 1=1';
  const params: unknown[] = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (type)   { sql += ' AND request_type_id = ?'; params.push(type); }
  if (q)      { sql += ' AND (title LIKE ? OR requester_name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ data: rows.results });
});

// ─── Costos de campaña (Marketing) ────────────────────────────────────────────
router.post('/campaign-costs', async (c) => {
  const body = await c.req.json<{
    request_id: string; campaign_code: string; total_amount: number;
    currency?: string; execution_date: string; billing_date: string;
    notes?: string;
    vendors: { vendor_name: string; amount: number; is_selected: boolean }[];
  }>();

  const costId = crypto.randomUUID().slice(0, 12);
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO campaign_costs (id, request_id, campaign_code, total_amount, currency, execution_date, billing_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(costId, body.request_id, body.campaign_code, body.total_amount,
             body.currency ?? 'USD', body.execution_date, body.billing_date, body.notes ?? null),
    ...body.vendors.map(v =>
      c.env.DB.prepare(`
        INSERT INTO campaign_vendors (id, campaign_cost_id, vendor_name, amount, is_selected)
        VALUES (?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID().slice(0,12), costId, v.vendor_name, v.amount, v.is_selected ? 1 : 0)
    ),
  ]);
  return c.json({ data: { id: costId } }, 201);
});

export default router;
