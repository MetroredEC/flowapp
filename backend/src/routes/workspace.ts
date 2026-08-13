import { Hono } from 'hono';
import { AppEnv } from '../types';
import { processApproval } from '../utils/approvals';
import { recordWorkEvent } from '../utils/work-events';
import { buildProfile, isPersonaKey, PersonaKey, readPersonaSignals } from '../utils/personas';
import { markRequestDelivered } from '../utils/workspace-bridge';

const router = new Hono<AppEnv>();

type Priority = 'low' | 'normal' | 'high' | 'urgent';

interface SpaceStatus {
  id: string; space_id: string; key: string; label: string;
  color: string; sort_order: number; is_done: number;
}

// ─── Helper: registrar actividad ─────────────────────────────────────────────
async function logActivity(
  db: D1Database, taskId: string, actor: { id: string; name: string; email: string },
  action: string, meta?: Record<string, unknown>
) {
  await db.prepare(`
    INSERT INTO ws_task_activity (task_id, actor_id, actor_name, actor_email, action, meta_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(taskId, actor.id, actor.name, actor.email, action, meta ? JSON.stringify(meta) : null).run();

  const source = await db.prepare(
    'SELECT source_type, source_id FROM ws_tasks WHERE id = ?'
  ).bind(taskId).first<{ source_type: string; source_id: string | null }>();
  if (source?.source_type === 'request' && source.source_id) {
    const titles: Record<string, string> = {
      created: 'Trabajo creado', status: 'Estado del trabajo actualizado',
      assigned: 'Responsable actualizado', priority: 'Prioridad actualizada',
      comment: 'Comentario añadido', approved: 'Trabajo aprobado', rejected: 'Trabajo rechazado',
      due: 'Fecha límite actualizada', field: 'Información actualizada',
    };
    await recordWorkEvent(db, {
      requestId: source.source_id, taskId, eventType: `task_${action}`,
      title: titles[action] ?? 'Trabajo actualizado',
      actorId: actor.id, actorName: actor.name, actorEmail: actor.email, detail: meta,
    });
  }
}

// ─── Helper: crear notificación ──────────────────────────────────────────────
async function notify(
  db: D1Database, userEmail: string, type: string,
  task: { id: string; title: string; space_id: string },
  actorName: string, body: string
) {
  if (!userEmail) return;
  await db.prepare(`
    INSERT INTO ws_notifications (user_email, type, task_id, task_title, space_id, actor_name, body)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(userEmail, type, task.id, task.title, task.space_id, actorName, body).run();
}

function actor(c: { get: (k: string) => string }) {
  return { id: c.get('userId'), name: c.get('userName'), email: c.get('userEmail') };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ESPACIOS
// ═══════════════════════════════════════════════════════════════════════════
router.get('/spaces', async (c) => {
  const ws_spaces = await c.env.DB.prepare(
    'SELECT * FROM ws_spaces WHERE is_active = 1 ORDER BY sort_order'
  ).all();
  const statuses = await c.env.DB.prepare(
    'SELECT * FROM ws_space_statuses ORDER BY space_id, sort_order'
  ).all();

  const bySpace: Record<string, SpaceStatus[]> = {};
  for (const s of (statuses.results as unknown as SpaceStatus[])) {
    (bySpace[s.space_id] ??= []).push(s);
  }

  const data = (ws_spaces.results as Record<string, unknown>[]).map(sp => ({
    ...sp,
    statuses: bySpace[sp.id as string] ?? [],
  }));

  return c.json({ data });
});

// Conteo de tareas abiertas por espacio (para badges de navegación)
router.get('/spaces/counts', async (c) => {
  const email = c.get('userEmail');
  const rows = await c.env.DB.prepare(`
    SELECT space_id,
           COUNT(*) AS total,
           SUM(CASE WHEN assignee_email = ? THEN 1 ELSE 0 END) AS mine
    FROM ws_tasks
    WHERE archived = 0
      AND status NOT IN ('done','cerrado_ganado','cerrado_perdido')
    GROUP BY space_id
  `).bind(email).all();
  return c.json({ data: rows.results });
});

// ═══════════════════════════════════════════════════════════════════════════
//  TAREAS
// ═══════════════════════════════════════════════════════════════════════════
router.get('/tasks', async (c) => {
  const spaceId = c.req.query('space');
  const assignee = c.req.query('assignee');
  const search = c.req.query('search');
  const source = c.req.query('source');

  let q = 'SELECT * FROM ws_tasks WHERE archived = 0';
  const params: unknown[] = [];

  if (spaceId)  { q += ' AND space_id = ?';       params.push(spaceId); }
  if (assignee) { q += ' AND assignee_email = ?'; params.push(assignee); }
  if (source)   { q += ' AND source_type = ?';    params.push(source); }
  if (search)   {
    q += ' AND (title LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  q += ' ORDER BY updated_at DESC';

  const rows = await c.env.DB.prepare(q).bind(...params).all();
  return c.json({ data: rows.results });
});

// Tareas del usuario actual (Mis tareas)
router.get('/tasks/mine', async (c) => {
  const email = c.get('userEmail');
  const rows = await c.env.DB.prepare(`
    SELECT t.*, s.name AS space_name, s.color AS space_color
    FROM ws_tasks t JOIN ws_spaces s ON s.id = t.space_id
    WHERE t.assignee_email = ? AND t.archived = 0
    ORDER BY
      CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      t.updated_at DESC
  `).bind(email).all();
  return c.json({ data: rows.results });
});

// Centro de trabajo personal: plan de hoy + sugerencias accionables.
router.get('/day', async (c) => {
  const email = c.get('userEmail');
  const today = "date('now','-5 hours')";
  const openCondition = 'COALESCE(ss.is_done, 0) = 0';

  const [planned, suggested, summary] = await Promise.all([
    c.env.DB.prepare(`
      SELECT t.*, s.name AS space_name, s.color AS space_color
      FROM ws_tasks t
      JOIN ws_spaces s ON s.id = t.space_id
      LEFT JOIN ws_space_statuses ss ON ss.space_id = t.space_id AND ss.key = t.status
      WHERE lower(t.assignee_email) = lower(?) AND t.archived = 0
        AND ${openCondition} AND t.planned_date = ${today}
      ORDER BY COALESCE(t.day_order, 999),
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        COALESCE(t.due_date, '9999-12-31')
    `).bind(email).all(),
    c.env.DB.prepare(`
      SELECT t.*, s.name AS space_name, s.color AS space_color
      FROM ws_tasks t
      JOIN ws_spaces s ON s.id = t.space_id
      LEFT JOIN ws_space_statuses ss ON ss.space_id = t.space_id AND ss.key = t.status
      WHERE lower(t.assignee_email) = lower(?) AND t.archived = 0
        AND ${openCondition}
        AND COALESCE(t.planned_date, '') <> ${today}
        AND (t.snoozed_until IS NULL OR t.snoozed_until <= ${today})
        AND (t.priority IN ('urgent','high') OR t.due_date <= date(${today}, '+2 days') OR t.is_blocked = 1)
      ORDER BY t.is_blocked DESC,
        CASE WHEN t.due_date < ${today} THEN 0 ELSE 1 END,
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        COALESCE(t.due_date, '9999-12-31')
      LIMIT 12
    `).bind(email).all(),
    c.env.DB.prepare(`
      SELECT
        SUM(CASE WHEN ${openCondition} THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN ${openCondition} AND t.due_date < ${today} THEN 1 ELSE 0 END) AS overdue,
        SUM(CASE WHEN ${openCondition} AND t.is_blocked = 1 THEN 1 ELSE 0 END) AS blocked,
        SUM(CASE WHEN ${openCondition} AND t.planned_date = ${today} THEN 1 ELSE 0 END) AS planned,
        SUM(CASE WHEN ss.is_done = 1 AND date(t.completed_at) = ${today} THEN 1 ELSE 0 END) AS completed_today,
        COALESCE(SUM(CASE WHEN ${openCondition} AND t.planned_date = ${today} THEN t.estimate_minutes ELSE 0 END), 0) AS planned_minutes
      FROM ws_tasks t
      LEFT JOIN ws_space_statuses ss ON ss.space_id = t.space_id AND ss.key = t.status
      WHERE lower(t.assignee_email) = lower(?) AND t.archived = 0
    `).bind(email).first(),
  ]);

  return c.json({ data: { planned: planned.results, suggested: suggested.results, summary } });
});

// Detalle de tarea + comentarios + actividad
router.get('/tasks/:id', async (c) => {
  const id = c.req.param('id');
  const task = await c.env.DB.prepare('SELECT * FROM ws_tasks WHERE id = ?').bind(id).first();
  if (!task) return c.json({ error: 'not_found' }, 404);

  const comments = await c.env.DB.prepare(
    'SELECT * FROM ws_task_comments WHERE task_id = ? ORDER BY created_at ASC'
  ).bind(id).all();
  const activity = await c.env.DB.prepare(
    'SELECT * FROM ws_task_activity WHERE task_id = ? ORDER BY created_at DESC LIMIT 100'
  ).bind(id).all();
  const checklist = await c.env.DB.prepare(
    'SELECT * FROM ws_task_checklist WHERE task_id = ? ORDER BY sort_order, created_at'
  ).bind(id).all();
  const deliverables = await c.env.DB.prepare(
    'SELECT * FROM ws_task_deliverables WHERE task_id = ? ORDER BY sort_order, created_at'
  ).bind(id).all();

  return c.json({
    data: {
      task, comments: comments.results, activity: activity.results,
      checklist: checklist.results, deliverables: deliverables.results,
    }
  });
});

// Crear tarea — restringido: el trabajo entra por solicitudes aprobadas.
// Solo administradores pueden crear tareas manuales (casos excepcionales).
router.post('/tasks', async (c) => {
  const roles = c.get('userRoles') ?? [];
  if (!roles.includes('flowapp-admin')) {
    return c.json({
      error: 'forbidden',
      message: 'Las tareas se crean automáticamente al aprobarse una solicitud. Crea una solicitud para iniciar el flujo.',
    }, 403);
  }
  const a = actor(c);
  const body = await c.req.json<{
    space_id: string; title: string; description?: string;
    status?: string; priority?: Priority;
    assignee_id?: string; assignee_name?: string; assignee_email?: string;
    due_date?: string; source_type?: string; source_id?: string;
    custom_fields_json?: string;
    needs_approval?: number; approver_email?: string; approver_name?: string;
  }>();

  const status = body.status || (await defaultStatus(c.env.DB, body.space_id));

  await c.env.DB.prepare(`
    INSERT INTO ws_tasks (
      space_id, title, description, status, priority,
      assignee_id, assignee_name, assignee_email,
      created_by_id, created_by_name, created_by_email,
      due_date, source_type, source_id, custom_fields_json,
      needs_approval, approval_status, approver_email, approver_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.space_id, body.title, body.description || null, status, body.priority || 'normal',
    body.assignee_id || null, body.assignee_name || null, body.assignee_email || null,
    a.id, a.name, a.email,
    body.due_date || null, body.source_type || 'manual', body.source_id || null, body.custom_fields_json || null,
    body.needs_approval || 0, body.needs_approval ? 'pending' : null,
    body.approver_email || null, body.approver_name || null
  ).run();

  const task = await c.env.DB.prepare(
    'SELECT * FROM ws_tasks WHERE created_by_email = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(a.email).first() as Record<string, unknown>;

  const taskRef = { id: task.id as string, title: task.title as string, space_id: task.space_id as string };
  await logActivity(c.env.DB, taskRef.id, a, 'created');

  if (body.assignee_email && body.assignee_email !== a.email) {
    await notify(c.env.DB, body.assignee_email, 'assignment', taskRef, a.name, `Te asignó "${task.title}"`);
  }
  if (body.needs_approval && body.approver_email) {
    await notify(c.env.DB, body.approver_email, 'approval', taskRef, a.name, `Solicita tu aprobación en "${task.title}"`);
  }

  return c.json({ data: task }, 201);
});

// Actualizar tarea (estado, responsable, prioridad, etc.)
router.patch('/tasks/:id', async (c) => {
  const a = actor(c);
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>();

  const prev = await c.env.DB.prepare('SELECT * FROM ws_tasks WHERE id = ?').bind(id).first() as Record<string, unknown>;
  if (!prev) return c.json({ error: 'not_found' }, 404);

  if (body.status !== undefined) {
    const validStatus = await c.env.DB.prepare(
      'SELECT key, is_done FROM ws_space_statuses WHERE space_id = ? AND key = ?'
    ).bind(prev.space_id, body.status).first<{ key: string; is_done: number }>();
    if (!validStatus) return c.json({ error: 'invalid_status', message: 'El estado no pertenece a este espacio' }, 400);
    if (validStatus.is_done && body.status !== prev.status) {
      const pending = await c.env.DB.prepare(`
        SELECT
          (SELECT COUNT(*) FROM ws_task_checklist WHERE task_id = ? AND is_required = 1 AND is_done = 0) AS checklist,
          (SELECT COUNT(*) FROM ws_task_deliverables WHERE task_id = ? AND is_required = 1 AND is_completed = 0) AS deliverables
      `).bind(id, id).first<{ checklist: number; deliverables: number }>();
      const missingChecklist = Number(pending?.checklist ?? 0);
      const missingDeliverables = Number(pending?.deliverables ?? 0);
      if (missingChecklist || missingDeliverables) {
        return c.json({
          error: 'requirements_pending',
          message: `Antes de terminar, completa ${missingChecklist} paso(s) y ${missingDeliverables} entregable(s) obligatorio(s).`,
          data: { checklist: missingChecklist, deliverables: missingDeliverables },
        }, 409);
      }
    }
  }
  if (body.priority !== undefined && !['low', 'normal', 'high', 'urgent'].includes(String(body.priority))) {
    return c.json({ error: 'invalid_priority', message: 'Prioridad no válida' }, 400);
  }
  if (body.due_date !== undefined && body.due_date !== null && Number.isNaN(Date.parse(String(body.due_date)))) {
    return c.json({ error: 'invalid_due_date', message: 'Fecha límite no válida' }, 400);
  }
  for (const field of ['planned_date', 'snoozed_until']) {
    if (body[field] !== undefined && body[field] !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(body[field]))) {
      return c.json({ error: `invalid_${field}`, message: 'La fecha debe usar formato AAAA-MM-DD' }, 400);
    }
  }
  if (body.is_blocked !== undefined && ![0, 1, false, true].includes(body.is_blocked as never)) {
    return c.json({ error: 'invalid_is_blocked', message: 'Estado de bloqueo no válido' }, 400);
  }
  if (body.estimate_minutes !== undefined && body.estimate_minutes !== null) {
    const estimate = Number(body.estimate_minutes);
    if (!Number.isInteger(estimate) || estimate < 0 || estimate > 10080) {
      return c.json({ error: 'invalid_estimate', message: 'La estimación debe estar entre 0 y 10080 minutos' }, 400);
    }
  }

  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: unknown[] = [];
  const fields = ['title','description','status','priority','assignee_id','assignee_name',
    'assignee_email','due_date','custom_fields_json','approval_status','planned_date','day_order',
    'snoozed_until','is_blocked','blocked_reason','estimate_minutes'];
  for (const f of fields) {
    if (body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(body[f]); }
  }
  if (body.status !== undefined && body.status !== prev.status) {
    const target = await c.env.DB.prepare(
      'SELECT is_done FROM ws_space_statuses WHERE space_id = ? AND key = ?'
    ).bind(prev.space_id, body.status).first<{ is_done: number }>();
    sets.push("started_at = COALESCE(started_at, datetime('now'))");
    if (target?.is_done) sets.push("completed_at = datetime('now')");
    else sets.push('completed_at = NULL');
  }
  vals.push(id);
  await c.env.DB.prepare(`UPDATE ws_tasks SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  const taskRef = { id, title: prev.title as string, space_id: prev.space_id as string };

  // Actividad + notificaciones específicas
  if (body.status !== undefined && body.status !== prev.status) {
    await logActivity(c.env.DB, id, a, 'status', { from: prev.status, to: body.status });
  }
  if (body.priority !== undefined && body.priority !== prev.priority) {
    await logActivity(c.env.DB, id, a, 'priority', { from: prev.priority, to: body.priority });
  }
  if (body.planned_date !== undefined && body.planned_date !== prev.planned_date) {
    await logActivity(c.env.DB, id, a, 'planned', { from: prev.planned_date, to: body.planned_date });
  }
  if (body.snoozed_until !== undefined && body.snoozed_until !== prev.snoozed_until) {
    await logActivity(c.env.DB, id, a, 'snoozed', { to: body.snoozed_until });
  }
  if (body.is_blocked !== undefined && Number(body.is_blocked) !== Number(prev.is_blocked)) {
    await logActivity(c.env.DB, id, a, Number(body.is_blocked) ? 'blocked' : 'unblocked', { reason: body.blocked_reason });
  }
  if (body.assignee_email !== undefined && body.assignee_email !== prev.assignee_email) {
    await logActivity(c.env.DB, id, a, 'assigned', { to: body.assignee_name });
    if (body.assignee_email && body.assignee_email !== a.email) {
      await notify(c.env.DB, body.assignee_email as string, 'assignment', taskRef, a.name, `Te asignó "${prev.title}"`);
    }
  }
  if (body.approval_status === 'approved') {
    await logActivity(c.env.DB, id, a, 'approved');
    if (prev.created_by_email) await notify(c.env.DB, prev.created_by_email as string, 'approval', taskRef, a.name, `Aprobó "${prev.title}"`);
  }
  if (body.approval_status === 'rejected') {
    await logActivity(c.env.DB, id, a, 'rejected');
    if (prev.created_by_email) await notify(c.env.DB, prev.created_by_email as string, 'approval', taskRef, a.name, `Rechazó "${prev.title}"`);
  }

  // Terminar el trabajo de una solicitud es entregarla: el solicitante debe
  // enterarse sin que nadie tenga que avisarle por chat.
  if (body.status !== undefined && body.status !== prev.status
      && prev.source_type === 'request' && prev.source_id) {
    const target = await c.env.DB.prepare(
      'SELECT is_done FROM ws_space_statuses WHERE space_id = ? AND key = ?'
    ).bind(prev.space_id, body.status).first<{ is_done: number }>();
    if (target?.is_done) {
      try { await markRequestDelivered(c.env.DB, prev.source_id as string, id); }
      catch (error) { console.error('DELIVERY_MARK_FAILED', error instanceof Error ? error.message : String(error)); }
    }
  }

  const task = await c.env.DB.prepare('SELECT * FROM ws_tasks WHERE id = ?').bind(id).first();
  return c.json({ data: task });
});

router.delete('/tasks/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('UPDATE ws_tasks SET archived = 1 WHERE id = ?').bind(id).run();
  return c.json({ data: { archived: true } });
});

// Requisitos de ejecución instanciados desde Process Studio
router.patch('/tasks/:id/checklist/:itemId', async (c) => {
  const a = actor(c);
  const { id, itemId } = c.req.param();
  const body = await c.req.json<{ is_done: boolean }>();
  const item = await c.env.DB.prepare(
    'SELECT id, label, is_done FROM ws_task_checklist WHERE id = ? AND task_id = ?'
  ).bind(itemId, id).first<{ id: string; label: string; is_done: number }>();
  if (!item) return c.json({ error: 'not_found', message: 'Paso no encontrado' }, 404);
  const done = body.is_done ? 1 : 0;
  await c.env.DB.prepare(`
    UPDATE ws_task_checklist SET is_done = ?, completed_by = ?,
      completed_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
    WHERE id = ? AND task_id = ?
  `).bind(done, done ? a.email : null, done, itemId, id).run();
  await logActivity(c.env.DB, id, a, 'checklist', { label: item.label, done: Boolean(done) });
  const updated = await c.env.DB.prepare('SELECT * FROM ws_task_checklist WHERE id = ?').bind(itemId).first();
  return c.json({ data: updated });
});

router.patch('/tasks/:id/deliverables/:itemId', async (c) => {
  const a = actor(c);
  const { id, itemId } = c.req.param();
  const body = await c.req.json<{ is_completed: boolean; evidence_url?: string }>();
  const item = await c.env.DB.prepare(
    'SELECT id, label FROM ws_task_deliverables WHERE id = ? AND task_id = ?'
  ).bind(itemId, id).first<{ id: string; label: string }>();
  if (!item) return c.json({ error: 'not_found', message: 'Entregable no encontrado' }, 404);
  const done = body.is_completed ? 1 : 0;
  if (done && !body.evidence_url?.trim()) {
    return c.json({ error: 'evidence_required', message: 'Añade el enlace o ubicación de la evidencia.' }, 400);
  }
  await c.env.DB.prepare(`
    UPDATE ws_task_deliverables SET is_completed = ?, evidence_url = ?, completed_by = ?,
      completed_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
    WHERE id = ? AND task_id = ?
  `).bind(done, body.evidence_url?.trim() || null, done ? a.email : null, done, itemId, id).run();
  await logActivity(c.env.DB, id, a, 'deliverable', { label: item.label, done: Boolean(done) });
  const updated = await c.env.DB.prepare('SELECT * FROM ws_task_deliverables WHERE id = ?').bind(itemId).first();
  return c.json({ data: updated });
});

// ═══════════════════════════════════════════════════════════════════════════
//  COMENTARIOS
// ═══════════════════════════════════════════════════════════════════════════
router.post('/tasks/:id/comments', async (c) => {
  const a = actor(c);
  const id = c.req.param('id');
  const body = await c.req.json<{ body: string; mentions?: string[] }>();

  const task = await c.env.DB.prepare('SELECT * FROM ws_tasks WHERE id = ?').bind(id).first() as Record<string, unknown>;
  if (!task) return c.json({ error: 'not_found' }, 404);

  await c.env.DB.prepare(`
    INSERT INTO ws_task_comments (task_id, author_id, author_name, author_email, body, mentions_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, a.id, a.name, a.email, body.body, body.mentions ? JSON.stringify(body.mentions) : null).run();

  await c.env.DB.prepare("UPDATE ws_tasks SET updated_at = datetime('now') WHERE id = ?").bind(id).run();
  await logActivity(c.env.DB, id, a, 'comment');

  const taskRef = { id, title: task.title as string, space_id: task.space_id as string };

  // Notificar menciones + al responsable
  const targets = new Set<string>(body.mentions ?? []);
  if (task.assignee_email && task.assignee_email !== a.email) targets.add(task.assignee_email as string);
  for (const email of targets) {
    if (email === a.email) continue;
    const isMention = (body.mentions ?? []).includes(email);
    await notify(c.env.DB, email, isMention ? 'mention' : 'comment', taskRef, a.name,
      isMention ? `Te mencionó: "${body.body.slice(0, 80)}"` : `Comentó en "${task.title}"`);
  }

  const comment = await c.env.DB.prepare(
    'SELECT * FROM ws_task_comments WHERE task_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(id).first();
  return c.json({ data: comment }, 201);
});

// ═══════════════════════════════════════════════════════════════════════════
//  BANDEJA / NOTIFICACIONES
// ═══════════════════════════════════════════════════════════════════════════
router.get('/inbox', async (c) => {
  const email = c.get('userEmail');
  const rows = await c.env.DB.prepare(
    'SELECT * FROM ws_notifications WHERE user_email = ? ORDER BY created_at DESC LIMIT 60'
  ).bind(email).all();
  const unread = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM ws_notifications WHERE user_email = ? AND is_read = 0'
  ).bind(email).first() as { n: number };
  return c.json({ data: rows.results, unread: unread.n });
});

// Solo el contador (para polling ligero en vivo)
router.get('/inbox/count', async (c) => {
  const email = c.get('userEmail');
  const unread = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM ws_notifications WHERE user_email = ? AND is_read = 0'
  ).bind(email).first() as { n: number };
  return c.json({ unread: unread.n });
});

router.post('/inbox/read', async (c) => {
  const email = c.get('userEmail');
  const body = await c.req.json<{ id?: string; all?: boolean }>();
  if (body.all) {
    await c.env.DB.prepare('UPDATE ws_notifications SET is_read = 1 WHERE user_email = ?').bind(email).run();
  } else if (body.id) {
    await c.env.DB.prepare('UPDATE ws_notifications SET is_read = 1 WHERE id = ? AND user_email = ?').bind(body.id, email).run();
  }
  return c.json({ data: { ok: true } });
});

// ═══════════════════════════════════════════════════════════════════════════
//  APROBACIONES (integración Solicitudes → workspace)
// ═══════════════════════════════════════════════════════════════════════════

// Solicitudes que esperan MI aprobación (nivel actual)
router.get('/approvals/mine', async (c) => {
  const email = (c.get('userEmail') || '').toLowerCase();
  const uid = c.get('userId');
  const rows = await c.env.DB.prepare(`
    SELECT s.id AS step_id, s.level, s.label,
           r.id AS request_id, r.title, r.request_type_name,
           r.requester_name, r.requester_email, r.total_levels, r.created_at
    FROM approval_steps s
    JOIN requests r ON r.id = s.request_id
    WHERE s.status = 'pending'
      AND r.status = 'in_progress'
      AND r.current_level = s.level
      AND (s.approver_id = ? OR lower(s.approver_email) = ?)
    ORDER BY r.created_at ASC
  `).bind(uid, email).all();
  return c.json({ data: rows.results });
});

// Aprobar o rechazar desde la app (autenticado, sin magic link)
router.post('/approvals/:stepId/decide', async (c) => {
  const stepId = c.req.param('stepId');
  const email = (c.get('userEmail') || '').toLowerCase();
  const uid = c.get('userId');
  const body = await c.req.json<{ action: 'approve' | 'reject'; comment?: string }>();
  if (body.action !== 'approve' && body.action !== 'reject') {
    return c.json({ error: 'action inválida' }, 400);
  }

  const step = await c.env.DB.prepare('SELECT * FROM approval_steps WHERE id = ?')
    .bind(stepId).first<{ id: string; request_id: string; level: number; approver_id: string; approver_email: string; status: string }>();
  if (!step) return c.json({ error: 'not_found' }, 404);
  if (step.approver_id !== uid && (step.approver_email || '').toLowerCase() !== email) {
    return c.json({ error: 'forbidden', message: 'No eres el aprobador de este paso' }, 403);
  }
  if (step.status !== 'pending') {
    return c.json({ error: 'already_decided', message: 'Este paso ya fue decidido' }, 400);
  }

  try {
    const result = await processApproval(step.request_id, step.level, body.action, body.comment ?? '', c.env);
    return c.json({ data: result });
  } catch (e) {
    return c.json({ error: 'decision_failed', message: e instanceof Error ? e.message : 'Error' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  RESUMEN GLOBAL (Mi día / Dashboard)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/overview', async (c) => {
  const email = c.get('userEmail');
  const mine = await c.env.DB.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN COALESCE(ss.is_done, 0) = 0 THEN 1 ELSE 0 END) AS open,
           SUM(CASE WHEN COALESCE(ss.is_done, 0) = 1 THEN 1 ELSE 0 END) AS done,
           SUM(CASE WHEN COALESCE(ss.is_done, 0) = 0 AND t.priority IN ('high','urgent') THEN 1 ELSE 0 END) AS urgent,
           SUM(CASE WHEN COALESCE(ss.is_done, 0) = 0 AND t.due_date IS NOT NULL AND t.due_date < date('now') THEN 1 ELSE 0 END) AS overdue
    FROM ws_tasks t
    LEFT JOIN ws_space_statuses ss ON ss.space_id = t.space_id AND ss.key = t.status
    WHERE t.assignee_email = ? AND t.archived = 0
  `).bind(email).first();

  const bySpace = await c.env.DB.prepare(`
    SELECT s.id, s.name, s.color,
           COUNT(t.id) AS total,
           SUM(CASE WHEN t.status NOT IN ('done','cerrado_ganado','cerrado_perdido') THEN 1 ELSE 0 END) AS open
    FROM ws_spaces s LEFT JOIN ws_tasks t ON t.space_id = s.id AND t.archived = 0
    WHERE s.is_active = 1
    GROUP BY s.id ORDER BY s.sort_order
  `).all();

  const recent = await c.env.DB.prepare(`
    SELECT ta.*, t.title AS task_title, t.space_id
    FROM ws_task_activity ta JOIN ws_tasks t ON t.id = ta.task_id
    ORDER BY ta.created_at DESC LIMIT 15
  `).all();

  return c.json({ data: { mine, bySpace: bySpace.results, recent: recent.results } });
});

// ═══════════════════════════════════════════════════════════════════════════
//  MÉTRICAS DE GERENCIA (SLA, ciclo, envejecimiento, aprobadores)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/metrics', async (c) => {
  const roles = c.get('userRoles') ?? [];
  const allowed = roles.includes('flowapp-admin') || roles.includes('flowapp-approver');
  if (!allowed) return c.json({ error: 'forbidden', message: 'Panel disponible solo para administradores y aprobadores' }, 403);

  const db = c.env.DB;
  // SLA en días calendario por prioridad: urgente 2 · alta 4 · normal 6 · baja 8
  const SLA_CASE = "CASE t.priority WHEN 'urgent' THEN 2 WHEN 'high' THEN 4 WHEN 'normal' THEN 6 ELSE 8 END";

  const [bySpace, sla, aged, agedCount, pendingApr, decidedApr, reqStats] = await Promise.all([
    // Por área: abiertas, completadas 30d, ciclo medio (días)
    db.prepare(`
      SELECT s.id, s.name, s.color,
        SUM(CASE WHEN t.id IS NOT NULL AND t.archived = 0 AND COALESCE(ss.is_done, 0) = 0 THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN t.archived = 0 AND ss.is_done = 1 AND t.updated_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS done30,
        ROUND(AVG(CASE WHEN t.archived = 0 AND ss.is_done = 1 AND t.updated_at >= datetime('now','-30 days')
          THEN julianday(t.updated_at) - julianday(t.created_at) END), 1) AS cycle_days
      FROM ws_spaces s
      LEFT JOIN ws_tasks t ON t.space_id = s.id
      LEFT JOIN ws_space_statuses ss ON ss.space_id = t.space_id AND ss.key = t.status
      WHERE s.is_active = 1
      GROUP BY s.id ORDER BY s.sort_order
    `).all(),

    // Cumplimiento de SLA por prioridad (completadas últimos 30 días)
    db.prepare(`
      SELECT t.priority,
        COUNT(*) AS done30,
        SUM(CASE WHEN julianday(t.updated_at) - julianday(t.created_at) <= ${SLA_CASE} THEN 1 ELSE 0 END) AS within
      FROM ws_tasks t
      JOIN ws_space_statuses ss ON ss.space_id = t.space_id AND ss.key = t.status AND ss.is_done = 1
      WHERE t.archived = 0 AND t.updated_at >= datetime('now','-30 days')
      GROUP BY t.priority
    `).all(),

    // Tareas envejecidas: abiertas, >7 días sin movimiento
    db.prepare(`
      SELECT t.id, t.title, t.space_id, s.name AS space_name, s.color AS space_color,
        t.assignee_name, t.priority,
        CAST(julianday('now') - julianday(t.updated_at) AS INTEGER) AS stale_days
      FROM ws_tasks t
      JOIN ws_spaces s ON s.id = t.space_id
      LEFT JOIN ws_space_statuses ss ON ss.space_id = t.space_id AND ss.key = t.status
      WHERE t.archived = 0 AND COALESCE(ss.is_done, 0) = 0
        AND julianday('now') - julianday(t.updated_at) > 7
      ORDER BY stale_days DESC LIMIT 12
    `).all(),

    db.prepare(`
      SELECT COUNT(*) AS n
      FROM ws_tasks t
      LEFT JOIN ws_space_statuses ss ON ss.space_id = t.space_id AND ss.key = t.status
      WHERE t.archived = 0 AND COALESCE(ss.is_done, 0) = 0
        AND julianday('now') - julianday(t.updated_at) > 7
    `).first<{ n: number }>(),

    // Aprobadores: pendientes ahora
    db.prepare(`
      SELECT ast.approver_email, ast.approver_name, COUNT(*) AS pending
      FROM approval_steps ast
      JOIN requests r ON r.id = ast.request_id
      WHERE ast.status = 'pending' AND r.status = 'in_progress' AND r.current_level = ast.level
      GROUP BY ast.approver_email
    `).all(),

    // Aprobadores: tiempo medio de decisión (horas, últimos 30 días)
    db.prepare(`
      SELECT approver_email, approver_name, COUNT(*) AS decided,
        ROUND(AVG((julianday(decided_at) - julianday(COALESCE(notified_at, created_at))) * 24), 1) AS avg_hours
      FROM approval_steps
      WHERE decided_at IS NOT NULL AND decided_at >= datetime('now','-30 days')
      GROUP BY approver_email
    `).all(),

    // Solicitudes: últimos 30 días
    db.prepare(`
      SELECT
        SUM(CASE WHEN created_at >= datetime('now','-30 days') AND status != 'draft' THEN 1 ELSE 0 END) AS created30,
        SUM(CASE WHEN status = 'approved' AND updated_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS approved30,
        SUM(CASE WHEN status = 'rejected' AND updated_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS rejected30,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS inflight
      FROM requests
    `).first(),
  ]);

  // Unir aprobadores (pendientes + tiempos) por correo
  const aprMap = new Map<string, { name: string; email: string; pending: number; decided: number; avg_hours: number | null }>();
  for (const p of (pendingApr.results as { approver_email: string; approver_name: string; pending: number }[])) {
    aprMap.set(p.approver_email, { name: p.approver_name, email: p.approver_email, pending: p.pending, decided: 0, avg_hours: null });
  }
  for (const d of (decidedApr.results as { approver_email: string; approver_name: string; decided: number; avg_hours: number }[])) {
    const cur = aprMap.get(d.approver_email);
    if (cur) { cur.decided = d.decided; cur.avg_hours = d.avg_hours; }
    else aprMap.set(d.approver_email, { name: d.approver_name, email: d.approver_email, pending: 0, decided: d.decided, avg_hours: d.avg_hours });
  }

  return c.json({
    data: {
      bySpace: bySpace.results,
      slaByPriority: sla.results,
      aged: aged.results,
      agedCount: agedCount?.n ?? 0,
      approvers: [...aprMap.values()].sort((a, b) => b.pending - a.pending),
      requests: reqStats,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  PERSONAS — quién eres determina dónde empiezas
// ═══════════════════════════════════════════════════════════════════════════

// Perfil de la sesión: personas detectadas, señales que las justifican e inicio.
router.get('/me', async (c) => {
  const email = c.get('userEmail') ?? '';
  const userId = c.get('userId') ?? '';
  const roles = c.get('userRoles') ?? [];

  const [signals, preference] = await Promise.all([
    readPersonaSignals(c.env.DB, userId, email),
    c.env.DB.prepare('SELECT preferred_persona FROM user_preferences WHERE lower(user_email) = lower(?)')
      .bind(email).first<{ preferred_persona: string | null }>(),
  ]);

  const stored = preference?.preferred_persona ?? null;
  const preferred = isPersonaKey(stored) ? stored : null;
  return c.json({ data: buildProfile(email, c.get('userName') ?? '', signals, roles, preferred) });
});

// Fijar o soltar la persona con la que arranca la sesión.
router.put('/me/persona', async (c) => {
  const email = c.get('userEmail') ?? '';
  if (!email) return c.json({ error: 'unauthorized' }, 401);

  const body = await c.req.json<{ persona: PersonaKey | null }>();
  const persona = body.persona;
  if (persona !== null && !isPersonaKey(persona)) {
    return c.json({ error: 'invalid_persona', message: 'Persona no reconocida' }, 400);
  }

  const roles = c.get('userRoles') ?? [];
  const signals = await readPersonaSignals(c.env.DB, c.get('userId') ?? '', email);

  // Nadie puede fijarse una persona que no tiene: la preferencia elige entre
  // lo detectado, no lo inventa.
  if (persona) {
    const profile = buildProfile(email, '', signals, roles, null);
    if (!profile.personas.some(p => p.key === persona)) {
      return c.json({ error: 'persona_unavailable', message: 'Esa persona no está disponible para tu cuenta' }, 403);
    }
  }

  await c.env.DB.prepare(`
    INSERT INTO user_preferences (user_email, preferred_persona, updated_at)
    VALUES (lower(?), ?, datetime('now'))
    ON CONFLICT(user_email) DO UPDATE SET
      preferred_persona = excluded.preferred_persona, updated_at = excluded.updated_at
  `).bind(email, persona).run();

  return c.json({ data: buildProfile(email, c.get('userName') ?? '', signals, roles, persona) });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SOLICITANTE — mis solicitudes, estado, próximo paso y entregables
// ═══════════════════════════════════════════════════════════════════════════
router.get('/requests/mine', async (c) => {
  const email = (c.get('userEmail') || '').toLowerCase();
  const userId = c.get('userId') ?? '';

  const rows = await c.env.DB.prepare(`
    SELECT r.id, r.title, r.description, r.request_type_name, r.status, r.current_level, r.total_levels,
           r.created_at, r.submitted_at, r.approved_at, r.rejected_at, r.closed_at, r.sla_due_at,
           r.delivered_at, r.confirmed_at, r.reopen_due_at, r.reopen_count, r.cancel_reason,
           step.approver_name  AS pending_approver_name,
           step.label          AS pending_approver_label,
           fb.rating           AS rating,
           (SELECT COUNT(*) FROM request_returns rr WHERE rr.request_id = r.id) AS return_count,
           t.id                AS task_id,
           t.status            AS task_status,
           t.assignee_name     AS task_assignee_name,
           t.due_date          AS task_due_date,
           t.is_blocked        AS task_blocked,
           ss.label            AS task_status_label,
           COALESCE(ss.is_done, 0) AS task_done,
           (SELECT COUNT(*) FROM ws_task_deliverables d WHERE d.task_id = t.id) AS deliverables_total,
           (SELECT COUNT(*) FROM ws_task_deliverables d WHERE d.task_id = t.id AND d.is_completed = 1) AS deliverables_ready
    FROM requests r
    LEFT JOIN approval_steps step
      ON step.request_id = r.id AND step.level = r.current_level AND step.status = 'pending'
    LEFT JOIN ws_tasks t
      ON t.source_type = 'request' AND t.source_id = r.id AND t.archived = 0
    LEFT JOIN ws_space_statuses ss
      ON ss.space_id = t.space_id AND ss.key = t.status
    LEFT JOIN request_feedback fb ON fb.request_id = r.id
    WHERE r.requester_id = ? OR lower(r.requester_email) = ?
    ORDER BY
      CASE r.status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 WHEN 'draft' THEN 2
                    WHEN 'approved' THEN 3 ELSE 4 END,
      r.created_at DESC
    LIMIT 100
  `).bind(userId, email).all();

  const data: Record<string, unknown>[] = (rows.results as Record<string, unknown>[]).map(row => ({
    ...row,
    next_step: describeNextStep(row),
  }));

  const summary = data.reduce<{ drafts: number; in_flight: number; approved: number; rejected: number; awaiting_delivery: number; awaiting_me: number }>((acc, row) => {
    const status = String(row.status);
    if (status === 'draft') acc.drafts += 1;
    else if (status === 'pending' || status === 'in_progress') acc.in_flight += 1;
    else if (status === 'approved') acc.approved += 1;
    else if (status === 'rejected') acc.rejected += 1;
    if (row.task_done === 0 && row.deliverables_total) acc.awaiting_delivery += 1;
    // Lo que está detenido esperando al propio solicitante.
    if (status === 'draft' || (row.delivered_at && !row.confirmed_at)) acc.awaiting_me += 1;
    return acc;
  }, { drafts: 0, in_flight: 0, approved: 0, rejected: 0, awaiting_delivery: 0, awaiting_me: 0 });

  return c.json({ data, summary });
});

// Traduce el estado interno en la frase que el solicitante necesita leer.
function describeNextStep(row: Record<string, unknown>): string {
  const status = String(row.status ?? '');
  if (status === 'draft') return 'Falta que la envíes';
  if (status === 'rejected') return 'Rechazada — revisa el motivo en el detalle';
  if (status === 'cancelled') return row.cancel_reason ? `Cancelada: ${row.cancel_reason}` : 'Cancelada';
  if (status === 'pending' || status === 'in_progress') {
    const approver = row.pending_approver_name;
    const label = row.pending_approver_label;
    if (approver) return `Espera la decisión de ${approver}${label ? ` (${label})` : ''}`;
    return `En aprobación, nivel ${row.current_level} de ${row.total_levels}`;
  }
  if (status === 'approved') {
    if (row.confirmed_at) {
      return row.rating ? 'Cerrada y calificada' : 'Confirmada — puedes calificar el servicio';
    }
    if (row.delivered_at) return 'Entregada — confirma la recepción o devuélvela';
    if (row.task_blocked === 1) return 'El equipo reportó un bloqueo';
    if (row.task_assignee_name) return `${row.task_assignee_name} está trabajando en esto`;
    return 'Aprobada, pendiente de asignar responsable';
  }
  return 'Sin pasos pendientes';
}

// ═══════════════════════════════════════════════════════════════════════════
//  APROBADOR — decisiones con contexto, impacto y vencimiento
// ═══════════════════════════════════════════════════════════════════════════
router.get('/decisions', async (c) => {
  const email = (c.get('userEmail') || '').toLowerCase();
  const uid = c.get('userId');

  const [pending, decided] = await Promise.all([
    c.env.DB.prepare(`
      SELECT s.id AS step_id, s.level, s.label, s.created_at AS step_created_at, s.notified_at,
             r.id AS request_id, r.title, r.description, r.request_type_name,
             r.requester_name, r.requester_email, r.total_levels, r.created_at,
             r.submitted_at, r.sla_due_at, r.campaign_data,
             CAST(julianday('now') - julianday(COALESCE(s.notified_at, s.created_at)) AS INTEGER) AS waiting_days,
             (SELECT COUNT(*) FROM attachments a WHERE a.request_id = r.id) AS attachment_count,
             (SELECT COUNT(*) FROM requests o
               WHERE o.requester_id = r.requester_id AND o.status IN ('pending','in_progress')) AS requester_in_flight
      FROM approval_steps s
      JOIN requests r ON r.id = s.request_id
      WHERE s.status = 'pending' AND r.status = 'in_progress' AND r.current_level = s.level
        AND (s.approver_id = ? OR lower(s.approver_email) = ?)
      ORDER BY COALESCE(r.sla_due_at, '9999-12-31') ASC, s.created_at ASC
    `).bind(uid, email).all(),

    c.env.DB.prepare(`
      SELECT COUNT(*) AS decided30,
             ROUND(AVG((julianday(decided_at) - julianday(COALESCE(notified_at, created_at))) * 24), 1) AS avg_hours
      FROM approval_steps
      WHERE (approver_id = ? OR lower(approver_email) = ?)
        AND decided_at IS NOT NULL AND decided_at >= datetime('now','-30 days')
    `).bind(uid, email).first<{ decided30: number; avg_hours: number | null }>(),
  ]);

  const rows = pending.results as Record<string, unknown>[];
  const overdue = rows.filter(row => row.sla_due_at && String(row.sla_due_at) < new Date().toISOString()).length;

  return c.json({
    data: rows,
    summary: {
      pending: rows.length,
      overdue,
      oldest_days: rows.reduce((max, row) => Math.max(max, Number(row.waiting_days ?? 0)), 0),
      decided30: decided?.decided30 ?? 0,
      avg_hours: decided?.avg_hours ?? null,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  LÍDER DE ÁREA — capacidad, SLA, cuellos de botella y distribución
// ═══════════════════════════════════════════════════════════════════════════
router.get('/team-load', async (c) => {
  const email = (c.get('userEmail') || '').toLowerCase();
  const roles = c.get('userRoles') ?? [];
  const seesEverything = roles.includes('flowapp-admin') || roles.includes('flowapp-manager');

  const leadJoin = "JOIN ws_space_members m ON m.space_id = s.id AND lower(m.user_email) = ? AND m.role = 'lead'";
  const led = await c.env.DB.prepare(`
    SELECT s.id, s.name, s.color
    FROM ws_spaces s
    ${seesEverything ? '' : leadJoin}
    WHERE s.is_active = 1
    ORDER BY s.sort_order
  `).bind(...(seesEverything ? [] : [email])).all();

  const spaces = led.results as { id: string; name: string; color: string }[];
  if (spaces.length === 0) {
    return c.json({ data: { spaces: [], members: [], bottlenecks: [], summary: null } });
  }

  const ids = spaces.map(space => space.id);
  const placeholders = ids.map(() => '?').join(',');

  const [members, bottlenecks, summary] = await Promise.all([
    // Carga por persona: abierto, vencido, bloqueado y minutos comprometidos.
    c.env.DB.prepare(`
      SELECT m.space_id, m.user_email, COALESCE(m.user_name, m.user_email) AS user_name, m.role,
        COALESCE(SUM(CASE WHEN COALESCE(ss.is_done, 0) = 0 THEN 1 ELSE 0 END), 0) AS open_tasks,
        COALESCE(SUM(CASE WHEN COALESCE(ss.is_done, 0) = 0 AND t.due_date < date('now') THEN 1 ELSE 0 END), 0) AS overdue,
        COALESCE(SUM(CASE WHEN COALESCE(ss.is_done, 0) = 0 AND t.is_blocked = 1 THEN 1 ELSE 0 END), 0) AS blocked,
        COALESCE(SUM(CASE WHEN COALESCE(ss.is_done, 0) = 0 THEN COALESCE(t.estimate_minutes, 0) ELSE 0 END), 0) AS planned_minutes,
        COALESCE(SUM(CASE WHEN ss.is_done = 1 AND t.completed_at >= datetime('now','-7 days') THEN 1 ELSE 0 END), 0) AS done7
      FROM ws_space_members m
      LEFT JOIN ws_tasks t
        ON t.space_id = m.space_id AND lower(t.assignee_email) = lower(m.user_email) AND t.archived = 0
      LEFT JOIN ws_space_statuses ss ON ss.space_id = t.space_id AND ss.key = t.status
      WHERE m.space_id IN (${placeholders})
      GROUP BY m.space_id, m.user_email
      ORDER BY open_tasks DESC
    `).bind(...ids).all(),

    // Dónde se acumula el trabajo: estado con más antigüedad media.
    c.env.DB.prepare(`
      SELECT t.space_id, t.status, COALESCE(ss.label, t.status) AS status_label,
        COUNT(*) AS open_tasks,
        ROUND(AVG(julianday('now') - julianday(t.updated_at)), 1) AS avg_stale_days
      FROM ws_tasks t
      LEFT JOIN ws_space_statuses ss ON ss.space_id = t.space_id AND ss.key = t.status
      WHERE t.space_id IN (${placeholders}) AND t.archived = 0 AND COALESCE(ss.is_done, 0) = 0
      GROUP BY t.space_id, t.status
      HAVING COUNT(*) > 0
      ORDER BY avg_stale_days DESC
      LIMIT 10
    `).bind(...ids).all(),

    c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN COALESCE(ss.is_done, 0) = 0 THEN 1 ELSE 0 END), 0) AS open_tasks,
        COALESCE(SUM(CASE WHEN COALESCE(ss.is_done, 0) = 0 AND t.due_date < date('now') THEN 1 ELSE 0 END), 0) AS overdue,
        COALESCE(SUM(CASE WHEN COALESCE(ss.is_done, 0) = 0 AND t.is_blocked = 1 THEN 1 ELSE 0 END), 0) AS blocked,
        COALESCE(SUM(CASE WHEN COALESCE(ss.is_done, 0) = 0 AND COALESCE(t.assignee_email, '') = '' THEN 1 ELSE 0 END), 0) AS unassigned,
        ROUND(AVG(CASE WHEN ss.is_done = 1 AND t.completed_at >= datetime('now','-30 days')
          THEN julianday(t.completed_at) - julianday(t.created_at) END), 1) AS cycle_days
      FROM ws_tasks t
      LEFT JOIN ws_space_statuses ss ON ss.space_id = t.space_id AND ss.key = t.status
      WHERE t.space_id IN (${placeholders}) AND t.archived = 0
    `).bind(...ids).first(),
  ]);

  return c.json({
    data: {
      spaces,
      members: members.results,
      bottlenecks: bottlenecks.results,
      summary,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  MIEMBROS DEL ESPACIO (quién ejecuta y quién lidera)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/spaces/:id/members', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, space_id, user_email, user_name, role, created_at
    FROM ws_space_members WHERE space_id = ?
    ORDER BY CASE role WHEN 'lead' THEN 0 ELSE 1 END, COALESCE(user_name, user_email)
  `).bind(c.req.param('id')).all();
  return c.json({ data: rows.results });
});

router.put('/spaces/:id/members', async (c) => {
  const roles = c.get('userRoles') ?? [];
  if (!roles.includes('flowapp-admin')) {
    return c.json({ error: 'forbidden', message: 'Solo un administrador puede cambiar el equipo de un espacio' }, 403);
  }

  const spaceId = c.req.param('id');
  const space = await c.env.DB.prepare('SELECT id FROM ws_spaces WHERE id = ?').bind(spaceId).first();
  if (!space) return c.json({ error: 'not_found' }, 404);

  const body = await c.req.json<{ members: { user_email: string; user_name?: string; role: 'lead' | 'member' }[] }>();
  const members = (body.members ?? [])
    .filter(member => member.user_email?.trim())
    .map(member => ({
      email: member.user_email.trim().toLowerCase(),
      name: member.user_name?.trim() || member.user_email.trim(),
      role: member.role === 'lead' ? 'lead' : 'member',
    }));

  const statements = [
    c.env.DB.prepare('DELETE FROM ws_space_members WHERE space_id = ?').bind(spaceId),
    ...members.map(member => c.env.DB.prepare(`
      INSERT INTO ws_space_members (space_id, user_email, user_name, role) VALUES (?, ?, ?, ?)
      ON CONFLICT(space_id, user_email) DO UPDATE SET user_name = excluded.user_name, role = excluded.role
    `).bind(spaceId, member.email, member.name, member.role)),
  ];
  await c.env.DB.batch(statements);

  const rows = await c.env.DB.prepare(
    'SELECT id, space_id, user_email, user_name, role, created_at FROM ws_space_members WHERE space_id = ?'
  ).bind(spaceId).all();
  return c.json({ data: rows.results });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function defaultStatus(db: D1Database, spaceId: string): Promise<string> {
  const row = await db.prepare(
    'SELECT key FROM ws_space_statuses WHERE space_id = ? ORDER BY sort_order LIMIT 1'
  ).bind(spaceId).first() as { key: string } | null;
  return row?.key ?? 'todo';
}

export default router;
