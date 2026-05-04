lines = open('src/utils/approvals.ts', 'r', encoding='utf-8').readlines()
for i, line in enumerate(lines):
    if 'simpleHtml' in line and 'const simpleHtml' in line:
        lines[i] = """  const simpleHtml = `
<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
<div style="background:#0C447C;padding:16px;border-radius:8px 8px 0 0;">
  <h2 style="color:#fff;margin:0;">FlowApp</h2>
</div>
<div style="border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
  <p>Hola <b>${step.approver_name}</b>,</p>
  <p>Tienes una solicitud pendiente de aprobacion (<b>Nivel ${level}/${request.total_levels}</b>):</p>
  <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
    <b>${request.title}</b><br>
    <span style="color:#666;">${request.request_type_name} - ${request.requester_name}</span><br>
    <p style="margin-top:8px;">${request.description}</p>
  </div>
  ${attachments.length > 0 ? '<p><b>Adjuntos:</b> ' + attachments.map(a => '<a href="' + a.url + '">' + a.filename + '</a>').join(', ') + '</p>' : ''}
  <table style="margin-top:20px;width:100%;"><tr>
    <td style="padding-right:8px;"><a href="${env.PLATFORM_URL}/approve?token=${approveToken}" style="display:block;background:#1D9E75;color:#fff;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font-weight:bold;">Aprobar</a></td>
    <td style="padding-left:8px;"><a href="${env.PLATFORM_URL}/reject?token=${rejectToken}" style="display:block;background:#fff;color:#993C1D;border:2px solid #F0997B;text-align:center;padding:10px;border-radius:8px;text-decoration:none;font-weight:bold;">Rechazar</a></td>
  </tr></table>
  <p style="margin-top:16px;font-size:12px;color:#888;">Enlace valido por 72 horas.</p>
</div>
</body></html>\`;\n"""
        print(f'Updated simpleHtml at line {i+1}')
        break
open('src/utils/approvals.ts', 'w', encoding='utf-8').writelines(lines)
