content = open('src/email/template.ts', 'r', encoding='utf-8').read()
# Replace special chars that might break Exchange
content = content.replace('\u00b7', '·')  # middle dot
content = content.replace('\u2014', '-')  # em dash  
content = content.replace('\u2713', 'OK') # checkmark
content = content.replace('\u2715', 'X')  # cross
# Check encoding
print('File OK, length:', len(content))
open('src/email/template.ts', 'w', encoding='utf-8').write(content)
