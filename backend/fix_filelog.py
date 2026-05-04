content = open('src/routes/email-actions.ts', 'r', encoding='utf-8').read()
old = "  const obj = await c.env.FILES.get(decodeURIComponent(key));"
new = "  console.error('Files key received:', JSON.stringify(key)); const obj = await c.env.FILES.get(decodeURIComponent(key));"
if old in content:
    content = content.replace(old, new)
    open('src/routes/email-actions.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
    idx = content.find('FILES.get')
    print(repr(content[idx-50:idx+100]))
