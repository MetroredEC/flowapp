content = open('src/routes/requests.ts', 'r', encoding='utf-8').read()
old = "import { Hono } from 'hono';"
new = "import { Hono } from 'hono';\nimport { notifyApprover } from '../utils/approvals';"
if old in content:
    content = content.replace(old, new, 1)
    open('src/routes/requests.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
