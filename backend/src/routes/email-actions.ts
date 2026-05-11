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

type ReviewInfo = DecisionInfo & {
 requester_email?: string;
};

type ReviewAttachment = {
 filename: string;
 r2_key: string;
 size_bytes?: number;
};

router.get('/review', async (c) => {
 const token = c.req.query('token') ?? '';
 if (!token) return c.html(page('error', 'Token faltante', 'No se proporciono un token.', frontendUrl(c.env)));

 const check = await verifyMagicToken(token, c.env.TOKEN_SECRET, c.env.DB);
 if (!check.ok) return c.html(page('error', errorTitle(check.error), errorMsg(check.error), frontendUrl(c.env)));

 const { requestId, stepId } = check.payload;

 const info = await c.env.DB.prepare(`
  SELECT r.id, r.title, r.description, r.request_type_name, r.requester_name, r.requester_email,
      s.level, s.approver_name, s.status as step_status
   FROM requests r
   JOIN approval_steps s ON s.request_id = r.id
   WHERE r.id = ? AND s.id = ?
 `).bind(requestId, stepId).first<ReviewInfo>();

 if (!info) return c.html(page('error', 'Solicitud no encontrada', 'No se encontro la solicitud asociada al enlace.', frontendUrl(c.env)));
 if (info.step_status !== 'pending') {
  return c.html(page('error', 'Decision ya registrada', 'Este paso ya fue procesado y no puede modificarse desde el mismo enlace.', frontendUrl(c.env), info.id));
 }

 const files = await c.env.DB.prepare(`
  SELECT filename, r2_key, size_bytes
   FROM attachments
   WHERE request_id = ?
   ORDER BY created_at
 `).bind(requestId).all<ReviewAttachment>();

 return c.html(reviewPage(token, info, files.results ?? []));
});

router.get('/approve', async (c) => {
 const token = c.req.query('token') ?? '';
 return renderDecisionForm(c, 'approve', token);
});

router.post('/approve', async (c) => {
 const body = await readDecisionBody(c);
 return completeDecision(c, 'approve', body.token, body.comment);
});

router.get('/reject', async (c) => {
 const token = c.req.query('token') ?? '';
 return renderDecisionForm(c, 'reject', token);
});

router.post('/reject', async (c) => {
 const body = await readDecisionBody(c);
 return completeDecision(c, 'reject', body.token, body.comment);
});

router.get('/review-file/:key{.+}', async (c) => {
 const token = c.req.query('token') ?? '';
 const check = await verifyMagicToken(token, c.env.TOKEN_SECRET, c.env.DB);
 if (!check.ok) return c.html(page('error', errorTitle(check.error), errorMsg(check.error), frontendUrl(c.env)));

 const key = safeDecode(c.req.param('key'));
 if (!key.startsWith(check.payload.requestId + '/')) {
  return c.html(page('error', 'Acceso denegado', 'El archivo no pertenece a esta solicitud.', frontendUrl(c.env)));
 }

 return streamFile(c, key);
});

router.get('/files/:key{.+}', async (c) => {
 const key = safeDecode(c.req.param('key'));
 return streamFile(c, key);
});

async function streamFile(c: Context<AppEnv>, key: string): Promise<Response> {
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
}

async function renderDecisionForm(c: Context<AppEnv>, action: Decision, token: string, formError = ''): Promise<Response> {
 if (!token) return c.html(page('error', 'Token faltante', 'No se proporciono un token.', frontendUrl(c.env)));

 const check = await verifyMagicToken(token, c.env.TOKEN_SECRET, c.env.DB);
 if (!check.ok) return c.html(page('error', errorTitle(check.error), errorMsg(check.error), frontendUrl(c.env)));

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
  console.error('EMAIL_DECISION_FAILED', err instanceof Error ? err.message: String(err));
  return c.html(page('error', 'No se pudo registrar', err instanceof Error ? err.message: 'Ocurrio un error al registrar la decision.', frontendUrl(c.env), requestId));
 }
}

async function readDecisionBody(c: Context<AppEnv>): Promise<{ token: string; comment: string }> {
 const form = await c.req.formData();
 return {
  token: String(form.get('token') ?? ''),
  comment: String(form.get('comment') ?? ''),
 };
}

