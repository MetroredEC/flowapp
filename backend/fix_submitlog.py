content = open('src/routes/requests.ts', 'r', encoding='utf-8').read()
old = "  await c.env.DB.prepare(\"UPDATE requests SET status='in_progress', updated_at=datetime('now') WHERE id=?\").bind(id).run();\n  await notifyApprover(id, 1, c.env);\n  return c.json({ data: { submitted: true } });"
new = """  await c.env.DB.prepare("UPDATE requests SET status='in_progress', updated_at=datetime('now') WHERE id=?").bind(id).run();
  try {
    await notifyApprover(id, 1, c.env);
    console.error('notifyApprover OK');
  } catch (err) {
    console.error('notifyApprover ERROR:', err instanceof Error ? err.message : String(err));
  }
  return c.json({ data: { submitted: true } });"""
if old in content:
    content = content.replace(old, new)
    open('src/routes/requests.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
    idx = content.find('notifyApprover')
    print(repr(content[idx-50:idx+150]))
