content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
# Fix [request.total](http://request.total)_levels
i = 0
result = []
s = content
target = 'request.total'
while i < len(s):
    if s[i] == chr(0x5b) and s[i+1:i+14] == target and s[i+14] == chr(0x5d):
        end = s.find(')', i+14) + 1
        replaced = s[i+1:i+14] + s[end-1+1:].split('\n')[0].split(',')[0]
        print('Found corrupted:', repr(s[i:end+10]))
        result.append('request.total_levels')
        i = end + len('_levels')
    else:
        result.append(s[i])
        i += 1
new_content = ''.join(result)
if new_content != content:
    open('src/utils/approvals.ts', 'w', encoding='utf-8').write(new_content)
    print('Fixed!')
else:
    print('No change')
    idx = content.find('total')
    print(repr(content[idx-5:idx+30]))
