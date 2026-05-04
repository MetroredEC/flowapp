import { AppEnv, RequestRow, ApprovalStepRow, FlowConfigRow } from '../types';
import { createMagicToken } from '../auth/tokens';
import { getAppToken, getUserById, getFirstUserByJobTitle, sendMail } from '../utils/graph';
import { buildApprovalEmail } from '../email/template';

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
      const user = await getFirstUserByJobTitle(config.approver_value, graphToken);
      if (!user) throw new Error(`No se encontro un aprobador con cargo: ${config.approver_value}`);
      approverId = user.id;
      approverName = user.displayName;
      approverEmail = user.mail ?? user.userPrincipalName;
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
  const statements = [
    db.prepare(`
      INSERT INTO requests (id, request_type_id, request_type_name, title, description,
        requester_id, requester_name, requester_email, status, current_level, total_levels, campaign_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?)
    `).bind(
      requestId, params.requestTypeId, reqType.name,
      params.title, params.description,
      params.requesterId, params.requesterName, params.requesterEmail,
      totalLevels,
      params.campaignData ? JSON.stringify(params.campaignData) : null
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
  
  const apiUrl = publicApiUrl(env);
  const frontend = frontendUrl(env);
  const atts = await db.prepare('SELECT filename, r2_key FROM attachments WHERE request_id = ? ORDER BY created_at')
    .bind(requestId).all<{ filename: string; r2_key: string }>();

  const attachments = (atts.results ?? []).map((a) => ({
    filename: a.filename,
    url: joinUrl(apiUrl, '/api/files/' + encodeURIComponent(a.r2_key)),
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
    approveUrl: joinUrl(frontend, '/requests/' + encodeURIComponent(requestId)),
    rejectUrl: joinUrl(frontend, '/requests/' + encodeURIComponent(requestId)),
    platformUrl: joinUrl(frontend, '/requests/' + encodeURIComponent(requestId)),
    campaignData: request.campaign_data,
  });

  const graphToken = await getAppToken(
    env.ENTRA_TENANT_ID, env.ENTRA_CLIENT_ID, env.ENTRA_CLIENT_SECRET, env.KV
  );

  const sender = (env.MAIL_SENDER_UPN || request.requester_email).trim();
  console.log('SENDING_APPROVAL_EMAIL', JSON.stringify({ to: step.approver_email, from: sender, requestId, level, attachments: attachments.length }));
  await sendMail({ to: step.approver_email, subject, html, text, replyTo: request.requester_email }, sender, graphToken);

  await db.prepare("UPDATE approval_steps SET notified_at = datetime('now') WHERE id = ?")
    .bind(step.id).run();
  await writeAudit(db, 'requests', requestId, 'approval_notified', 'system', 'FlowApp', {
    level,
    approver_email: step.approver_email,
    attachment_count: attachments.length,
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

  if (action === 'reject') {
    await db.prepare("UPDATE requests SET status='rejected', updated_at=datetime('now') WHERE id=?")
      .bind(requestId).run();
    await notifyRequesterOutcome(requestId, 'rejected', cleanComment, env);
    return { done: true };
  }

  const request = await db.prepare('SELECT total_levels FROM requests WHERE id = ?')
    .bind(requestId).first<{ total_levels: number }>();
  const nextLevel = level + 1;

  if (nextLevel <= (request?.total_levels ?? 4)) {
    await db.prepare("UPDATE requests SET current_level=?, updated_at=datetime('now') WHERE id=?")
      .bind(nextLevel, requestId).run();
    await notifyApprover(requestId, nextLevel, env);
    return { done: false, nextLevel };
  }

  await db.prepare("UPDATE requests SET status='approved', updated_at=datetime('now') WHERE id=?")
    .bind(requestId).run();
  await notifyRequesterOutcome(requestId, 'approved', '', env);
  return { done: true };
}

async function notifyRequesterOutcome(
  requestId: string, outcome: 'approved' | 'rejected', comment: string, env: Env
): Promise<void> {
  const request = await env.DB.prepare('SELECT * FROM requests WHERE id = ?')
    .bind(requestId).first<RequestRow>();
  if (!request) return;

  const isApproved = outcome === 'approved';
  const subject = isApproved
    ? '[FlowApp] Solicitud aprobada - ' + request.title
    : '[FlowApp] Solicitud rechazada - ' + request.title;
  const title = isApproved ? 'Solicitud aprobada' : 'Solicitud rechazada';
  const color = isApproved ? '#1D9E75' : '#993C1D';
  const bg = isApproved ? '#E1F5EE' : '#FFF2EC';
  const requestUrl = joinUrl(frontendUrl(env), '/requests/' + encodeURIComponent(requestId));
  const commentBlock = !isApproved && comment
    ? '<div style="background:#FFF8F6;border-left:4px solid #F0997B;padding:12px 16px;border-radius:6px;margin:18px 0;"><p style="margin:0;font-size:13px;color:#333;line-height:1.5;"><strong>Comentarios:</strong><br>' + escapeHtml(comment) + '</p></div>'
    : '';

  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#F2F2F0;font-family:Segoe UI,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F0;padding:24px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E6E4DE;"><tr><td style="background:' + bg + ';padding:28px;text-align:center;"><h1 style="margin:0;color:' + color + ';font-size:24px;">' + title + '</h1></td></tr><tr><td style="padding:28px;"><p style="margin:0 0 16px;font-size:15px;color:#111;">Hola ' + escapeHtml(request.requester_name) + ',</p><p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;">Tu solicitud <strong>' + escapeHtml(request.title) + '</strong> fue <strong style="color:' + color + ';">' + (isApproved ? 'aprobada' : 'rechazada') + '</strong>.</p>' + commentBlock + '<p style="margin:24px 0 0;"><a href="' + escapeAttr(requestUrl) + '" style="display:inline-block;background:#185FA5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">Ver solicitud</a></p></td></tr><tr><td style="background:#F8F8F6;padding:14px 28px;text-align:center;border-top:1px solid #ECECEA;"><p style="margin:0;font-size:11px;color:#999;">FlowApp - Sistema de aprobaciones internas</p></td></tr></table></td></tr></table></body></html>';

  const graphToken = await getAppToken(
    env.ENTRA_TENANT_ID, env.ENTRA_CLIENT_ID, env.ENTRA_CLIENT_SECRET, env.KV
  );
  const sender = (env.MAIL_SENDER_UPN || request.requester_email).trim();
  await sendMail({ to: request.requester_email, subject, html, text: subject }, sender, graphToken);
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
