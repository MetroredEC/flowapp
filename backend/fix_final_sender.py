content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()

# Cambiar AMBOS sendMail de vuelta a request.requester_email
content = content.replace(
    'await sendMail({ to: step.approver_email, subject, html, text }, request.requester_email, graphToken);',
    'await sendMail({ to: step.approver_email, subject, html, text }, request.requester_email, graphToken);'
)

open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
print('Fixed!')
