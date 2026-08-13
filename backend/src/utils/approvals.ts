import { AppEnv, RequestRow, ApprovalStepRow, FlowConfigRow } from '../types';
import { createMagicToken } from '../auth/tokens';
import { getAppToken, getUserById, getFirstUserByJobTitle, sendMail } from '../utils/graph';
import { buildApprovalEmail } from '../email/template';
import { createTaskFromRequest } from './workspace-bridge';
import { logEvent } from './syslog';
import { sendTeamsCard, appUrl } from './teams';
import { recordWorkEvent } from './work-events';

// Notificación en la Bandeja del workspace (best-effort, nunca rompe el flujo)
async function wsNotify(
  db: D1Database, userEmail: string, type: string,
  taskId: string | null, taskTitle: string, spaceId: string | null,
  actorName: string, body: string
): Promise<void> {
  if (!userEmail) return;
  const traceId = taskId?.replace(/^req:/, '') || undefined;
  const startedAt = Date.now();
  try {
    await db.prepare(`
      INSERT INTO ws_notifications (user_email, type, task_id, task_title, space_id, actor_name, body)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(userEmail, type, taskId, taskTitle, spaceId, actorName, body).run();
    await logEvent(db, {
      category: 'notify', action: 'inbox_created', trace_id: traceId,
      ref_type: taskId?.startsWith('req:') ? 'request' : 'task', ref_id: taskId || undefined,
      duration_ms: Date.now() - startedAt, detail: { recipient: userEmail, type, title: taskTitle },
    });
  } catch (e) {
    await logEvent(db, {
      category: 'notify', action: 'inbox_create_failed', ok: false, trace_id: traceId,
      ref_type: taskId?.startsWith('req:') ? 'request' : 'task', ref_id: taskId || undefined,
      duration_ms: Date.now() - startedAt,
      detail: { recipient: userEmail, type, error: e instanceof Error ? e.message : String(e) },
    });
  }
}

type Env = AppEnv['Bindings'];

type ResolvedApprover = {
  level: number;
  label: string;
  approverId: string;
  approverName: string;
  approverEmail: string;
};

export async function createRequestWithSteps(
  params: {
    requestTypeId: string;
    title: string;
    description: string;
    requesterId: string;
    requesterName: string;
    requesterEmail: string;
    campaignData?: unknown;
  },
  env: Env
): Promise<string> {
  const db = env.DB;

  const reqType = await db.prepare('SELECT * FROM request_types WHERE id = ? AND is_active = 1')
    .bind(params.requestTypeId).first<{ id: string; name: string }>();
  if (!reqType) throw new Error('Tipo de solicitud no encontrado');

  const configs = await db.prepare(
    'SELECT * FROM flow_configs WHERE request_type_id = ? AND is_active = 1 ORDER BY level'
  ).bind(params.requestTypeId).all<FlowConfigRow>();

  if (!configs.results.length) throw new Error('No hay flujo configurado para este tipo');

  const graphToken = await getAppToken(
    env.ENTRA_TENANT_ID, env.ENTRA_CLIENT_ID, env.ENTRA_CLIENT_SECRET, env.KV
  );
  const resolvedApprovers: ResolvedApprover[] = [];

  for (const config of configs.results) {
    let approverId = config.approver_value;
    let approverName = config.approver_name ?? '';
    let approverEmail = config.approver_email ?? '';

    if (config.approver_type === 'job_title') {
      if (config.approver_value === '__requester__') {
        // El solicitante es el aprobador de este nivel (ej: recepción final)
        approverId   = params.requesterId;
        approverName = params.requesterName;
        approverEmail = params.requesterEmail;
      } else {
        const user = await getFirstUserByJobTitle(config.approver_value, graphToken);
        if (!user) {
          await logEvent(db, {
            category: 'request', action: 'approver_resolve_failed', ok: false,
            actor: params.requesterEmail,
            detail: { tipo: reqType.name, nivel: config.level, cargo_buscado: config.approver_value },
          });
          throw new Error(`No se encontro un aprobador con cargo: ${config.approver_value}. Reasigna el nivel ${config.level} a un usuario específico en Administrar → Flujos.`);
        }
        approverId = user.id;
        approverName = user.displayName;
        approverEmail = user.mail ?? user.userPrincipalName;
      }
    } else if ((!approverName || !approverEmail) && approverId) {
      const user = await getUserById(approverId, graphToken);
      if (user) {
        approverName = approverName || user.displayName;
        approverEmail = approverEmail || user.mail || user.userPrincipalName;
      }
    }

    if (!approverEmail.trim()) {
      throw new Error(`El aprobador del nivel ${config.level} no tiene correo configurado`);
    }

    resolvedApprovers.push({
      level: config.level,
      label: config.label,
      approverId,
      approverName: approverName || approverEmail,
      approverEmail,
    });
  }

  const totalLevels = resolvedApprovers.length;
  const requestId = crypto.randomUUID();
  const processVersion = await db.prepare(`
    SELECT id, version FROM process_versions
    WHERE process_id = ? ORDER BY version DESC LIMIT 1
  `).bind(params.requestTypeId).first<{ id: string; version: number }>();
  const statements = [
    db.prepare(`
      INSERT INTO requests (id, request_type_id, request_type_name, title, description,
        requester_id, requester_name, requester_email, status, current_level, total_levels, campaign_data,
        process_version_id, process_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?, ?)
    `).bind(
      requestId, params.requestTypeId, reqType.name,
      params.title, params.description,
      params.requesterId, params.requesterName, params.requesterEmail,
      totalLevels,
      params.campaignData ? JSON.stringify(params.campaignData) : null,
      processVersion?.id ?? null, processVersion?.version ?? null,
    ),
    ...resolvedApprovers.map(config => db.prepare(`
      INSERT INTO approval_steps (id, request_id, level, label, approver_id, approver_name, approver_email)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), requestId, config.level, config.label,
      config.approverId, config.approverName, config.approverEmail
    )),
  ];

  await db.batch(statements);
  await writeAudit(db, 'requests', requestId, 'request_created', params.requesterId, params.requesterName, {
    request_type: reqType.name,
    total_levels: totalLevels,
  });
  await logEvent(db, {
    category: 'request', action: 'created', ref_type: 'request', ref_id: requestId,
    actor: params.requesterEmail,
    detail: { titulo: params.title, tipo: reqType.name, niveles: totalLevels },
  });
  await recordWorkEvent(db, {
    requestId, eventType: 'request_created', title: 'Solicitud creada',
    actorId: params.requesterId, actorName: params.requesterName, actorEmail: params.requesterEmail,
    detail: { process: reqType.name, process_version: processVersion?.version ?? null },
  });

  return requestId;
}

