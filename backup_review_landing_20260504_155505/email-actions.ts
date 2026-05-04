import { Context, Hono } from 'hono';
import { AppEnv, ApprovalStepRow, RequestRow } from '../types';
import { verifyMagicToken, consumeMagicToken, TokenError } from '../auth/tokens';
import { processApproval } from '../utils/approvals';

const router = new Hono<AppEnv>();

type Decision = 'approve' | 'reject';
type Env = AppEnv['Bindings'];

type DecisionInfo = Pick<RequestRow, 'id' | 'title' | 'description' | 'request_type_name' | 'requester_name'> & {
  level: number;
  approver_name: string;
  step_status: string;
};

router.get('/approve', async (c) => {
  const token = c.req.query('token') ?? '';
  const confirm = c.req.query('confirm') === '1' || c.req.query('comment') !== undefined;
  if (confirm) return completeDecision(c, 'approve', token, c.req.query('comment') ?? '');
  return renderDecisionForm(c, 'approve', token);
});

router.post('/approve', async (c) => {
  const body = await readDecisionBody(c);
  return completeDecision(c, 'approve', body.token, body.comment);
});

router.get('/reject', async (c) => {
  const token = c.req.query('token') ?? '';
  const comment = c.req.query('comment');
  if (comment !== undefined) return completeDecision(c, 'reject', token, comment);
  return renderDecisionForm(c, 'reject', token);
});

router.post('/reject', async (c) => {
  const body = await readDecisionBody(c);
  return completeDecision(c, 'reject', body.token, body.comment);
});

