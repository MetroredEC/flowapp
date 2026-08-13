// Motor de automatizaciones: Cuando ocurra X, si se cumple Y, hacer Z.
//
// El único enganche es recordWorkEvent: por ahí ya pasa todo lo que ocurre en
// una solicitud o una tarea, así que no hace falta instrumentar cada ruta.
//
// Regla de diseño para evitar recursión: las acciones escriben directo en las
// tablas y NO emiten work_events. Si una acción registrara un evento, ese
// evento volvería a entrar al motor y una regla mal escrita podría dispararse
// a sí misma en bucle. La trazabilidad de lo que hizo el motor vive en
// automation_runs y en ws_task_activity, no en la cadena de disparo.

import type { WorkEventInput } from './work-events';

type DB = D1Database;

export interface AutomationCondition {
  field: string;
  op: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'is_empty' | 'is_not_empty';
  value?: string | number | null;
}

export type AutomationAction =
  | { type: 'notify'; to: 'assignee' | 'requester' | 'lead' | 'email'; email?: string; body: string }
  | { type: 'set_priority'; value: 'low' | 'normal' | 'high' | 'urgent' }
  | { type: 'set_due_in_days'; value: number }
  | { type: 'assign_to'; email: string; name?: string }
  | { type: 'block'; reason: string }
  | { type: 'unblock' }
  | { type: 'comment'; body: string };

interface AutomationRow {
  id: string;
  name: string;
  process_id: string | null;
  space_id: string | null;
  conditions_json: string;
  actions_json: string;
}

/** Contexto plano con claves punteadas: request.status, task.priority, etc. */
type Context = Record<string, string | number | null>;

// ─── Catálogo ────────────────────────────────────────────────────────────────
// El editor visual se construye a partir de esto: si una capacidad no está
// aquí, no aparece en la interfaz. Evita que el frontend invente disparadores
// o campos que el motor no sabe evaluar.

export const TRIGGERS: { event: string; label: string; scope: 'request' | 'task' }[] = [
  { event: 'request_created',    label: 'Se crea una solicitud',            scope: 'request' },
  { event: 'request_submitted',  label: 'Se envía una solicitud',           scope: 'request' },
  { event: 'request_approved',   label: 'Se aprueba una solicitud',         scope: 'request' },
  { event: 'request_cancelled',  label: 'Se cancela una solicitud',         scope: 'request' },
  { event: 'request_edited',     label: 'El solicitante corrige',           scope: 'request' },
  { event: 'task_created',       label: 'Se crea el trabajo del área',      scope: 'task' },
  { event: 'task_assigned',      label: 'Se asigna un responsable',         scope: 'task' },
  { event: 'task_status',        label: 'Cambia el estado del trabajo',     scope: 'task' },
  { event: 'task_completed',     label: 'Se completa el trabajo',           scope: 'task' },
  { event: 'request_delivered',  label: 'Se entrega al solicitante',        scope: 'request' },
  { event: 'delivery_confirmed', label: 'El solicitante confirma',          scope: 'request' },
  { event: 'delivery_returned',  label: 'El solicitante devuelve',          scope: 'request' },
  { event: 'request_reopened',   label: 'Se reabre una solicitud',          scope: 'request' },
  { event: 'request_rated',      label: 'El solicitante califica',          scope: 'request' },
  { event: 'request_closed',     label: 'Se cierra el proceso',             scope: 'request' },
];

export const CONDITION_FIELDS: { field: string; label: string; kind: 'text' | 'number' | 'choice'; options?: string[] }[] = [
  { field: 'request.status',          label: 'Estado de la solicitud', kind: 'choice', options: ['draft', 'pending', 'in_progress', 'approved', 'rejected', 'cancelled'] },
  { field: 'request.request_type_name', label: 'Nombre del proceso',   kind: 'text' },
  { field: 'request.requester_email', label: 'Correo del solicitante', kind: 'text' },
  { field: 'request.current_level',   label: 'Nivel de aprobación',    kind: 'number' },
  { field: 'request.reopen_count',    label: 'Veces reabierta',        kind: 'number' },
  { field: 'task.priority',           label: 'Prioridad del trabajo',  kind: 'choice', options: ['low', 'normal', 'high', 'urgent'] },
  { field: 'task.status',             label: 'Estado del trabajo',     kind: 'text' },
  { field: 'task.assignee_email',     label: 'Responsable',            kind: 'text' },
  { field: 'task.is_blocked',         label: 'Está bloqueada (1 o 0)', kind: 'number' },
  { field: 'task.estimate_minutes',   label: 'Minutos estimados',      kind: 'number' },
  { field: 'task.space_id',           label: 'Espacio',                kind: 'text' },
];

