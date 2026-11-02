import { getAllRecords } from '../storage/repository';
import type { StoredRecord, StoreName } from '../storage/types';
import type { FarmStoryItem } from '../utils/farmStoryTypes';
import { getStoredAuthUser } from './authClient';
import { FARM_STORY_CATEGORIES, type FarmStoryCategoryId } from './farmStoryDisplaySettings';

type AdditionalCategory = Extract<FarmStoryCategoryId,
  'medicineInventory' | 'embryoInventory' | 'feedInventory' | 'feeding' | 'expense' | 'blv' | 'feedingAction' | 'fattening'>;
export type FarmStoryAdditionalRecordsResult = {
  items: FarmStoryItem[];
  failedCategories: FarmStoryCategoryId[];
};

const sources: ReadonlyArray<{ store: StoreName; categories: readonly AdditionalCategory[] }> = [
  { store: 'supplyInventory', categories: ['medicineInventory', 'embryoInventory'] },
  { store: 'feedInventory', categories: ['feedInventory'] },
  { store: 'feedings', categories: ['feeding'] },
  { store: 'expenses', categories: ['expense'] },
  { store: 'blvTests', categories: ['blv'] },
  { store: 'feedingAlertActions', categories: ['feedingAction'] },
  { store: 'fatteningTransitions', categories: ['fattening'] },
];
const dateFields: Record<AdditionalCategory, string> = {
  medicineInventory: 'date', embryoInventory: 'date', feedInventory: 'transactionDate',
  feeding: 'feedingDate', expense: 'paymentDate', blv: 'testDate', feedingAction: 'actionDate', fattening: 'startDate',
};
const labels = new Map<FarmStoryCategoryId, string>(FARM_STORY_CATEGORIES.map(category => [category.id, category.label]));
const nonActualStatuses = new Set(['取消', '取消済', '取消済み', 'キャンセル', '中止', '未実施', '予定', '下書き']);
const supplyActions = new Set(['購入', '使用', '廃棄', '棚卸増', '棚卸減']);
const feedingActionStatuses = new Set(['対応中', '対応済み', '様子見', '再確認必要']);

export class FarmStoryAdditionalRecordsContextChangedError extends Error {
  constructor() {
    super('農場または利用者が変わったため、以前の農場ストーリーは表示しません。');
    this.name = 'FarmStoryAdditionalRecordsContextChangedError';
  }
}

function context() {
  const user = getStoredAuthUser();
  return { farmId: user?.farmId ?? null, userId: user?.id ?? null };
}

function assertContext(expected: ReturnType<typeof context>) {
  const current = context();
  if (current.farmId !== expected.farmId || current.userId !== expected.userId) {
    throw new FarmStoryAdditionalRecordsContextChangedError();
  }
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

/** Preserve the business calendar date, never replace it with a save timestamp. */
function calendarDate(value: unknown): string {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(raw)) return '';
  const day = raw.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return '';
  if (raw.length > 10 && !Number.isFinite(Date.parse(raw))) return '';
  return day;
}

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Amount strings may carry more precision than Number/Intl's default rounding. */
function numericText(value: unknown): string {
  const supplied = text(value);
  const raw = supplied.includes(',')
    ? (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d*)?$/.test(supplied) ? supplied.replace(/,/g, '') : '')
    : supplied;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw) || !Number.isFinite(Number(raw))) return '';
  if (/e/i.test(raw)) return raw;
  const [whole, fraction] = raw.split('.');
  const negative = whole.startsWith('-');
  const digits = whole.replace(/^[+-]/, '').replace(/^0+(?=\d)/, '') || '0';
  return `${negative ? '-' : ''}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction === undefined ? '' : `.${fraction}`}`;
}

function quantity(value: unknown, unit: unknown, direction: -1 | 0 | 1 = 0): string {
  const number = numericText(value);
  if (!number) return '';
  let rendered = number;
  if (direction) {
    const negative = number.startsWith('-');
    const magnitude = number.replace(/^[+-]/, '');
    rendered = `${negative !== (direction < 0) ? '−' : '+'}${magnitude}`;
  }
  return `${rendered}${text(unit) ? ` ${text(unit)}` : ''}`;
}

function field(label: string, value: unknown): string {
  const content = text(value);
  return content ? `${label}：${content}` : '';
}

function amount(value: unknown): string {
  const rendered = numericText(value);
  return rendered ? `金額：${rendered} 円` : '';
}

function details(...values: string[]): string { return values.filter(Boolean).join(' / '); }

function actualRecord(row: StoredRecord): boolean {
  return !row.deletedAt && !row.blvSyncDeletePending && !row.feedingAlertActionSyncDeletePending &&
    !row.fatteningTransitionSyncDeletePending && !nonActualStatuses.has(text(row.status));
}