router.get('/files/:key{.+}', async (c) => {
  const key = safeDecode(c.req.param('key'));
  const obj = await c.env.FILES.get(key);
  if (!obj) return c.json({ error: 'not_found', message: 'Archivo no encontrado' }, 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  const metadata = (obj as unknown as { customMetadata?: Record<string, string> }).customMetadata ?? {};
  const filename = sanitizeHeaderValue(metadata.filename || key.split('/').pop() || 'archivo');
  headers.set('Content-Disposition', `inline; filename="${filename}"`);
  return new Response(obj.body, { headers });
});

async function renderDecisionForm(c: Context<AppEnv>, action: Decision, token: string, formError = ''): Promise<Response> {
  if (!token) return c.html(page('error', 'Token faltante', 'No se proporciono un token.', frontendUrl(c.env)));

  const check = await verifyMagicToken(token, c.env.TOKEN_SECRET, c.env.DB);
  if (!check.ok) return c.html(page('error', errorTitle(check.error), errorMsg(check.error), frontendUrl(c.env)));
  if (check.payload.action !== action) {
    return c.html(page('error', 'Enlace incorrecto', 'Este enlace no corresponde a la accion seleccionada.', frontendUrl(c.env)));
  }

  const info = await c.env.DB.prepare(`
    SELECT r.id, r.title, r.description, r.request_type_name, r.requester_name,
           s.level, s.approver_name, s.status as step_status
      FROM requests r
      JOIN approval_steps s ON s.request_id = r.id
     WHERE r.id = ? AND s.id = ?
  `).bind(check.payload.requestId, check.payload.stepId).first<DecisionInfo>();

  if (!info) return c.html(page('error', 'Solicitud no encontrada', 'No se encontro la solicitud asociada al enlace.', frontendUrl(c.env)));
  if (info.step_status !== 'pending') {
    return c.html(page('error', 'Decision ya registrada', 'Este paso ya fue procesado y no puede modificarse desde el mismo enlace.', frontendUrl(c.env), info.id));
  }

  return c.html(decisionForm(action, token, info, frontendUrl(c.env), formError));
}

async function completeDecision(c: Context<AppEnv>, action: Decision, token: string, comment: string): Promise<Response> {
  if (!token) return c.html(page('error', 'Token faltante', 'No se proporciono un token.', frontendUrl(c.env)));
  const cleanComment = normalizeComment(comment);
  if (action === 'reject' && !cleanComment) {
    return renderDecisionForm(c, action, token, 'El comentario es obligatorio para rechazar.');
  }

  const check = await verifyMagicToken(token, c.env.TOKEN_SECRET, c.env.DB);
  if (!check.ok) return c.html(page('error', errorTitle(check.error), errorMsg(check.error), frontendUrl(c.env)));
  if (check.payload.action !== action) {
    return c.html(page('error', 'Enlace incorrecto', 'Este enlace no corresponde a la accion seleccionada.', frontendUrl(c.env)));
  }

  const { requestId, stepId } = check.payload;
  const step = await c.env.DB.prepare('SELECT level, status FROM approval_steps WHERE id = ?')
    .bind(stepId).first<Pick<ApprovalStepRow, 'level' | 'status'>>();
  if (!step) return c.html(page('error', 'Paso no encontrado', 'No se encontro el paso de aprobacion.', frontendUrl(c.env)));
  if (step.status !== 'pending') {
    return c.html(page('error', 'Decision ya registrada', 'Este paso ya fue procesado y no puede modificarse desde el mismo enlace.', frontendUrl(c.env), requestId));
  }

  try {
    const result = await processApproval(requestId, step.level, action, cleanComment, c.env);
    await consumeMagicToken(token, c.env.DB);

    if (action === 'reject') {
      return c.html(page('reject', 'Rechazo registrado', 'Tu decision y comentarios fueron enviados al solicitante.', frontendUrl(c.env), requestId));
    }

    const msg = result.done
      ? 'La solicitud fue completamente aprobada. El solicitante fue notificado.'
      : `Tu aprobacion fue registrada. Se notifico al aprobador del nivel ${result.nextLevel}.`;
    return c.html(page('success', 'Aprobacion registrada', msg, frontendUrl(c.env), requestId));
  } catch (err) {
    console.error('EMAIL_DECISION_FAILED', err instanceof Error ? err.message : String(err));
    return c.html(page('error', 'No se pudo registrar', err instanceof Error ? err.message : 'Ocurrio un error al registrar la decision.', frontendUrl(c.env), requestId));
  }
}

async function readDecisionBody(c: Context<AppEnv>): Promise<{ token: string; comment: string }> {
  const form = await c.req.formData();
  return {
    token: String(form.get('token') ?? ''),
    comment: String(form.get('comment') ?? ''),
  };
}

function decisionForm(action: Decision, token: string, info: DecisionInfo, platformUrl: string, formError: string): string {
  const isReject = action === 'reject';
  const title = isReject ? 'Rechazar solicitud' : 'Aprobar solicitud';
  const button = isReject ? 'Enviar rechazo' : 'Confirmar aprobacion';
  const buttonColor = isReject ? '#993C1D' : '#1D9E75';
  const intro = isReject
    ? 'Indica el motivo del rechazo. El solicitante recibira esta informacion para corregir o complementar su solicitud.'
    : 'Puedes agregar un comentario para dejar trazabilidad de tu decision. El comentario es opcional para aprobar.';
  const required = isReject ? 'required' : '';
  const errorHtml = formError
    ? `<div class="error">${escapeHtml(formError)}</div>`
    : '';

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} - FlowApp</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#F2F2F0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;color:#222}
    .card{background:#fff;border-radius:16px;padding:32px;max-width:560px;width:100%;box-shadow:0 10px 30px rgba(0,0,0,.08)}
    .eyebrow{font-size:12px;color:#185FA5;font-weight:800;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px}
    h1{font-size:22px;color:#111;margin-bottom:8px;font-weight:800}
    p{font-size:14px;color:#666;line-height:1.6;margin-bottom:18px}
    .summary{background:#F8FAFC;border-left:4px solid #185FA5;border-radius:8px;padding:14px 16px;margin:18px 0}
    .summary h2{font-size:16px;color:#111;margin-bottom:8px;line-height:1.35}
    .summary div{font-size:12px;color:#666;margin-top:4px}
    label{display:block;font-size:13px;font-weight:700;color:#333;margin-bottom:6px}
    textarea{width:100%;padding:12px;border:1.5px solid #D8D6CE;border-radius:8px;font-size:14px;resize:vertical;min-height:120px;font-family:inherit;outline:none;transition:border-color .2s}
    textarea:focus{border-color:#185FA5}
    .actions{display:flex;gap:10px;margin-top:18px;align-items:center}
    .primary{flex:1;padding:13px;border-radius:8px;font-size:14px;font-weight:800;border:none;cursor:pointer;background:${buttonColor};color:#fff}
    .secondary{display:block;text-align:center;padding:13px 16px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;background:#F2F2F0;color:#444}
    .error{background:#FFF2EC;border:1px solid #F0997B;color:#993C1D;border-radius:8px;padding:10px 12px;font-size:13px;margin:10px 0 16px}
    small{display:block;margin-top:22px;font-size:12px;color:#aaa;text-align:center}
  </style>
</head>
<body>
  <div class="card">
    <div class="eyebrow">Nivel ${info.level} - ${escapeHtml(info.request_type_name)}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(intro)}</p>
    <div class="summary">
      <h2>${escapeHtml(info.title)}</h2>
      <div>Solicitado por <strong>${escapeHtml(info.requester_name)}</strong></div>
      <div>Aprobador: <strong>${escapeHtml(info.approver_name)}</strong></div>
    </div>
    ${errorHtml}
    <form method="POST" action="/${action}">
      <input type="hidden" name="token" value="${escapeAttr(token)}">
      <label for="comment">Comentarios ${isReject ? '' : '(opcional)'}</label>
      <textarea id="comment" name="comment" maxlength="1200" ${required} placeholder="Escribe tus comentarios aqui..."></textarea>
      <div class="actions">
        <a class="secondary" href="${escapeAttr(joinUrl(platformUrl, '/requests/' + encodeURIComponent(info.id)))}">Ver solicitud</a>
        <button type="submit" class="primary">${escapeHtml(button)}</button>
      </div>
    </form>
    <small>FlowApp - Sistema de aprobaciones</small>
  </div>
</body>
</html>`;
}

function page(
  type: 'success' | 'reject' | 'error',
  title: string,
  message: string,
  platformUrl: string,
  requestId?: string
): string {
  const colors = {
    success: { bg: '#E1F5EE', fg: '#085041', icon: '&check;', btn: '#1D9E75' },
    reject: { bg: '#FAECE7', fg: '#712B13', icon: '&times;', btn: '#993C1D' },
    error: { bg: '#FAEEDA', fg: '#633806', icon: '!', btn: '#185FA5' },
  }[type];
  const target = requestId ? joinUrl(platformUrl, '/requests/' + encodeURIComponent(requestId)) : platformUrl;
  const label = requestId ? 'Ver solicitud' : 'Ir a la plataforma';

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} - FlowApp</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#F2F2F0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:16px;padding:40px 36px;max-width:480px;width:100%;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.08)}
    .icon{width:64px;height:64px;border-radius:50%;background:${colors.bg};color:${colors.fg};font-size:26px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
    h1{font-size:21px;color:#111;margin-bottom:10px;font-weight:800}
    p{font-size:14px;color:#666;line-height:1.6;margin-bottom:24px;white-space:pre-line}
    a{display:inline-block;background:${colors.btn};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:800}
    small{display:block;margin-top:28px;font-size:12px;color:#bbb}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${colors.icon}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <a href="${escapeAttr(target)}">${escapeHtml(label)}</a>
    <small>FlowApp - Sistema de aprobaciones</small>
  </div>
</body>
</html>`;
}

function errorTitle(e?: TokenError) {
  return ({
    invalid_format: 'Enlace invalido',
    invalid_signature: 'Enlace invalido',
    invalid_payload: 'Enlace invalido',
    expired: 'Enlace expirado',
    already_used: 'Enlace ya utilizado',
    not_found: 'Token no encontrado',
  } as Record<string, string>)[e ?? ''] ?? 'Error';
}

function errorMsg(e?: TokenError) {
  return ({
    invalid_format: 'El enlace no tiene el formato esperado.',
    invalid_signature: 'El enlace no es valido o fue modificado.',
    invalid_payload: 'El enlace no contiene una accion valida.',
    expired: 'Este enlace vencio. Solicita que se reenvie la notificacion.',
    already_used: 'Esta accion ya fue registrada. No se puede usar el mismo enlace dos veces.',
    not_found: 'El token no existe en el sistema.',
  } as Record<string, string>)[e ?? ''] ?? 'Ocurrio un error inesperado.';
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
  return comment.trim().slice(0, 1200);
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

function safeDecode(value: string): string {
  try { return decodeURIComponent(value); }
  catch { return value; }
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/["\r\n]/g, '_');
}

export default router;
