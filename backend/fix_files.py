content = open('src/routes/email-actions.ts', 'r', encoding='utf-8').read()
content = content.replace(
    "router.get('/files/:key{.+}'",
    "router.get('/:key{.+}'"
)
open('src/routes/email-actions.ts', 'w', encoding='utf-8').write(content)
print('OK')
for l in content.split('\n'):
    if 'key' in l and 'get' in l:
        print(l)
