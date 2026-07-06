const fs = require('fs');
const path = require('path');

const root = process.cwd();
const calvingsRoutePath = path.join(root, 'server', 'src', 'routes', 'calvings.ts');
const calvingsDataPath = path.join(root, 'server', 'src', 'data', 'calvings.json');
const breedingPath = path.join(root, 'server', 'src', 'data', 'breeding.json');
const breedingsPath = path.join(root, 'server', 'src', 'data', 'breedings.json');

function title(text) {
  console.log('');
  console.log('==============================');
  console.log(text);
  console.log('==============================');
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

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

title('1. 分娩記録APIの安全確認');

const routeText = readText(calvingsRoutePath);

if (!routeText) {
  console.log('NG: server/src/routes/calvings.ts が見つかりません。');
} else {
  const hasRegisterCalf = routeText.includes("register-calf");
  const hasBreedingCandidates = routeText.includes("breeding-candidates");
  const hasCompleteBreeding = routeText.includes("complete-breeding");

  console.log(`子牛台帳登録API register-calf: ${hasRegisterCalf ? 'OK あります' : 'NG 見つかりません'}`);
  console.log(`繁殖候補API breeding-candidates: ${hasBreedingCandidates ? 'NG 残っています' : 'OK 撤去されています'}`);
  console.log(`繁殖書き換えAPI complete-breeding: ${hasCompleteBreeding ? 'NG 残っています' : 'OK 撤去されています'}`);
}

title('2. 分娩記録データの繁殖連携跡');

const calvings = readJson(calvingsDataPath);
const linkedCalvings = calvings.filter((item) =>
  item.breedingLinked === true ||
  item.breedingId ||
  item.breedingLinkedAt
);

if (linkedCalvings.length === 0) {
  console.log('OK: 分娩記録に繁殖連携の跡は見つかりませんでした。');
} else {
  console.log('注意: 分娩記録に繁殖連携の跡があります。');
  linkedCalvings.forEach((item) => {
    console.log(`- 分娩ID: ${item.id || ''}`);
    console.log(`  母牛: ${item.cowName || ''}`);
    console.log(`  子牛: ${item.calfName || ''}`);
    console.log(`  breedingId: ${item.breedingId || ''}`);
    console.log(`  breedingLinked: ${item.breedingLinked ? 'true' : 'false'}`);
    console.log(`  breedingLinkedAt: ${item.breedingLinkedAt || ''}`);
  });
}

function checkBreedingFile(label, filePath) {
  title(`3. ${label} の書き換え確認`);

  const records = readJson(filePath);
  if (!records.length) {
    console.log(`${label} は空、または見つかりません。`);
    return;
  }

  const changed = records.filter((item) =>
    item.status === '分娩済み' ||
    item.calvingRecordId ||
    item.actualCalvingDate ||
    item.calvingResult ||
    item.calfName
  );

  if (changed.length === 0) {
    console.log(`OK: ${label} に分娩済み書き換えの跡は見つかりませんでした。`);
    return;
  }

  console.log(`注意: ${label} に分娩済み書き換えの可能性がある記録があります。`);
  changed.forEach((item) => {
    console.log(`- 繁殖ID: ${item.id || ''}`);
    console.log(`  母牛: ${item.cowName || item.cowEarTag || ''}`);
    console.log(`  status: ${item.status || ''}`);
    console.log(`  actualCalvingDate: ${item.actualCalvingDate || ''}`);
    console.log(`  calvingResult: ${item.calvingResult || ''}`);
    console.log(`  calvingRecordId: ${item.calvingRecordId || ''}`);
    console.log(`  calfName: ${item.calfName || ''}`);
  });
}

checkBreedingFile('breeding.json', breedingPath);
checkBreedingFile('breedings.json', breedingsPath);

title('4. 結果');

console.log('以下なら安全です。');
console.log('- breeding-candidates: OK 撤去されています');
console.log('- complete-breeding: OK 撤去されています');
console.log('- 分娩記録に繁殖連携の跡なし');
console.log('- breeding.json / breedings.json に分娩済み書き換えの跡なし');
console.log('');
console.log('注意表示が出た場合は、その表示内容をChatGPTに貼ってください。戻す場所を一つずつ案内します。');
