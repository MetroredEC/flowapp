lines = open('src/utils/approvals.ts', 'r', encoding='utf-8').readlines()
for i, line in enumerate(lines):
    if 'await sendMail(' in line:
        lines.insert(i, "  console.error('Sending mail to:', step.approver_email, 'from:', request.requester_email);\n")
        print(f'Added log at line {i+1}')
        break
open('src/utils/approvals.ts', 'w', encoding='utf-8').writelines(lines)
