lines = open('src/utils/approvals.ts', 'r', encoding='utf-8').readlines()
for i, line in enumerate(lines):
    if 'await sendMail(' in line:
        # Remove debug logs we added
        pass
    if "console.error('sendMail args:" in line or "console.error('Mail attachments" in line or "console.error('Sending mail" in line:
        lines[i] = ''
        
# Now find where attachments are built and add base64 conversion
new_lines = []
for i, line in enumerate(lines):
    new_lines.append(line)
    if "const attachments = (atts.results ?? []).map" in line:
        # Find the closing of this map - replace entirely
        pass

open('src/utils/approvals.ts', 'w', encoding='utf-8').writelines(new_lines)
print('Cleaned logs')
