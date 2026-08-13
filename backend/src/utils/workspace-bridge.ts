// Puente Solicitud → Tarea de Workspace
// Cuando una solicitud se aprueba, se crea una tarea en el espacio del área
// para que el equipo la ejecute, con trazabilidad completa.
import { recordWorkEvent } from './work-events';
import { resolveExecutionConfig } from './process-version';
import { pickAssignee } from './capacity';

type DB = D1Database;

interface RequestRowLite {
  id: string;
  request_type_id: string;
  request_type_name: string;
  title: string;
  description: string;
  requester_id: string;
  requester_name: string;
  requester_email: string;
  campaign_data: string | null;
  sla_due_at: string | null;
}

// La configuración de ejecución sale de la versión anclada en la solicitud,
// no de la configuración vigente del proceso. Ver utils/process-version.ts.

// Mapea el tipo de solicitud → espacio de trabajo
async function spaceForRequestType(db: DB, requestTypeId: string, configured?: string | null): Promise<string> {
  if (configured) {
    const exists = await db.prepare('SELECT id FROM ws_spaces WHERE id = ? AND is_active = 1')
      .bind(configured).first();
    if (exists) return configured;
  }
  // 1) Categoría configurada en el wizard
  const cfg = await db.prepare('SELECT category FROM process_configs WHERE id = ?')
    .bind(requestTypeId).first<{ category: string | null }>();
  const cat = (cfg?.category ?? '').toLowerCase();
  const map: Record<string, string> = {
    bi: 'bi', marketing: 'marketing', comercial: 'comercial', sso: 'sso',
    operaciones: 'operaciones', compras: 'operaciones', rrhh: 'operaciones',
  };
  if (map[cat]) return map[cat];

  // 2) Heurística por prefijo del id (rt-bi-*, rt-com-*, rt-mkt-*, rt-sso-*)
  const id = requestTypeId.toLowerCase();
  if (id.includes('bi'))  return 'bi';
  if (id.includes('mkt') || id.includes('market')) return 'marketing';
  if (id.includes('com')) return 'comercial';
  if (id.includes('sso') || id.includes('oper')) return 'operaciones';

  // 3) Verificar que el espacio existe; si no, caer en 'comercial'
  return 'comercial';
}

// Detecta prioridad a partir de los campos del formulario
function detectPriority(fields: Record<string, unknown> | null): string {
  if (!fields) return 'normal';
  const joined = Object.values(fields).map(v => String(v ?? '').toLowerCase()).join(' ');
  if (joined.includes('urgent')) return 'urgent';
  if (joined.includes('alta'))   return 'high';
  if (joined.includes('baja'))   return 'low';
  return 'normal';
}

// Auto-asignación por capacidad real. Ver utils/capacity.ts: la versión
// anterior leía dept_team_members, una tabla vacía y limitada a dos
// departamentos, así que nunca asignaba a nadie.
async function autoAssignForSpace(
  db: DB, spaceId: string, specialty?: string | null,
): Promise<{ user_id: string; user_name: string; user_email: string; reason: string } | null> {
  const pick = await pickAssignee(db, spaceId, { specialty });
  if (!pick) return null;
  return {
    user_id: pick.user_email, user_name: pick.user_name,
    user_email: pick.user_email, reason: pick.reason,
  };
}

