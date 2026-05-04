content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
old = "  const html = '<html><body><p>Hola ' + step.approver_name + ',</p><p>Solicitud: <b>' + request.title + '</b></p><p><a href=\"' + env.PLATFORM_URL + '/approve?token=' + approveToken + '\">APROBAR</a> | <a href=\"' + env.PLATFORM_URL + '/reject?token=' + rejectToken + '\">RECHAZAR</a></p><p>Nivel ' + level + '/' + request.total_levels + '</p></body></html>';"
new = "  const html = '<html><body style=\"font-family:Arial,sans-serif;\">' +" +
    "'<h2 style=\"color:#0C447C;\">FlowApp - Aprobacion requerida</h2>' +" +
    "'<p>Hola <b>' + step.approver_name + '</b>,</p>' +" +
    "'<p>Nivel ' + level + ' de ' + request.total_levels + ' - ' + request.request_type_name + '</p>' +" +
    "'<p><b>' + request.title + '</b></p>' +" +
    "'<p>' + request.description + '</p>' +" +
    "(attachments.length > 0 ? '<p>Adjuntos: ' + attachments.map(function(a){return '<a href=\"' + a.url + '\">' + a.filename + '</a>';}).join(', ') + '</p>' : '') +" +
    "'<p><a href=\"' + env.PLATFORM_URL + '/approve?token=' + approveToken + '\" style=\"background:#1D9E75;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;margin-right:10px;\">Aprobar</a>' +" +
    "'<a href=\"' + env.PLATFORM_URL + '/reject?token=' + rejectToken + '\" style=\"background:#993C1D;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;\">Rechazar</a></p>' +" +
    "'<p style=\"color:#888;font-size:12px;\">Enlace valido por 72 horas - FlowApp</p>' +" +
    "'</body></html>';"
if old in content:
    content = content.replace(old, new)
    open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
