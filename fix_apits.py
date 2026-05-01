content = open('frontend/src/lib/api.ts', 'r', encoding='utf-8').read()
old = "  cancelRequest: (id: string) =>"
new = """  submitRequest: (id: string) =>
    request<{ data: { submitted: boolean } }>('PATCH', `/api/requests/${id}/submit`),
  cancelRequest: (id: string) =>"""
if old in content:
    content = content.replace(old, new)
    open('frontend/src/lib/api.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
