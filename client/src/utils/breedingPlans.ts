import type { Breeding } from '../types/breeding';
import { calculateExpectedCalvingDate, calculateNextHeatExpectedDate, calculatePregnancyCheckExpectedDate } from './breeding';

// One already-identified cow/cycle. Callers must resolve animal identity and
// the current cycle before using this projection; names alone are not IDs.
export type BreedingPlanRecord = Readonly<Partial<Breeding> & Pick<Breeding, 'id'> & {
  serviceDate?: string;
  actualTransferDate?: string;
  pregnancyDiagnosisDate?: string;
  status?: string;
}>;
export type BreedingPlanKind = 'post-calving-heat' | 'breeding-choice' | 'transfer' | 'next-heat' | 'pregnancy-check' | 'recheck' | 'calving' | 'feed-review';
export type BreedingPlan = Readonly<{
  kind: BreedingPlanKind;
  title: string;
  date: string | null;
  dateSource: 'stored' | 'calculated' | 'none';
  sourceRecordId?: string;
  relatedDate?: string;
  note?: string;
}>;
export type BreedingPlanIssue = Readonly<{
  code: 'invalid-today' | 'invalid-cycle-days' | 'invalid-date' | 'conflicting-dates' | 'future-activity' | 'missing-activity' | 'missing-et-heat' | 'missing-date' | 'missing-result' | 'unknown-result';
  field?: string;
}>;
export type BreedingPlanProjection = { plans: BreedingPlan[]; issues: BreedingPlanIssue[] };
export type BreedingPlanOptions = Readonly<{ today: string; cycleDays?: number; latestCalvingDate?: string }>;

const titles: Record<BreedingPlanKind, string> = {
  'post-calving-heat': '分娩後の発情確認',
  'breeding-choice': '種付方法の確認',
  transfer: '受精卵移植（ET）',
  'next-heat': '次回発情確認',
  'pregnancy-check': '妊娠鑑定',
  recheck: '再鑑定',
  calving: '分娩予定',
  'feed-review': '増し飼い検討',
};

