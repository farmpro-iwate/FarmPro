import { openFarmProDatabase } from '../storage/db';
import { getRecordById } from '../storage/repository';
import type { FeedInventoryRecord } from './feedInventoryApi';
import {
  assertExpenseSyncContext, deletedFeedPurchaseMarkerId, expenseSyncContext,
  getExpensesList, paymentMethodOptions, withFreshExpenseRecords,
  type ExpenseRecord, type ExpenseSyncContext,
} from './expensesApi';

type PurchaseRecord = FeedInventoryRecord & {
  syncRecordId?: string; cloudUpdatedAt?: string; cloudSyncPending?: boolean;
  deletedAt?: string; farmId?: string;
};
type StoredExpense = ExpenseRecord & { cloudUpdatedAt?: string; deletedAt?: string };

export type FeedPurchaseExpenseInput = {
  paymentDate: string;
  amount: string;
  paymentMethod: string;
  vendor: string;
  description: string;
  memo: string;
  allowSeparatePayment?: boolean;
};

export type FeedPurchaseExpenseReview = {
  purchase: FeedInventoryRecord;
  sourceId: string;
  expenses: ExpenseRecord[];
  linkedExpense?: ExpenseRecord;
};

type ReviewState = {
  owner: ExpenseSyncContext;
  localId: string;
  sourceId: string;
  sourceSnapshot: string;
  expenses: Map<string, ExpenseRecord>;
};
// A review belongs to the account and the exact records that were displayed.
// UI fields cannot replace this captured evidence with a different purchase.
const reviews = new WeakMap<FeedPurchaseExpenseReview, ReviewState>();

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
}

function purchaseSnapshot(record: PurchaseRecord): string {
  const { cloudUpdatedAt: _cloud, cloudSyncPending: _pending, ...content } = record;
  return JSON.stringify(stable(content));
}

function expenseSnapshot(record: ExpenseRecord, omitSource = false): string {
  const fields = ['paymentDate', 'category', 'expenseCategoryMasterId', 'description', 'vendor',
    'vendorMasterId', 'amount', 'paymentMethod', 'target', 'animalType', 'animalId',
    'animalEarTag', 'animalName', 'memo', 'createdAt', 'updatedAt',
    'sourceSupplyMovementId', 'sourceSupplyPurchaseReference'];
  if (!omitSource) fields.push('sourceType', 'sourceId', 'sourceDetail');
  const row = record as unknown as Record<string, unknown>;
  return JSON.stringify(fields.map(key => row[key] ?? ''));
}

function cloudExpenseId(record: ExpenseRecord): string {
  return record.syncRecordId || `expense:${record.id}`;
}

function sourceIdFor(record: PurchaseRecord): string {
  return record.syncRecordId || `feed-inventory:${record.id}`;
}

function assertPurchase(record: PurchaseRecord | undefined, owner: ExpenseSyncContext): asserts record is PurchaseRecord {
  if (!record || record.deletedAt || record.transactionType !== '入庫' ||
      (record.sourceType !== undefined && record.sourceType !== 'purchased')) {
    throw new Error('購入した飼料の入庫記録だけを経費に登録できます。元の記録を確認してください。');
  }
  if (record.farmId && record.farmId !== owner.farmId) {
    throw new Error('元の入庫記録の農場が一致しません。画面を開き直してください。');
  }
}

function stateFor(review: FeedPurchaseExpenseReview): ReviewState {
  const state = reviews.get(review);
  if (!state) throw new Error('購入内容を開き直してから経費を確認してください。');
  assertExpenseSyncContext(state.owner);
  return state;
}

function linkedExpense(records: ExpenseRecord[], sourceId: string): ExpenseRecord | undefined {
  const matches = records.filter(row => row.sourceType === 'feed-purchase' && row.sourceId === sourceId);
  if (matches.length > 1) throw new Error('この購入に複数の経費が紐付いています。経費管理で登録状況を確認してください。');
  return matches[0];
}

export function isLinkableFeedPurchaseExpense(expense: ExpenseRecord): boolean {
  const row = expense as StoredExpense;
  return row.category === '飼料費' && (!row.sourceType || row.sourceType === 'manual') &&
    !row.sourceId && !row.sourceDetail && !row.sourceSupplyMovementId && !row.sourceSupplyPurchaseReference &&
    !row.settlementSaleId && !row.deletedAt && !row.cloudSyncPending &&
    Number.isFinite(Number(row.amount)) && Number(row.amount) > 0;
}

