content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()

# HTML mínimo pero con diseño básico
minimalHtml = '''<html>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
<tr><td style="background:#0C447C;color:#fff;padding:20px;text-align:center;">
<h2 style="margin:0;font-size:24px;">FlowApp</h2>
</td></tr>
<tr><td style="background:#fff;padding:20px;border:1px solid #ddd;">
<p>Hola <b>''' + step.approver_name + '''</b>,</p>
<p>Tienes una solicitud pendiente:</p>
<div style="background:#f8f8f8;padding:15px;border-left:4px solid #0C447C;margin:15px 0;">
<p style="margin:0;font-weight:bold;font-size:16px;">''' + request.title + '''</p>
<p style="margin:5px 0 0;color:#666;">Nivel ''' + level + ''' de ''' + request.total_levels + ''' - ''' + request.request_type_name + '''</p>
</div>
<p>''' + request.description + '''</p>
''' + (attachments.length > 0 ? '<p><b>Adjuntos:</b> ' + attachments.map(function(a){return '<a href="' + a.url + '" style="color:#0C447C;">' + a.filename + '</a>';}).join(', ') + '</p>' : '') + '''
<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
<tr>
<td style="padding:0 8px 0 0;"><a href="''' + env.PLATFORM_URL + '''/approve?token=''' + approveToken + '''" style="display:block;background:#1D9E75;color:#fff;padding:12px;text-align:center;border-radius:4px;text-decoration:none;font-weight:bold;">Aprobar</a></td>
<td style="padding:0 0 0 8px;"><a href="''' + env.PLATFORM_URL + '''/reject?token=''' + rejectToken + '''" style="display:block;background:#F0997B;color:#fff;padding:12px;text-align:center;border-radius:4px;text-decoration:none;font-weight:bold;">Rechazar</a></td>
</tr>
</table>
<p style="color:#888;font-size:12px;margin:20px 0 0;">Enlace valido por 72 horas - FlowApp</p>
</td></tr>
<tr><td style="background:#f4f4f4;padding:12px;text-align:center;font-size:12px;color:#999;">
Sistema de aprobaciones interno
</td></tr>
</table>
</body>
</html>'''

# Reemplazar todo el bloque html
start = content.find("  const html = '<!DOCTYPE html>'")
if start > 0:
    end = content.find("';", start) + 2
    new_html = "  const html = '" + minimalHtml.replace("'", "\\'") + "';"
    content = content[:start] + new_html + content[end:]
    open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
    print('HTML updated!')
else:
    print('Pattern not found')
