content = open('src/utils/graph.ts', 'r', encoding='utf-8').read()

# Fix the markdown links that corrupted the code
import re
content = re.sub(r'\[msg\.to\]\(http://msg\.to\)', 'msg.to', content)
content = re.sub(r'\[a\.name\]\(http://a\.name\)', 'a.name', content)

open('src/utils/graph.ts', 'w', encoding='utf-8').write(content)
print('Fixed!')

# Verify
print('msg.to correct:', 'address: msg.to' in content)
print('a.name correct:', 'name: a.name' in content)
