content = open('src/index.ts', 'r', encoding='utf-8').read()
old = """app.route('/approve',     emailActionsRouter);
app.route('/reject',      emailActionsRouter);
app.route('/api/approve', emailActionsRouter);
app.route('/api/reject',  emailActionsRouter);
app.route('/api/files',   emailActionsRouter);"""
new = """app.get('/approve', (c) => emailActionsRouter.fetch(new Request(c.req.url.replace('/approve', '/approve'), c.req.raw), c.env));
app.get('/reject', (c) => emailActionsRouter.fetch(c.req.raw, c.env));
app.route('/api/files',   emailActionsRouter);"""
print('old found:', old in content)
