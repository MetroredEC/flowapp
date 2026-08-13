// Barrido programado de automatizaciones.
//
// Hace dos cosas que el motor por eventos no puede hacer solo:
//
// 1. Emitir disparadores por tiempo. Nadie "hace" que una tarea venza mañana,
//    así que no hay evento que lo anuncie. El barrido recorre el trabajo
//    abierto, calcula el contexto temporal y lo pasa por el mismo motor: las
//    reglas de tiempo se escriben igual que las de evento.
//
// 2. Vaciar la bandeja de salida. El motor corre dentro de recordWorkEvent,
//    que no recibe el entorno; aquí sí está, y con él el webhook de Teams y el
//    token de Graph.
//
// El barrido nunca emite work_events: llama al motor directamente. Un evento
// sintético en la línea de tiempo ensuciaría el historial de la solicitud con
// entradas que ningún humano provocó.

import { runAutomations } from './automations';
import { sendTeamsCard, appUrl } from './teams';
import { getAppToken, sendMail } from './graph';
import { logEvent } from './syslog';

type DB = D1Database;

interface SchedulerEnv {
  DB: D1Database;
  KV: KVNamespace;
  TEAMS_WEBHOOK_URL?: string;
  FRONTEND_URL?: string;
  PLATFORM_URL: string;
  ENTRA_TENANT_ID: string;
  ENTRA_CLIENT_ID: string;
  ENTRA_CLIENT_SECRET: string;
  MAIL_SENDER_UPN?: string;
}

/** Tope por corrida: evita que un barrido se coma el tiempo de CPU del worker. */
const MAX_TASKS_PER_SWEEP = 200;
const MAX_APPROVALS_PER_SWEEP = 100;
const MAX_OUTBOX_PER_SWEEP = 25;
const MAX_ATTEMPTS = 3;

