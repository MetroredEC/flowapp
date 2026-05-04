# Fix 1: unused html in approvals.ts
content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
content = content.replace(
    'const { subject, html, text } = buildApprovalEmail(',
    'const { subject, text } = buildApprovalEmail('
)
open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
print('Fixed html unused')

# Fix 2: index.ts routing - show current routes
content = open('src/index.ts', 'r', encoding='utf-8').read()
for line in content.split('\n'):
    if 'route' in line or 'emailActions' in line:
        print(repr(line))
