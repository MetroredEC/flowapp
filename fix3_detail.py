content = open('frontend/src/pages/RequestDetail.tsx', 'r', encoding='latin-1').read()
old_str = 'api/files/${encodeURIComponent(a.id)}'
new_str = 'api/files/${encodeURIComponent((a as any).r2_key || a.id)}'
if old_str in content:
    content = content.replace(old_str, new_str)
    open('frontend/src/pages/RequestDetail.tsx', 'w', encoding='latin-1').write(content)
    print('Fixed!')
else:
    print('Not found')
    print('Looking for a.id:', 'a.id' in content)
