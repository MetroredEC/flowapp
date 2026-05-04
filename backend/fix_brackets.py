content = open('src/utils/graph.ts', 'r', encoding='utf-8').read()

# Find exact positions using simple string search
bracket_msg = '[msg.to]'
bracket_name = '[a.name]'

idx1 = content.find(bracket_msg)
idx2 = content.find(bracket_name)
print('idx1:', idx1, 'idx2:', idx2)

if idx1 > 0:
    end1 = content.find(')', idx1) + 1
    print('Replacing:', repr(content[idx1:end1]))
    content = content[:idx1] + 'msg.to' + content[end1:]
    print('Fixed msg.to')

idx2 = content.find(bracket_name)
if idx2 > 0:
    end2 = content.find(')', idx2) + 1
    print('Replacing:', repr(content[idx2:end2]))
    content = content[:idx2] + 'a.name' + content[end2:]
    print('Fixed a.name')

open('src/utils/graph.ts', 'w', encoding='utf-8').write(content)
print('Done')
