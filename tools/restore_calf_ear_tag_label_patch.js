const fs = require('fs');
const path = require('path');

const root = process.cwd();

const targetFiles = [
  path.join(root, 'client', 'src', 'pages', 'CalfDetail.tsx'),
  path.join(root, 'client', 'src', 'pages', 'CalvingForm.tsx'),
  path.join(root, 'client', 'src', 'pages', 'CalvingEditForm.tsx'),
  path.join(root, 'client', 'src', 'pages', 'CalvingList.tsx'),
  path.join(root, 'client', 'src', 'pages', 'FeedingAlertActionList.tsx'),
  path.join(root, 'client', 'src', 'pages', 'FeedingAlertActionForm.tsx'),
  path.join(root, 'client', 'src', 'pages', 'FeedingAlertActionEditForm.tsx'),
  path.join(root, 'client', 'src', 'pages', 'FeedingGuideList.tsx'),
  path.join(root, 'client', 'src', 'pages', 'Home.tsx'),
  path.join(root, 'client', 'src', 'pages', 'ReportPage.tsx'),
  path.join(root, 'client', 'src', 'services', 'printApi.ts')
];

console.log('');
console.log('==============================');
console.log('子牛台帳まわり 表示名置換の復元');
console.log('==============================');

let restored = 0;

for (const filePath of targetFiles) {
  const backupPath = `${filePath}.bak_ear_tag_label`;

  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, filePath);
    restored += 1;
    console.log(`復元: ${path.relative(root, filePath)}`);
  }
}

console.log('');
console.log(`復元したファイル数: ${restored}`);
console.log('復元後、clientを再起動してください。');
