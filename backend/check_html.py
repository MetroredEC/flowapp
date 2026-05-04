# El HTML del .msg tiene \\r\\n que necesita ser convertido a saltos reales
html_limpio = """<!DOCTYPE html>
<html lang="es">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>[FlowApp] Aprobacion</title>
</head>
<body style="margin:0;padding:0;background:#F2F2F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tbody>
<tr>
<td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tbody>
<tr>
<td style="background:#0C447C;border-radius:12px 12px 0 0;padding:22px 32px;">
<span style="color:#fff;font-size:22px;font-weight:800;">FlowApp</span>
</td>
</tr>
<tr>
<td style="background:#fff;padding:28px 32px;">
<p style="font-size:15px;color:#111;margin:0 0 16px;">Hola <strong>APPROVER_NAME</strong>,</p>
<p style="font-size:13px;color:#555;margin:0 0 20px;">Tienes una solicitud pendiente de aprobacion.</p>
<div style="background:#f8f8f8;border-radius:6px;padding:16px;margin-bottom:16px;border-left:3px solid #0C447C;">
<p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;">Nivel LEVEL de TOTAL_LEVELS - REQUEST_TYPE</p>
<p style="margin:0 0 8px;font-size:17px;font-weight:700;color:#111;">REQUEST_TITLE</p>
<p style="margin:0 0 8px;font-size:13px;color:#444;">REQUEST_DESC</p>
<p style="margin:0;font-size:12px;color:#888;">Solicitado por <b>REQUESTER_NAME</b></p>
</div>
ATTACHMENTS
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
<tbody>
<tr>
<td style="padding-right:8px;"><a href="APPROVE_URL" style="display:block;background:#1D9E75;color:#fff;text-align:center;padding:14px;border-radius:6px;font-size:15px;font-weight:700;text-decoration:none;">Aprobar</a></td>
<td style="padding-left:8px;"><a href="REJECT_URL" style="display:block;background:#fff;color:#993C1D;text-align:center;padding:12px;border-radius:6px;font-size:15px;font-weight:700;text-decoration:none;border:2px solid #F0997B;">Rechazar</a></td>
</tr>
</tbody>
</table>
<p style="margin-top:20px;font-size:11px;color:#aaa;text-align:center;">Enlace de un solo uso valido por 72 horas.</p>
</td>
</tr>
<tr>
<td style="background:#f4f4f4;border-radius:0 0 12px 12px;padding:14px 32px;text-align:center;">
<p style="margin:0;font-size:12px;color:#aaa;">FlowApp - Sistema de aprobaciones</p>
</td>
</tr>
</tbody>
</table>
</td>
</tr>
</tbody>
</table>
</body>
</html>"""

print("HTML limpio:", len(html_limpio))
