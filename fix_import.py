content = open('src/routes/requests.ts', 'r', encoding='utf-8').read()
old = "  const { notifyApprover } = await import('../utils/approvals');"
new = ""
if old in content:
    content = content.replace(old, new)
    open('src/routes/requests.ts', 'w', encoding='utf-8').write(content)
    print('Step 1 done')
else:
    print('dynamic import not found')