export const CONDITION_OPS: { op: AutomationCondition['op']; label: string; needsValue: boolean }[] = [
  { op: 'eq',           label: 'es igual a',      needsValue: true },
  { op: 'neq',          label: 'no es igual a',   needsValue: true },
  { op: 'contains',     label: 'contiene',        needsValue: true },
  { op: 'gt',           label: 'es mayor que',    needsValue: true },
  { op: 'gte',          label: 'es mayor o igual', needsValue: true },
  { op: 'lt',           label: 'es menor que',    needsValue: true },
  { op: 'lte',          label: 'es menor o igual', needsValue: true },
  { op: 'is_empty',     label: 'está vacío',      needsValue: false },
  { op: 'is_not_empty', label: 'tiene valor',     needsValue: false },
];

export const ACTION_TYPES: { type: AutomationAction['type']; label: string; hint: string }[] = [
  { type: 'notify',          label: 'Avisar a alguien',        hint: 'Deja una novedad en su bandeja' },
  { type: 'set_priority',    label: 'Cambiar la prioridad',    hint: 'Sube o baja la urgencia del trabajo' },
  { type: 'set_due_in_days', label: 'Mover la fecha límite',   hint: 'Recalcula el vencimiento desde hoy' },
  { type: 'assign_to',       label: 'Asignar responsable',     hint: 'Reasigna el trabajo y avisa' },
  { type: 'block',           label: 'Marcar como bloqueada',   hint: 'La saca del flujo normal con un motivo' },
  { type: 'unblock',         label: 'Quitar el bloqueo',       hint: 'Devuelve la tarea al flujo' },
  { type: 'comment',         label: 'Comentar en el trabajo',  hint: 'Deja una nota visible para el equipo' },
];

const VALID_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const VALID_RECIPIENTS = new Set(['assignee', 'requester', 'lead', 'email']);
const VALID_TRIGGERS = new Set(TRIGGERS.map(t => t.event));
const VALID_FIELDS = new Set(CONDITION_FIELDS.map(f => f.field));
const VALID_OPS = new Set(CONDITION_OPS.map(o => o.op));
const VALID_ACTIONS = new Set(ACTION_TYPES.map(a => a.type));

/** Valida una regla antes de guardarla. Devuelve el motivo del rechazo o null. */
export function validateAutomation(
  triggerEvent: string, conditions: AutomationCondition[], actions: AutomationAction[],
): string | null {
  if (!VALID_TRIGGERS.has(triggerEvent)) return 'El disparador no existe';
  if (!Array.isArray(conditions) || !Array.isArray(actions)) return 'Condiciones o acciones mal formadas';
  if (actions.length === 0) return 'La automatización necesita al menos una acción';
  if (actions.length > MAX_ACTIONS_PER_RUN) return `Máximo ${MAX_ACTIONS_PER_RUN} acciones por automatización`;
  if (conditions.length > 10) return 'Máximo 10 condiciones por automatización';

  for (const condition of conditions) {
    if (!VALID_FIELDS.has(condition.field)) return `Campo no reconocido: ${condition.field}`;
    if (!VALID_OPS.has(condition.op)) return `Operador no reconocido: ${condition.op}`;
    const needsValue = CONDITION_OPS.find(o => o.op === condition.op)?.needsValue;
    if (needsValue && (condition.value === undefined || condition.value === null || condition.value === '')) {
      return 'Hay una condición sin valor';
    }
  }

  for (const action of actions) {
    if (!VALID_ACTIONS.has(action.type)) return `Acción no reconocida: ${action.type}`;
    if (action.type === 'notify') {
      if (!action.body?.trim()) return 'El aviso necesita un mensaje';
      if (!VALID_RECIPIENTS.has(action.to)) return `Destinatario no reconocido: ${action.to}`;
      if (action.to === 'email' && !action.email?.trim()) return 'Falta el correo del destinatario';
    }
    // ws_tasks restringe priority con un CHECK: un valor fuera de la lista
    // haría fallar la acción en ejecución, no al guardarla.
    if (action.type === 'set_priority' && !VALID_PRIORITIES.has(action.value)) {
      return `Prioridad no válida: ${action.value}`;
    }
    if (action.type === 'assign_to' && !action.email?.trim()) return 'Falta el correo del nuevo responsable';
    if (action.type === 'block' && !action.reason?.trim()) return 'El bloqueo necesita un motivo';
    if (action.type === 'comment' && !action.body?.trim()) return 'El comentario necesita texto';
    if (action.type === 'set_due_in_days' && !Number.isFinite(Number(action.value))) {
      return 'La fecha límite necesita un número de días';
    }
  }
  return null;
}

const MAX_ACTIONS_PER_RUN = 10;

