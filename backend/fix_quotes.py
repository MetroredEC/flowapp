content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
# Escape single quotes inside the font-family string
content = content.replace(
    "BlinkMacSystemFont,'Segoe UI'",
    "BlinkMacSystemFont,\\'Segoe UI\\'"
)
open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
print('Fixed!')
