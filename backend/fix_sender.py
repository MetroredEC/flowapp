content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()

# Cambiar el sender de request.requester_email a comercial@metrored.med.ec
# En notifyApprover
content = content.replace(
    'await sendMail({ to: step.approver_email, subject, html, text }, request.requester_email, graphToken);',
    'await sendMail({ to: step.approver_email, subject, html, text }, "comercial@metrored.med.ec", graphToken);'
)

# En notifyRequesterOutcome
content = content.replace(
    'await sendMail({ to: request.requester_email, subject, html, text: subject }, request.requester_email, graphToken);',
    'await sendMail({ to: request.requester_email, subject, html, text: subject }, "comercial@metrored.med.ec", graphToken);'
)

open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
print('Fixed!')
