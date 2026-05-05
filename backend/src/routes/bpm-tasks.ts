import { Hono } from 'hono';
import { AppEnv } from '../types';
import { completeTask } from '../utils/bpm-engine';

const router = new Hono<AppEnv>();

type TaskListRow = {
  id: string;
  title: string;
  status: string;
  assignee_email: string | null;
  created_at: string;
  completed_at: string | null;
  request_id: string | null;
  request_title: string | null;
  request_type_name: string | null;
  requester_name: string | null;
};

router.get('/mine', async (c) => {
  const userEmail = c.get('userEmail');
  const roles = c.get('userRoles');
  const includeAll = isPrivileged(roles) && c.req.query('all') === '1';

  const sql = `
    SELECT t.id, t.title, t.status, t.assignee_email, t.created_at, t.completed_at,
           t.request_id,
           r.title as request_title,
           r.request_type_name,
           r.requester_name
      FROM tasks t
      LEFT JOIN requests r ON r.id = t.request_id
     WHERE t.status = 'pending'
       ${includeAll ? '' : 'AND lower(t.assignee_email) = lower(?)'}
     ORDER BY t.created_at DESC
     LIMIT 100
  `;

  const result = includeAll
    ? await c.env.DB.prepare(sql).all<TaskListRow>()
    : await c.env.DB.prepare(sql).bind(userEmail).all<TaskListRow>();

  return c.json({ data: result.results ?? [] });
});

router.get('/:id', async (c) => {
  const id = c.req.param('id');
  const userEmail = c.get('userEmail');
  const roles = c.get('userRoles');

  const task = await c.env.DB.prepare(`
    SELECT t.*,
           r.title as request_title,
           r.description as request_description,
           r.request_type_name,
           r.requester_name,
           r.requester_email
      FROM tasks t
      LEFT JOIN requests r ON r.id = t.request_id
     WHERE t.id = ?
  `).bind(id).first<Record<string, unknown>>();

  if (!task) return c.json({ error: 'not_found' }, 404);

  if (!isPrivileged(roles) && String(task.assignee_email ?? '').toLowerCase() !== userEmail.toLowerCase()) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const attachments = await c.env.DB.prepare(`
    SELECT id, filename, content_type, size_bytes, created_at
      FROM attachments
     WHERE request_id = ?
     ORDER BY created_at
  `).bind(String(task.request_id ?? '')).all();

  const events = await c.env.DB.prepare(`
    SELECT action, comment, actor_name, actor_email, created_at
      FROM task_events
     WHERE task_id = ?
     ORDER BY created_at
  `).bind(id).all();

  return c.json({
    data: {
      task,
      attachments: attachments.results ?? [],
      events: events.results ?? [],
    }
  });
});

router.post('/:id/complete', async (c) => {
  const id = c.req.param('id');
  const userEmail = c.get('userEmail');
  const roles = c.get('userRoles');
  const body = await c.req.json();

  const task = await c.env.DB.prepare(`
    SELECT id, assignee_email, status
      FROM tasks
     WHERE id = ?
  `).bind(id).first<{ id: string; assignee_email: string | null; status: string }>();

  if (!task) return c.json({ error: 'not_found' }, 404);

  if (!isPrivileged(roles) && String(task.assignee_email ?? '').toLowerCase() !== userEmail.toLowerCase()) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const action = String(body.action ?? '').trim() || 'complete';
  const comment = String(body.comment ?? '').trim();

  if (action === 'reject' && !comment) {
    return c.json({ error: 'comment_required', message: 'El comentario es obligatorio para rechazar.' }, 400);
  }

  const result = await completeTask(id, action, comment, {
    id: c.get('userId'),
    name: c.get('userName'),
    email: userEmail,
  }, c.env);

  return c.json({ data: result });
});

function isPrivileged(roles: string[]): boolean {
  return roles.includes('flowapp-admin') || roles.includes('flowapp-approver');
}

export default router;
