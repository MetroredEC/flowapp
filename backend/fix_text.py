content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
content = content.replace(
    "const { subject, text } = buildApprovalEmail(",
    "const { subject } = buildApprovalEmail("
)
open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
print('Fixed!')
