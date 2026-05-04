content = open('src/index.ts', 'r', encoding='utf-8').read()
old = "  return emailActionsRouter.request('/files/' + key, {}, c.env);"
new = "  return emailActionsRouter.request('/' + encodeURIComponent(decodeURIComponent(key)), {}, c.env);"
if old in content:
    content = content.replace(old, new)
    open('src/index.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
