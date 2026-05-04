content = open('src/routes/requests.ts', 'r', encoding='utf-8').read()
content = content.replace('  return c.json({ data: { cancelled: true } });\n});\n});\n', '  return c.json({ data: { cancelled: true } });\n});\n')
open('src/routes/requests.ts', 'w', encoding='utf-8').write(content)
print('Fixed!')
