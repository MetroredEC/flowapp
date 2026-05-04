content = open('src/utils/graph.ts', 'r', encoding='utf-8').read()
idx = content.find('a.name')
for j, c in enumerate(content[idx:idx+20]):
    print(j, hex(ord(c)), repr(c))