export async function notifyApprover(requestId: string, level: number, env: Env): Promise<void> {
  const db = env.DB;

  const [request, step] = await Promise.all([
    db.prepare('SELECT * FROM requests WHERE id = ?').bind(requestId).first<RequestRow>(),
    db.prepare('SELECT * FROM approval_steps WHERE request_id = ? AND level = ?')
      .bind(requestId, level).first<ApprovalStepRow>(),
  ]);
  if (!request || !step) return;
  if (!step.approver_email?.trim()) throw new Error(`El aprobador del nivel ${level} no tiene correo configurado`);

    
  const exp = Date.now() + 72 * 60 * 60 * 1000;
  const reviewToken = await createMagicToken(
    { stepId: step.id, requestId, action: 'approve', exp },
    env.TOKEN_SECRET,
    db
  );

  const apiUrl = publicApiUrl(env);
  const reviewUrl = joinUrl(apiUrl, '/review?token=' + encodeURIComponent(reviewToken));
  const atts = await db.prepare('SELECT filename, r2_key FROM attachments WHERE request_id = ? ORDER BY created_at')
    .bind(requestId).all<{ filename: string; r2_key: string }>();

  const attachments = (atts.results ?? []).map((a) => ({
    filename: a.filename,
    url: joinUrl(apiUrl, '/files/' + encodeURIComponent(a.r2_key)),
  }));

  const { subject, html, text } = buildApprovalEmail({
    approverName: step.approver_name,
    requesterName: request.requester_name,
    requestTitle: request.title,
    requestType: request.request_type_name,
    description: request.description,
    level,
    totalLevels: request.total_levels,
    requestId,
    attachments: attachments.map(a => ({ filename: a.filename, url: '' })),
    approveUrl: reviewUrl,
    rejectUrl: reviewUrl,
    platformUrl: reviewUrl,
    campaignData: request.campaign_data,
  });

  const graphToken = await getAppToken(
    env.ENTRA_TENANT_ID, env.ENTRA_CLIENT_ID, env.ENTRA_CLIENT_SECRET, env.KV
  );

  const sender = (env.MAIL_SENDER_UPN || request.requester_email).trim();
  console.log('SENDING_APPROVAL_EMAIL', JSON.stringify({ to: step.approver_email, from: sender, requestId, level, attachments: attachments.length }));
  try {
    await sendMail({ to: step.approver_email, subject, html, text, replyTo: request.requester_email }, sender, graphToken);
    await logEvent(db, {
      category: 'email', action: 'approval_sent', ref_type: 'request', ref_id: requestId,
      detail: { para: step.approver_email, nivel: level, remitente: sender },
    });
  } catch (e) {
    await logEvent(db, {
      category: 'email', action: 'approval_send_failed', ok: false, ref_type: 'request', ref_id: requestId,
      detail: { para: step.approver_email, nivel: level, error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }

  await db.prepare("UPDATE approval_steps SET notified_at = datetime('now') WHERE id = ?")
    .bind(step.id).run();
  await writeAudit(db, 'requests', requestId, 'approval_notified', 'system', 'FlowApp', {
    level,
    approver_email: step.approver_email,
    attachment_count: attachments.length,
  });

  // Bandeja del aprobador: solicitud esperando su decisión
  await wsNotify(
    db, step.approver_email, 'approval',
    'req:' + requestId, request.title, null,
    request.requester_name,
    `Solicitud "${request.title}" espera tu aprobación (${step.label})`
  );

  // Canal de Teams (opcional, no bloqueante)
  await sendTeamsCard(env, {
    title: 'Solicitud esperando aprobación',
    tone: 'warning',
    facts: [
      { label: 'Solicitud', value: request.title },
      { label: 'Tipo', value: request.request_type_name },
      { label: 'Solicitante', value: request.requester_name },
      { label: 'Aprobador', value: `${step.approver_name} (nivel ${level}/${request.total_levels})` },
    ],
    url: appUrl(env, `/solicitudes/${requestId}`),
    urlLabel: 'Revisar solicitud',
    traceId: requestId, refType: 'request', refId: requestId, source: 'approval-pipeline',
  });
}

export async function processApproval(
  requestId: string, level: number, action: 'approve' | 'reject', comment: string, env: Env
): Promise<{ done: boolean; nextLevel?: number }> {
  const db = env.DB;
  const step = await db.prepare('SELECT * FROM approval_steps WHERE request_id = ? AND level = ?')
    .bind(requestId, level).first<ApprovalStepRow>();
  if (!step) throw new Error('Paso de aprobacion no encontrado');
  if (step.status !== 'pending') throw new Error('La decision ya fue registrada');

  const cleanComment = normalizeComment(comment);
  const update = await db.prepare(`
    UPDATE approval_steps
       SET status = ?, comment = ?, decided_at = datetime('now')
     WHERE request_id = ? AND level = ? AND status = 'pending'
  `).bind(action === 'approve' ? 'approved' : 'rejected', cleanComment || null, requestId, level).run();

  if (changedRows(update) === 0) throw new Error('La decision ya fue registrada');

  await writeAudit(db, 'requests', requestId, action === 'approve' ? 'approval_approved' : 'approval_rejected',
    step.approver_id, step.approver_name, { level, comment: cleanComment || null });

  const reqInfo = await db.prepare('SELECT title, requester_email FROM requests WHERE id = ?')
    .bind(requestId).first<{ title: string; requester_email: string }>();

  await logEvent(db, {
    category: 'approval', action: action === 'approve' ? 'approved' : 'rejected',
    ref_type: 'request', ref_id: requestId, actor: step.approver_email,
    detail: { titulo: reqInfo?.title, nivel: level, comentario: cleanComment || undefined },
  });
  await recordWorkEvent(db, {
    requestId,
    eventType: action === 'approve' ? 'approval_approved' : 'approval_rejected',
    title: action === 'approve' ? `Nivel ${level} aprobado` : 'Solicitud rechazada',
    actorId: step.approver_id, actorName: step.approver_name, actorEmail: step.approver_email,
    detail: { level, label: step.label, comment: cleanComment || null },
  });

  if (action === 'reject') {
    await db.prepare("UPDATE requests SET status='rejected', rejected_at=datetime('now'), updated_at=datetime('now') WHERE id=?")
      .bind(requestId).run();
    if (reqInfo) {
      await wsNotify(db, reqInfo.requester_email, 'approval', 'req:' + requestId, reqInfo.title,
        null, step.approver_name,
        `Rechazó tu solicitud "${reqInfo.title}"${cleanComment ? ': ' + cleanComment.slice(0, 120) : ''}`);
    }
    await sendTeamsCard(env, {
      title: 'Solicitud rechazada',
      tone: 'attention',
      facts: [
        { label: 'Solicitud', value: reqInfo?.title ?? requestId },
        { label: 'Rechazada por', value: step.approver_name },
        ...(cleanComment ? [{ label: 'Motivo', value: cleanComment.slice(0, 200) }] : []),
      ],
      url: appUrl(env, `/solicitudes/${requestId}`),
      traceId: requestId, refType: 'request', refId: requestId, source: 'approval-pipeline',
    });
    // El correo de resultado nunca debe revertir/romper una decisión ya registrada
    try {
      await notifyRequesterOutcome(requestId, 'rejected', cleanComment, env);
      await logEvent(db, { category: 'email', action: 'outcome_sent', ref_type: 'request', ref_id: requestId, detail: { para: reqInfo?.requester_email, resultado: 'rechazada' } });
    } catch (e) {
      await logEvent(db, { category: 'email', action: 'outcome_send_failed', ok: false, ref_type: 'request', ref_id: requestId, detail: { error: e instanceof Error ? e.message : String(e) } });
    }
    return { done: true };
  }

  const request = await db.prepare('SELECT total_levels FROM requests WHERE id = ?')
    .bind(requestId).first<{ total_levels: number }>();
  const nextLevel = level + 1;

  if (nextLevel <= (request?.total_levels ?? 4)) {
    await db.prepare("UPDATE requests SET current_level=?, updated_at=datetime('now') WHERE id=?")
      .bind(nextLevel, requestId).run();
    // Si falla la notificación al siguiente nivel, la decisión queda registrada igual
    try {
      await notifyApprover(requestId, nextLevel, env);
    } catch (e) {
      await logEvent(db, { category: 'email', action: 'next_level_notify_failed', ok: false, ref_type: 'request', ref_id: requestId, detail: { nivel: nextLevel, error: e instanceof Error ? e.message : String(e) } });
    }
    return { done: false, nextLevel };
  }

  await db.prepare("UPDATE requests SET status='approved', approved_at=datetime('now'), updated_at=datetime('now') WHERE id=?")
    .bind(requestId).run();
  await recordWorkEvent(db, {
    requestId, eventType: 'request_approved', title: 'Aprobación completada',
    actorId: step.approver_id, actorName: step.approver_name, actorEmail: step.approver_email,
  });

  // Puente: crear tarea en el espacio del área para que el equipo la ejecute
  let createdTask: { id: string; space_id: string } | null = null;
  try {
    await createTaskFromRequest(db, requestId);
    createdTask = await db.prepare(
      "SELECT id, space_id FROM ws_tasks WHERE source_type='request' AND source_id = ? LIMIT 1"
    ).bind(requestId).first<{ id: string; space_id: string }>();
    await logEvent(db, {
      category: 'task', action: 'bridge_created', ref_type: 'task', ref_id: createdTask?.id,
      detail: { solicitud: requestId, espacio: createdTask?.space_id, titulo: reqInfo?.title },
    });
  } catch (e) {
    await logEvent(db, {
      category: 'task', action: 'bridge_failed', ok: false, ref_type: 'request', ref_id: requestId,
      detail: { error: e instanceof Error ? e.message : String(e) },
    });
  }

  // Bandeja del solicitante: aprobada y en tablero del área
  if (reqInfo) {
    await wsNotify(db, reqInfo.requester_email, 'approval',
      createdTask?.id ?? 'req:' + requestId, reqInfo.title, createdTask?.space_id ?? null,
      step.approver_name,
      `Aprobó tu solicitud "${reqInfo.title}" — ya está en el tablero del área`);
  }

  await sendTeamsCard(env, {
    title: 'Solicitud aprobada — en el tablero del área',
    tone: 'good',
    facts: [
      { label: 'Solicitud', value: reqInfo?.title ?? requestId },
      { label: 'Aprobada por', value: step.approver_name },
      ...(createdTask ? [{ label: 'Área', value: createdTask.space_id }] : []),
    ],
    url: createdTask
      ? appUrl(env, `/espacio/${createdTask.space_id}`)
      : appUrl(env, `/solicitudes/${requestId}`),
    urlLabel: 'Ver tablero',
    traceId: requestId, refType: 'request', refId: requestId, source: 'approval-pipeline',
  });

  try {
    await notifyRequesterOutcome(requestId, 'approved', '', env);
    await logEvent(db, { category: 'email', action: 'outcome_sent', ref_type: 'request', ref_id: requestId, detail: { para: reqInfo?.requester_email, resultado: 'aprobada' } });
  } catch (e) {
    await logEvent(db, { category: 'email', action: 'outcome_send_failed', ok: false, ref_type: 'request', ref_id: requestId, detail: { error: e instanceof Error ? e.message : String(e) } });
  }
  return { done: true };
}

async function notifyRequesterOutcome(
  requestId: string, outcome: 'approved' | 'rejected', comment: string, env: Env
): Promise<void> {
  const request = await env.DB.prepare('SELECT * FROM requests WHERE id = ?')
    .bind(requestId).first<RequestRow>();
  if (!request) return;

  const isApproved = outcome === 'approved';
  const processConfig = isApproved
    ? await env.DB.prepare(`
        SELECT email_subject, email_body, send_on_approve
        FROM process_configs WHERE id = ?
      `).bind(request.request_type_id).first<{
        email_subject: string | null;
        email_body: string | null;
        send_on_approve: number | null;
      }>()
    : null;

  if (isApproved && processConfig?.send_on_approve === 0) {
    await logEvent(env.DB, {
      category: 'email', action: 'outcome_skipped', ref_type: 'request', ref_id: requestId,
      detail: { reason: 'send_on_approve_disabled', process: request.request_type_id },
    });
    return;
  }

  const requestUrl = joinUrl(frontendUrl(env), '/requests/' + encodeURIComponent(requestId));
  const approvers = isApproved
    ? await env.DB.prepare(`
        SELECT approver_name FROM approval_steps
        WHERE request_id = ? AND status = 'approved'
        ORDER BY level
      `).bind(requestId).all<{ approver_name: string }>()
    : { results: [] as { approver_name: string }[] };
  const variables: Record<string, string> = {
    solicitante: request.requester_name,
    correo: request.requester_email,
    titulo: request.title,
    proceso: request.request_type_name,
    fecha: new Intl.DateTimeFormat('es-EC', {
      dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Guayaquil',
    }).format(new Date()),
    nivel_actual: String(request.current_level),
    aprobadores: approvers.results.map(a => a.approver_name).filter(Boolean).join(', '),
    url_solicitud: requestUrl,
  };
  const renderTemplate = (template: string) => template.replace(
    /{{\s*(solicitante|correo|titulo|proceso|fecha|nivel_actual|aprobadores|url_solicitud)\s*}}/g,
    (_match, key: string) => variables[key] ?? ''
  );

  const fallbackSubject = isApproved
    ? '[FlowApp] Solicitud aprobada - ' + request.title
    : '[FlowApp] Solicitud rechazada - ' + request.title;
  const subject = isApproved && processConfig?.email_subject?.trim()
    ? renderTemplate(processConfig.email_subject.trim())
    : fallbackSubject;
  const title = isApproved ? 'Solicitud aprobada' : 'Solicitud rechazada';
  const color = isApproved ? '#1D9E75' : '#993C1D';
  const bg = isApproved ? '#E1F5EE' : '#FFF2EC';
  const commentBlock = !isApproved && comment
    ? '<div style="background:#FFF8F6;border-left:4px solid #F0997B;padding:12px 16px;border-radius:6px;margin:18px 0;"><p style="margin:0;font-size:13px;color:#333;line-height:1.5;"><strong>Comentarios:</strong><br>' + escapeHtml(comment) + '</p></div>'
    : '';

  const customBody = isApproved && processConfig?.email_body?.trim()
    ? renderTemplate(processConfig.email_body.trim())
    : '';
  const bodyHtml = customBody
    ? '<div style="white-space:normal;font-size:14px;color:#333;line-height:1.65;">' +
      escapeHtml(customBody).replace(/\r?\n/g, '<br>') + '</div>'
    : '<p style="margin:0 0 16px;font-size:15px;color:#111;">Hola ' + escapeHtml(request.requester_name) + ',</p><p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;">Tu solicitud <strong>' + escapeHtml(request.title) + '</strong> fue <strong style="color:' + color + ';">' + (isApproved ? 'aprobada' : 'rechazada') + '</strong>.</p>' + commentBlock;

  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#F2F2F0;font-family:Segoe UI,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F0;padding:24px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E6E4DE;"><tr><td style="background:' + bg + ';padding:28px;text-align:center;"><h1 style="margin:0;color:' + color + ';font-size:24px;">' + title + '</h1></td></tr><tr><td style="padding:28px;">' + bodyHtml + '<p style="margin:24px 0 0;"><a href="' + escapeAttr(requestUrl) + '" style="display:inline-block;background:#185FA5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">Ver solicitud</a></p></td></tr><tr><td style="background:#F8F8F6;padding:14px 28px;text-align:center;border-top:1px solid #ECECEA;"><p style="margin:0;font-size:11px;color:#999;">FlowApp - Sistema de aprobaciones internas</p></td></tr></table></td></tr></table></body></html>';

  const graphToken = await getAppToken(
    env.ENTRA_TENANT_ID, env.ENTRA_CLIENT_ID, env.ENTRA_CLIENT_SECRET, env.KV
  );
  const sender = (env.MAIL_SENDER_UPN || request.requester_email).trim();
  await sendMail({
    to: request.requester_email,
    subject,
    html,
    text: customBody || fallbackSubject,
  }, sender, graphToken);
}

function publicApiUrl(env: Env): string {
  return cleanBase(env.PUBLIC_API_URL || env.PLATFORM_URL);
}

function frontendUrl(env: Env): string {
  return cleanBase(env.FRONTEND_URL || env.PLATFORM_URL);
}

function cleanBase(url: string): string {
  return (url || '').replace(/\/+$/, '');
}

function joinUrl(base: string, path: string): string {
  return cleanBase(base) + '/' + path.replace(/^\/+/, '');
}

function normalizeComment(comment: string): string {
  return comment.trim().replace(/\s+$/g, '').slice(0, 1200);
}

function changedRows(result: D1Result): number {
  return (result.meta as { changes?: number } | undefined)?.changes ?? 0;
}

async function writeAudit(db: D1Database, entity: string, entityId: string, action: string, actorId: string, actorName: string, details?: unknown): Promise<void> {
  await db.prepare('INSERT INTO audit_log (entity, entity_id, action, actor_id, actor_name, details) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(entity, entityId, action, actorId, actorName, details ? JSON.stringify(details) : null)
    .run();
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}
