lines = open('src/utils/graph.ts', 'r', encoding='utf-8').readlines()
for i, line in enumerate(lines):
    if 'if (!res.ok && res.status !== 202)' in line:
        lines.insert(i, "  console.error('sendMail graph status:', res.status);\n")
        print(f'Added log at line {i+1}')
        break
open('src/utils/graph.ts', 'w', encoding='utf-8').writelines(lines)
