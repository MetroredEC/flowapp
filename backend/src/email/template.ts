export interface ApprovalEmailData {
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
  campaignData?: string | null;
}

export function buildApprovalEmail(d: ApprovalEmailData): { subject: string; html: string; text: string } {
  const hasAttachments = d.attachments.length > 0;

  const attachmentHtml = hasAttachments
    ? `<tr><td style="padding:10px 0;color:#333;font-size:13px;border-top:1px solid #ECECEA;">
        Esta solicitud incluye <strong>${d.attachments.length}</strong> archivo(s) adjunto(s). Revisa los archivos en la plataforma.
      </td></tr>`
    : `<tr><td style="padding:10px 0;color:#888;font-size:13px;border-top:1px solid #ECECEA;">
        Esta solicitud no tiene archivos adjuntos.
      </td></tr>`;

  const attachmentText = hasAttachments
    ? `${d.attachments.length} archivo(s) adjunto(s). Revisar en la plataforma.`
    : 'Esta solicitud no tiene archivos adjuntos.';

  const viewUrl = d.platformUrl;
  const subject = `[FlowApp] Aprobacion requerida - ${d.requestTitle}`;

  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F2F2F0;font-family:Segoe UI,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F0;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E6E4DE;">
<tr><td style="background:#EAF2FA;padding:28px;text-align:center;">
<h1 style="margin:0;color:#185FA5;font-size:24px;">Aprobacion requerida</h1>
<p style="margin:8px 0 0;color:#555;font-size:13px;">Nivel ${d.level} de ${d.totalLevels}</p>
</td></tr>
<tr><td style="padding:28px;">
<p style="margin:0 0 16px;font-size:15px;color:#111;">Hola ${esc(d.approverName)},</p>
<p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;">
${esc(d.requesterName)} envio una solicitud que requiere tu revision.
</p>

<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0;">
<tr><td style="font-size:13px;font-weight:700;color:#111;padding-bottom:4px;">Solicitud</td></tr>
<tr><td style="padding:10px 0;color:#333;font-size:14px;border-top:1px solid #ECECEA;">${esc(d.requestTitle)}</td></tr>
<tr><td style="font-size:13px;font-weight:700;color:#111;padding-top:14px;padding-bottom:4px;">Tipo</td></tr>
<tr><td style="padding:10px 0;color:#333;font-size:14px;border-top:1px solid #ECECEA;">${esc(d.requestType)}</td></tr>
<tr><td style="font-size:13px;font-weight:700;color:#111;padding-top:14px;padding-bottom:4px;">Descripcion</td></tr>
<tr><td style="padding:10px 0;color:#333;font-size:14px;line-height:1.6;border-top:1px solid #ECECEA;">${esc(d.description)}</td></tr>
<tr><td style="font-size:13px;font-weight:700;color:#111;padding-top:14px;padding-bottom:4px;">Archivos de respaldo</td></tr>
${attachmentHtml}
</table>

<p style="margin:24px 0 8px;">
<a href="${attr(viewUrl)}" style="display:inline-block;background:#185FA5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">
Ver solicitud y decidir
</a>
</p>

<p style="margin:14px 0 0;font-size:12px;color:#777;line-height:1.5;">
Para aprobar o rechazar, ingresa a la plataforma. Los adjuntos no se incluyen en este correo por seguridad.
</p>
</td></tr>
<tr><td style="background:#F8F8F6;padding:14px 28px;text-align:center;border-top:1px solid #ECECEA;">
<p style="margin:0;font-size:11px;color:#999;">FlowApp - Sistema de aprobaciones internas</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `Aprobacion requerida
Solicitud: ${d.requestTitle}
Tipo: ${d.requestType}
Solicitante: ${d.requesterName}
${attachmentText}
Ver solicitud y decidir: ${viewUrl}`;

  return { subject, html, text };
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attr(value: unknown): string {
  return esc(value);
}
