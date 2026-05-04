lines = open('src/routes/requests.ts', 'r', encoding='utf-8').readlines()
# Find and replace lines 144-145 (0-indexed: 143-144)
for i, line in enumerate(lines):
    if 'await notifyApprover(id, 1, c.env);' in line and 'try' not in lines[i-1]:
        lines[i] = """  try {
    await notifyApprover(id, 1, c.env);
    console.error('notifyApprover success');
  } catch (err) {
    console.error('notifyApprover failed:', err instanceof Error ? err.message : String(err));
  }
"""
        print(f'Fixed line {i+1}')
        break
open('src/routes/requests.ts', 'w', encoding='utf-8').writelines(lines)
