content = open('src/routes/requests.ts', 'r', encoding='utf-8').read()
old = 'SELECT id, filename, content_type, size_bytes, is_selected, created_at FROM attachments WHERE request_id = ?'
new = 'SELECT id, filename, r2_key, content_type, size_bytes, is_selected, created_at FROM attachments WHERE request_id = ?'
if old in content:
    content = content.replace(old, new)
    open('src/routes/requests.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
