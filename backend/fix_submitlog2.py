content = open('src/routes/requests.ts', 'r', encoding='utf-8').read()
old = "  try {\n    await notifyApprover(id, 1, c.env);\n  } catch (e) {\n    console.error('notifyApprover error:', e instanceof Error ? e.message : String(e));\n  }"
new = "  console.error('SUBMIT: calling notifyApprover for', id);\n  try {\n    await notifyApprover(id, 1, c.env);\n    console.error('SUBMIT: notifyApprover OK');\n  } catch (e) {\n    console.error('SUBMIT: notifyApprover FAILED:', e instanceof Error ? e.message : String(e));\n  }"
if old in content:
    content = content.replace(old, new)
    open('src/routes/requests.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found')
    idx = content.find('notifyApprover')
    print(repr(content[idx-10:idx+100]))
