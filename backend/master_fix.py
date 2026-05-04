import re

# 1. Fix graph.ts - msg.to and a.name (already correct in stashed version)
content = open('src/utils/graph.ts', 'r', encoding='utf-8').read()
print('graph.ts msg.to ok:', 'address: msg.to' in content)
print('graph.ts a.name ok:', 'name: a.name,' in content)

# 2. Fix approvals.ts - draft status + simple html + no notifyApprover on create
content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
content = content.replace("'in_progress', 1, ?, ?)", "'draft', 1, ?, ?)")
content = content.replace("  await notifyApprover(requestId, 1, env);\n  return requestId;", "  return requestId;")
open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
print('approvals.ts draft ok:', "'draft', 1, ?, ?)" in content)

# 3. Fix requests.ts - add submit endpoint + r2_key in attachments
content = open('src/routes/requests.ts', 'r', encoding='utf-8').read()
content = content.replace(
    "import { Hono } from 'hono';",
    "import { Hono } from 'hono';\nimport { notifyApprover } from '../utils/approvals';"
)
content = content.replace(
    'SELECT id, filename, content_type, size_bytes, is_selected, created_at FROM attachments WHERE request_id = ?',
    'SELECT id, filename, r2_key, content_type, size_bytes, is_selected, created_at FROM attachments WHERE request_id = ?'
)
submit_route = """
router.patch('/:id/submit', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const req = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first<{requester_id:string;status:string}>();
  if (!req) return c.json({ error: 'not_found' }, 404);
  if (req.requester_id !== userId) return c.json({ error: 'forbidden' }, 403);
  if (req.status !== 'draft') return c.json({ error: 'Solo borradores' }, 400);
  await c.env.DB.prepare("UPDATE requests SET status='in_progress', updated_at=datetime('now') WHERE id=?").bind(id).run();
  try { await notifyApprover(id, 1, c.env); } catch(e) { console.error('notify error:', e); }
  return c.json({ data: { submitted: true } });
});
"""
content = content.replace('export default router;', submit_route + 'export default router;')
open('src/routes/requests.ts', 'w', encoding='utf-8').write(content)
print('requests.ts submit ok:', 'submit' in content)

# 4. Fix index.ts - approve/reject/files routing
content = open('src/index.ts', 'r', encoding='utf-8').read()
old_routes = """app.route('/approve',     emailActionsRouter);
app.route('/reject',      emailActionsRouter);
app.route('/api/approve', emailActionsRouter);
app.route('/api/reject',  emailActionsRouter);
app.route('/api/files',   emailActionsRouter);"""
new_routes = """app.get('/approve', async (c) => {
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
  const rawPath = new URL(c.req.url).pathname;
  const key = rawPath.replace('/api/files/', '');
  return emailActionsRouter.request('/' + encodeURIComponent(decodeURIComponent(key)), {}, c.env);
});"""
if old_routes in content:
    content = content.replace(old_routes, new_routes)
    print('index.ts routing fixed')
else:
    print('index.ts routing NOT found')
open('src/index.ts', 'w', encoding='utf-8').write(content)

# 5. Fix email-actions.ts - files route
content = open('src/routes/email-actions.ts', 'r', encoding='utf-8').read()
content = content.replace("router.get('/files/:key{.+}'", "router.get('/:key{.+}'")
open('src/routes/email-actions.ts', 'w', encoding='utf-8').write(content)
print('email-actions.ts files ok')

# 6. Fix approvals.ts - use simple html for email
content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
old_notify = "  await sendMail({ to: step.approver_email, subject, html, text }, request.requester_email, graphToken);"
new_notify = """  const simpleHtml = '<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><div style="background:#0C447C;padding:16px;border-radius:8px 8px 0 0;"><h2 style="color:#fff;margin:0;">FlowApp</h2></div><div style="border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 8px 8px;"><p>Hola <b>' + step.approver_name + '</b>,</p><p>Solicitud pendiente nivel ' + level + '/' + request.total_levels + ':</p><div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;"><b>' + request.title + '</b><br><span style="color:#666;">' + request.request_type_name + ' - ' + request.requester_name + '</span></div>' + (attachments.length > 0 ? '<p>Adjuntos: ' + attachments.map(function(a){return '<a href="' + a.url + '">' + a.filename + '</a>';}).join(', ') + '</p>' : '') + '<table style="width:100%;margin-top:20px;"><tr><td style="padding-right:8px;"><a href="' + env.PLATFORM_URL + '/approve?token=' + approveToken + '" style="display:block;background:#1D9E75;color:#fff;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font-weight:bold;">Aprobar</a></td><td style="padding-left:8px;"><a href="' + env.PLATFORM_URL + '/reject?token=' + rejectToken + '" style="display:block;background:#fff;color:#993C1D;border:2px solid #F0997B;text-align:center;padding:10px;border-radius:8px;text-decoration:none;font-weight:bold;">Rechazar</a></td></tr></table><p style="font-size:12px;color:#888;margin-top:16px;">Enlace valido 72 horas.</p></div></body></html>';
  await sendMail({ to: step.approver_email, subject, html: simpleHtml, text }, request.requester_email, graphToken);"""
if old_notify in content:
    content = content.replace(old_notify, new_notify)
    open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
    print('approvals.ts simpleHtml ok')
else:
    print('approvals.ts sendMail NOT found')
    idx = content.find('sendMail')
    print(repr(content[idx:idx+100]))

print('ALL DONE')
