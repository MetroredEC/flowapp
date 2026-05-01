content = open('src/index.ts', 'r', encoding='utf-8').read()
old = """app.route('/approve',     emailActionsRouter);
app.route('/reject',      emailActionsRouter);
app.route('/api/approve', emailActionsRouter);
app.route('/api/reject',  emailActionsRouter);
app.route('/api/files',   emailActionsRouter);"""
new = """app.get('/approve', async (c) => {
  const token = c.req.query('token') ?? '';
  return emailActionsRouter.request('/approve?token=' + token, {}, c.env);
});
app.get('/reject', async (c) => {
  const token = c.req.query('token') ?? '';
  const comment = c.req.query('comment') ?? '';
  const url = '/reject?token=' + token + (comment ? '&comment=' + encodeURIComponent(comment) : '');
  return emailActionsRouter.request(url, {}, c.env);
});
app.get('/api/files/*', async (c) => {
  const key = c.req.path.replace('/api/files/', '');
  return emailActionsRouter.request('/files/' + key, {}, c.env);
});"""
content = content.replace(old, new)
open('src/index.ts', 'w', encoding='utf-8').write(content)
print('Fixed!')