function reviewPage(token: string, info: ReviewInfo, files: ReviewAttachment[]): string {
 const fileHtml = files.length
  ? files.map(f => `
   <a class="file" href="/review-file/${encodeURIComponent(f.r2_key)}?token=${encodeURIComponent(token)}" target="_blank" rel="noopener">
    <span>${escapeHtml(f.filename)}</span>
    <small>${formatBytes(f.size_bytes ?? 0)}</small>
   </a>
  `).join('')
 : '<div class="empty">Esta solicitud no tiene archivos adjuntos.</div>';

 return `<!doctype html>
<html lang="es">
<head>
 <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
 <title>Revisar solicitud - FlowApp</title>
 <style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#F2F2F0;min-height:100vh;padding:24px;color:#222}
 .wrap{max-width:880px;margin:0 auto}
 .card{background:#fff;border-radius:16px;padding:28px;box-shadow:0 10px 30px rgba(0,0,0,.08);margin-bottom:18px}
 .eyebrow{font-size:12px;color:#185FA5;font-weight:800;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px}
  h1{font-size:24px;color:#111;margin-bottom:10px;font-weight:800}
  h2{font-size:16px;color:#111;margin:22px 0 10px}
  p{font-size:14px;color:#555;line-height:1.6;margin-bottom:10px}
 .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
 .meta{background:#F8FAFC;border:1px solid #ECECEA;border-radius:10px;padding:12px}
 .meta span{display:block;font-size:11px;color:#777;text-transform:uppercase;font-weight:800;margin-bottom:4px}
 .meta strong{font-size:14px;color:#222}
 .files{display:grid;gap:8px}
 .file{display:flex;justify-content:space-between;gap:16px;align-items:center;border:1px solid #E6E4DE;background:#FAFAF8;border-radius:10px;padding:12px 14px;text-decoration:none;color:#185FA5;font-weight:700}
 .file small{color:#777;font-weight:500}
 .empty{padding:14px;border:1px dashed #CCC;border-radius:10px;color:#777;font-size:14px}
  label{display:block;font-size:13px;font-weight:800;color:#333;margin-bottom:6px}
  textarea{width:100%;padding:12px;border:1.5px solid #D8D6CE;border-radius:10px;font-size:14px;resize:vertical;min-height:120px;font-family:inherit;outline:none}
  textarea:focus{border-color:#185FA5}
 .actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
  button{padding:14px 18px;border-radius:10px;font-size:14px;font-weight:900;border:none;cursor:pointer;color:#fff}
 .approve{background:#1D9E75}
 .reject{background:#993C1D}
 .note{font-size:12px;color:#888;margin-top:12px}
  @media(max-width:720px){.grid,.actions{grid-template-columns:1fr}}
 </style>
</head>
<body>
 <div class="wrap">
  <div class="card">
   <div class="eyebrow">Nivel ${info.level} - ${escapeHtml(info.request_type_name)}</div>
   <h1>${escapeHtml(info.title)}</h1>
   <p>${escapeHtml(info.description)}</p>
   <div class="grid">
    <div class="meta"><span>Solicitante</span><strong>${escapeHtml(info.requester_name)}</strong></div>
    <div class="meta"><span>Aprobador</span><strong>${escapeHtml(info.approver_name)}</strong></div>
   </div>

   <h2>Archivos adjuntos</h2>
   <div class="files">${fileHtml}</div>
  </div>

  <div class="card">
   <h2>Decision</h2>
   <p>Escribe un comentario si necesitas dejar trazabilidad. Para rechazar, el comentario es obligatorio.</p>

   <form method="POST" action="/approve">
    <input type="hidden" name="token" value="${escapeAttr(token)}">
    <label for="approve-comment">Comentario para aprobacion</label>
    <textarea id="approve-comment" name="comment" maxlength="1200" placeholder="Comentario opcional..."></textarea>
    <div class="actions">
     <button type="submit" class="approve">Aprobar solicitud</button>
     <button type="submit" formaction="/reject" class="reject">Rechazar solicitud</button>
    </div>
   </form>
   <p class="note">El enlace vence y solo puede usarse una vez para decidir.</p>
  </div>
 </div>
</body>
</html>`;
}

function decisionForm(action: Decision, token: string, info: DecisionInfo, platformUrl: string, formError: string): string {
 const isReject = action === 'reject';
 const title = isReject ? 'Rechazar solicitud': 'Aprobar solicitud';
 const button = isReject ? 'Enviar rechazo': 'Confirmar aprobacion';
 const buttonColor = isReject ? '#993C1D': '#1D9E75';
 const intro = isReject
  ? 'Indica el motivo del rechazo. El solicitante recibira esta informacion.'
 : 'Puedes agregar un comentario para dejar trazabilidad.';
 const required = isReject ? 'required': '';
 const errorHtml = formError ? `<div class="error">${escapeHtml(formError)}</div>`: '';

 return `<!doctype html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} - FlowApp</title></head>
<body style="font-family:Segoe UI,Arial,sans-serif;background:#F2F2F0;padding:24px;">
 <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(intro)}</p>
  <p><strong>${escapeHtml(info.title)}</strong></p>
  ${errorHtml}
  <form method="POST" action="/${action}">
   <input type="hidden" name="token" value="${escapeAttr(token)}">
   <textarea name="comment" maxlength="1200" ${required} style="width:100%;min-height:120px;"></textarea>
   <button type="submit" style="margin-top:12px;background:${buttonColor};color:#fff;border:none;padding:12px 20px;border-radius:8px;">${escapeHtml(button)}</button>
  </form>
  <p><a href="${escapeAttr(joinUrl(platformUrl, '/requests/' + encodeURIComponent(info.id)))}">Ver solicitud en plataforma</a></p>
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
 const target = requestId ? joinUrl(platformUrl, '/requests/' + encodeURIComponent(requestId)): platformUrl;
 const label = requestId ? 'Ver solicitud': 'Ir a la plataforma';

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

function formatBytes(bytes: number): string {
 if (!bytes) return '';
 if (bytes < 1024) return bytes + ' B';
 if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
 return (bytes / 1024 / 1024).toFixed(1) + ' MB';
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
