lines = open('src/utils/approvals.ts', 'r', encoding='utf-8').readlines()
for i, line in enumerate(lines):
    if 'await sendMail(' in line and 'simpleHtml' in line:
        lines.insert(i, "  console.error('HTML length:', simpleHtml.length, 'First 200:', simpleHtml.substring(0, 200));\n")
        print(f'Added log at line {i+1}')
        break
open('src/utils/approvals.ts', 'w', encoding='utf-8').writelines(lines)