export async function runAutomations(db: DB, event: WorkEventInput): Promise<void> {
  try {
    const rules = await db.prepare(`
      SELECT id, name, process_id, space_id, conditions_json, actions_json
      FROM automations
      WHERE is_active = 1 AND trigger_event = ?
    `).bind(event.eventType).all();

    const candidates = rules.results as unknown as AutomationRow[];
    if (!candidates.length) return;

    const context = await buildContext(db, event);
    if (!context) return;

    for (const rule of candidates) {
      // Ámbito: una regla sin proceso ni espacio aplica a todo.
      if (rule.process_id && rule.process_id !== context['request.request_type_id']) continue;
      if (rule.space_id && rule.space_id !== context['task.space_id']) continue;

      let conditions: AutomationCondition[] = [];
      let actions: AutomationAction[] = [];
      try {
        conditions = JSON.parse(rule.conditions_json) as AutomationCondition[];
        actions = JSON.parse(rule.actions_json) as AutomationAction[];
      } catch {
        await logRun(db, rule, event, false, null, 'Configuración ilegible');
        continue;
      }

      if (!conditions.every(condition => matches(condition, context))) {
        continue; // No coincide: no se registra para no llenar la bitácora de ruido.
      }

      const applied: string[] = [];
      let failure: string | null = null;
      for (const action of actions.slice(0, MAX_ACTIONS_PER_RUN)) {
        try {
          const label = await apply(db, action, context, rule);
          if (label) applied.push(label);
        } catch (error) {
          failure = error instanceof Error ? error.message : String(error);
          break;
        }
      }
      await logRun(db, rule, event, true, applied.join(' · ') || null, failure);
    }
  } catch (error) {
    // Una automatización rota nunca debe tumbar la operación que la disparó.
    console.error('AUTOMATION_ENGINE_FAILED', event.eventType,
      error instanceof Error ? error.message : String(error));
  }
}

async function buildContext(db: DB, event: WorkEventInput): Promise<Context | null> {
  const request = await db.prepare(`
    SELECT id, request_type_id, request_type_name, status, current_level, total_levels,
           requester_name, requester_email, sla_due_at, delivered_at, confirmed_at, reopen_count
    FROM requests WHERE id = ?
  `).bind(event.requestId).first<Record<string, unknown>>();

  const task = event.taskId
    ? await db.prepare('SELECT * FROM ws_tasks WHERE id = ?').bind(event.taskId).first<Record<string, unknown>>()
    : await db.prepare(
        "SELECT * FROM ws_tasks WHERE source_type = 'request' AND source_id = ? AND archived = 0 LIMIT 1"
      ).bind(event.requestId).first<Record<string, unknown>>();

  if (!request && !task) return null;

  const context: Context = { 'event.type': event.eventType };
  const copy = (prefix: string, row: Record<string, unknown> | null, keys: string[]) => {
    if (!row) return;
    for (const key of keys) {
      const value = row[key];
      context[`${prefix}.${key}`] =
        value === null || value === undefined ? null
        : typeof value === 'number' ? value
        : String(value);
    }
  };

  copy('request', request ?? null, [
    'id', 'request_type_id', 'request_type_name', 'status', 'current_level',
    'total_levels', 'requester_name', 'requester_email', 'sla_due_at',
    'delivered_at', 'confirmed_at', 'reopen_count',
  ]);
  copy('task', task ?? null, [
    'id', 'title', 'space_id', 'status', 'priority', 'assignee_email',
    'assignee_name', 'due_date', 'is_blocked', 'estimate_minutes',
  ]);

  return context;
}

function matches(condition: AutomationCondition, context: Context): boolean {
  const actual = context[condition.field] ?? null;
  const expected = condition.value ?? null;

  switch (condition.op) {
    case 'is_empty':     return actual === null || actual === '';
    case 'is_not_empty': return actual !== null && actual !== '';
    case 'eq':           return String(actual) === String(expected);
    case 'neq':          return String(actual) !== String(expected);
    case 'contains':     return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'gt': case 'lt': case 'gte': case 'lte': {
      const a = Number(actual);
      const b = Number(expected);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      return condition.op === 'gt' ? a > b
           : condition.op === 'lt' ? a < b
           : condition.op === 'gte' ? a >= b : a <= b;
    }
    default: return false;
  }
}

/** Sustituye {{request.title}} y similares dentro de los textos de la acción. */
function render(template: string, context: Context): string {
  return template.replace(/\{\{\s*([a-z_.]+)\s*\}\}/gi, (_, key: string) =>
    String(context[key] ?? ''));
}

