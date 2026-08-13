import { Hono } from 'hono';
import { AppEnv } from '../types';

const router = new Hono<AppEnv>();

type Dept = 'marketing' | 'bi' | 'comercial' | 'sso' | 'operaciones';
const VALID_DEPTS: Dept[] = ['marketing', 'bi', 'comercial', 'sso', 'operaciones'];
type Status = 'todo' | 'in_progress' | 'review' | 'done';
type Priority = 'low' | 'normal' | 'high' | 'urgent';

// ─── Auto-assign: miembro con menos tickets abiertos ─────────────────────────
async function autoAssign(db: D1Database, dept: Dept) {
  const row = await db.prepare(`
    SELECT dtm.user_id, dtm.user_name, dtm.user_email,
           COUNT(dt.id) AS open_count
    FROM dept_team_members dtm
    LEFT JOIN design_tickets dt
      ON dt.assigned_to_id = dtm.user_id
      AND dt.department    = dtm.department
      AND dt.status        != 'done'
    WHERE dtm.department = ? AND dtm.is_active = 1
    GROUP BY dtm.user_id
    ORDER BY open_count ASC, dtm.created_at ASC
    LIMIT 1
  `).bind(dept).first<{ user_id: string; user_name: string; user_email: string; open_count: number }>();
  return row ?? null;
}

// ─── GET /tickets?dept=marketing|bi ──────────────────────────────────────────
router.get('/', async (c) => {
  const dept = c.req.query('dept') as Dept | undefined;
  const status = c.req.query('status') as Status | undefined;
  const q = c.req.query('q') ?? '';

  let sql = 'SELECT * FROM design_tickets WHERE 1=1';
  const params: unknown[] = [];

  if (dept)   { sql += ' AND department = ?'; params.push(dept); }
  if (status) { sql += ' AND status = ?';     params.push(status); }
  if (q)      { sql += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

  sql += ' ORDER BY CASE status WHEN \'urgent\' THEN 0 WHEN \'high\' THEN 1 WHEN \'normal\' THEN 2 ELSE 3 END, created_at DESC';

  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ data: rows.results ?? [] });
});

// ─── POST /tickets — crear ticket con auto-asignación ────────────────────────
router.post('/', async (c) => {
  const body = await c.req.json<{
    department: Dept;
    title: string;
    description?: string;
    priority?: Priority;
    due_date?: string;
    tags?: string[];
  }>();

  if (!body.title?.trim())      return c.json({ error: 'title requerido' }, 400);
  if (!['marketing','bi'].includes(body.department))
    return c.json({ error: 'department debe ser marketing o bi' }, 400);

  const assignee = await autoAssign(c.env.DB, body.department);

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  await c.env.DB.prepare(`
    INSERT INTO design_tickets
      (id, department, title, description, priority, status,
       assigned_to_id, assigned_to_name, assigned_to_email,
       created_by_id, created_by_name, due_date, tags_json)
    VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.department, body.title.trim(),
    body.description?.trim() ?? null,
    body.priority ?? 'normal',
    assignee?.user_id    ?? null,
    assignee?.user_name  ?? null,
    assignee?.user_email ?? null,
    c.get('userId'), c.get('userName'),
    body.due_date ?? null,
    body.tags ? JSON.stringify(body.tags) : null,
  ).run();

  const ticket = await c.env.DB.prepare('SELECT * FROM design_tickets WHERE id = ?').bind(id).first();
  return c.json({ data: ticket }, 201);
});

// ─── PATCH /tickets/:id — mover columna / editar ─────────────────────────────
router.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<{
    status: Status;
    priority: Priority;
    title: string;
    description: string;
    due_date: string | null;
    tags: string[];
    assigned_to_id: string;
    assigned_to_name: string;
    assigned_to_email: string;
  }>>();

  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: unknown[] = [];

  if (body.status   !== undefined) { sets.push('status = ?');   vals.push(body.status); }
  if (body.priority !== undefined) { sets.push('priority = ?'); vals.push(body.priority); }
  if (body.title    !== undefined) { sets.push('title = ?');    vals.push(body.title.trim()); }
  if (body.description !== undefined) { sets.push('description = ?'); vals.push(body.description?.trim() ?? null); }
  if (body.due_date !== undefined) { sets.push('due_date = ?'); vals.push(body.due_date ?? null); }
  if (body.tags     !== undefined) { sets.push('tags_json = ?'); vals.push(JSON.stringify(body.tags)); }
  if (body.assigned_to_id !== undefined) {
    sets.push('assigned_to_id = ?', 'assigned_to_name = ?', 'assigned_to_email = ?');
    vals.push(body.assigned_to_id, body.assigned_to_name ?? null, body.assigned_to_email ?? null);
  }

  if (sets.length === 1) return c.json({ error: 'nada que actualizar' }, 400);
  vals.push(id);

  await c.env.DB.prepare(`UPDATE design_tickets SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  const updated = await c.env.DB.prepare('SELECT * FROM design_tickets WHERE id = ?').bind(id).first();
  return c.json({ data: updated });
});

// ─── DELETE /tickets/:id ──────────────────────────────────────────────────────
router.delete('/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM design_tickets WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ data: { deleted: true } });
});

// ─── GET /tickets/team/:dept — miembros del equipo con carga ─────────────────
// La carga se mide sobre las tareas del workspace (ws_tasks) del espacio.
router.get('/team/:dept', async (c) => {
  const dept = c.req.param('dept') as Dept;
  if (!VALID_DEPTS.includes(dept)) return c.json({ error: 'Departamento inválido' }, 400);
  const rows = await c.env.DB.prepare(`
    SELECT dtm.*,
           COUNT(CASE WHEN wt.status NOT IN ('done','cerrado_ganado','cerrado_perdido') AND wt.archived = 0 THEN 1 END) AS open_tickets
    FROM dept_team_members dtm
    LEFT JOIN ws_tasks wt
      ON wt.assignee_id = dtm.user_id AND wt.space_id = dtm.department
    WHERE dtm.department = ?
    GROUP BY dtm.user_id
    ORDER BY dtm.user_name
  `).bind(dept).all();
  return c.json({ data: rows.results ?? [] });
});

// ─── Admin: gestión del equipo ────────────────────────────────────────────────
router.post('/team', async (c) => {
  const body = await c.req.json<{
    user_id: string; user_name: string; user_email: string; department: Dept;
  }>();
  if (!body.user_id || !body.department) return c.json({ error: 'user_id y department requeridos' }, 400);
  if (!VALID_DEPTS.includes(body.department)) return c.json({ error: 'Departamento inválido' }, 400);

  const id = crypto.randomUUID().slice(0, 8);
  await c.env.DB.prepare(`
    INSERT INTO dept_team_members (id, user_id, user_name, user_email, department)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, department) DO UPDATE SET is_active = 1
  `).bind(id, body.user_id, body.user_name, body.user_email, body.department).run();

  return c.json({ data: { id } }, 201);
});

router.delete('/team/:id', async (c) => {
  await c.env.DB.prepare('UPDATE dept_team_members SET is_active = 0 WHERE id = ?')
    .bind(c.req.param('id')).run();
  return c.json({ data: { removed: true } });
});

export default router;
