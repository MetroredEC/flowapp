lines = open('src/utils/approvals.ts', 'r', encoding='utf-8').readlines()
for i, line in enumerate(lines):
    if 'await sendMail(' in line:
        # Add a test simple mail before the real one
        lines.insert(i, """  // TEST: simple mail
  await sendMail({
    to: step.approver_email,
    subject: 'FlowApp TEST - ' + request.title,
    html: '<p>Test simple</p>',
    text: 'Test simple',
  }, request.requester_email, graphToken);
  console.error('Simple test mail sent');
""")
        print(f'Added test at line {i+1}')
        break
open('src/utils/approvals.ts', 'w', encoding='utf-8').writelines(lines)
