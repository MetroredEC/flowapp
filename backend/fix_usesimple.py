content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
old = 'await sendMail({ to: step.approver_email, subject, html, text }'
new = 'await sendMail({ to: step.approver_email, subject, html: simpleHtml, text }'
if old in content:
    content = content.replace(old, new)
    open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    idx = content.find('sendMail({')
    print('Not found, showing:', repr(content[idx:idx+100]))
