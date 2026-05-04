lines = open('src/routes/requests.ts', 'r', encoding='utf-8').readlines()
# Find and remove the first (incomplete) submit route - lines 134-147 (0-indexed 133-146)
new_lines = []
skip = False
skip_count = 0
for i, line in enumerate(lines):
    if "// PATCH /requests/:id/submit" in line and not skip and skip_count == 0:
        skip = True
        skip_count = 1
        continue
    if skip:
        if "return c.json({ data: { submitted: true } });" in line:
            skip = False
            continue
        continue
    new_lines.append(line)

open('src/routes/requests.ts', 'w', encoding='utf-8').writelines(new_lines)
# Verify
content = open('src/routes/requests.ts', 'r', encoding='utf-8').read()
count = content.count("/:id/submit")
print(f'Submit routes remaining: {count}')
