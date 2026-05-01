content = open('frontend/src/pages/NewRequest.tsx', 'r', encoding='utf-8').read()
old = """      const { data } = await api.createRequest({
        request_type_id: form.request_type_id,
        title:           form.title.trim(),
        description:     form.description.trim(),
      });
      // Subir archivos adjuntos
      for (const file of files) {
        await api.uploadFile(data.id, file);
      }
      navigate(`/requests/${data.id}`);"""
new = """      const { data } = await api.createRequest({
        request_type_id: form.request_type_id,
        title:           form.title.trim(),
        description:     form.description.trim(),
      });
      // Subir archivos adjuntos
      for (const file of files) {
        await api.uploadFile(data.id, file);
      }
      // Confirmar y enviar (activa el flujo y envía correo con adjuntos)
      await api.submitRequest(data.id);
      navigate(`/requests/${data.id}`);"""
if old in content:
    content = content.replace(old, new)
    open('frontend/src/pages/NewRequest.tsx', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
    idx = content.find('createRequest')
    print(repr(content[idx:idx+200]))
