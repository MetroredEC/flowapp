lines = open('src/utils/approvals.ts', 'r', encoding='utf-8').readlines()
for i, line in enumerate(lines):
    if 'await sendMail(' in line:
        lines.insert(i, "  console.error('sendMail args:', JSON.stringify({to: step.approver_email, attCount: attachments.length, firstAtt: attachments[0]}));\n")
        print(f'Added at line {i+1}')
        break
open('src/utils/approvals.ts', 'w', encoding='utf-8').writelines(lines)
