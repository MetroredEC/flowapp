content = open('frontend/src/pages/RequestDetail.tsx', 'r', encoding='utf-8').read()
old = 'href={`${API}/api/files/${encodeURIComponent(a.id)}`}'
new = 'href={`${API}/api/files/${encodeURIComponent((a as any).r2_key || a.id)}`}'
if old in content:
    content = content.replace(old, new)
    open('frontend/src/pages/RequestDetail.tsx', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found, showing context:')
    idx = content.find('api/files')
    print(repr(content[idx-20:idx+100]))
