content = open('frontend/src/pages/RequestDetail.tsx', 'r', encoding='latin-1').read()
idx = content.find('api/files')
print(repr(content[idx-20:idx+120]))
