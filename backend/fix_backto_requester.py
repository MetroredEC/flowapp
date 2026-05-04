content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()

# Cambiar de comercial@metrored.med.ec de vuelta a request.requester_email
content = content.replace(
    'await sendMail({ to: step.approver_email, subject, html, text }, "comercial@metrored.med.ec", graphToken);',
    'await sendMail({ to: step.approver_email, subject, html, text }, request.requester_email, graphToken);'
)

content = content.replace(
    'await sendMail({ to: request.requester_email, subject, html, text: subject }, "comercial@metrored.med.ec", graphToken);',
    'await sendMail({ to: request.requester_email, subject, html, text: subject }, request.requester_email, graphToken);'
)

open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
print('Fixed!')
