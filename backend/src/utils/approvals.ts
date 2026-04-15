import { AppEnv, RequestRow, ApprovalStepRow, FlowConfigRow } from '../types';
import { createMagicToken } from '../auth/tokens';
import { getAppToken, getUserById, sendMail } from '../utils/graph';
import { buildApprovalEmail } from '../email/template';

type Env = AppEnv['Bindings'];

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

  const totalLevels = configs.results.length;
  const requestId = crypto.randomUUID();

  await db.prepare(`
    INSERT INTO requests (id, request_type_id, request_type_name, title, description,
      requester_id, requester_name, requester_email, status, current_level, total_levels, campaign_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', 1, ?, ?)
  `).bind(
    requestId, params.requestTypeId, reqType.name,
    params.title, params.description,
    params.requesterId, params.requesterName, params.requesterEmail,
    totalLevels,
    params.campaignData ? JSON.stringify(params.campaignData) : null
  ).run();

  const graphToken = await getAppToken(
    env.ENTRA_TENANT_ID, env.ENTRA_CLIENT_ID, env.ENTRA_CLIENT_SECRET, env.KV
  );

  for (const config of configs.results) {
    let approverId   = config.approver_value;
    let approverName  = config.approver_name ?? '';
    let approverEmail = config.approver_email ?? '';

    if (config.approver_type === 'job_title') {
      const user = await getUserById(config.approver_value, graphToken);
      if (user) {
        approverId    = user.id;
        approverName  = user.displayName;
        approverEmail = user.mail ?? user.userPrincipalName;
      }
    }

    const stepId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO approval_steps (id, request_id, level, label, approver_id, approver_name, approver_email)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(stepId, requestId, config.level, config.label, approverId, approverName, approverEmail).run();
  }

  await notifyApprover(requestId, 1, env);
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

  const exp = Date.now() + 72 * 60 * 60 * 1000;
  const [approveToken, rejectToken] = await Promise.all([
    createMagicToken({ stepId: step.id, requestId, action: 'approve', exp }, env.TOKEN_SECRET, db),
    createMagicToken({ stepId: step.id, requestId, action: 'reject',  exp }, env.TOKEN_SECRET, db),
  ]);

  const atts = await db.prepare('SELECT * FROM attachments WHERE request_id = ?')
    .bind(requestId).all<{ filename: string; r2_key: string }>();

  const attachments = (atts.results ?? []).map((a) => ({
    filename: a.filename,
    url: `${env.PLATFORM_URL}/api/files/${encodeURIComponent(a.r2_key)}`,
  }));

  const campaignData = request.campaign_data ? JSON.parse(request.campaign_data) : undefined;

  const { subject, html, text } = buildApprovalEmail({
    approverName:  step.approver_name,
    requesterName: request.requester_name,
    requestTitle:  request.title,
    requestType:   request.request_type_name,
    description:   request.description,
    level,
    totalLevels:   request.total_levels,
    requestId,
    attachments,
    approveUrl:  `${env.PLATFORM_URL}/api/approve?token=${approveToken}`,
    rejectUrl:   `${env.PLATFORM_URL}/api/reject?token=${rejectToken}`,
    platformUrl: env.PLATFORM_URL,
    campaignData,
  });

  const graphToken = await getAppToken(
    env.ENTRA_TENANT_ID, env.ENTRA_CLIENT_ID, env.ENTRA_CLIENT_SECRET, env.KV
  );

  await sendMail({ to: step.approver_email, subject, html, text }, request.requester_email, graphToken);

  await db.prepare("UPDATE approval_steps SET notified_at = datetime('now') WHERE id = ?")
    .bind(step.id).run();
}

export async function processApproval(
  requestId: string, level: number, action: 'approve' | 'reject', comment: string, env: Env
): Promise<{ done: boolean; nextLevel?: number }> {
  const db = env.DB;

  await db.prepare(`
    UPDATE approval_steps
    SET status = ?, comment = ?, decided_at = datetime('now')
    WHERE request_id = ? AND level = ?
  `).bind(action === 'approve' ? 'approved' : 'rejected', comment || null, requestId, level).run();

  if (action === 'reject') {
    await db.prepare("UPDATE requests SET status='rejected', updated_at=datetime('now') WHERE id=?")
      .bind(requestId).run();
    await notifyRequesterOutcome(requestId, 'rejected', comment, env);
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
    ? `[FlowApp] Solicitud aprobada - ${request.title}`
    : `[FlowApp] Solicitud rechazada - ${request.title}`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#F2F2F0;padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
  <tr><td style="background:#0C447C;border-radius:12px 12px 0 0;padding:22px 32px;">
    <span style="color:#fff;font-size:22px;font-weight:800;">FlowApp</span>
  </td></tr>
  <tr><td style="background:#fff;padding:28px 32px;">
    <p style="font-size:15px;color:#111;">Hola <strong>${request.requester_name}</strong>,</p>
    <p style="font-size:13px;color:#555;">Tu solicitud <strong>"${request.title}"</strong> ha sido
      <strong style="color:${isApproved ? '#1D9E75' : '#993C1D'};">${isApproved ? 'aprobada' : 'rechazada'}</strong>.
    </p>
    ${!isApproved && comment ? `<div style="background:#FFF8F6;border-left:3px solid #F0997B;padding:12px 16px;border-radius:0 8px 8px 0;margin:16px 0;">
      <p style="margin:0;font-size:13px;color:#444;">${comment}</p>
    </div>` : ''}
    <a href="${env.PLATFORM_URL}/requests/${requestId}"
       style="display:inline-block;margin-top:16px;background:#185FA5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
      Ver solicitud
    </a>
  </td></tr>
  <tr><td style="background:#F2F2F0;border-radius:0 0 12px 12px;padding:14px 32px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#aaa;">FlowApp - Sistema de aprobaciones</p>
  </td></tr>
</table></body></html>`;

  const graphToken = await getAppToken(
    env.ENTRA_TENANT_ID, env.ENTRA_CLIENT_ID, env.ENTRA_CLIENT_SECRET, env.KV
  );
  await sendMail({ to: request.requester_email, subject, html, text: subject }, request.requester_email, graphToken);
}
