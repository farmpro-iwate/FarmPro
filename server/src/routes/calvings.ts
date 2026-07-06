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

export const calvingsRouter = Router();

const dataPath = path.join(process.cwd(), 'src', 'data', 'calvings.json');

function ensureDataFile() {
  const dir = path.dirname(dataPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, '[]', 'utf-8');
  }
}

function readRecords(): CalvingRecord[] {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecords(records: CalvingRecord[]) {
  ensureDataFile();
  fs.writeFileSync(dataPath, JSON.stringify(records, null, 2), 'utf-8');
}

function createId() {
  return `calving_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    id: input.id || createId(),
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
