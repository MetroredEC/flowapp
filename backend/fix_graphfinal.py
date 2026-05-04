import re
content = open('src/utils/graph.ts', 'r', encoding='utf-8').read()

# Find and replace the corrupted sendMail function body
old = "      toRecipients: [{ emailAddress: { address: [msg.to](http://msg.to) } }],\n      attachments: (msg.attachments ?? []).map(a => ({\n        '@odata.type': '#microsoft.graph.fileAttachment',\n        name: [a.name](http://a.name),"
new = "      toRecipients: [{ emailAddress: { address: msg.to } }],\n      attachments: (msg.attachments ?? []).map(a => ({\n        '@odata.type': '#microsoft.graph.fileAttachment',\n        name: a.name,"

if old in content:
    content = content.replace(old, new)
    open('src/utils/graph.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Pattern not found, trying byte-level fix')
    # Try replacing by finding the exact positions
    idx1 = content.find('[msg.to](http://msg.to)')
    idx2 = content.find('[a.name](http://a.name)')
    if idx1 > 0:
        content = content[:idx1] + 'msg.to' + content[idx1+len('[msg.to](http://msg.to)'):]
        print('Fixed msg.to')
    if idx2 > 0:
        content = content[:idx2] + 'a.name' + content[idx2+len('[a.name](http://a.name)'):]
        print('Fixed a.name')
    open('src/utils/graph.ts', 'w', encoding='utf-8').write(content)
