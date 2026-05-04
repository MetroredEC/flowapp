content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
old = "  const plainText = 'Hola ' + step.approver_name + '. Solicitud: ' + request.title + '. APROBAR: ' + env.PLATFORM_URL + '/approve?token=' + approveToken;\n  await sendMail({ to: step.approver_email, subject, html: '<p>' + plainText + '</p>', text: plainText }, request.requester_email, graphToken);"
new = """  const simpleHtml = '<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">' +
    '<div style="background:#0C447C;padding:16px;border-radius:8px 8px 0 0;">' +
    '<h2 style="color:#fff;margin:0;">FlowApp</h2>' +
    '<p style="color:#90b8d8;margin:4px 0 0;font-size:13px;">Nivel ' + level + ' de ' + request.total_levels + '</p>' +
    '</div>' +
    '<div style="border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 8px 8px;">' +
    '<p>Hola <b>' + step.approver_name + '</b>,</p>' +
    '<p>Tienes una solicitud pendiente de aprobacion:</p>' +
    '<div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;border-left:3px solid #0C447C;">' +
    '<b>' + request.title + '</b><br>' +
    '<span style="color:#666;font-size:13px;">' + request.request_type_name + ' - ' + request.requester_name + '</span><br>' +
    '<p style="margin:8px 0 0;font-size:13px;">' + request.description + '</p>' +
    '</div>' +
    (attachments.length > 0 ? '<p><b>Adjuntos:</b> ' + attachments.map(function(a){return '<a href="' + a.url + '">' + a.filename + '</a>';}).join(', ') + '</p>' : '') +
    '<table style="width:100%;margin-top:20px;" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="width:50%;padding-right:8px;"><a href="' + env.PLATFORM_URL + '/approve?token=' + approveToken + '" style="display:block;background:#1D9E75;color:#fff;text-align:center;padding:12px;border-radius:6px;text-decoration:none;font-weight:bold;">Aprobar</a></td>' +
    '<td style="width:50%;padding-left:8px;"><a href="' + env.PLATFORM_URL + '/reject?token=' + rejectToken + '" style="display:block;background:#fff;color:#993C1D;border:2px solid #F0997B;text-align:center;padding:10px;border-radius:6px;text-decoration:none;font-weight:bold;">Rechazar</a></td>' +
    '</tr></table>' +
    '<p style="font-size:11px;color:#aaa;margin-top:16px;text-align:center;">Enlace valido por 72 horas</p>' +
    '</div></body></html>';
  const plainText = 'FlowApp - Aprobacion nivel ' + level + '/' + request.total_levels + '. Solicitud: ' + request.title + '. APROBAR: ' + env.PLATFORM_URL + '/approve?token=' + approveToken + ' RECHAZAR: ' + env.PLATFORM_URL + '/reject?token=' + rejectToken;
  await sendMail({ to: step.approver_email, subject, html: simpleHtml, text: plainText }, request.requester_email, graphToken);"""
if old in content:
    content = content.replace(old, new)
    open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
    idx = content.find('plainText')
    print(repr(content[idx:idx+100]))