export function findMatchingFeedPurchaseExpenses(
  review: FeedPurchaseExpenseReview,
  input: Pick<FeedPurchaseExpenseInput, 'paymentDate' | 'amount' | 'vendor'>,
): ExpenseRecord[] {
  const amount = Number(input.amount);
  if (!input.paymentDate || !Number.isFinite(amount) || amount <= 0) return [];
  const vendor = input.vendor.trim().toLocaleLowerCase();
  return review.expenses.filter(row => !(row as StoredExpense).deletedAt && row.category === '飼料費' &&
    (!row.sourceType || row.sourceType === 'manual') && row.paymentDate === input.paymentDate &&
    Number(row.amount) === amount && row.vendor.trim().toLocaleLowerCase() === vendor);
}

export async function loadFeedPurchaseExpenseReview(feedInventoryId: string): Promise<FeedPurchaseExpenseReview> {
  const owner = expenseSyncContext();
  const purchase = await getRecordById<PurchaseRecord>('feedInventory', feedInventoryId);
  assertExpenseSyncContext(owner);
  assertPurchase(purchase, owner);
  const expenses = await getExpensesList({ requireCloudSync: true });
  assertExpenseSyncContext(owner);
  // Reading through feedInventoryApi can normalize and save old cost snapshots.
  // This flow deliberately reads the raw record and never updates stock/costing.
  const current = await getRecordById<PurchaseRecord>('feedInventory', feedInventoryId);
  assertExpenseSyncContext(owner);
  assertPurchase(current, owner);
  const sourceId = sourceIdFor(current);
  const review: FeedPurchaseExpenseReview = {
    purchase: { ...current }, sourceId, expenses,
    linkedExpense: linkedExpense(expenses, sourceId),
  };
  reviews.set(review, { owner, localId: current.id, sourceId, sourceSnapshot: purchaseSnapshot(current),
    expenses: new Map(expenses.map(row => [String(row.id), { ...row }])) });
  return review;
}

async function assertReviewedPurchase(state: ReviewState): Promise<PurchaseRecord> {
  assertExpenseSyncContext(state.owner);
  const purchase = await getRecordById<PurchaseRecord>('feedInventory', state.localId);
  assertExpenseSyncContext(state.owner);
  assertPurchase(purchase, state.owner);
  if (sourceIdFor(purchase) !== state.sourceId || purchaseSnapshot(purchase) !== state.sourceSnapshot) {
    throw new Error('確認後に飼料の入庫内容が変わりました。画面を開き直して確認してください。');
  }
  const deleted = await getRecordById('metadata', deletedFeedPurchaseMarkerId(state.sourceId));
  assertExpenseSyncContext(state.owner);
  if (deleted) throw new Error('この購入に紐付いた経費は削除されています。自動で再登録せず、経費管理で確認してください。');
  return purchase;
}