async function apply(
  db: DB, action: AutomationAction, context: Context, rule: AutomationRow,
): Promise<string | null> {
  const taskId = context['task.id'] as string | null;
  const requestId = context['request.id'] as string | null;

  switch (action.type) {
    case 'notify': {
      const target = await resolveRecipient(db, action, context);
      if (!target) return null;
      await db.prepare(`
        INSERT INTO ws_notifications (user_email, type, task_id, task_title, space_id, actor_name, body)
        VALUES (?, 'status', ?, ?, ?, ?, ?)
      `).bind(
        target, taskId, context['task.title'] ?? context['request.request_type_name'] ?? null,
        context['task.space_id'] ?? null, `Automatización · ${rule.name}`,
        render(action.body, context),
      ).run();
      return `avisó a ${target}`;
    }

    case 'set_priority': {
      if (!taskId) return null;
      await db.prepare("UPDATE ws_tasks SET priority = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(action.value, taskId).run();
      await trace(db, taskId, rule, `Prioridad cambiada a ${action.value}`);
      return `prioridad ${action.value}`;
    }

    case 'set_due_in_days': {
      if (!taskId) return null;
      const days = Math.max(0, Math.min(Math.round(Number(action.value)), 365));
      await db.prepare(
        "UPDATE ws_tasks SET due_date = date('now', ?), updated_at = datetime('now') WHERE id = ?"
      ).bind(`+${days} days`, taskId).run();
      await trace(db, taskId, rule, `Fecha límite movida a ${days} día(s)`);
      return `vence en ${days}d`;
    }

    case 'assign_to': {
      if (!taskId) return null;
      const email = action.email.trim().toLowerCase();
      await db.prepare(
        "UPDATE ws_tasks SET assignee_email = ?, assignee_name = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(email, action.name ?? email, taskId).run();
      await trace(db, taskId, rule, `Asignada a ${action.name ?? email}`);
      await db.prepare(`
        INSERT INTO ws_notifications (user_email, type, task_id, task_title, space_id, actor_name, body)
        VALUES (?, 'assignment', ?, ?, ?, ?, ?)
      `).bind(
        email, taskId, context['task.title'] ?? null, context['task.space_id'] ?? null,
        `Automatización · ${rule.name}`, `Se te asignó "${context['task.title'] ?? 'una tarea'}"`,
      ).run();
      return `asignada a ${email}`;
    }

    case 'block': {
      if (!taskId) return null;
      await db.prepare(
        "UPDATE ws_tasks SET is_blocked = 1, blocked_reason = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(render(action.reason, context), taskId).run();
      await trace(db, taskId, rule, 'Marcada como bloqueada');
      return 'bloqueada';
    }

    case 'unblock': {
      if (!taskId) return null;
      await db.prepare(
        "UPDATE ws_tasks SET is_blocked = 0, blocked_reason = NULL, updated_at = datetime('now') WHERE id = ?"
      ).bind(taskId).run();
      await trace(db, taskId, rule, 'Desbloqueada');
      return 'desbloqueada';
    }

    case 'comment': {
      if (!taskId) return null;
      await db.prepare(`
        INSERT INTO ws_task_comments (task_id, author_name, author_email, body)
        VALUES (?, ?, 'automatizacion@flowapp', ?)
      `).bind(taskId, `Automatización · ${rule.name}`, render(action.body, context)).run();
      return 'comentó';
    }

    default:
      // Acción desconocida: la regla se guardó con una versión más nueva.
      void requestId;
      return null;
  }
}

async function resolveRecipient(
  db: DB, action: Extract<AutomationAction, { type: 'notify' }>, context: Context,
): Promise<string | null> {
  if (action.to === 'email') return action.email?.trim().toLowerCase() || null;
  if (action.to === 'assignee') return (context['task.assignee_email'] as string | null) || null;
  if (action.to === 'requester') return (context['request.requester_email'] as string | null) || null;

  const spaceId = context['task.space_id'];
  if (!spaceId) return null;
  const lead = await db.prepare(
    "SELECT user_email FROM ws_space_members WHERE space_id = ? AND role = 'lead' ORDER BY created_at LIMIT 1"
  ).bind(spaceId).first<{ user_email: string }>();
  return lead?.user_email ?? null;
}

/** Deja rastro en la tarea sin emitir un work_event (evita realimentación). */
async function trace(db: DB, taskId: string, rule: AutomationRow, detail: string): Promise<void> {
  await db.prepare(`
    INSERT INTO ws_task_activity (task_id, actor_name, actor_email, action, meta_json)
    VALUES (?, ?, 'automatizacion@flowapp', 'automation', ?)
  `).bind(taskId, `Automatización · ${rule.name}`, JSON.stringify({ rule: rule.id, detail })).run();
}

async function logRun(
  db: DB, rule: AutomationRow, event: WorkEventInput,
  matched: boolean, applied: string | null, error: string | null,
): Promise<void> {
  await db.prepare(`
    INSERT INTO automation_runs
      (automation_id, automation_name, event_type, request_id, task_id, matched, actions_applied, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    rule.id, rule.name, event.eventType, event.requestId, event.taskId ?? null,
    matched ? 1 : 0, applied, error,
  ).run();
}
