export interface EmailData {
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
  campaignData?: {
    code: string; totalAmount: number; currency: string;
    vendorName: string; executionDate: string; billingDate: string;
  };
}

export function buildApprovalEmail(d: EmailData): { subject: string; html: string; text: string } {
  const subject = `[FlowApp] Aprobación nivel ${d.level}/${d.totalLevels} — ${d.requestTitle}`;

  const levels = Array.from({ length: d.totalLevels }, (_, i) => {
    const n = i + 1;
    const bg = n < d.level ? '#1D9E75' : n === d.level ? '#185FA5' : '#D3D1C7';
    const c  = n <= d.level ? '#fff' : '#888780';
    return `<td align="center" style="padding:0 4px;">
      <div style="width:32px;height:32px;border-radius:50%;background:${bg};color:${c};font-size:13px;font-weight:700;line-height:32px;text-align:center;">${n}</div>
    </td>`;
  }).join('<td style="width:16px;"><div style="height:2px;background:#E8E8E8;margin-top:15px;"></div></td>');

  const attRows = d.attachments.length
    ? d.attachments.map(a => `
      <tr>
        <td style="padding:7px 0;border-bottom:1px solid #F0F0F0;">
          <a href="${a.url}" style="color:#185FA5;font-size:13px;text-decoration:none;">&#128206; ${esc(a.filename)}</a>
        </td>
      </tr>`).join('')
    : `<tr><td style="padding:7px 0;color:#aaa;font-size:13px;">Sin archivos adjuntos</td></tr>`;

  const campaign = d.campaignData ? `
    <div style="background:#F0FAF6;border:1px solid #9FE1CB;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#085041;text-transform:uppercase;letter-spacing:0.5px;">Datos de campaña</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${row('Código','#0F6E56',esc(d.campaignData.code))}
        ${row('Monto total','#0F6E56',`${d.campaignData.currency} ${d.campaignData.totalAmount.toLocaleString('es-EC')}`)}
        ${row('Proveedor seleccionado','#0F6E56',esc(d.campaignData.vendorName))}
        ${row('Fecha de ejecución','#444',d.campaignData.executionDate)}
        ${row('Fecha de facturación','#444',d.campaignData.billingDate)}
      </table>
    </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F2F2F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#0C447C;border-radius:12px 12px 0 0;padding:22px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td><span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">FlowApp</span></td>
        <td align="right"><span style="background:rgba(255,255,255,0.15);color:#B5D4F4;font-size:11px;padding:4px 10px;border-radius:20px;">Nivel ${d.level} de ${d.totalLevels}</span></td>
      </tr>
    </table>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#fff;padding:28px 32px 0;">

    <p style="margin:0 0 6px;font-size:15px;color:#111;">Hola, <strong>${esc(d.approverName)}</strong></p>
    <p style="margin:0 0 24px;font-size:13px;color:#666;line-height:1.5;">Tienes una solicitud pendiente de tu aprobación.</p>

    <!-- Indicador de niveles -->
    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>${levels}</tr>
    </table>

    <!-- Detalle -->
    <div style="background:#F8F8F6;border-radius:8px;padding:18px;margin-bottom:16px;">
      <p style="margin:0 0 2px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.6px;">${esc(d.requestType)}</p>
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111;line-height:1.3;">${esc(d.requestTitle)}</p>
      <p style="margin:0 0 10px;font-size:13px;color:#444;line-height:1.6;">${esc(d.description)}</p>
      <p style="margin:0;font-size:12px;color:#888;">Solicitado por <strong style="color:#555;">${esc(d.requesterName)}</strong></p>
    </div>

    ${campaign}

    <!-- Adjuntos -->
    <p style="margin:0 0 6px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.6px;">Archivos adjuntos</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">${attRows}</table>

  </td></tr>

  <!-- Botones -->
  <tr><td style="background:#fff;padding:8px 32px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="49%" style="padding-right:6px;">
          <a href="${d.approveUrl}" style="display:block;background:#1D9E75;color:#fff;text-align:center;padding:15px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">Aprobar</a>
        </td>
        <td width="49%" style="padding-left:6px;">
          <a href="${d.rejectUrl}" style="display:block;background:#fff;color:#993C1D;border:2px solid #F0997B;text-align:center;padding:13px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">Rechazar</a>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Aviso -->
  <tr><td style="background:#FFFBF0;border-top:1px solid #FAC775;padding:12px 32px;">
    <p style="margin:0;font-size:12px;color:#633806;line-height:1.5;">
      Enlace de un solo uso · válido por <strong>72 horas</strong> · 
      <a href="${d.platformUrl}/requests/${d.requestId}" style="color:#633806;">Ver en plataforma</a>
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#F2F2F0;border-radius:0 0 12px 12px;padding:14px 32px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#aaa;">FlowApp · Sistema de aprobaciones interno</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const text = `[FlowApp] Aprobación requerida — Nivel ${d.level}/${d.totalLevels}

Hola ${d.approverName},

Solicitud: ${d.requestTitle}
Tipo: ${d.requestType}
Solicitado por: ${d.requesterName}

${d.description}

APROBAR : ${d.approveUrl}
RECHAZAR: ${d.rejectUrl}

Enlace válido por 72 horas. Ver en plataforma: ${d.platformUrl}/requests/${d.requestId}`;

  return { subject, html, text };
}

function row(label: string, color: string, value: string) {
  return `<tr>
    <td style="font-size:13px;color:#888;padding:3px 0;width:45%;">${label}</td>
    <td style="font-size:13px;color:${color};font-weight:600;">${value}</td>
  </tr>`;
}
function esc(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
