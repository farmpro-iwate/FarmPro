import { Router } from 'express';
import fs from 'fs';
import path from 'path';

export const breedingRouter = Router();

const dataPath = path.join(process.cwd(), 'src', 'data', 'breeding.json');

type BreedingRecord = {
  id: string;
  cowId?: string;
  cowName?: string;
  breedingType?: string;
  serviceDate?: string;
  expectedCalvingDate?: string;
  pregnancyCheckDate?: string;
  pregnancyCheckActualDate?: string;
  pregnancyResult?: string;
  status?: string;
  sireName?: string;
  sireMasterId?: number;
  semenNo?: string;
  inseminatorName?: string;
  inseminatorMasterId?: number;
  matingStartDate?: string;
  matingEndDate?: string;
  donorCowId?: string;
  donorCowName?: string;
  embryoNo?: string;
  embryoType?: string;
  embryoRank?: string;
  supplierName?: string;
  supplierMasterId?: number;
  transferOperatorName?: string;
  memo?: string;
};

function ensureDataFile() {
  const dir = path.dirname(dataPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, '[]', 'utf-8');
  }
}

function readData(): BreedingRecord[] {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeData(records: BreedingRecord[]) {
  ensureDataFile();
  fs.writeFileSync(dataPath, JSON.stringify(records, null, 2), 'utf-8');
}

function toDate(dateText?: string) {
  if (!dateText) return null;
  const d = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function addDays(dateText: string | undefined, days: number) {
  const d = toDate(dateText);
  if (!d) return '';

  d.setDate(d.getDate() + days);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${y}-${m}-${day}`;
}

function makeId() {
  return `breeding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRecord(input: Partial<BreedingRecord>, current?: BreedingRecord): BreedingRecord {
  const serviceDate = input.serviceDate ?? current?.serviceDate ?? '';
  const expectedCalvingDate =
    input.expectedCalvingDate ??
    current?.expectedCalvingDate ??
    addDays(serviceDate, 285);

  const pregnancyCheckDate =
    input.pregnancyCheckDate ??
    current?.pregnancyCheckDate ??
    addDays(serviceDate, 40);

  return {
    id: current?.id || input.id || makeId(),
    cowId: input.cowId ?? current?.cowId ?? '',
    cowName: input.cowName ?? current?.cowName ?? '',
    breedingType: input.breedingType ?? current?.breedingType ?? '人工授精',
    serviceDate,
    expectedCalvingDate,
    pregnancyCheckDate,
    pregnancyCheckActualDate: input.pregnancyCheckActualDate ?? current?.pregnancyCheckActualDate ?? '',
    pregnancyResult: input.pregnancyResult ?? current?.pregnancyResult ?? '未鑑定',
    status: input.status ?? current?.status ?? '鑑定待ち',
    sireName: input.sireName ?? current?.sireName ?? '',
    sireMasterId: input.sireMasterId ?? current?.sireMasterId,
    semenNo: input.semenNo ?? current?.semenNo ?? '',
    inseminatorName: input.inseminatorName ?? current?.inseminatorName ?? '',
    inseminatorMasterId: input.inseminatorMasterId ?? current?.inseminatorMasterId,
    matingStartDate: input.matingStartDate ?? current?.matingStartDate ?? '',
    matingEndDate: input.matingEndDate ?? current?.matingEndDate ?? '',
    donorCowId: input.donorCowId ?? current?.donorCowId ?? '',
    donorCowName: input.donorCowName ?? current?.donorCowName ?? '',
    embryoNo: input.embryoNo ?? current?.embryoNo ?? '',
    embryoType: input.embryoType ?? current?.embryoType ?? '',
    embryoRank: input.embryoRank ?? current?.embryoRank ?? '',
    supplierName: input.supplierName ?? current?.supplierName ?? '',
    supplierMasterId: input.supplierMasterId ?? current?.supplierMasterId,
    transferOperatorName: input.transferOperatorName ?? current?.transferOperatorName ?? '',
    memo: input.memo ?? current?.memo ?? ''
  };
}

function sortRecords(records: BreedingRecord[]) {
  return [...records].sort((a, b) => {
    const dateA = a.serviceDate || '';
    const dateB = b.serviceDate || '';
    return dateB.localeCompare(dateA);
  });
}

breedingRouter.get('/', (_req, res) => {
  const records = readData();
  res.json(sortRecords(records));
});

breedingRouter.get('/alerts', (_req, res) => {
  const records = readData();
  const today = new Date();
  const todayText = today.toISOString().slice(0, 10);

  const alerts = records.flatMap((record) => {
    const result: Array<{
      id: string;
      cowId?: string;
      cowName?: string;
      type: string;
      date?: string;
      status?: string;
      message: string;
      record: BreedingRecord;
    }> = [];

    const pregnancyCheckDate = record.pregnancyCheckDate || '';
    const expectedCalvingDate = record.expectedCalvingDate || '';

    if (record.status !== '分娩済み' && record.pregnancyResult === '未鑑定' && pregnancyCheckDate) {
      if (pregnancyCheckDate < todayText) {
        result.push({
          id: `${record.id}_pregnancy_overdue`,
          cowId: record.cowId,
          cowName: record.cowName,
          type: '妊娠鑑定期限切れ',
          date: pregnancyCheckDate,
          status: record.status,
          message: '妊娠鑑定予定日を過ぎています。',
          record
        });
      } else if (pregnancyCheckDate === todayText) {
        result.push({
          id: `${record.id}_pregnancy_today`,
          cowId: record.cowId,
          cowName: record.cowName,
          type: '妊娠鑑定今日',
          date: pregnancyCheckDate,
          status: record.status,
          message: '今日は妊娠鑑定予定日です。',
          record
        });
      }
    }

    if (record.status !== '分娩済み' && expectedCalvingDate) {
      if (expectedCalvingDate < todayText) {
        result.push({
          id: `${record.id}_calving_overdue`,
          cowId: record.cowId,
          cowName: record.cowName,
          type: '分娩予定日超過',
          date: expectedCalvingDate,
          status: record.status,
          message: '分娩予定日を過ぎています。分娩記録を確認してください。',
          record
        });
      }
    }

    return result;
  });

  res.json({
    total: alerts.length,
    alerts
  });
});

breedingRouter.get('/:id', (req, res) => {
  const records = readData();
  const record = records.find((item) => item.id === req.params.id);

  if (!record) {
    res.status(404).json({ message: '繁殖記録が見つかりません。' });
    return;
  }

  res.json(record);
});

breedingRouter.post('/', (req, res) => {
  const records = readData();
  const record = normalizeRecord(req.body || {});

  records.push(record);
  writeData(records);

  res.status(201).json(record);
});

breedingRouter.put('/:id', (req, res) => {
  const records = readData();
  const index = records.findIndex((item) => item.id === req.params.id);

  if (index === -1) {
    res.status(404).json({ message: '繁殖記録が見つかりません。' });
    return;
  }

  const updated = normalizeRecord(req.body || {}, records[index]);
  records[index] = updated;
  writeData(records);

  res.json(updated);
});

breedingRouter.delete('/:id', (req, res) => {
  const records = readData();
  const next = records.filter((item) => item.id !== req.params.id);

  if (next.length === records.length) {
    res.status(404).json({ message: '繁殖記録が見つかりません。' });
    return;
  }

  writeData(next);
  res.json({ ok: true });
});

export default breedingRouter;
