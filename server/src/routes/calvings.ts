import { Router } from 'express';
import fs from 'fs';
import path from 'path';

export type CalvingRecord = {
  id: string;
  cowId?: string;
  cowName?: string;
  expectedCalvingDate?: string;
  actualCalvingDate?: string;
  calfName?: string;
  calfSex?: 'オス' | 'メス' | '不明' | string;
  birthWeightKg?: number | string;
  calvingResult?: '自然分娩' | '難産' | '外科的処置' | '死産' | string;
  colostrumStatus?: '未確認' | '確認済み' | '要確認' | string;
  memo?: string;
  registeredToCalfLedger?: boolean;
  calfId?: string;
  createdAt?: string;
  updatedAt?: string;
};

type CalfRecord = {
  id: string;
  name?: string;
  earTag?: string;
  sex?: string;
  birthDate?: string;
  birthWeightKg?: number | string;
  motherCowId?: string;
  motherCowName?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export const calvingsRouter = Router();

const dataPath = path.join(process.cwd(), 'src', 'data', 'calvings.json');
const calvesPath = path.join(process.cwd(), 'src', 'data', 'calves.json');

function ensureFile(filePath: string, defaultValue = '[]') {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, defaultValue, 'utf-8');
  }
}

function readJsonArray<T>(filePath: string): T[] {
  ensureFile(filePath);

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(filePath: string, records: T[]) {
  ensureFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
}

function readRecords(): CalvingRecord[] {
  return readJsonArray<CalvingRecord>(dataPath);
}

function writeRecords(records: CalvingRecord[]) {
  writeJsonArray<CalvingRecord>(dataPath, records);
}

function createId(prefix = 'calving') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCalvingResult(result?: string) {
  if (!result) return '自然分娩';
  if (result === '正常') return '自然分娩';
  if (result === '介助分娩') return '難産';
  if (result === '要確認') return '難産';
  if (result === '中止') return '死産';
  return result;
}

function normalizeRecord(input: Partial<CalvingRecord>): CalvingRecord {
  const now = new Date().toISOString();

  const birthWeight =
    input.birthWeightKg === '' || input.birthWeightKg === undefined || input.birthWeightKg === null
      ? ''
      : Number(input.birthWeightKg);

  return {
    id: input.id || createId('calving'),
    cowId: input.cowId || '',
    cowName: input.cowName || '',
    expectedCalvingDate: input.expectedCalvingDate || '',
    actualCalvingDate: input.actualCalvingDate || '',
    calfName: input.calfName || '',
    calfSex: input.calfSex || '不明',
    birthWeightKg: Number.isNaN(birthWeight) ? '' : birthWeight,
    calvingResult: normalizeCalvingResult(input.calvingResult),
    colostrumStatus: input.colostrumStatus || '未確認',
    memo: input.memo || '',
    registeredToCalfLedger: Boolean(input.registeredToCalfLedger),
    calfId: input.calfId || '',
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

function daysDifference(actual?: string, expected?: string) {
  if (!actual || !expected) return null;

  const actualDate = new Date(`${actual}T00:00:00`);
  const expectedDate = new Date(`${expected}T00:00:00`);

  if (Number.isNaN(actualDate.getTime()) || Number.isNaN(expectedDate.getTime())) {
    return null;
  }

  return Math.round((actualDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24));
}

function withComputedFields(record: CalvingRecord) {
  return {
    ...record,
    calvingResult: normalizeCalvingResult(record.calvingResult),
    daysFromExpected: daysDifference(record.actualCalvingDate, record.expectedCalvingDate)
  };
}

function makeCalfFromCalving(record: CalvingRecord): CalfRecord {
  const now = new Date().toISOString();
  const calfId = record.calfId || createId('calf');

  const memoLines = [
    record.memo || '',
    `分娩記録ID: ${record.id}`,
    record.calvingResult ? `分娩結果: ${normalizeCalvingResult(record.calvingResult)}` : '',
    record.colostrumStatus ? `初乳確認: ${record.colostrumStatus}` : ''
  ].filter(Boolean);

  return {
    id: calfId,
    name: record.calfName || '',
    earTag: record.calfName || '',
    sex: record.calfSex || '不明',
    birthDate: record.actualCalvingDate || '',
    birthWeightKg: record.birthWeightKg === undefined ? '' : record.birthWeightKg,
    motherCowId: record.cowId || '',
    motherCowName: record.cowName || '',
    memo: memoLines.join('\n'),
    createdAt: now,
    updatedAt: now
  };
}

function isDuplicateCalf(calves: CalfRecord[], record: CalvingRecord) {
  const calfName = (record.calfName || '').trim();
  const birthDate = (record.actualCalvingDate || '').trim();
  const motherCowId = (record.cowId || '').trim();
  const motherCowName = (record.cowName || '').trim();

  return calves.some((calf) => {
    const sameName =
      calfName &&
      [calf.name, calf.earTag].some((value) => String(value || '').trim() === calfName);

    const sameBirthMother =
      birthDate &&
      String(calf.birthDate || '').trim() === birthDate &&
      (
        (motherCowId && String(calf.motherCowId || '').trim() === motherCowId) ||
        (motherCowName && String(calf.motherCowName || '').trim() === motherCowName)
      );

    return Boolean(sameName || sameBirthMother);
  });
}

calvingsRouter.get('/', (_req, res) => {
  const records = readRecords();
  res.json(records.map(withComputedFields));
});

calvingsRouter.get('/summary', (_req, res) => {
  const records = readRecords().map((record) => ({
    ...record,
    calvingResult: normalizeCalvingResult(record.calvingResult)
  }));

  const total = records.length;

  const natural = records.filter((r) => r.calvingResult === '自然分娩').length;
  const dystocia = records.filter((r) => r.calvingResult === '難産').length;
  const surgical = records.filter((r) => r.calvingResult === '外科的処置').length;
  const stillbirth = records.filter((r) => r.calvingResult === '死産').length;
  const colostrumChecked = records.filter((r) => r.colostrumStatus === '確認済み').length;
  const notRegisteredToCalfLedger = records.filter((r) => !r.registeredToCalfLedger && r.calvingResult !== '死産').length;

  res.json({
    total,
    natural,
    dystocia,
    surgical,
    stillbirth,
    colostrumChecked,
    notRegisteredToCalfLedger
  });
});

calvingsRouter.post('/:id/register-calf', (req, res) => {
  const records = readRecords();
  const index = records.findIndex((item) => item.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ message: '分娩記録が見つかりません。' });
    return;
  }

  const record = withComputedFields(records[index]);

  if (record.registeredToCalfLedger) {
    res.status(400).json({ message: 'この分娩記録はすでに子牛台帳へ登録済みです。' });
    return;
  }

  if (record.calvingResult === '死産') {
    res.status(400).json({ message: '死産の記録は子牛台帳へ登録しません。' });
    return;
  }

  if (!record.calfName) {
    res.status(400).json({ message: '子牛名がないため、子牛台帳へ登録できません。' });
    return;
  }

  if (!record.actualCalvingDate) {
    res.status(400).json({ message: '実分娩日がないため、子牛台帳へ登録できません。' });
    return;
  }

  const calves = readJsonArray<CalfRecord>(calvesPath);

  if (isDuplicateCalf(calves, record)) {
    res.status(400).json({
      message: '同じ子牛名、または同じ母牛・生年月日の子牛がすでに子牛台帳にある可能性があります。重複を確認してください。'
    });
    return;
  }

  const calf = makeCalfFromCalving(record);
  calves.push(calf);
  writeJsonArray<CalfRecord>(calvesPath, calves);

  const now = new Date().toISOString();
  records[index] = {
    ...records[index],
    registeredToCalfLedger: true,
    calfId: calf.id,
    updatedAt: now
  };
  writeRecords(records);

  res.status(201).json({
    ok: true,
    calf,
    calving: withComputedFields(records[index])
  });
});

calvingsRouter.get('/:id', (req, res) => {
  const records = readRecords();
  const record = records.find((item) => item.id === req.params.id);

  if (!record) {
    res.status(404).json({ message: '分娩記録が見つかりません。' });
    return;
  }

  res.json(withComputedFields(record));
});

calvingsRouter.post('/', (req, res) => {
  const records = readRecords();
  const record = normalizeRecord(req.body || {});

  records.push(record);
  writeRecords(records);

  res.status(201).json(withComputedFields(record));
});

calvingsRouter.put('/:id', (req, res) => {
  const records = readRecords();
  const index = records.findIndex((item) => item.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ message: '分娩記録が見つかりません。' });
    return;
  }

  const updated = normalizeRecord({
    ...records[index],
    ...(req.body || {}),
    id: records[index].id,
    createdAt: records[index].createdAt
  });

  records[index] = updated;
  writeRecords(records);

  res.json(withComputedFields(updated));
});

calvingsRouter.delete('/:id', (req, res) => {
  const records = readRecords();
  const exists = records.some((item) => item.id === req.params.id);

  if (!exists) {
    res.status(404).json({ message: '分娩記録が見つかりません。' });
    return;
  }

  const next = records.filter((item) => item.id !== req.params.id);
  writeRecords(next);

  res.json({ ok: true });
});

export default calvingsRouter;
