content = open('src/routes/requests.ts', 'r', encoding='utf-8').read()
# Count occurrences of });
print('});  count:', content.count('});\n});'))
# Find and show the double });
idx = content.find('});\n});')
if idx > 0:
    print('Found at:', idx)
    print('Context:', repr(content[idx-50:idx+20]))
    content = content[:idx+3] + content[idx+7:]  # Remove one });
    open('src/routes/requests.ts', 'w', encoding='utf-8').write(content)
    print('Fixed!')
else:
    print('Not found with LF, trying CRLF')
    idx = content.find('});\r\n});')
    print('CRLF idx:', idx)
