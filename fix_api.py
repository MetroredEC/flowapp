content = open('frontend/src/lib/api.ts', 'r', encoding='utf-8').read()
old_str = 'export interface Attachment {\n  id: string; filename: string; content_type: string;\n  size_bytes: number; is_selected: number; created_at: string;\n}'
new_str = 'export interface Attachment {\n  id: string; filename: string; r2_key: string; content_type: string;\n  size_bytes: number; is_selected: number; created_at: string;\n}'
if old_str in content:
    content = content.replace(old_str, new_str)
    open('frontend/src/lib/api.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found - checking')
    idx = content.find('Attachment')
    print(repr(content[idx:idx+150]))
