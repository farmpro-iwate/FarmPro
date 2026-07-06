const fs = require('fs');
const path = require('path');

const root = process.cwd();

const targetFiles = [
  path.join(root, 'client', 'src', 'pages', 'CattleList.tsx'),
  path.join(root, 'client', 'src', 'pages', 'CattleForm.tsx'),
  path.join(root, 'client', 'src', 'pages', 'CattleDetail.tsx'),
  path.join(root, 'client', 'src', 'pages', 'BreedingForm.tsx'),
  path.join(root, 'client', 'src', 'pages', 'BreedingAdvancedForm.tsx'),
  path.join(root, 'client', 'src', 'pages', 'BreedingAdvancedList.tsx'),
  path.join(root, 'client', 'src', 'pages', 'PregnancyCheckList.tsx'),
  path.join(root, 'client', 'src', 'pages', 'PregnancyCheckEdit.tsx'),
  path.join(root, 'client', 'src', 'pages', 'BlvForm.tsx'),
  path.join(root, 'client', 'src', 'pages', 'TreatmentForm.tsx'),
  path.join(root, 'client', 'src', 'pages', 'VaccineForm.tsx'),
  path.join(root, 'client', 'src', 'pages', 'ScheduleForm.tsx'),
  path.join(root, 'client', 'src', 'pages', 'SalesForm.tsx'),
  path.join(root, 'client', 'src', 'pages', 'SalesEditForm.tsx'),
  path.join(root, 'client', 'src', 'pages', 'SalesList.tsx'),
  path.join(root, 'client', 'src', 'pages', 'Home.tsx'),
  path.join(root, 'client', 'src', 'pages', 'ReportPage.tsx'),
  path.join(root, 'client', 'src', 'services', 'printApi.ts')
];

console.log('');
console.log('==============================');
console.log('牛台帳まわり 表示名置換の復元');
console.log('==============================');

let restored = 0;

for (const filePath of targetFiles) {
  const backupPath = `${filePath}.bak_cattle_ear_tag_label`;

  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, filePath);
    restored += 1;
    console.log(`復元: ${path.relative(root, filePath)}`);
  }
}

console.log('');
console.log(`復元したファイル数: ${restored}`);
console.log('復元後、clientを再起動してください。');
