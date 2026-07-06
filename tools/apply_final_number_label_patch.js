const fs = require('fs');
const path = require('path');

const root = process.cwd();

const targetFiles = [
  path.join(root, 'client', 'src', 'pages', 'BlvList.tsx'),
  path.join(root, 'client', 'src', 'pages', 'BreedingList.tsx'),
  path.join(root, 'client', 'src', 'pages', 'HelpPage.tsx'),
  path.join(root, 'client', 'src', 'components', 'CattlePicker.tsx')
];

const replacements = [
  ['個体番号・牛名・種雄牛', '耳標番号・牛名・種雄牛'],
  ['個体番号・牛名', '耳標番号・牛名'],
  ['個体番号・名前・メモ', '耳標番号・名前・メモ'],
  ['個体番号・牛名、または子牛番号・子牛名', '耳標番号・牛名、または子牛耳標番号'],
  ['個体番号と牛名', '耳標番号と牛名'],
  ['個体番号', '耳標番号'],
  ['子牛番号', '子牛耳標番号']
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
    const backupPath = `${filePath}.bak_final_number_label`;
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

title('残った古い番号表示の最終置換');

console.log('残っていた5件程度の古い表示だけを置き換えます。');
console.log('内部データ名は変更しません。');
console.log('変更前のファイルは .bak_final_number_label として保存します。');

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
console.log('node tools\\check_number_label_final.js');
console.log('');
console.log('もし白画面や違和感があれば戻せます。');
console.log('node tools\\restore_final_number_label_patch.js');
