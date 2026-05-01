content = open('src/routes/requests.ts', 'r', encoding='utf-8').read()
# Fix: parse steps JSON string to array
old = "  const rows = await c.env.DB.prepare(sql).bind(...params).all();\n  return c.json({ data: rows.results });"
new = """  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  const data = (rows.results ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    steps: typeof r.steps === 'string' ? JSON.parse(r.steps) : (r.steps ?? []),
  }));
  return c.json({ data });"""
if old in content:
    content = content.replace(old, new)
    open('src/routes/requests.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Pattern not found')
    # Show context
    idx = content.find('rows.results')
    print(repr(content[idx-50:idx+150]))
