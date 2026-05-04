with open('src/utils/approvals.ts', 'r') as f:
    content = f.read()

content = content.replace('"comercial@metrored.med.ec"', 'request.requester_email')

with open('src/utils/approvals.ts', 'w') as f:
    f.write(content)
print('Fixed!')
