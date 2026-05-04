lines = open('src/utils/approvals.ts', 'r', encoding='utf-8').readlines()
for i, line in enumerate(lines):
    if 'await sendMail(' in line:
        lines.insert(i, "  const simpleHtml = '<p>Solicitud: <b>' + request.title + '</b></p><p>De: ' + request.requester_name + '</p><p><a href=\"' + env.PLATFORM_URL + '/approve?token=' + approveToken + '\">APROBAR</a></p><p><a href=\"' + env.PLATFORM_URL + '/reject?token=' + rejectToken + '\">RECHAZAR</a></p>';\n")
        print(f'Added simple html at line {i+1}')
        break
open('src/utils/approvals.ts', 'w', encoding='utf-8').writelines(lines)
