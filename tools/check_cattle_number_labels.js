const fs = require('fs');
const path = require('path');

const root = process.cwd();

const searchDirs = [
  path.join(root, 'client', 'src', 'pages'),
  path.join(root, 'client', 'src', 'components'),
  path.join(root, 'client', 'src', 'services'),
  path.join(root, 'server', 'src', 'data'),
  path.join(root, 'server', 'src', 'routes')
];

const keywords = [
  '牛ID',
  '母牛ID',
  '個体ID',
  'ID',
  'id',
  'cattleId',
  'cowId',
  'earTag',
  '個体番号',
  '個体識別番号',
  '耳標番号',
  '牛台帳',
  'cattle'
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

function looksCattleRelated(filePath, text) {
  const name = path.basename(filePath).toLowerCase();
  const rel = path.relative(root, filePath).toLowerCase();

  return (
    name.includes('cattle') ||
    name.includes('cow') ||
    rel.includes('cattle') ||
    text.includes('牛台帳') ||
    text.includes('母牛') ||
    text.includes('成牛') ||
    text.includes('earTag') ||
    text.includes('cattle')
  );
}

title('牛台帳 番号表示 安全確認');

console.log('この確認では、牛台帳まわりで「ID」「耳標番号」「個体識別番号」などの表示がどこにあるか探します。');
console.log('このスクリプトは確認だけです。ファイルは変更しません。');

const files = searchDirs.flatMap(walk).filter((filePath) => {
  const text = read(filePath);
  return looksCattleRelated(filePath, text);
});

title('1. 牛台帳関連ファイル候補');

if (files.length === 0) {
  console.log('牛台帳関連ファイル候補は見つかりませんでした。');
} else {
  files.forEach((filePath) => {
    console.log(path.relative(root, filePath));
  });
}

title('2. 番号表示・ID表示の候補');

let found = false;

for (const filePath of files) {
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
    matches.slice(0, 60).forEach((match) => {
      console.log(`  ${match.lineNumber}: ${match.line}`);
    });

    if (matches.length > 60) {
      console.log(`  ...他 ${matches.length - 60} 件`);
    }
  }
}

if (!found) {
  console.log('該当する表示は見つかりませんでした。');
}

title('3. 次に直す候補');

console.log('画面表示では、以下の置き換えを優先します。');
console.log('');
console.log('  牛ID → 耳標番号');
console.log('  母牛ID → 母牛耳標番号');
console.log('  個体ID → 個体識別番号');
console.log('  個体番号 → 耳標番号 または 個体識別番号');
console.log('  id / cattleId / cowId → 画面にはなるべく出さない');
console.log('');
console.log('内部データ名は、すぐには変更しません。画面表示だけ直すのが安全です。');
console.log('');
console.log('この結果をChatGPTに貼ると、次のPackで安全に牛台帳画面を直せます。');
