content = open('src/routes/requests.ts', 'r', encoding='utf-8').read()
# Remove the extra }); after cancel route
bad = "  return c.json({ data: { cancelled: true } });\n});\n});\n"
good = "  return c.json({ data: { cancelled: true } });\n});\n"
if bad in content:
    content = content.replace(bad, good)
    open('src/routes/requests.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found, checking bytes')
    idx = content.find('cancelled: true')
    print(repr(content[idx:idx+30]))
