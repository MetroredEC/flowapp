lines = open('src/utils/graph.ts', 'r', encoding='utf-8').readlines()
for i, line in enumerate(lines):
    if 'sendMail error' in line:
        lines.insert(i, "    console.error('sendMail response:', res.status, await res.clone().text());\n")
        print(f'Added log at line {i+1}')
        break
open('src/utils/graph.ts', 'w', encoding='utf-8').writelines(lines)
