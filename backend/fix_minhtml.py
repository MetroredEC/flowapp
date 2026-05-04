content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
# Find and replace the html variable in notifyApprover
old = "  const html = '<html><body style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;\">' +"
# Replace with minimal html
lines = content.split('\n')
new_lines = []
skip = False
for i, line in enumerate(lines):
    if "  const html = '<html><body style=" in line and 'notifyApprover' not in '\n'.join(lines[max(0,i-30):i]):
        # This is in notifyApprover - skip until we find the text variable
        skip = True
        new_lines.append("  const html = '<html><body><p>Hola ' + step.approver_name + ',</p><p>Solicitud: <b>' + request.title + '</b></p><p><a href=\"' + env.PLATFORM_URL + '/approve?token=' + approveToken + '\">APROBAR</a> | <a href=\"' + env.PLATFORM_URL + '/reject?token=' + rejectToken + '\">RECHAZAR</a></p><p>Nivel ' + level + '/' + request.total_levels + '</p></body></html>';")
        continue
    if skip and "  const text = " in line:
        skip = False
    if not skip:
        new_lines.append(line)

open('src/utils/approvals.ts', 'w', encoding='utf-8').writelines('\n'.join(new_lines))
print('Done, lines:', len(new_lines))
