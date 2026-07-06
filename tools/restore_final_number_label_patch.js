const fs = require('fs');
const path = require('path');

const root = process.cwd();

const targetFiles = [
  path.join(root, 'client', 'src', 'pages', 'BlvList.tsx'),
  path.join(root, 'client', 'src', 'pages', 'BreedingList.tsx'),
  path.join(root, 'client', 'src', 'pages', 'HelpPage.tsx'),
  path.join(root, 'client', 'src', 'components', 'CattlePicker.tsx')
];

console.log('');
console.log('==============================');
console.log('残った古い番号表示 最終置換の復元');
console.log('==============================');

let restored = 0;

for (const filePath of targetFiles) {
  const backupPath = `${filePath}.bak_final_number_label`;

  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, filePath);
    restored += 1;
    console.log(`復元: ${path.relative(root, filePath)}`);
  }
}

console.log('');
console.log(`復元したファイル数: ${restored}`);
console.log('復元後、clientを再起動してください。');
