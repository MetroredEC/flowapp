lines = open('src/utils/approvals.ts', 'r', encoding='utf-8').readlines()
new_lines = []
skip = False
for line in lines:
    if '// TEST: simple mail' in line:
        skip = True
    if skip and "console.error('Simple test mail sent');" in line:
        skip = False
        continue
    if not skip:
        new_lines.append(line)
open('src/utils/approvals.ts', 'w', encoding='utf-8').writelines(new_lines)
print('Removed test, lines:', len(new_lines))
