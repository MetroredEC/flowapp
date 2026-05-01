content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
old = "  await notifyApprover(requestId, 1, env);\n  return requestId;"
new = "  return requestId;"
if old in content:
    content = content.replace(old, new)
    open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
    idx = content.find('notifyApprover')
    print(repr(content[idx-20:idx+80]))
