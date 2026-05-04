content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()

i = 0
result = []
s = content

fixes = {
    'Date.now': 'Date.now',
    'step.id': 'step.id',
}

while i < len(s):
    found = False
    for key, val in fixes.items():
        if s[i] == chr(0x5b) and s[i+1:i+1+len(key)] == key and s[i+1+len(key)] == chr(0x5d):
            end = s.find(')', i+1+len(key)) + 1
            result.append(val)
            i = end
            found = True
            print(f'Fixed: {key}')
            break
    if not found:
        result.append(s[i])
        i += 1

new_content = ''.join(result)
if new_content != content:
    open('src/utils/approvals.ts', 'w', encoding='utf-8').write(new_content)
    print('Saved!')
else:
    print('No changes - checking manually')
    idx = content.find('Date.now')
    print(repr(content[idx-2:idx+15]))