function buildItem(categoryId: AdditionalCategory, row: StoredRecord, today: string): FarmStoryItem | null {
  const id = text(row.id);
  const date = calendarDate(row[dateFields[categoryId]]);
  if (!id || !actualRecord(row) || !date || date > today) return null;
  const base = { id: `story:${categoryId}:${id}`, date, categoryId, category: labels.get(categoryId)! };
  const encodedId = encodeURIComponent(id);

  switch (categoryId) {
    case 'medicineInventory':
    case 'embryoInventory': {
      const kind = categoryId === 'medicineInventory' ? '医薬品' : '受精卵';
      const action = text(row.action);
      if (row.kind !== kind || !supplyActions.has(action)) return null;
      const direction = action === '購入' || action === '棚卸増' ? 1 : -1;
      return { ...base, title: `${text(row.itemName) || kind}：${action}`,
        detail: details(field('数量', quantity(row.quantity, row.unit, direction)), amount(row.amount),
          field(kind === '受精卵' ? '受精卵番号' : 'ロット番号', row.lotNumber), field('対象耳標', row.cowEarTag), field('メモ', row.note)),
        ...(text(row.cowEarTag) ? { earTag: text(row.cowEarTag) } : {}),
        sourcePath: `/supply-inventory?kind=${encodeURIComponent(kind)}` };
    }
    case 'feedInventory': {
      const transaction = text(row.transactionType);
      if (!['入庫', '出庫', '調整'].includes(transaction)) return null;
      const direction = transaction === '入庫' ? 1 : transaction === '出庫' ? -1 : 0;
      return { ...base, title: `${text(row.feedName) || '飼料'}：${transaction}`,
        detail: details(field('数量', quantity(row.quantity, row.unit, direction)),
          field('総重量', quantity(row.totalWeightKg, 'kg')), amount(row.totalPrice), field('仕入先', row.supplier), field('メモ', row.memo)),
        sourcePath: `/feed-inventory/${encodedId}/edit` };
    }
    case 'feeding':
      return { ...base, title: `${text(row.feedName) || '飼料'}を給与`,
        detail: details(field('対象', row.target), field('給与量', quantity(row.amount, row.unit)),
          amount(row.totalPrice), field('目的', row.purpose), field('メモ', row.memo)),
        sourcePath: `/feedings/${encodedId}/edit` };
    case 'expense': {
      const animalKind = row.animalType === 'cattle' || row.animalType === 'calf' ? row.animalType : undefined;
      return { ...base, title: `経費：${text(row.category) || 'その他'}`,
        detail: details(text(row.description), amount(row.amount), field('支払先', row.vendor), field('対象', row.target), field('メモ', row.memo)),
        ...(animalKind ? { animalKind, ...(text(row.animalId) ? { animalId: text(row.animalId) } : {}) } : {}),
        ...(text(row.animalName) ? { animalName: text(row.animalName) } : {}),
        ...(text(row.animalEarTag) ? { earTag: text(row.animalEarTag) } : {}),
        sourcePath: `/expenses/${encodedId}/edit` };
    }
    case 'blv': {
      const result = text(row.result);
      // The form's other value is 未検査, whose testDate is not a performed test.
      if (result !== '陰性' && result !== '陽性') return null;
      return { ...base, title: `${text(row.cowName) || text(row.cowEarTag) || '牛'}：BLV検査`,
        detail: details(`結果：${result}`, field('耳標', row.cowEarTag), field('隔離メモ', row.isolationMemo), field('メモ', row.note)),
        animalKind: 'cattle', ...(text(row.cowName) ? { animalName: text(row.cowName) } : {}),
        ...(text(row.cowEarTag) ? { earTag: text(row.cowEarTag) } : {}), sourcePath: `/blv/${encodedId}/edit` };
    }
    case 'feedingAction': {
      // 未対応 is the form default, even when actionDate is already today.
      if (!feedingActionStatuses.has(text(row.status))) return null;
      return { ...base, title: `${text(row.calfName) || '子牛'}：${text(row.actionType) || '給与アラート対応'}`,
        detail: details(field('アラート', row.alertType), field('状態', row.status),
          field('日齢', numericText(row.ageDays) ? `${numericText(row.ageDays)} 日` : ''), field('メモ', row.memo)),
        animalKind: 'calf', ...(text(row.calfId) ? { animalId: text(row.calfId) } : {}),
        ...(text(row.calfName) ? { animalName: text(row.calfName) } : {}),
        sourcePath: `/feeding-alert-actions/${encodedId}/edit` };
    }
    case 'fattening':
      if (!['肥育中', '出荷準備', '出荷済み'].includes(text(row.status))) return null;
      return { ...base, title: `${text(row.targetName) || text(row.targetNumber) || '牛'}：肥育移行`,
        detail: details(field('開始体重', quantity(row.startWeight, 'kg')), field('状態', row.status),
          field('理由', row.transitionReason), field('飼養場所', row.housingLocation), field('メモ', row.memo)),
        animalKind: 'cattle', ...(text(row.targetName) ? { animalName: text(row.targetName) } : {}),
        ...(text(row.targetNumber) ? { earTag: text(row.targetNumber) } : {}),
        sourcePath: `/fattening-transitions/${encodedId}/edit` };
  }
}

/** Read only the selected local ledgers. No sync, expense or costing getter is invoked. */
export async function loadFarmStoryAdditionalRecords(
  enabledCategories: readonly FarmStoryCategoryId[], today = localToday(),
): Promise<FarmStoryAdditionalRecordsResult> {
  const expected = context();
  const cutoff = calendarDate(today);
  if (!cutoff) throw new Error('農場ストーリーの基準日が不正です。');
  const selected = new Set(enabledCategories);
  const requested = sources.map(source => ({ ...source, categories: source.categories.filter(category => selected.has(category)) }))
    .filter(source => source.categories.length > 0);
  const loaded = await Promise.allSettled(requested.map(async source => {
    assertContext(expected);
    const rows = await getAllRecords<StoredRecord>(source.store);
    assertContext(expected);
    return rows;
  }));
  assertContext(expected);
  const items: FarmStoryItem[] = [];
  const failedCategories: FarmStoryCategoryId[] = [];
  loaded.forEach((result, index) => {
    const categories = requested[index].categories;
    if (result.status === 'rejected') {
      if (result.reason instanceof FarmStoryAdditionalRecordsContextChangedError) throw result.reason;
      failedCategories.push(...categories);
      return;
    }
    for (const category of categories) {
      for (const row of result.value) {
        const item = buildItem(category, row, cutoff);
        if (item) items.push(item);
      }
    }
  });
  assertContext(expected);
  items.sort((left, right) => right.date.localeCompare(left.date) || left.id.localeCompare(right.id));
  return { items, failedCategories };
}
