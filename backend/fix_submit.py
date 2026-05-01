content = open('src/routes/requests.ts', 'r', encoding='utf-8').read()
new_route = """
// PATCH /requests/:id/submit — confirmar borrador y enviar
router.patch('/:id/submit', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const req = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
  if (!req) return c.json({ error: 'not_found' }, 404);
  if (req.requester_id !== userId) return c.json({ error: 'forbidden' }, 403);
  if (req.status !== 'draft') return c.json({ error: 'Solo se pueden enviar solicitudes en borrador' }, 400);
  await c.env.DB.prepare("UPDATE requests SET status='in_progress', updated_at=datetime('now') WHERE id=?").bind(id).run();
  const { notifyApprover } = await import('../utils/approvals');
  await notifyApprover(id, 1, c.env);
  return c.json({ data: { submitted: true } });
});
"""
# Insert before the export
old = 'export default router;'
content = content.replace(old, new_route + old)
open('src/routes/requests.ts', 'w', encoding='utf-8').write(content)
print('Fixed!')
