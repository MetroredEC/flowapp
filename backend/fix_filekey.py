content = open('src/index.ts', 'r', encoding='utf-8').read()
old = "  return emailActionsRouter.request('/files/' + encodeURIComponent(decodeURIComponent(key)) + rawSearch, {}, c.env);"
new = "  return emailActionsRouter.request('/' + encodeURIComponent(decodeURIComponent(key)) + rawSearch, {}, c.env);"
if old in content:
    content = content.replace(old, new)
    open('src/index.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
    idx = content.find('emailActionsRouter.request')
    print(repr(content[idx-10:idx+120]))
