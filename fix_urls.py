content = open('backend/src/utils/approvals.ts', 'r', encoding='utf-8').read()
old1 = "approveUrl:  `${env.PLATFORM_URL}/api/approve?token=${approveToken}`,"
new1 = "approveUrl:  `${env.PLATFORM_URL}/approve?token=${approveToken}`,"
old2 = "rejectUrl:   `${env.PLATFORM_URL}/api/reject?token=${rejectToken}`,"
new2 = "rejectUrl:   `${env.PLATFORM_URL}/reject?token=${rejectToken}`,"
if old1 in content:
    content = content.replace(old1, new1)
    print('Fixed approve URL')
else:
    print('approve not found')
if old2 in content:
    content = content.replace(old2, new2)
    print('Fixed reject URL')
else:
    print('reject not found')
open('backend/src/utils/approvals.ts', 'w', encoding='utf-8').write(content)
