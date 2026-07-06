const fs = require('fs');
const path = require('path');

const root = process.cwd();
const calvingsPath = path.join(root, 'server', 'src', 'data', 'calvings.json');
const breedingPath = path.join(root, 'server', 'src', 'data', 'breeding.json');
const breedingsPath = path.join(root, 'server', 'src', 'data', 'breedings.json');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function showTitle(title) {
  console.log('');
  console.log('==============================');
  console.log(title);
  console.log('==============================');
}

const calvings = readJson(calvingsPath);
const breeding = readJson(breedingPath);
const breedings = readJson(breedingsPath);

showTitle('分娩記録の繁殖連携状態');

const linkedCalvings = calvings.filter((item) => item.breedingLinked || item.breedingId || item.breedingLinkedAt);

if (linkedCalvings.length === 0) {
  console.log('分娩記録に繁殖連携の跡は見つかりませんでした。');
} else {
  linkedCalvings.forEach((item) => {
    console.log(`分娩ID: ${item.id || ''}`);
    console.log(`  母牛: ${item.cowName || ''}`);
    console.log(`  子牛: ${item.calfName || ''}`);
    console.log(`  breedingId: ${item.breedingId || ''}`);
    console.log(`  breedingLinked: ${item.breedingLinked ? 'true' : 'false'}`);
    console.log(`  breedingLinkedAt: ${item.breedingLinkedAt || ''}`);
  });
}

function checkBreedingList(name, records) {
  showTitle(`${name} の分娩済み・分娩記録IDつきデータ`);

  const changed = records.filter((item) =>
    item.status === '分娩済み' ||
    item.calvingRecordId ||
    item.actualCalvingDate ||
    item.calvingResult ||
    item.calfName
  );

  if (changed.length === 0) {
    console.log('分娩済みに書き換わった可能性のある繁殖記録は見つかりませんでした。');
    return;
  }

  changed.forEach((item) => {
    console.log(`繁殖ID: ${item.id || ''}`);
    console.log(`  母牛: ${item.cowName || item.cowEarTag || ''}`);
    console.log(`  status: ${item.status || ''}`);
    console.log(`  actualCalvingDate: ${item.actualCalvingDate || ''}`);
    console.log(`  calvingResult: ${item.calvingResult || ''}`);
    console.log(`  calvingRecordId: ${item.calvingRecordId || ''}`);
    console.log(`  calfName: ${item.calfName || ''}`);
  });
}

checkBreedingList('breeding.json', breeding);
checkBreedingList('breedings.json', breedings);

console.log('');
console.log('確認完了です。');
console.log('status: 分娩済み や breedingLinked: true が表示された場合、ボタンで書き換わった可能性があります。');
console.log('戻す場合は、表示内容を見てから手作業で戻すのが安全です。自動で戻す処理は今回は入れていません。');
