content = open('src/utils/graph.ts', 'r', encoding='utf-8').read()
print('msg.to found:', 'msg.to' in content)
print('a.name found:', 'a.name' in content)
# Show the problematic area
idx = content.find('toRecipients')
print(repr(content[idx:idx+200]))
