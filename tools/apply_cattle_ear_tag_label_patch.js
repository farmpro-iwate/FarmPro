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

const replacements = [
  ['母牛ID', '母牛耳標番号'],
  ['牛ID', '耳標番号'],
  ['個体ID', '個体識別番号'],
  ['個体番号', '耳標番号'],
  ['個体番号、牛名', '耳標番号、牛名'],
  ['個体番号、牛名は必須です', '耳標番号、牛名は必須です'],
  ['個体番号', '耳標番号']
];

function title(text) {
  console.log('');
  console.log('==============================');
  console.log(text);
  console.log('==============================');
}

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      filePath,
      exists: false,
      changed: false,
      count: 0
    };
  }

  const before = fs.readFileSync(filePath, 'utf-8');
  let after = before;
  let count = 0;

  for (const [from, to] of replacements) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    const matches = after.match(regex);
    if (matches) {
      count += matches.length;
      after = after.replace(regex, to);
    }
  }

  if (after !== before) {
    const backupPath = `${filePath}.bak_cattle_ear_tag_label`;
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, before, 'utf-8');
    }
    fs.writeFileSync(filePath, after, 'utf-8');
    return {
      filePath,
      exists: true,
      changed: true,
      count
    };
  }

  return {
    filePath,
    exists: true,
    changed: false,
    count: 0
  };
}

title('牛台帳まわり 表示名置換');

console.log('画面に出る日本語だけを置き換えます。');
console.log('内部の id / cowId / cattleId / earTag は変更しません。');
console.log('変更前のファイルは .bak_cattle_ear_tag_label として保存します。');

const results = targetFiles.map(patchFile);

title('結果');

let changedCount = 0;

for (const result of results) {
  const relative = path.relative(root, result.filePath);

  if (!result.exists) {
    console.log(`未検出: ${relative}`);
    continue;
  }

  if (result.changed) {
    changedCount += 1;
    console.log(`変更: ${relative} (${result.count}か所)`);
  } else {
    console.log(`変更なし: ${relative}`);
  }
}

title('完了');

console.log(`変更したファイル数: ${changedCount}`);
console.log('');
console.log('次に確認してください。');
console.log('1. clientを起動');
console.log('2. http://localhost:5173/cattle');
console.log('3. http://localhost:5173/');
console.log('');
console.log('画面が問題なければGitHub保存してください。');
console.log('もし白画面になった場合は、次の復元スクリプトを実行してください。');
console.log('node tools\\restore_cattle_ear_tag_label_patch.js');
