const fs = require('fs');
const path = require('path');

const root = process.cwd();

const targetDirs = [
  path.join(root, 'client', 'src', 'pages'),
  path.join(root, 'client', 'src', 'components'),
  path.join(root, 'client', 'src', 'services')
];

const badWords = [
  '子牛ID',
  '母牛ID',
  '牛ID',
  '個体ID',
  '個体番号',
  '子牛名または子牛ID',
  '子牛名または耳標番号',
  '子牛名・耳標番号'
];

const goodWords = [
  '耳標番号',
  '母牛耳標番号',
  '子牛耳標番号',
  '個体識別番号'
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
    } else if (/\.(tsx|ts)$/.test(item)) {
      files.push(full);
    }
  }

  return files;
}

function countWord(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = text.match(new RegExp(escaped, 'g'));
  return matches ? matches.length : 0;
}

const files = targetDirs.flatMap(walk);

title('番号表示 全体確認');

console.log('この確認は、画面側の表示に「ID」や「個体番号」がどれくらい残っているかを調べます。');
console.log('このスクリプトは確認だけです。ファイルは変更しません。');

title('1. 残っている可能性がある表示');

let totalBad = 0;
let foundBad = false;

for (const filePath of files) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split(/\r?\n/);
  const matches = [];

  lines.forEach((line, index) => {
    const hitWords = badWords.filter((word) => line.includes(word));
    if (hitWords.length > 0) {
      matches.push({
        lineNumber: index + 1,
        line: line.trim()
      });
    }
  });

  if (matches.length > 0) {
    foundBad = true;
    totalBad += matches.length;
    console.log('');
    console.log(path.relative(root, filePath));
    matches.slice(0, 30).forEach((match) => {
      console.log(`  ${match.lineNumber}: ${match.line}`);
    });

    if (matches.length > 30) {
      console.log(`  ...他 ${matches.length - 30} 件`);
    }
  }
}

if (!foundBad) {
  console.log('OK: 主な古い番号表示は見つかりませんでした。');
}

title('2. 耳標番号・個体識別番号の表示数');

const goodCounts = {};

for (const word of goodWords) {
  goodCounts[word] = 0;
}

for (const filePath of files) {
  const text = fs.readFileSync(filePath, 'utf-8');

  for (const word of goodWords) {
    goodCounts[word] += countWord(text, word);
  }
}

for (const word of goodWords) {
  console.log(`${word}: ${goodCounts[word]}件`);
}

title('3. 判定');

if (totalBad === 0) {
  console.log('かなり良い状態です。');
  console.log('画面表示は、耳標番号中心にかなり寄っています。');
} else if (totalBad <= 10) {
  console.log(`残りは少なめです。古い表示が ${totalBad} 件あります。`);
  console.log('表示内容を見て、次のPackで部分的に直せます。');
} else {
  console.log(`古い表示が ${totalBad} 件あります。`);
  console.log('一気に直すより、画面ごとに少しずつ直すのが安全です。');
}

console.log('');
console.log('注意: プログラム内部の id / cowId / calfId は、画面に出なければ残してOKです。');
console.log('次に進む場合は、この結果の「残っている可能性がある表示」の部分だけ見れば十分です。');
