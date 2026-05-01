content = open('frontend/src/pages/RequestDetail.tsx', 'r', encoding='latin-1').read()
old = content[content.find('api/files')-20:content.find('api/files')+45]
print('Found:', repr(old))
new_content = content.replace(
    'encodeURIComponent(a.id))',
    'encodeURIComponent(a.r2_key || a.id))'
)
if new_content != content:
    open('frontend/src/pages/RequestDetail.tsx', 'w', encoding='latin-1').write(new_content)
    print('Fixed!')
else:
    print('No change - trying alternative')
    idx = content.find('api/files')
    print(repr(content[idx:idx+60]))
