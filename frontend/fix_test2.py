content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
old = "  await sendMail({ to: step.approver_email, subject, html, text }, request.requester_email, graphToken);"
new = "  const testHtml = '<p>Hola ' + step.approver_name + '. Solicitud: ' + request.title + '.</p><p><a href=\"' + env.PLATFORM_URL + '/approve?token=' + approveToken + '\">Aprobar</a> | <a href=\"' + env.PLATFORM_URL + '/reject?token=' + rejectToken + '\">Rechazar</a></p>';\n  await sendMail({ to: step.approver_email, subject, html: testHtml, text }, request.requester_email, graphToken);"
if old in content:
    content = content.replace(old, new)
    open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
    idx = content.find('sendMail')
    print(repr(content[idx:idx+100]))
