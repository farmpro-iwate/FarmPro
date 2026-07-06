const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();

const sourcePath = path.join(rootDir, 'server', 'src', 'data', 'feedingGuide_from_csv.json');
const targetPath = path.join(rootDir, 'server', 'src', 'data', 'feedingGuide.json');

function pad(n) {
  return String(n).padStart(2, '0');
}

function timestamp() {
  const d = new Date();
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate())
  ].join('') + '_' + [
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds())
  ].join('');
}

function isValidGuideItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.ageDays === undefined || item.ageDays === null || String(item.ageDays).trim() === '') return false;
  if (!item.stageName && item.stageName !== '') return false;
  if (item.starterKg === undefined || item.starterKg === null) return false;
  if (item.growingFeedKg === undefined || item.growingFeedKg === null) return false;
  if (item.roughageKg === undefined || item.roughageKg === null) return false;
  return true;
}

function main() {
  if (!fs.existsSync(sourcePath)) {
    console.error('変換後JSONが見つかりません。先にCSV変換を実行してください。');
    console.error(sourcePath);
    console.error('');
    console.error('先に実行するコマンド:');
    console.error('node tools/convert_feeding_guide_csv_to_json.js');
    process.exit(1);
  }

  let sourceData;
  try {
    sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
  } catch (err) {
    console.error('feedingGuide_from_csv.json を読み込めませんでした。JSON形式を確認してください。');
    console.error(err.message);
    process.exit(1);
  }

  if (!Array.isArray(sourceData)) {
    console.error('feedingGuide_from_csv.json の中身が配列ではありません。');
    process.exit(1);
  }

  if (sourceData.length === 0) {
    console.error('feedingGuide_from_csv.json にデータがありません。');
    process.exit(1);
  }

  const invalidItems = sourceData.filter((item) => !isValidGuideItem(item));
  if (invalidItems.length > 0) {
    console.error('必要な項目が足りないデータがあります。');
    console.error('必要項目: ageDays, stageName, starterKg, growingFeedKg, roughageKg');
    console.error(`不正件数: ${invalidItems.length}件`);
    process.exit(1);
  }

  const ages = sourceData.map((item) => String(item.ageDays));
  const duplicates = ages.filter((age, index) => ages.indexOf(age) !== index);

  if (duplicates.length > 0) {
    console.warn('注意: 日齢が重複しています。');
    console.warn([...new Set(duplicates)].join(', '));
    console.warn('必要ならCSVを修正してから再変換してください。');
    console.warn('');
  }

  const backupPath = path.join(
    path.dirname(targetPath),
    `feedingGuide_backup_auto_${timestamp()}.json`
  );

  if (fs.existsSync(targetPath)) {
    fs.copyFileSync(targetPath, backupPath);
    console.log('現在の feedingGuide.json をバックアップしました。');
    console.log(backupPath);
  } else {
    console.warn('現在の feedingGuide.json が見つかりません。バックアップなしで新規作成します。');
  }

  const sorted = [...sourceData].sort((a, b) => Number(a.ageDays || 0) - Number(b.ageDays || 0));

  fs.writeFileSync(targetPath, JSON.stringify(sorted, null, 2), 'utf-8');

  console.log('');
  console.log('給与目安データを本反映しました。');
  console.log(`反映元: ${sourcePath}`);
  console.log(`反映先: ${targetPath}`);
  console.log(`件数: ${sorted.length}件`);
  console.log('');
  console.log('次に確認するURL:');
  console.log('http://localhost:4000/api/feeding-guide');
  console.log('http://localhost:5173/feeding-guide');
  console.log('');
  console.log('表示がおかしい場合は、上に表示されたバックアップファイルの中身を feedingGuide.json へ戻してください。');
}

main();
