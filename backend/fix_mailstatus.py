lines = open('src/utils/graph.ts', 'r', encoding='utf-8').readlines()
for i, line in enumerate(lines):
    if 'saveToSentItems' in line:
        print(f'Found saveToSentItems at line {i+1}')
    if 'sendMail error' in line:
        # Add detailed logging before the throw
        lines.insert(i, "    const errText = await res.clone().text();\n    console.error('sendMail failed:', res.status, errText);\n")
        print(f'Added error log at line {i+1}')
        break
    if "res.status !== 202" in line:
        lines.insert(i+1, "  console.error('sendMail status:', res.status);\n")
        print(f'Added status log at line {i+2}')
        break
open('src/utils/graph.ts', 'w', encoding='utf-8').writelines(lines)
