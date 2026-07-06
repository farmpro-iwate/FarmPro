const fs = require('fs');
const path = require('path');

const root = process.cwd();

const targetDirs = [
  path.join(root, 'client', 'src', 'pages'),
  path.join(root, 'client', 'src', 'components'),
  path.join(root, 'client', 'src', 'services')
];

const badWords = ['牛ID', '母牛ID', '個体ID', '個体番号'];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  const files = [];

  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(tsx|ts)$/.test(item)) {
      files.push(full);
    }
  }

  return files;
}

console.log('');
console.log('==============================');
console.log('牛台帳 耳標番号表示 置換後チェック');
console.log('==============================');

let found = false;

for (const filePath of targetDirs.flatMap(walk)) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split(/\r?\n/);

  const matches = [];

  lines.forEach((line, index) => {
    if (badWords.some((word) => line.includes(word))) {
      matches.push({ lineNumber: index + 1, line: line.trim() });
    }
  });

  if (matches.length > 0) {
    found = true;
    console.log('');
    console.log(path.relative(root, filePath));
    matches.slice(0, 30).forEach((match) => {
      console.log(`  ${match.lineNumber}: ${match.line}`);
    });
  }
}

if (!found) {
  console.log('OK: 主なID表示は見つかりませんでした。');
} else {
  console.log('');
  console.log('注意: まだID表示が残っています。表示内容を見て次のPackで直します。');
}
