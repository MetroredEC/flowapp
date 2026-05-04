content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()

i = 0
result = []
s = content
while i < len(s):
    # Fix [request.total](http://request.total)_levels
    if s[i] == chr(0x5b) and s[i+1:i+14] == 'request.total' and s[i+14] == chr(0x5d):
        end = s.find(')', i+14) + 1
        result.append('request.total_levels')
        i = end + len('_levels')
    # Fix [attachments.map](http://attachments.map)
    elif s[i] == chr(0x5b) and s[i+1:i+16] == 'attachments.map' and s[i+16] == chr(0x5d):
        end = s.find(')', i+16) + 1
        result.append('attachments.map')
        i = end
    else:
        result.append(s[i])
        i += 1

new_content = ''.join(result)
if new_content != content:
    open('src/utils/approvals.ts', 'w', encoding='utf-8').write(new_content)
    print('Fixed!')
else:
    print('No changes')
