content = open('src/utils/graph.ts', 'r', encoding='utf-8').read()

# Find by looking for the bracket pattern around msg.to
# The file has: [msg.to](http://msg.to)
# We need to find '[' + 'msg.to' + ']' + '(' + 'http://msg.to' + ')'

i = 0
result = []
s = content
while i < len(s):
    if s[i] == chr(0x5b) and s[i+1:i+7] == 'msg.to' and s[i+7] == chr(0x5d):
        # Found [msg.to](...) - skip to after closing paren
        end = s.find(')', i+7) + 1
        result.append('msg.to')
        i = end
    elif s[i] == chr(0x5b) and s[i+1:i+7] == 'a.name' and s[i+7] == chr(0x5d):
        end = s.find(')', i+7) + 1
        result.append('a.name')
        i = end
    else:
        result.append(s[i])
        i += 1

new_content = ''.join(result)
if new_content != content:
    open('src/utils/graph.ts', 'w', encoding='utf-8').write(new_content)
    print('Fixed!')
else:
    print('No changes made')
    # Debug: show chars around toRecipients
    idx = content.find('toRecipients')
    for j, c in enumerate(content[idx:idx+60]):
        print(j, hex(ord(c)), repr(c))
