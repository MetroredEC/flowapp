import re
content = open('frontend/src/pages/RequestDetail.tsx', 'r', encoding='latin-1').read()
# Find and show the exact characters around api/files
idx = content.find('api/files')
chunk = content[idx:idx+60]
print('Exact bytes:', [hex(ord(c)) for c in chunk[:40]])