// Crea la tarea (idempotente por source_id)
export async function createTaskFromRequest(db: DB, requestId: string): Promise<void> {
  const req = await db.prepare('SELECT * FROM requests WHERE id = ?')
    .bind(requestId).first<RequestRowLite>();
  if (!req) return;

  const exists = await db.prepare(
    "SELECT id FROM ws_tasks WHERE source_type = 'request' AND source_id = ?"
  ).bind(requestId).first();
  if (exists) return;

  const config = await resolveExecutionConfig(db, requestId);
  const spaceId = await spaceForRequestType(db, req.request_type_id, config?.workspace_id);
  const okSpace = await db.prepare('SELECT id FROM ws_spaces WHERE id = ?').bind(spaceId).first();
  const finalSpace = okSpace ? spaceId : 'comercial';

  const startStatus = await db.prepare(
    'SELECT key FROM ws_space_statuses WHERE space_id = ? ORDER BY sort_order LIMIT 1'
  ).bind(finalSpace).first<{ key: string }>();

  // Campos personalizados desde campaign_data
  let fields: Record<string, unknown> | null = null;
  try {
    const cd = req.campaign_data ? JSON.parse(req.campaign_data) : null;
    fields = cd?.fields ?? cd ?? null;
  } catch { fields = null; }

  const priority = detectPriority(fields);
  const customJson = fields ? JSON.stringify(fields) : null;

  // La estrategia se define en Process Studio. Procesos antiguos conservan auto-asignación.
  const mode = config?.assignment_mode ?? 'auto_load';
  // La categoría del proceso hace de especialidad: si alguien del espacio la
  // tiene declarada, se le da preferencia sobre quien solo está más libre.
  const processCategory = await db.prepare('SELECT category FROM process_configs WHERE id = ?')
    .bind(req.request_type_id).first<{ category: string | null }>();
  const assignee = mode === 'fixed_user' && config?.fixed_assignee_email
    ? {
        user_id: config.fixed_assignee_id ?? config.fixed_assignee_email,
        user_name: config.fixed_assignee_name ?? config.fixed_assignee_email,
        user_email: config.fixed_assignee_email,
        reason: 'Responsable fijo del proceso',
      }
    : mode === 'manual' ? null : await autoAssignForSpace(db, finalSpace, processCategory?.category);
  const executionDue = config?.execution_sla_days
    ? new Date(Date.now() + Number(config.execution_sla_days) * 86400000).toISOString().slice(0, 10)
    : req.sla_due_at;

  await db.prepare(`
    INSERT INTO ws_tasks (
      space_id, title, description, status, priority,
      assignee_id, assignee_name, assignee_email,
      created_by_id, created_by_name, created_by_email,
      due_date, source_type, source_id, custom_fields_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'request', ?, ?)
  `).bind(
    finalSpace,
    req.title,
    `${req.description}\n\n(Solicitud aprobada de ${req.requester_name})`,
    startStatus?.key ?? 'todo',
    priority,
    assignee?.user_id ?? null, assignee?.user_name ?? null, assignee?.user_email ?? null,
    req.requester_id, req.requester_name, req.requester_email,
    executionDue, requestId, customJson
  ).run();

  const task = await db.prepare(
    "SELECT id, title, space_id FROM ws_tasks WHERE source_type = 'request' AND source_id = ? LIMIT 1"
  ).bind(requestId).first<{ id: string; title: string; space_id: string }>();
  if (task) {
    let checklist: Array<{ label?: string; required?: boolean }> = [];
    let deliverables: Array<{ label?: string; required?: boolean }> = [];
    try { checklist = JSON.parse(config?.checklist_json ?? '[]'); } catch { checklist = []; }
    try { deliverables = JSON.parse(config?.deliverables_json ?? '[]'); } catch { deliverables = []; }
    const requirements: D1PreparedStatement[] = [];
    checklist.filter(item => item.label?.trim()).forEach((item, index) => {
      requirements.push(db.prepare(`
        INSERT INTO ws_task_checklist (id, task_id, label, is_required, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), task.id, item.label!.trim(), item.required === false ? 0 : 1, index));
    });
    deliverables.filter(item => item.label?.trim()).forEach((item, index) => {
      requirements.push(db.prepare(`
        INSERT INTO ws_task_deliverables (id, task_id, label, is_required, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), task.id, item.label!.trim(), item.required === false ? 0 : 1, index));
    });
    if (requirements.length) await db.batch(requirements);

    await db.prepare(`
      INSERT INTO ws_task_activity (task_id, actor_name, actor_email, action, meta_json)
      VALUES (?, ?, ?, 'created', ?)
    `).bind(task.id, req.requester_name, req.requester_email, JSON.stringify({ source: 'solicitud aprobada' })).run();
    await recordWorkEvent(db, {
      requestId, taskId: task.id, eventType: 'task_created', title: 'Trabajo creado en el área',
      actorId: req.requester_id, actorName: 'FlowApp',
      detail: { space_id: task.space_id, due_date: req.sla_due_at, priority },
    });

    if (assignee) {
      await db.prepare(`
        INSERT INTO ws_task_activity (task_id, actor_name, action, meta_json)
        VALUES (?, 'FlowApp', 'assigned', ?)
      `).bind(task.id, JSON.stringify({ to: assignee.user_name, source: assignee.reason })).run();
      await db.prepare(`
        INSERT INTO ws_notifications (user_email, type, task_id, task_title, space_id, actor_name, body)
        VALUES (?, 'assignment', ?, ?, ?, 'FlowApp', ?)
      `).bind(
        assignee.user_email, task.id, task.title, task.space_id,
        `Se te asignó "${task.title}" (solicitud aprobada de ${req.requester_name})`
      ).run();
      await recordWorkEvent(db, {
        requestId, taskId: task.id, eventType: 'task_assigned', title: 'Responsable asignado',
        actorName: 'FlowApp', detail: { assignee: assignee.user_name, assignee_email: assignee.user_email },
      });
    }
  }
}

