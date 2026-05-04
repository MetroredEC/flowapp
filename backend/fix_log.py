content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
old = "  await sendMail({ to: step.approver_email, subject, html, text }, \"comercial@metrored.med.ec\", graphToken);"
new = "  console.error('SENDING:', step.approver_email, 'FROM: comercial@metrored.med.ec');\n  await sendMail({ to: step.approver_email, subject, html, text }, \"comercial@metrored.med.ec\", graphToken);"
if old in content:
    content = content.replace(old, new)
    open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
