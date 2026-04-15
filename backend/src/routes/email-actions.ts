import { Hono } from 'hono';
import { AppEnv } from '../types';
import { verifyMagicToken, consumeMagicToken } from '../auth/tokens';
import { processApproval } from '../utils/approvals';

const router = new Hono<AppEnv>();

// GET /approve?token=…
router.get('/approve', async (c) => {
  const token = c.req.query('token') ?? '';
  if (!token) return c.html(page('error', 'Token faltante', 'No se proporcionó un token de aprobación.', c.env.PLATFORM_URL));

  const check = await verifyMagicToken(token, c.env.TOKEN_SECRET, c.env.DB);
  if (!check.ok) return c.html(page('error', errorTitle(check.error), errorMsg(check.error), c.env.PLATFORM_URL));

  const { requestId, stepId } = check.payload;
  const step = await c.env.DB.prepare('SELECT level FROM approval_steps WHERE id = ?')
    .bind(stepId).first<{ level: number }>();
  if (!step) return c.html(page('error', 'Paso no encontrado', 'No se encontró el paso de aprobación.', c.env.PLATFORM_URL));

  await consumeMagicToken(token, c.env.DB);
  const result = await processApproval(requestId, step.level, 'approve', '', c.env);

  const msg = result.done
    ? 'La solicitud ha sido completamente aprobada. El solicitante ha sido notificado.'
    : `Tu aprobación fue registrada. Se ha notificado al aprobador del nivel ${result.nextLevel}.`;

  return c.html(page('success', 'Aprobación registrada', msg, c.env.PLATFORM_URL, requestId));
});

// GET /reject?token=…  (sin comment → muestra formulario)
router.get('/reject', async (c) => {
  const token   = c.req.query('token') ?? '';
  const comment = c.req.query('comment') ?? '';

  if (!token) return c.html(page('error', 'Token faltante', 'No se proporcionó un token.', c.env.PLATFORM_URL));

  const check = await verifyMagicToken(token, c.env.TOKEN_SECRET, c.env.DB);
  if (!check.ok) return c.html(page('error', errorTitle(check.error), errorMsg(check.error), c.env.PLATFORM_URL));

  if (!comment) return c.html(rejectForm(token, c.env.PLATFORM_URL));

  const { requestId, stepId } = check.payload;
  const step = await c.env.DB.prepare('SELECT level FROM approval_steps WHERE id = ?')
    .bind(stepId).first<{ level: number }>();
  if (!step) return c.html(page('error', 'Paso no encontrado', 'No se encontró el paso de aprobación.', c.env.PLATFORM_URL));

  await consumeMagicToken(token, c.env.DB);
  await processApproval(requestId, step.level, 'reject', comment, c.env);

  return c.html(page('reject', 'Rechazo registrado',
    'Tu decisión fue registrada. El solicitante ha sido notificado con tus comentarios.',
    c.env.PLATFORM_URL, requestId));
});

// GET /files/:key — servir archivos desde R2
router.get('/files/:key{.+}', async (c) => {
  const key = c.req.param('key');
  const obj = await c.env.FILES.get(decodeURIComponent(key));
  if (!obj) return c.json({ error: 'not_found' }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=3600');
  return new Response(obj.body, { headers });
});

// ─── HTML helpers ─────────────────────────────────────────────────────────────
function page(
  type: 'success' | 'reject' | 'error',
  title: string, message: string,
  platformUrl: string, requestId?: string
): string {
  const colors = {
    success: { bg: '#E1F5EE', fg: '#085041', icon: '✓', btn: '#1D9E75' },
    reject:  { bg: '#FAECE7', fg: '#712B13', icon: '✕', btn: '#993C1D' },
    error:   { bg: '#FAEEDA', fg: '#633806', icon: '!', btn: '#185FA5' },
  }[type];

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — FlowApp</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F2F2F0;
         min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:16px;padding:40px 36px;max-width:460px;width:100%;text-align:center}
    .icon{width:64px;height:64px;border-radius:50%;background:${colors.bg};color:${colors.fg};
          font-size:26px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}
    h1{font-size:20px;color:#111;margin-bottom:10px;font-weight:700}
    p{font-size:14px;color:#666;line-height:1.6;margin-bottom:24px}
    a{display:inline-block;background:${colors.btn};color:#fff;padding:12px 28px;
      border-radius:8px;text-decoration:none;font-size:14px;font-weight:600}
    small{display:block;margin-top:28px;font-size:12px;color:#bbb}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${colors.icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${requestId
      ? `<a href="${platformUrl}/requests/${requestId}">Ver solicitud</a>`
      : `<a href="${platformUrl}">Ir a la plataforma</a>`}
    <small>FlowApp · Sistema de aprobaciones</small>
  </div>
</body>
</html>`;
}

function rejectForm(token: string, platformUrl: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Rechazar solicitud — FlowApp</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F2F2F0;
         min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:16px;padding:36px;max-width:460px;width:100%}
    h1{font-size:20px;color:#111;margin-bottom:8px;font-weight:700}
    p{font-size:13px;color:#777;margin-bottom:20px;line-height:1.5}
    label{display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:6px}
    textarea{width:100%;padding:12px;border:1.5px solid #ddd;border-radius:8px;font-size:14px;
             resize:vertical;min-height:110px;font-family:inherit;outline:none;transition:border-color .2s}
    textarea:focus{border-color:#185FA5}
    .btns{display:flex;gap:10px;margin-top:16px}
    .btn-r{flex:1;padding:13px;border-radius:8px;font-size:14px;font-weight:700;border:none;
           cursor:pointer;background:#993C1D;color:#fff}
    .btn-c{flex:1;padding:13px;border-radius:8px;font-size:14px;font-weight:700;border:none;
           cursor:pointer;background:#F2F2F0;color:#444}
    small{display:block;margin-top:20px;font-size:12px;color:#bbb;text-align:center}
  </style>
</head>
<body>
  <div class="card">
    <h1>Rechazar solicitud</h1>
    <p>Indica el motivo del rechazo. El solicitante recibirá esta información para corregir o complementar su solicitud.</p>
    <form method="GET" action="/reject">
      <input type="hidden" name="token" value="${token}">
      <label for="c">Motivo del rechazo</label>
      <textarea id="c" name="comment" required placeholder="Describe qué debe corregir o justificar el solicitante..."></textarea>
      <div class="btns">
        <button type="button" class="btn-c" onclick="history.back()">Cancelar</button>
        <button type="submit" class="btn-r">Confirmar rechazo</button>
      </div>
    </form>
    <small>FlowApp · Sistema de aprobaciones</small>
  </div>
</body>
</html>`;
}

function errorTitle(e?: string) {
  return ({ invalid_signature:'Enlace inválido', expired:'Enlace expirado',
    already_used:'Enlace ya utilizado', not_found:'Token no encontrado' } as Record<string,string>)[e ?? ''] ?? 'Error';
}
function errorMsg(e?: string) {
  return ({
    invalid_signature:'El enlace no es válido o fue modificado.',
    expired:'Este enlace venció (validez de 72 horas). Pide al solicitante que lo reenvíe.',
    already_used:'Esta acción ya fue registrada. No se puede usar el mismo enlace dos veces.',
    not_found:'El token no existe en el sistema.',
  } as Record<string,string>)[e ?? ''] ?? 'Ocurrió un error inesperado.';
}

export default router;