/** Días que el solicitante tiene para reabrir tras confirmar la entrega. */
const REOPEN_WINDOW_DAYS = 7;

/**
 * El equipo terminó el trabajo: la solicitud pasa a "entregada".
 *
 * Hasta ahora `require_requester_confirmation` se configuraba en Process Studio
 * y no ocurría nada. Aquí es donde esa configuración se vuelve real: si el
 * proceso pide confirmación, la solicitud queda esperando al solicitante en vez
 * de cerrarse sola; si no la pide, se cierra en el acto.
 */
export async function markRequestDelivered(db: DB, requestId: string, taskId: string): Promise<void> {
  const req = await db.prepare(
    'SELECT id, request_type_id, requester_email, requester_name, title, delivered_at, confirmed_at FROM requests WHERE id = ?'
  ).bind(requestId).first<{
    id: string; request_type_id: string; requester_email: string; requester_name: string;
    title: string; delivered_at: string | null; confirmed_at: string | null;
  }>();
  if (!req || req.delivered_at) return;

  const config = await resolveExecutionConfig(db, requestId);
  const needsConfirmation = config?.require_requester_confirmation !== 0;

  const reopenDueAt = new Date(Date.now() + REOPEN_WINDOW_DAYS * 86400000).toISOString();

  if (needsConfirmation) {
    await db.prepare(`
      UPDATE requests SET delivered_at = datetime('now'), reopen_due_at = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(reopenDueAt, requestId).run();

    if (req.requester_email) {
      const task = await db.prepare('SELECT space_id FROM ws_tasks WHERE id = ?')
        .bind(taskId).first<{ space_id: string }>();
      await db.prepare(`
        INSERT INTO ws_notifications (user_email, type, task_id, task_title, space_id, actor_name, body)
        VALUES (?, 'status', ?, ?, ?, 'FlowApp', ?)
      `).bind(
        req.requester_email, taskId, req.title, task?.space_id ?? null,
        `"${req.title}" está lista. Revisa la entrega y confirma la recepción.`
      ).run();
    }

    await recordWorkEvent(db, {
      requestId, taskId, eventType: 'request_delivered',
      title: 'Trabajo entregado, espera confirmación del solicitante',
      actorName: 'FlowApp', detail: { reopen_due_at: reopenDueAt },
    });
    return;
  }

  await db.prepare(`
    UPDATE requests SET delivered_at = datetime('now'), confirmed_at = datetime('now'),
      closed_at = COALESCE(closed_at, datetime('now')), updated_at = datetime('now')
    WHERE id = ?
  `).bind(requestId).run();

  await recordWorkEvent(db, {
    requestId, taskId, eventType: 'request_delivered',
    title: 'Trabajo entregado y cerrado automáticamente',
    actorName: 'FlowApp', detail: { requires_confirmation: false },
  });
}

// Marca la tarea de la solicitud como completada (al cerrar la solicitud)
export async function completeTaskFromRequest(db: DB, requestId: string): Promise<void> {
  const task = await db.prepare(
    "SELECT id, space_id FROM ws_tasks WHERE source_type = 'request' AND source_id = ?"
  ).bind(requestId).first<{ id: string; space_id: string }>();
  if (!task) return;

  const doneStatus = await db.prepare(
    'SELECT key FROM ws_space_statuses WHERE space_id = ? AND is_done = 1 ORDER BY sort_order LIMIT 1'
  ).bind(task.space_id).first<{ key: string }>();
  if (!doneStatus) return;

  await db.prepare("UPDATE ws_tasks SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(doneStatus.key, task.id).run();
  await db.prepare(`
    INSERT INTO ws_task_activity (task_id, actor_name, action, meta_json)
    VALUES (?, 'FlowApp', 'status', ?)
  `).bind(task.id, JSON.stringify({ to: doneStatus.key, source: 'solicitud cerrada' })).run();
  await recordWorkEvent(db, {
    requestId, taskId: task.id, eventType: 'task_completed', title: 'Trabajo completado',
    actorName: 'FlowApp', detail: { status: doneStatus.key },
  });
}