// Preserve a stored calendar date, including legacy ISO timestamps. Reject
// impossible dates instead of allowing JavaScript to roll them into next month.
export function breedingPlanDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  // Validate the whole timestamp before extracting its calendar day; a valid
  // YYYY-MM-DD prefix must not disguise an invalid time or arbitrary suffix.
  if (!/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/.test(input)) return null;
  const day = input.slice(0, 10);
  const time = Date.parse(`${day}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day ? day : null;
}

export function breedingPlanDaysUntil(date: string, today: string): number | null {
  const target = breedingPlanDate(date);
  const base = breedingPlanDate(today);
  if (!target || !base) return null;
  return Math.round((Date.parse(`${target}T12:00:00Z`) - Date.parse(`${base}T12:00:00Z`)) / 86400000);
}

function plan(kind: BreedingPlanKind, date: string | null, source: BreedingPlan['dateSource'], recordId?: string): BreedingPlan {
  return { kind, title: titles[kind], date, dateSource: date ? source : 'none', ...(recordId !== undefined ? { sourceRecordId: recordId } : {}) };
}

const hasValue = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '';
const closed = (row: BreedingPlanRecord) => ['分娩済み', '中止'].includes(row.breedingStatus || row.status || '');
const activityFields = ['heatDate', 'inseminationDate', 'serviceDate', 'transferDate', 'actualTransferDate'] as const;

/** Read-only projection of ONE current breeding cycle. Never saves, completes,
 * deletes, fetches, or modifies any record. Issues must be displayed by future
 * UI adapters, not converted into an unqualified "予定なし" message. */
export function projectBreedingPlans(record: BreedingPlanRecord, options: BreedingPlanOptions): BreedingPlanProjection {
  const output: BreedingPlanProjection = { plans: [], issues: [] };
  if (closed(record)) return output;
  const today = breedingPlanDate(options.today);
  if (!today) return { plans: [], issues: [{ code: 'invalid-today' }] };
  const cycleDays = options.cycleDays ?? 21;
  if (!Number.isInteger(cycleDays) || cycleDays <= 0) return { plans: [], issues: [{ code: 'invalid-cycle-days' }] };

  const issue = (code: BreedingPlanIssue['code'], field?: string) => {
    if (!output.issues.some((item) => item.code === code && item.field === field)) output.issues.push({ code, ...(field ? { field } : {}) });
  };
  const read = (field: keyof BreedingPlanRecord): string | null => {
    const raw = record[field];
    const date = breedingPlanDate(raw);
    if (hasValue(raw) && !date) issue('invalid-date', field);
    return date;
  };
  const alias = (primary: keyof BreedingPlanRecord, legacy: keyof BreedingPlanRecord) => {
    const first = read(primary);
    const second = read(legacy);
    if (first && second && first !== second) issue('conflicting-dates', `${primary}/${legacy}`);
    return hasValue(record[primary]) ? first : second;
  };
  const heat = read('heatDate');
  const insemination = alias('inseminationDate', 'serviceDate');
  const transfer = alias('transferDate', 'actualTransferDate');
  const diagnosis = alias('pregnancyCheckDate', 'pregnancyDiagnosisDate');
  const activityDates = [heat, insemination, transfer].filter((date): date is string => Boolean(date));
  if (activityDates.some((date) => date > today) || (diagnosis && diagnosis > today)) issue('future-activity');
  if (output.issues.length > 0) return output;

  if (hasValue(options.latestCalvingDate)) {
    const calving = breedingPlanDate(options.latestCalvingDate);
    if (!calving || calving > today) return { plans: [], issues: [{ code: 'invalid-date', field: 'latestCalvingDate' }] };
    // A later diagnosis edit does not turn an old service into a new cycle.
    const activity = activityDates.slice().sort().pop();
    if (!activity) return { plans: [], issues: [{ code: 'missing-activity' }] };
    if (activity <= calving) return output;
  }

  const isEt = record.breedingMethod === '受精卵移植';
  const performed = isEt ? transfer : insemination || transfer;
  const base = isEt ? heat : performed;
  const result = record.pregnancyResult || '未鑑定';
  const sourceId = String(record.id);
  const add = (kind: BreedingPlanKind, date: string | null, source: BreedingPlan['dateSource'] = 'stored') => {
    const item = plan(kind, date, source, sourceId);
    output.plans.push(item);
    return item;
  };
  const automaticDate = (field: 'nextHeatExpectedDate' | 'pregnancyCheckExpectedDate' | 'expectedCalvingDate', calculate: (date: string) => string) => {
    // ET uses heat as the agreed display base. A missing heat date is NOT
    // silently replaced with transferDate or a possibly stale stored estimate.
    if (isEt) {
      if (!heat) { issue('missing-et-heat', 'heatDate'); return { date: null, source: 'none' as const }; }
      return { date: breedingPlanDate(calculate(heat)), source: 'calculated' as const };
    }
    if (hasValue(record[field])) return { date: read(field), source: 'stored' as const };
    return { date: base ? breedingPlanDate(calculate(base)) : null, source: 'calculated' as const };
  };
  const addAutomatic = (kind: BreedingPlanKind, field: 'nextHeatExpectedDate' | 'pregnancyCheckExpectedDate' | 'expectedCalvingDate', calculate: (date: string) => string) => {
    const value = automaticDate(field, calculate);
    if (!value.date) issue('missing-date', field);
    return add(kind, value.date, value.source);
  };

  if (['受胎', '妊娠'].includes(result)) {
    const calving = addAutomatic('calving', 'expectedCalvingDate', calculateExpectedCalvingDate);
    const remaining = calving.date ? breedingPlanDaysUntil(calving.date, today) : null;
    if (remaining !== null && remaining <= 60) {
      output.plans.push({ ...plan('feed-review', null, 'none', sourceId), relatedDate: calving.date!, note: '分娩予定日を目安に、体況と飼料内容を確認してください。' });
    }
  } else if (result === '再鑑定予定') {
    const date = read('recheckExpectedDate');
    if (!date) issue('missing-date', 'recheckExpectedDate');
    add('recheck', date);
  } else if (['空胎', '不受胎'].includes(result)) {
    addAutomatic('next-heat', 'nextHeatExpectedDate', (date) => calculateNextHeatExpectedDate(date, cycleDays));
  } else if (result !== '未鑑定') {
    issue('unknown-result', 'pregnancyResult');
  } else if (diagnosis) {
    issue('missing-result', 'pregnancyResult');
    add('pregnancy-check', null, 'none');
  } else if (isEt && !performed) {
    const date = read('transferPlannedDate');
    if (!date) issue('missing-date', 'transferPlannedDate');
    add('transfer', date);
  } else if (performed) {
    addAutomatic('next-heat', 'nextHeatExpectedDate', (date) => calculateNextHeatExpectedDate(date, cycleDays));
    addAutomatic('pregnancy-check', 'pregnancyCheckExpectedDate', (date) => calculatePregnancyCheckExpectedDate(date, cycleDays));
  } else if (heat) {
    add('breeding-choice', null, 'none');
  } else if (['nextHeatExpectedDate', 'pregnancyCheckExpectedDate', 'expectedCalvingDate'].some((field) => hasValue(record[field as keyof BreedingPlanRecord]))) {
    issue('missing-activity');
  }
  return output;
}

/** Already-matched records for a single cow only; do not pass the entire herd. */
export function projectPostCalvingHeat(input: Readonly<{
  latestCalvingDate?: string;
  breedings: readonly BreedingPlanRecord[];
  today: string;
  isSold?: boolean;
}>): BreedingPlanProjection {
  const empty: BreedingPlanProjection = { plans: [], issues: [] };
  if (input.isSold || !hasValue(input.latestCalvingDate)) return empty;
  const today = breedingPlanDate(input.today);
  const calving = breedingPlanDate(input.latestCalvingDate);
  if (!today) return { plans: [], issues: [{ code: 'invalid-today' }] };
  if (!calving || calving > today) return { plans: [], issues: [{ code: 'invalid-date', field: 'latestCalvingDate' }] };
  for (const row of input.breedings) {
    if ((row.breedingStatus || row.status) === '分娩済み') continue;
    const fields = [...activityFields, 'transferPlannedDate', 'pregnancyCheckDate', 'pregnancyDiagnosisDate'] as const;
    const present = fields.filter((field) => hasValue(row[field]));
    if (present.some((field) => !breedingPlanDate(row[field]))) return { plans: [], issues: [{ code: 'invalid-date', field: 'activity' }] };
    if (present.some((field) => breedingPlanDate(row[field])! >= calving)) return empty;
    if (present.length === 0 && (hasValue(row.pregnancyResult) && row.pregnancyResult !== '未鑑定' || hasValue(row.expectedCalvingDate) || hasValue(row.pregnancyCheckExpectedDate) || hasValue(row.nextHeatExpectedDate))) {
      return { plans: [], issues: [{ code: 'missing-activity' }] };
    }
  }
  const days = Math.abs(breedingPlanDaysUntil(calving, today)!);
  return { plans: [{ ...plan('post-calving-heat', null, 'none'), relatedDate: calving, note: `分娩後${days}日。発情を確認したら登録してください。` }], issues: [] };
}

// These are view filters, not lifecycle/completion rules. Overdue unresolved
// work remains visible. A calendar excludes undated guidance instead of
// inventing an appointment date from relatedDate.
export function upcomingBreedingPlans(plans: readonly BreedingPlan[], today: string, windowDays = 7): BreedingPlan[] {
  if (!breedingPlanDate(today) || !Number.isInteger(windowDays) || windowDays < 0) return [];
  return plans.filter((item) => item.date === null || (breedingPlanDaysUntil(item.date, today) ?? Infinity) <= windowDays);
}

export function calendarBreedingPlans(plans: readonly BreedingPlan[], yearMonth: string): BreedingPlan[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) return [];
  return plans.filter((item) => item.date !== null && breedingPlanDate(item.date)?.startsWith(`${yearMonth}-`));
}
