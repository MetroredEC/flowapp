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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?)
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
    url: env.PLATFORM_URL + '/api/files/' + encodeURIComponent(a.r2_key),
  }));

  const { subject } = buildApprovalEmail({
    approverName:  step.approver_name,
    requesterName: request.requester_name,
    requestTitle:  request.title,
    requestType:   request.request_type_name,
    description:   request.description,
    level,
    totalLevels:   request.total_levels,
    requestId,
    attachments,
    approveUrl:  env.PLATFORM_URL + '/approve?token=' + approveToken,
    rejectUrl:   env.PLATFORM_URL + '/reject?token=' + rejectToken,
    platformUrl: env.PLATFORM_URL,
    campaignData: undefined,
  });

  const attachmentsHtml = attachments.length > 0
    ? '<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-top:1px solid #e0e0e0;padding-top:16px;"><tr><td><p style="margin:0 0 12px;font-weight:bold;color:#111;font-size:14px;">Archivos adjuntos:</p>' + 
      attachments.map(a => '<p style="margin:8px 0;"><a href="' + a.url + '" style="color:#185FA5;text-decoration:none;font-size:13px;">📎 ' + a.filename + '</a></p>').join('') + 
      '</td></tr></table>'
    : '';

  const html = '<html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f8f9fa;font-family:\'Segoe UI\',Arial,sans-serif;color:#333;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;padding:20px 0;"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;margin:0 auto;box-shadow:0 2px 4px rgba(0,0,0,0.1);border-radius:8px;overflow:hidden;"><tr><td style="background:linear-gradient(135deg,#0C447C 0%,#185FA5 100%);color:#fff;padding:32px 24px;text-align:center;"><h1 style="margin:0;font-size:32px;font-weight:600;letter-spacing:-0.5px;">FlowApp</h1><p style="margin:8px 0 0;font-size:13px;opacity:0.9;">Sistema de aprobaciones</p></td></tr><tr><td style="padding:32px 24px;"><p style="margin:0 0 24px;font-size:16px;color:#111;">Hola <strong>' + step.approver_name + '</strong>,</p><p style="margin:0 0 20px;font-size:14px;color:#666;line-height:1.6;">Tienes una solicitud pendiente de aprobacion en el nivel <strong>' + level + ' de ' + request.total_levels + '</strong>.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;border-radius:8px;margin:20px 0;border-left:4px solid #185FA5;"><tr><td style="padding:16px;"><p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Solicitud</p><h2 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#0C447C;">' + request.title + '</h2><p style="margin:0 0 8px;font-size:13px;color:#555;"><strong>Tipo:</strong> ' + request.request_type_name + '</p><p style="margin:0;font-size:13px;color:#555;"><strong>Solicitado por:</strong> ' + request.requester_name + '</p></td></tr></table><p style="margin:0 0 16px;font-size:14px;color:#666;line-height:1.6;">' + request.description + '</p>' + attachmentsHtml + '<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td style="padding:0 12px 0 0;width:50%;"><a href="' + env.PLATFORM_URL + '/approve?token=' + approveToken + '" style="display:block;background:#1D9E75;color:#fff;padding:14px 20px;text-align:center;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;box-shadow:0 2px 4px rgba(29,158,117,0.2);">✓ Aprobar</a></td><td style="padding:0 0 0 12px;width:50%;"><a href="' + env.PLATFORM_URL + '/reject?token=' + rejectToken + '" style="display:block;background:#fff;color:#993C1D;border:2px solid #F0997B;padding:12px 20px;text-align:center;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">✗ Rechazar</a></td></tr></table><p style="margin:24px 0 0;font-size:12px;color:#999;text-align:center;border-top:1px solid #e0e0e0;padding-top:16px;">Enlace de un solo uso válido por 72 horas<br><a href="' + env.PLATFORM_URL + '/requests/' + requestId + '" style="color:#185FA5;text-decoration:none;">Ver detalles en la plataforma</a></p></td></tr><tr><td style="background:#f8f9fa;padding:16px 24px;text-align:center;border-top:1px solid #e0e0e0;"><p style="margin:0;font-size:11px;color:#999;">FlowApp &nbsp;•&nbsp; Centro Médico Ambulatorio Metroambulat S.A.</p></td></tr></table></td></tr></table></body></html>';

  const text = 'FlowApp - Aprobacion nivel ' + level + '/' + request.total_levels + '. Solicitud: ' + request.title + '. APROBAR: ' + env.PLATFORM_URL + '/approve?token=' + approveToken + ' RECHAZAR: ' + env.PLATFORM_URL + '/reject?token=' + rejectToken;

  const graphToken = await getAppToken(
    env.ENTRA_TENANT_ID, env.ENTRA_CLIENT_ID, env.ENTRA_CLIENT_SECRET, env.KV
  );

  console.error('SENDING:', step.approver_email, 'FROM:', request.requester_email);
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
    ? '[FlowApp] Solicitud aprobada - ' + request.title
    : '[FlowApp] Solicitud rechazada - ' + request.title;

  const html = '<html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f8f9fa;font-family:\'Segoe UI\',Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;padding:20px 0;"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;margin:0 auto;box-shadow:0 2px 4px rgba(0,0,0,0.1);border-radius:8px;overflow:hidden;"><tr><td style="background:' + (isApproved ? 'linear-gradient(135deg,#1D9E75 0%,#2CB689 100%)' : 'linear-gradient(135deg,#993C1D 0%,#B85A32 100%)') + ';color:#fff;padding:32px 24px;text-align:center;"><h1 style="margin:0;font-size:32px;font-weight:600;">' + (isApproved ? '✓ Aprobada' : '✗ Rechazada') + '</h1></td></tr><tr><td style="padding:32px 24px;"><p style="margin:0 0 16px;font-size:16px;color:#111;">Hola ' + request.requester_name + ',</p><p style="margin:0 0 24px;font-size:14px;color:#666;">Tu solicitud <strong>' + request.title + '</strong> ha sido <strong style="color:' + (isApproved ? '#1D9E75' : '#993C1D') + ';">' + (isApproved ? 'aprobada' : 'rechazada') + '</strong>.</p>' + ((!isApproved && comment) ? '<div style="background:#FFF8F6;border-left:4px solid #F0997B;padding:12px 16px;border-radius:4px;margin:16px 0;"><p style="margin:0;font-size:13px;color:#333;"><strong>Comentarios:</strong><br>' + comment + '</p></div>' : '') + '<p style="margin:24px 0 0;"><a href="' + env.PLATFORM_URL + '/requests/' + requestId + '" style="display:inline-block;background:#185FA5;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:600;">Ver solicitud</a></p></td></tr><tr><td style="background:#f8f9fa;padding:16px 24px;text-align:center;border-top:1px solid #e0e0e0;"><p style="margin:0;font-size:11px;color:#999;">FlowApp &nbsp;•&nbsp; Centro Médico Ambulatorio Metroambulat S.A.</p></td></tr></table></td></tr></table></body></html>';

  const graphToken = await getAppToken(
    env.ENTRA_TENANT_ID, env.ENTRA_CLIENT_ID, env.ENTRA_CLIENT_SECRET, env.KV
  );
  await sendMail({ to: request.requester_email, subject, html, text: subject }, request.requester_email, graphToken);
}
