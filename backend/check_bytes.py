content = open('src/utils/graph.ts', 'r', encoding='utf-8').read()
idx = content.find('toRecipients')
chunk = content[idx:idx+100]
print('Exact bytes:')
for c in chunk:
    if ord(c) > 127 or c in '[]()':
        print(f'  {repr(c)} = {hex(ord(c))}')
print(repr(chunk))
