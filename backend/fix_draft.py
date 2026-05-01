content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
old = "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', 1, ?, ?)"
new = "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?)"
if old in content:
    content = content.replace(old, new)
    open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
