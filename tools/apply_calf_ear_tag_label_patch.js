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

const replacements = [
  ['子牛名または子牛ID', '子牛耳標番号'],
  ['子牛ID', '子牛耳標番号'],
  ['母牛ID', '母牛耳標番号'],
  ['牛ID', '耳標番号'],
  ['子牛名・耳標番号', '子牛耳標番号'],
  ['子牛名または耳標番号', '子牛耳標番号'],
  ['子牛名または子牛耳標番号', '子牛耳標番号'],
  ['子牛名', '子牛耳標番号'],
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
    const backupPath = `${filePath}.bak_ear_tag_label`;
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

title('子牛台帳まわり 表示名置換');

console.log('画面に出る日本語だけを置き換えます。');
console.log('内部の calfId / cowId / id は変更しません。');
console.log('変更前のファイルは .bak_ear_tag_label として保存します。');

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
console.log('2. http://localhost:5173/calves');
console.log('3. http://localhost:5173/calvings');
console.log('');
console.log('画面が問題なければGitHub保存してください。');
console.log('もし白画面になった場合は、次の復元スクリプトを実行してください。');
console.log('node tools\\restore_calf_ear_tag_label_patch.js');
