export function buildApprovalEmail(d: {
  approverName: string;
  requesterName: string;
  requestTitle: string;
  requestType: string;
  description: string;
  level: number;
  totalLevels: number;
  requestId: string;
  attachments: { filename: string; url: string }[];
  approveUrl: string;
  rejectUrl: string;
  platformUrl: string;
  campaignData?: unknown;
}): { subject: string; html: string; text: string } {
  const subject = '[FlowApp] Aprobacion nivel ' + d.level + '/' + d.totalLevels + ' - ' + d.requestTitle;
  const viewUrl = joinUrl(d.platformUrl, '/requests/' + encodeURIComponent(d.requestId));

  const attachmentHtml = d.attachments.length > 0
    ? d.attachments.map(a => `
        <tr>
          <td style="padding:10px 0;border-top:1px solid #ECECEA;">
            <a href="${attr(a.url)}" style="color:#185FA5;text-decoration:none;font-size:13px;font-weight:600;">Abrir adjunto</a>
            <span style="color:#555;font-size:13px;margin-left:8px;">${html(a.filename)}</span>
          </td>
        </tr>`).join('')
    : `<tr><td style="padding:10px 0;color:#888;font-size:13px;border-top:1px solid #ECECEA;">Sin archivos adjuntos</td></tr>`;

  const attachmentText = d.attachments.length > 0
    ? d.attachments.map(a => `Adjunto: ${a.filename} - ${a.url}`).join('\n')
    : 'Sin archivos adjuntos';

  const mailHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${html(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F2F2F0;font-family:Segoe UI,Arial,sans-serif;color:#222;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F0;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E6E4DE;">
        <tr>
          <td style="background:#0C447C;color:#FFFFFF;padding:26px 28px;">
            <h1 style="margin:0;font-size:24px;line-height:1.2;font-weight:800;">FlowApp</h1>
            <p style="margin:6px 0 0;font-size:13px;color:#CFE4F6;">Aprobacion nivel ${d.level} de ${d.totalLevels}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Hola <strong>${html(d.approverName)}</strong>,</p>
            <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;">Tienes una tarea pendiente. Abre la accion segura para registrar tu decision y, si aplica, enviar comentarios sin iniciar sesion.</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-left:4px solid #185FA5;border-radius:8px;margin:0 0 20px;">
              <tr><td style="padding:16px;">
                <p style="margin:0 0 6px;font-size:11px;color:#777;text-transform:uppercase;letter-spacing:.4px;">${html(d.requestType)}</p>
                <h2 style="margin:0 0 10px;font-size:18px;color:#111;line-height:1.3;">${html(d.requestTitle)}</h2>
                <p style="margin:0 0 10px;font-size:13px;color:#555;line-height:1.6;white-space:pre-line;">${html(d.description)}</p>
                <p style="margin:0;font-size:12px;color:#777;">Solicitado por <strong>${html(d.requesterName)}</strong></p>
              </td></tr>
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;">
              <tr><td style="font-size:13px;font-weight:700;color:#111;padding-bottom:4px;">Archivos de respaldo</td></tr>
              ${attachmentHtml}
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 12px;">
              <tr>
                <td style="padding-right:8px;width:50%;">
                  <a href="${attr(d.approveUrl)}" style="display:block;background:#1D9E75;color:#FFFFFF;text-align:center;padding:14px 12px;border-radius:8px;font-size:14px;font-weight:800;text-decoration:none;">Aprobar / comentar</a>
                </td>
                <td style="padding-left:8px;width:50%;">
                  <a href="${attr(d.rejectUrl)}" style="display:block;background:#FFFFFF;color:#993C1D;text-align:center;padding:12px 12px;border-radius:8px;font-size:14px;font-weight:800;text-decoration:none;border:2px solid #F0997B;">Rechazar / comentar</a>
                </td>
              </tr>
            </table>

            <p style="margin:20px 0 0;font-size:12px;color:#888;line-height:1.5;text-align:center;border-top:1px solid #ECECEA;padding-top:16px;">
              Enlaces de un solo uso validos por 72 horas.<br>
              <a href="${attr(viewUrl)}" style="color:#185FA5;text-decoration:none;font-weight:700;">Ver solicitud en la plataforma</a>
            </p>
          </td>
        </tr>
        <tr><td style="background:#F8F8F6;padding:14px 28px;text-align:center;border-top:1px solid #ECECEA;"><p style="margin:0;font-size:11px;color:#999;">FlowApp - Sistema de aprobaciones internas</p></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = 'FlowApp - Aprobacion requerida\n\n' +
    'Hola ' + d.approverName + ',\n\n' +
    'Solicitud: ' + d.requestTitle + '\n' +
    'Tipo: ' + d.requestType + '\n' +
    'Nivel: ' + d.level + '/' + d.totalLevels + '\n' +
    'Solicitado por: ' + d.requesterName + '\n\n' +
    d.description + '\n\n' +
    attachmentText + '\n\n' +
    'APROBAR / COMENTAR: ' + d.approveUrl + '\n' +
    'RECHAZAR / COMENTAR: ' + d.rejectUrl + '\n' +
    'VER SOLICITUD: ' + viewUrl + '\n\n' +
    'Enlaces validos por 72 horas.';

  return { subject, html: mailHtml, text };
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

function html(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attr(value: unknown): string {
  return html(value);
}
