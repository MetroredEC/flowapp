content = open('src/utils/approvals.ts', 'r', encoding='utf-8').read()
# Find and remove the old simpleHtml (the one-liner)
idx1 = content.find("  const simpleHtml = '<html><body style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;\"><div")
idx2 = content.find("  const simpleHtml = '<html><body style=\"font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;\">' +")
print('idx1:', idx1, 'idx2:', idx2)
if idx1 > 0 and idx2 > 0 and idx1 < idx2:
    # Remove from idx1 to end of that line
    end = content.find('\n', idx1) + 1
    content = content[:idx1] + content[end:]
    open('src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
    print('Removed old simpleHtml!')
