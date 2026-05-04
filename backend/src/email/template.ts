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

  const attLinks = d.attachments.length > 0
    ? '<p style="margin:8px 0;"><b>Adjuntos:</b> ' +
      d.attachments.map(function(a) {
        return '<a href="' + a.url + '" style="color:#185FA5;">' + a.filename + '</a>';
      }).join(', ') + '</p>'
    : '<p style="margin:8px 0;color:#888;">Sin archivos adjuntos</p>';

  const html = [
    '<html><head><meta charset="UTF-8"></head>',
    '<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">',
    '<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">',
    '<tr><td align="center">',
    '<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;">',
    '<tr><td style="background:#0C447C;padding:20px 28px;">',
    '<h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">FlowApp</h1>',
    '<p style="margin:4px 0 0;color:#90b8d8;font-size:13px;">Nivel ' + d.level + ' de ' + d.totalLevels + '</p>',
    '</td></tr>',
    '<tr><td style="padding:28px;">',
    '<p style="margin:0 0 16px;font-size:15px;color:#111;">Hola <b>' + d.approverName + '</b>,</p>',
    '<p style="margin:0 0 20px;font-size:14px;color:#555;">Tienes una solicitud pendiente de aprobacion.</p>',
    '<div style="background:#f8f8f8;border-radius:6px;padding:16px;margin-bottom:16px;border-left:3px solid #0C447C;">',
    '<p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;">' + d.requestType + '</p>',
    '<p style="margin:0 0 8px;font-size:17px;font-weight:700;color:#111;">' + d.requestTitle + '</p>',
    '<p style="margin:0 0 8px;font-size:13px;color:#444;">' + d.description + '</p>',
    '<p style="margin:0;font-size:12px;color:#888;">Solicitado por <b>' + d.requesterName + '</b></p>',
    '</div>',
    attLinks,
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">',
    '<tr>',
    '<td width="48%" style="padding-right:8px;">',
    '<a href="' + d.approveUrl + '" style="display:block;background:#1D9E75;color:#fff;text-align:center;',
    'padding:14px;border-radius:6px;font-size:15px;font-weight:700;text-decoration:none;">Aprobar</a>',
    '</td>',
    '<td width="48%" style="padding-left:8px;">',
    '<a href="' + d.rejectUrl + '" style="display:block;background:#fff;color:#993C1D;text-align:center;',
    'padding:12px;border-radius:6px;font-size:15px;font-weight:700;text-decoration:none;',
    'border:2px solid #F0997B;">Rechazar</a>',
    '</td>',
    '</tr>',
    '</table>',
    '<p style="margin-top:20px;font-size:11px;color:#aaa;text-align:center;">',
    'Enlace de un solo uso valido por 72 horas.</p>',
    '</td></tr>',
    '<tr><td style="background:#f4f4f4;padding:14px 28px;text-align:center;">',
    '<p style="margin:0;font-size:12px;color:#aaa;">FlowApp - Sistema de aprobaciones internas</p>',
    '</td></tr>',
    '</table>',
    '</td></tr>',
    '</table>',
    '</body></html>',
  ].join('');

  const text = 'FlowApp - Aprobacion requerida\n\n' +
    'Hola ' + d.approverName + ',\n\n' +
    'Solicitud: ' + d.requestTitle + '\n' +
    'Tipo: ' + d.requestType + '\n' +
    'Solicitado por: ' + d.requesterName + '\n\n' +
    d.description + '\n\n' +
    'APROBAR: ' + d.approveUrl + '\n' +
    'RECHAZAR: ' + d.rejectUrl + '\n\n' +
    'Enlace valido por 72 horas.';

  return { subject, html, text };
}
