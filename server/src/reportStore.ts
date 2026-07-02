import dayjs from 'dayjs';
import { readJson } from './jsonStore';
import { Cattle } from './dataStore';
import { Calf } from './calfStore';
import { Breeding } from './breedingStore';
import { Vaccine } from './vaccineStore';
import { BlvTest } from './blvStore';
import { Schedule } from './scheduleStore';
import { Treatment } from './treatmentStore';

function daysUntil(dateText: string) {
  if (!dateText) return null;
  return dayjs(dateText).diff(dayjs(), 'day');
}

function isWithin(dateText: string, days: number) {
  const remaining = daysUntil(dateText);
  return remaining !== null && remaining >= 0 && remaining <= days;
}

function escapeCsv(value: unknown) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const body = rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(','));
  return [headers.join(','), ...body].join('\n');
}

export async function getReportSummary() {
  const cattle = await readJson<Cattle>('cattle.json');
  const calves = await readJson<Calf>('calves.json');
  const breedings = await readJson<Breeding>('breedings.json');
  const vaccines = await readJson<Vaccine>('vaccines.json');
  const blvTests = await readJson<BlvTest>('blvTests.json');
  const schedules = await readJson<Schedule>('schedules.json');
  const treatments = await readJson<Treatment>('treatments.json');

  const nearSchedules = schedules
    .filter((item) => item.status !== '完了' && item.dueDate && isWithin(item.dueDate, 14))
    .map((item) => ({
      id: item.id,
      scheduleType: item.scheduleType,
      title: item.title,
      targetName: item.targetName,
      dueDate: item.dueDate,
      daysUntil: daysUntil(item.dueDate)
    }))
    .sort((a, b) => (a.daysUntil ?? 9999) - (b.daysUntil ?? 9999));

  const withdrawalTreatments = treatments
    .filter((item) => {
      const remaining = daysUntil(item.withdrawalEndDate);
      return remaining !== null && remaining >= 0;
    })
    .map((item) => ({
      id: item.id,
      targetName: item.targetName,
      medicine: item.medicine,
      withdrawalEndDate: item.withdrawalEndDate,
      daysUntil: daysUntil(item.withdrawalEndDate)
    }))
    .sort((a, b) => (a.daysUntil ?? 9999) - (b.daysUntil ?? 9999));

  return {
    counts: {
      cattle: cattle.length,
      calves: calves.length,
      breedings: breedings.length,
      vaccines: vaccines.length,
      blvPositive: blvTests.filter((item) => item.result === '陽性').length,
      openSchedules: schedules.filter((item) => item.status !== '完了').length,
      activeTreatments: treatments.filter((item) => item.progress === '治療中' || item.progress === '経過観察' || item.progress === '要再診').length,
      withdrawal: withdrawalTreatments.length
    },
    nearSchedules,
    withdrawalTreatments
  };
}

export async function getCsv(kind: string) {
  if (kind === 'cattle') return toCsv(await readJson<Cattle>('cattle.json') as unknown as Record<string, unknown>[]);
  if (kind === 'calves') return toCsv(await readJson<Calf>('calves.json') as unknown as Record<string, unknown>[]);
  if (kind === 'breedings') return toCsv(await readJson<Breeding>('breedings.json') as unknown as Record<string, unknown>[]);
  if (kind === 'vaccines') return toCsv(await readJson<Vaccine>('vaccines.json') as unknown as Record<string, unknown>[]);
  if (kind === 'blv') return toCsv(await readJson<BlvTest>('blvTests.json') as unknown as Record<string, unknown>[]);
  if (kind === 'schedules') return toCsv(await readJson<Schedule>('schedules.json') as unknown as Record<string, unknown>[]);
  if (kind === 'treatments') return toCsv(await readJson<Treatment>('treatments.json') as unknown as Record<string, unknown>[]);
  return null;
}
