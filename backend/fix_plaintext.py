content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
old = "  await sendMail({ to: step.approver_email, subject, html: simpleHtml, text }, request.requester_email, graphToken);"
new = "  const plainText = 'Hola ' + step.approver_name + '. Solicitud: ' + request.title + '. APROBAR: ' + env.PLATFORM_URL + '/approve?token=' + approveToken;\n  await sendMail({ to: step.approver_email, subject, html: '<p>' + plainText + '</p>', text: plainText }, request.requester_email, graphToken);"
if old in content:
    content = content.replace(old, new)
    open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
    idx = content.find('sendMail')
    print(repr(content[idx:idx+120]))