/** Día operativo de Ecuador (UTC-5), usado como cubo de deduplicación. */
function operativeDay(): string {
  const now = new Date(Date.now() - 5 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

export async function runScheduledAutomations(env: SchedulerEnv): Promise<void> {
  const day = operativeDay();
  await sweepTasks(env.DB, day);
  await sweepApprovals(env.DB, day);
  await drainOutbox(env);
}

// ─── 1. Trabajo abierto ───────────────────────────────────────────────────────
async function sweepTasks(db: DB, day: string): Promise<void> {
  const rows = await db.prepare(`
    SELECT t.id, t.source_id, t.assignee_email, t.due_date, t.updated_at, t.created_at
    FROM ws_tasks t
    LEFT JOIN ws_space_statuses ss ON ss.space_id = t.space_id AND ss.key = t.status
    WHERE t.archived = 0 AND COALESCE(ss.is_done, 0) = 0
      AND t.source_type = 'request' AND t.source_id IS NOT NULL
    ORDER BY t.updated_at ASC
    LIMIT ${MAX_TASKS_PER_SWEEP}
  `).all();

  const now = Date.now();
  for (const row of rows.results as Record<string, unknown>[]) {
    const taskId = String(row.id);
    const requestId = String(row.source_id);

    const dueDate = row.due_date ? String(row.due_date).slice(0, 10) : null;
    const daysToDue = dueDate
      ? Math.round((Date.parse(dueDate + 'T12:00:00Z') - Date.parse(day + 'T12:00:00Z')) / 86400000)
      : null;

    const hoursSince = (value: unknown): number | null => {
      if (!value) return null;
      const parsed = Date.parse(String(value).replace(' ', 'T') + 'Z');
      return Number.isNaN(parsed) ? null : Math.floor((now - parsed) / 3600000);
    };

    const unassigned = !String(row.assignee_email ?? '').trim();

    await runAutomations(
      db,
      { requestId, taskId, eventType: 'time_task_check', title: 'Revisión periódica del trabajo' },
      {
        extraContext: {
          'task.days_to_due': daysToDue,
          'task.hours_since_update': hoursSince(row.updated_at),
          'task.hours_unassigned': unassigned ? hoursSince(row.created_at) : null,
        },
        dedupeKey: `task:${taskId}:${day}`,
      },
    );
  }
}

// ─── 2. Aprobaciones detenidas ────────────────────────────────────────────────
async function sweepApprovals(db: DB, day: string): Promise<void> {
  const rows = await db.prepare(`
    SELECT s.id, s.request_id, s.approver_email,
           COALESCE(s.notified_at, s.created_at) AS waiting_since
    FROM approval_steps s
    JOIN requests r ON r.id = s.request_id
    WHERE s.status = 'pending' AND r.status = 'in_progress' AND r.current_level = s.level
    ORDER BY waiting_since ASC
    LIMIT ${MAX_APPROVALS_PER_SWEEP}
  `).all();

  const now = Date.now();
  for (const row of rows.results as Record<string, unknown>[]) {
    const since = Date.parse(String(row.waiting_since).replace(' ', 'T') + 'Z');
    const hoursWaiting = Number.isNaN(since) ? null : Math.floor((now - since) / 3600000);

    await runAutomations(
      db,
      {
        requestId: String(row.request_id),
        eventType: 'time_approval_check',
        title: 'Revisión periódica de aprobaciones',
      },
      {
        extraContext: {
          'approval.hours_waiting': hoursWaiting,
          'approval.approver_email': String(row.approver_email ?? ''),
        },
        dedupeKey: `approval:${row.id}:${day}`,
      },
    );
  }
}

// ─── 3. Bandeja de salida ─────────────────────────────────────────────────────
async function drainOutbox(env: SchedulerEnv): Promise<void> {
  const pending = await env.DB.prepare(`
    SELECT id, automation_name, channel, target, subject, body, request_id, attempts
    FROM automation_outbox
    WHERE status = 'pending' AND attempts < ?
    ORDER BY created_at ASC
    LIMIT ${MAX_OUTBOX_PER_SWEEP}
  `).bind(MAX_ATTEMPTS).all();

  const rows = pending.results as Record<string, unknown>[];
  if (!rows.length) return;

  // El token de Graph se pide una vez por corrida, y solo si hace falta.
  let mailToken: string | null = null;
  const needsMail = rows.some(row => row.channel === 'email');
  if (needsMail) {
    try {
      mailToken = await getAppToken(env.ENTRA_TENANT_ID, env.ENTRA_CLIENT_ID, env.ENTRA_CLIENT_SECRET, env.KV);
    } catch (error) {
      mailToken = null;
      await logEvent(env.DB, {
        category: 'email', action: 'outbox_token_failed', ok: false, severity: 'error',
        source: 'automation-scheduler',
        detail: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  for (const row of rows) {
    const id = String(row.id);
    const attempts = Number(row.attempts ?? 0) + 1;
    try {
      if (row.channel === 'teams') {
        const result = await sendTeamsCard(env, {
          title: String(row.subject ?? 'FlowApp'),
          tone: 'warning',
          facts: [{ label: 'Automatización', value: String(row.automation_name ?? '') }],
          url: row.request_id ? appUrl(env, `/solicitudes/${row.request_id}`) : undefined,
          urlLabel: 'Abrir en FlowApp',
          source: 'automation-scheduler',
          refType: 'automation', refId: String(row.id),
        });
        if (!result.ok) throw new Error(result.skipped ? 'Teams no está configurado' : `Teams respondió ${result.status}`);
      } else {
        if (!mailToken) throw new Error('Sin token de Graph para enviar correo');
        const sender = env.MAIL_SENDER_UPN?.trim();
        if (!sender) throw new Error('MAIL_SENDER_UPN no está configurado');
        const text = String(row.body ?? '');
        await sendMail({
          to: String(row.target ?? ''),
          subject: String(row.subject ?? 'FlowApp'),
          html: `<p>${escapeHtml(text)}</p>`,
          text,
        }, sender, mailToken);
      }

      await env.DB.prepare(
        "UPDATE automation_outbox SET status = 'sent', attempts = ?, sent_at = datetime('now'), last_error = NULL WHERE id = ?"
      ).bind(attempts, id).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Se agota en MAX_ATTEMPTS para no reintentar en bucle algo mal
      // configurado, pero la fila se conserva como evidencia.
      const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      await env.DB.prepare(
        'UPDATE automation_outbox SET status = ?, attempts = ?, last_error = ? WHERE id = ?'
      ).bind(status, attempts, message, id).run();
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
