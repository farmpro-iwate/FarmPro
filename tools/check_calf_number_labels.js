const fs = require('fs');
const path = require('path');

const root = process.cwd();
const clientPages = path.join(root, 'client', 'src', 'pages');
const clientServices = path.join(root, 'client', 'src', 'services');
const serverData = path.join(root, 'server', 'src', 'data');

const keywords = [
  '子牛ID',
  '母牛ID',
  '牛ID',
  'ID',
  'calfId',
  'cowId',
  'calfName',
  'earTag',
  '個体識別番号',
  '耳標番号'
];

function title(text) {
  console.log('');
  console.log('==============================');
  console.log(text);
  console.log('==============================');
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  const files = [];

  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(tsx|ts|json)$/.test(item)) {
      files.push(full);
    }
  }

  return files;
}

function read(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function showMatches(files, label) {
  title(label);

  let found = false;

  files.forEach((filePath) => {
    const text = read(filePath);
    const lines = text.split(/\r?\n/);

    const matches = [];

    lines.forEach((line, index) => {
      if (keywords.some((keyword) => line.includes(keyword))) {
        matches.push({
          lineNumber: index + 1,
          line: line.trim()
        });
      }
    });

    if (matches.length > 0) {
      found = true;
      console.log('');
      console.log(path.relative(root, filePath));
      matches.slice(0, 40).forEach((match) => {
        console.log(`  ${match.lineNumber}: ${match.line}`);
      });

      if (matches.length > 40) {
        console.log(`  ...他 ${matches.length - 40} 件`);
      }
    }
  });

  if (!found) {
    console.log('該当する表示は見つかりませんでした。');
  }
}

title('子牛台帳 番号表示 安全確認');

console.log('この確認では、子牛台帳まわりで「ID」「耳標番号」「個体識別番号」などの表示がどこにあるか探します。');
console.log('このスクリプトは確認だけです。ファイルは変更しません。');

const pageFiles = walk(clientPages).filter((filePath) => {
  const name = path.basename(filePath).toLowerCase();
  const text = read(filePath);
  return name.includes('calf') || text.includes('子牛') || text.includes('calves');
});

const serviceFiles = walk(clientServices).filter((filePath) => {
  const name = path.basename(filePath).toLowerCase();
  const text = read(filePath);
  return name.includes('calf') || text.includes('calves') || text.includes('子牛');
});

const dataFiles = walk(serverData).filter((filePath) => {
  const name = path.basename(filePath).toLowerCase();
  return name.includes('calf') || name.includes('calves') || name.includes('cattle');
});

showMatches(pageFiles, '1. client/src/pages の子牛関連ファイル');
showMatches(serviceFiles, '2. client/src/services の子牛関連ファイル');
showMatches(dataFiles, '3. server/src/data の子牛・牛関連JSON');

title('次に直す候補');

console.log('画面表示では、以下の置き換えを優先します。');
console.log('');
console.log('  子牛ID → 子牛耳標番号');
console.log('  母牛ID → 母牛耳標番号');
console.log('  calfId → 画面には出さない');
console.log('  cowId → 母牛耳標番号として表示');
console.log('  calfName → 子牛耳標番号として表示');
console.log('');
console.log('この結果をChatGPTに貼ると、次のPackで安全に子牛台帳画面を直せます。');