function validateInput(input: FeedPurchaseExpenseInput): FeedPurchaseExpenseInput {
  const paymentDate = input.paymentDate.trim();
  const date = new Date(`${paymentDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== paymentDate) throw new Error('実際の支払日を入力してください。');
  const amount = Number(input.amount.trim());
  if (!input.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('確認した支払金額（税込）を、0より大きい数字で入力してください。');
  }
  if (!paymentMethodOptions.some(method => method === input.paymentMethod)) throw new Error('支払方法を選択してください。');
  if (!input.description.trim()) throw new Error('経費の内容を入力してください。');
  return { ...input, paymentDate, amount: String(amount), vendor: input.vendor.trim(),
    description: input.description.trim(), memo: input.memo.trim(), allowSeparatePayment: input.allowSeparatePayment === true };
}

function matchingExpenses(records: ExpenseRecord[], input: FeedPurchaseExpenseInput): ExpenseRecord[] {
  return findMatchingFeedPurchaseExpenses({ expenses: records } as FeedPurchaseExpenseReview, input);
}

function assertNoSimilarExpense(
  records: ExpenseRecord[], input: FeedPurchaseExpenseInput, reviewedRecords: ExpenseRecord[],
): void {
  const currentMatches = matchingExpenses(records, input);
  if (!input.allowSeparatePayment && currentMatches.length) {
    throw new Error('同じ支払日・金額・支払先の飼料費があります。既存経費を確認し、別の支払いの場合だけ新規登録してください。');
  }
  if (input.allowSeparatePayment) {
    const snapshot = (rows: ExpenseRecord[]) => JSON.stringify(rows.map(row =>
      [cloudExpenseId(row), expenseSnapshot(row)]).sort(([a], [b]) => a.localeCompare(b)));
    if (snapshot(currentMatches) !== snapshot(matchingExpenses(reviewedRecords, input))) {
      throw new Error('確認後に似た支払いの経費が追加または変更されました。画面を開き直して確認してください。');
    }
  }
}

function sameCreatedExpense(row: ExpenseRecord, expected: ExpenseRecord): boolean {
  return ['paymentDate', 'category', 'description', 'vendor', 'amount', 'paymentMethod', 'target',
    'memo', 'sourceType', 'sourceId', 'sourceDetail'].every(key =>
    (row as unknown as Record<string, unknown>)[key] === (expected as unknown as Record<string, unknown>)[key]);
}

async function sendConfirmedExpense(
  owner: ExpenseSyncContext, path: string, init: RequestInit, expectedCloudId: string,
): Promise<StoredExpense> {
  assertExpenseSyncContext(owner);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    let response: Response;
    try { response = await fetch(path, { ...init, signal: controller.signal }); }
    catch {
      assertExpenseSyncContext(owner);
      throw new Error('保存結果を確認できませんでした。画面を開き直して、経費の登録状況を確認してください。');
    }
    assertExpenseSyncContext(owner);
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(body.message || '経費を登録できませんでした。画面を開き直して登録状況を確認してください。');
    }
    const saved = await response.json() as StoredExpense;
    assertExpenseSyncContext(owner);
    if (!saved || saved.id !== expectedCloudId || !saved.cloudUpdatedAt ||
        Number.isNaN(Date.parse(saved.cloudUpdatedAt)) || saved.deletedAt) {
      throw new Error('経費の保存内容を確認できません。画面を開き直して登録状況を確認してください。');
    }
    return saved;
  } finally { clearTimeout(timeout); }
}

/** The final local source check and expense write share one transaction. No
 * network operation or stock write occurs inside this transaction. */
async function commitLocally(
  state: ReviewState, write: (rows: ExpenseRecord[], store: IDBObjectStore) => ExpenseRecord,
): Promise<ExpenseRecord> {
  assertExpenseSyncContext(state.owner);
  const db = await openFarmProDatabase();
  assertExpenseSyncContext(state.owner);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['feedInventory', 'expenses', 'metadata'], 'readwrite');
    const purchaseRequest = tx.objectStore('feedInventory').get(state.localId);
    const expenses = tx.objectStore('expenses');
    const expenseRequest = expenses.getAll();
    const deletedRequest = tx.objectStore('metadata').get(deletedFeedPurchaseMarkerId(state.sourceId));
    let remaining = 3;
    let result: ExpenseRecord;
    let failure: unknown;
    const ready = () => {
      if (--remaining !== 0) return;
      try {
        assertExpenseSyncContext(state.owner);
        const purchase = purchaseRequest.result as PurchaseRecord | undefined;
        assertPurchase(purchase, state.owner);
        if (purchaseSnapshot(purchase) !== state.sourceSnapshot || sourceIdFor(purchase) !== state.sourceId) {
          throw new Error('確認後に飼料の入庫内容が変わりました。画面を開き直してください。');
        }
        if (deletedRequest.result) throw new Error('この購入の経費は削除済みです。経費管理で確認してください。');
        result = write(expenseRequest.result as ExpenseRecord[], expenses);
      } catch (error) { failure = error; tx.abort(); }
    };
    purchaseRequest.onsuccess = ready;
    expenseRequest.onsuccess = ready;
    deletedRequest.onsuccess = ready;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || tx.error || new Error('経費を端末に保存できませんでした。'));
  });
}

export async function createFeedPurchaseExpense(
  review: FeedPurchaseExpenseReview, input: FeedPurchaseExpenseInput,
): Promise<ExpenseRecord> {
  const state = stateFor(review);
  const values = validateInput(input);
  return withFreshExpenseRecords(state.owner, async records => {
    await assertReviewedPurchase(state);
    const now = new Date().toISOString();
    const id = `feed-purchase:${state.sourceId}`;
    const cloudId = `expense:${id}`;
    let candidate: StoredExpense = { id, syncRecordId: cloudId, cloudSyncPending: false,
      paymentDate: values.paymentDate, amount: values.amount, paymentMethod: values.paymentMethod,
      vendor: values.vendor, description: values.description, memo: values.memo,
      category: '飼料費', target: '農場全体', sourceType: 'feed-purchase', sourceId: state.sourceId,
      sourceDetail: 'purchase', createdAt: now, updatedAt: now };
    const existing = linkedExpense(records, state.sourceId);
    if (existing) {
      if (sameCreatedExpense(existing, candidate)) return existing;
      throw new Error('この購入の経費は登録済みです。金額や支払日を変更せず、経費管理で確認してください。');
    }
    const reviewedExpenses = [...state.expenses.values()];
    assertNoSimilarExpense(records, values, reviewedExpenses);
    if (state.owner.cloudEnabled) {
      const saved = await sendConfirmedExpense(state.owner,
        `/api/expenses/record-sync/${encodeURIComponent(cloudId)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.owner.token}`,
            'If-None-Match': '*', ...(values.allowSeparatePayment ? { 'X-FarmPro-Allow-Separate-Feed-Payment': 'true' } : {}) },
          body: JSON.stringify({ ...candidate, id: cloudId,
            ...(values.allowSeparatePayment ? { feedPurchaseConfirmedSimilarExpenses:
              matchingExpenses(reviewedExpenses, values).map(row => ({ ...row, id: cloudExpenseId(row) })) } : {}) }),
        }, cloudId);
      if (!sameCreatedExpense(saved, candidate)) throw new Error('保存された経費の内容が一致しません。経費管理で確認してください。');
      candidate = { ...saved, id, syncRecordId: cloudId, cloudSyncPending: false };
    }
    return commitLocally(state, (rows, store) => {
      const linked = linkedExpense(rows, state.sourceId);
      if (linked) {
        if (sameCreatedExpense(linked, candidate)) return linked;
        throw new Error('この購入に別の経費が登録されています。画面を開き直してください。');
      }
      assertNoSimilarExpense(rows, values, reviewedExpenses);
      if (rows.some(row => row.id === id || cloudExpenseId(row) === cloudId)) throw new Error('経費の登録IDが重複しています。経費管理で確認してください。');
      store.add(candidate);
      return candidate;
    });
  });
}

export async function linkFeedPurchaseExpense(
  review: FeedPurchaseExpenseReview, expenseId: string,
): Promise<ExpenseRecord> {
  const state = stateFor(review);
  const reviewedExpense = state.expenses.get(String(expenseId));
  if (!reviewedExpense) throw new Error('確認画面に表示された経費を選択してください。');
  return withFreshExpenseRecords(state.owner, async records => {
    const purchase = await assertReviewedPurchase(state);
    const cloudId = cloudExpenseId(reviewedExpense);
    const currentMatches = records.filter(row => cloudExpenseId(row) === cloudId);
    if (currentMatches.length !== 1) throw new Error('経費の識別情報が変わりました。画面を開き直してください。');
    const current = currentMatches[0];
    const linked = linkedExpense(records, state.sourceId);
    if (linked) {
      if (cloudExpenseId(linked) === cloudId && expenseSnapshot(linked, true) === expenseSnapshot(reviewedExpense, true)) return linked;
      throw new Error('この購入は既に経費へ紐付いています。経費管理で確認してください。');
    }
    if (!current || expenseSnapshot(current) !== expenseSnapshot(reviewedExpense) || !isLinkableFeedPurchaseExpense(current)) {
      throw new Error('選択した経費が変更されたか、紐付けできない状態です。画面を開き直してください。');
    }
    if (!state.owner.cloudEnabled && (current as StoredExpense).cloudUpdatedAt) {
      throw new Error('クラウドに保存済みの経費です。同期を利用できるプランで登録状況を確認してから紐付けてください。');
    }
    const purchaseAmount = Number(purchase.totalPrice);
    if (!Number.isFinite(purchaseAmount) || purchaseAmount <= 0 || Number(current.amount) !== purchaseAmount) {
      throw new Error('購入金額と同額の経費を1件だけ紐付けできます。まとめ払いなど金額が異なる場合は、既存経費を確認してください。');
    }
    let candidate: StoredExpense = { ...current, sourceType: 'feed-purchase', sourceId: state.sourceId,
      sourceDetail: 'purchase', syncRecordId: cloudId, cloudSyncPending: false };
    if (state.owner.cloudEnabled) {
      const saved = await sendConfirmedExpense(state.owner,
        `/api/expenses/record-sync/${encodeURIComponent(cloudId)}/feed-purchase-link`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.owner.token}` },
          body: JSON.stringify({ sourceId: state.sourceId, expected: current }),
        }, cloudId);
      if (saved.sourceType !== 'feed-purchase' || saved.sourceId !== state.sourceId || saved.sourceDetail !== 'purchase' ||
          expenseSnapshot(saved, true) !== expenseSnapshot(current, true)) {
        throw new Error('紐付け後の経費内容を確認できません。画面を開き直してください。');
      }
      candidate = { ...current, ...saved, id: current.id, syncRecordId: cloudId, cloudSyncPending: false };
    }
    return commitLocally(state, (rows, store) => {
      const alreadyLinked = linkedExpense(rows, state.sourceId);
      if (alreadyLinked) {
        if (cloudExpenseId(alreadyLinked) === cloudId && expenseSnapshot(alreadyLinked, true) === expenseSnapshot(current, true)) return alreadyLinked;
        throw new Error('この購入には別の経費が紐付いています。画面を開き直してください。');
      }
      const latestMatches = rows.filter(row => cloudExpenseId(row) === cloudId);
      const latest = latestMatches[0];
      if (latestMatches.length !== 1 || !latest || latest.id !== current.id ||
          expenseSnapshot(latest) !== expenseSnapshot(current) || !isLinkableFeedPurchaseExpense(latest)) {
        throw new Error('確認中に既存経費が変更されました。画面を開き直してください。');
      }
      store.put(candidate);
      return candidate;
    });
  });
}
