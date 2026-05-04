content = open('src/index.ts', 'r', encoding='utf-8').read()
old = """app.get('/api/files/*', async (c) => {
  const key = c.req.path.replace('/api/files/', '');
  return emailActionsRouter.request('/files/' + key, {}, c.env);
});"""
new = """app.get('/api/files/*', async (c) => {
  const rawPath = new URL(c.req.url).pathname;
  const key = rawPath.replace('/api/files/', '');
  const rawSearch = new URL(c.req.url).search;
  return emailActionsRouter.request('/files/' + encodeURIComponent(decodeURIComponent(key)) + rawSearch, {}, c.env);
});"""
if old in content:
    content = content.replace(old, new)
    open('src/index.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
    idx = content.find('api/files')
    print(repr(content[idx-5:idx+150]))
