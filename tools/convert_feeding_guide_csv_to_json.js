const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();

const inputPath = path.join(rootDir, 'docs', 'feedingGuide_real_data_input_sheet.csv');
const outputPath = path.join(rootDir, 'server', 'src', 'data', 'feedingGuide_from_csv.json');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }

      row.push(cell);
      const hasValue = row.some((v) => String(v || '').trim() !== '');
      if (hasValue) rows.push(row);

      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell);
    const hasValue = row.some((v) => String(v || '').trim() !== '');
    if (hasValue) rows.push(row);
  }

  return rows;
}

function clean(value) {
  return String(value || '').replace(/^\uFEFF/, '').trim();
}

function numberOnly(value) {
  const text = clean(value);
  if (!text) return '';

  const normalized = text
    .replace(/[０-９．]/g, (s) => {
      const map = {
        '０': '0',
        '１': '1',
        '２': '2',
        '３': '3',
        '４': '4',
        '５': '5',
        '６': '6',
        '７': '7',
        '８': '8',
        '９': '9',
        '．': '.'
      };
      return map[s] || s;
    })
    .replace(/kg|ＫＧ|Ｋｇ|キロ|cm|ＣＭ|センチ/g, '')
    .trim();

  return normalized;
}

function makeId(ageDays, index) {
  const age = String(ageDays || index).padStart(3, '0');
  return `guide_real_${age}`;
}

function buildMemo(row) {
  const parts = [];

  if (row.weightKg) parts.push(`体重目安: ${row.weightKg}kg`);
  if (row.heightCm) parts.push(`体高目安: ${row.heightCm}cm`);
  if (row.chestCm) parts.push(`胸囲目安: ${row.chestCm}cm`);
  if (row.milk) parts.push(`代用乳・ミルク: ${row.milk}`);
  if (row.memo) parts.push(row.memo);

  return parts.join(' / ');
}

function main() {
  if (!fs.existsSync(inputPath)) {
    console.error('CSVファイルが見つかりません。');
    console.error(inputPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, 'utf-8');
  const rows = parseCsv(raw);

  if (rows.length <= 1) {
    console.error('CSVにデータ行がありません。');
    process.exit(1);
  }

  const header = rows[0].map(clean);

  function col(name) {
    return header.indexOf(name);
  }

  const indexes = {
    ageDays: col('日齢'),
    stageName: col('ステージ名'),
    starterKg: col('スターターkg'),
    growingFeedKg: col('育成配合kg'),
    roughageKg: col('粗飼料kg'),
    weightKg: col('体重目安kg'),
    heightCm: col('体高目安cm'),
    chestCm: col('胸囲目安cm'),
    milk: col('代用乳・ミルク'),
    memo: col('メモ')
  };

  const missing = Object.entries(indexes)
    .filter(([, index]) => index < 0)
    .map(([name]) => name);

  if (missing.length > 0) {
    console.error('CSVの列名が足りません。');
    console.error(missing.join(', '));
    process.exit(1);
  }

  const result = rows.slice(1)
    .map((cells, index) => {
      const row = {
        ageDays: numberOnly(cells[indexes.ageDays]),
        stageName: clean(cells[indexes.stageName]),
        starterKg: numberOnly(cells[indexes.starterKg]),
        growingFeedKg: numberOnly(cells[indexes.growingFeedKg]),
        roughageKg: numberOnly(cells[indexes.roughageKg]),
        weightKg: numberOnly(cells[indexes.weightKg]),
        heightCm: numberOnly(cells[indexes.heightCm]),
        chestCm: numberOnly(cells[indexes.chestCm]),
        milk: clean(cells[indexes.milk]),
        memo: clean(cells[indexes.memo])
      };

      if (!row.ageDays) return null;

      return {
        id: makeId(row.ageDays, index),
        ageDays: row.ageDays,
        stageName: row.stageName || `${row.ageDays}日齢`,
        starterKg: row.starterKg || '0',
        growingFeedKg: row.growingFeedKg || '0',
        roughageKg: row.roughageKg || '0',
        memo: buildMemo(row)
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.ageDays || 0) - Number(b.ageDays || 0));

  const seen = new Set();
  const duplicated = [];
  for (const item of result) {
    if (seen.has(item.ageDays)) duplicated.push(item.ageDays);
    seen.add(item.ageDays);
  }

  if (duplicated.length > 0) {
    console.warn('注意: 日齢が重複しています。');
    console.warn([...new Set(duplicated)].join(', '));
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

  console.log('給与目安CSVをJSONへ変換しました。');
  console.log(`入力: ${inputPath}`);
  console.log(`出力: ${outputPath}`);
  console.log(`件数: ${result.length}件`);
  console.log('');
  console.log('次に確認するURL:');
  console.log('http://localhost:4000/api/feeding-guide');
  console.log('');
  console.log('注意: まだ feedingGuide.json は上書きしていません。');
}

main();
