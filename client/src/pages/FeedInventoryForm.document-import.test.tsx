import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedInventoryForm } from './FeedInventoryForm';
import * as inventoryApi from '../services/feedInventoryApi';
import * as settingsApi from '../services/settingsApi';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';
import * as repository from '../storage/repository';
import * as feedPurchaseExpenses from '../services/feedPurchaseExpenses';
import type { ExpenseRecord } from '../services/expensesApi';
import {
  emptyFeedDocumentCandidate, emptyFeedDocumentLine,
  type FeedDocumentCandidate, type FeedDocumentSelection,
} from '../utils/feedDocumentImport';

type ImporterProps = {
  onApply: (selection: FeedDocumentSelection) => void;
  initialSelection?: FeedDocumentSelection;
  completedLineIndexes: number[];
  autoOpen: boolean;
  disabled: boolean;
  buttonLabel?: string;
};
const importer = vi.hoisted(() => ({ latest: null as ImporterProps | null }));
vi.mock('../components/FeedPurchaseExpenseDialog', () => ({
  FeedPurchaseExpenseDialog: ({ record, onClose }: any) => record ? (
    <div role="dialog" aria-label="飼料購入の経費確認">
      <span>{record.feedName}の購入金額 {record.totalPrice}円</span>
      <button onClick={onClose}>あとで確認</button>
    </div>
  ) : null,
}));
vi.mock('../components/FeedDocumentImport', () => ({
  FeedDocumentImport: (props: ImporterProps) => {
    importer.latest = props;
    return <button type="button" disabled={props.disabled} onClick={() => props.onApply(nextSelection)}>
      {props.buttonLabel || '書類の候補を反映'}
    </button>;
  },
}));
vi.mock('../components/FeedSearchField', () => ({
  FeedSearchField: ({ value, onChange }: any) =>
    <input aria-label="飼料名" value={value} onChange={event => onChange(event.target.value)} />,
}));
vi.mock('../components/PartnerSearchField', () => ({
  PartnerSearchField: ({ label = '仕入先', value, onChange }: any) =>
    <input aria-label={label} value={value} onChange={event => onChange(event.target.value)} />,
}));

const owner = { id: 'feed-document-user', farmId: 'feed-document-farm', plan: 'free' };
const expectedOwner = { farmId: owner.farmId, userId: owner.id };
const sessionId = 'synthetic-feed-document-session';
let candidate: FeedDocumentCandidate;
let nextSelection: FeedDocumentSelection;
function selection(lineIndex: number): FeedDocumentSelection {
  return { candidate, lineIndex, sessionId };
}
function stored(input: Partial<inventoryApi.FeedInventoryInput>, id = 'stored-entry'): inventoryApi.FeedInventoryRecord {
  return {
    ...inventoryApi.emptyFeedInventoryInput, ...input, id,
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
  };
}
function savedExpense(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    id: 'saved-feed-expense', paymentDate: '2026-11-07', category: '飼料費',
    description: '検証用配合飼料 購入', vendor: '検証用飼料店', amount: '2200',
    paymentMethod: '銀行振込', target: '農場全体', memo: '',
    sourceType: 'feed-purchase', sourceId: 'feed-inventory:imported-entry-1',
    createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z',
    ...overrides,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}
function mount() {
  render(<MemoryRouter initialEntries={['/feed-inventory/new?source=feed-document']}><Routes>
    <Route path="/feed-inventory/new" element={<FeedInventoryForm />} />
    <Route path="/feed-inventory" element={<div>飼料一覧に移動</div>} />
  </Routes></MemoryRouter>);
}
async function enableDocumentExpense(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: '経費にも登録する' }));
  fireEvent.change(screen.getByLabelText(/^支払日/), { target: { value: '2026-11-07' } });
  await user.click(screen.getByRole('combobox', { name: /^支払方法/ }));
  await user.click(screen.getByRole('option', { name: '銀行振込' }));
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear(); sessionStorage.clear(); importer.latest = null;
  localStorage.setItem('farmpro.authUser', JSON.stringify(owner));
  candidate = {
    ...emptyFeedDocumentCandidate, documentType: 'invoice', documentNumber: 'FEED-FIXTURE-001',
    issueDate: '2026-11-02', deliveryDate: '2026-11-01', supplier: '検証用飼料店',
    lines: [
      { ...emptyFeedDocumentLine, kind: 'feed', feedName: '検証用配合飼料', deliveryDate: '2026-11-01',
        quantity: '2', unit: '袋', originalUnit: '袋', bagWeightKg: '20',
        unitPriceYen: '1100', unitPriceBasis: 'tax-included', priceUnit: '袋',
        grossYen: '2200', netYen: '2000', taxYen: '200', taxRate: '10' },
      { ...emptyFeedDocumentLine, kind: 'feed', feedName: '検証用牧草', deliveryDate: '2026-11-01',
        quantity: '5', unit: 'kg', originalUnit: 'kg',
        unitPriceYen: '220', unitPriceBasis: 'tax-included', priceUnit: 'kg',
        grossYen: '1100', netYen: '1000', taxYen: '100', taxRate: '10' },
    ],
  };
  nextSelection = selection(0);
  vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ defaultTaxRate: '10' } as any);
  vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([]);
  vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([]);
  vi.spyOn(repository, 'getAllRecords').mockResolvedValue([]);
  vi.spyOn(inventoryApi, 'getFeedInventoryList').mockResolvedValue([]);
  let createdCount = 0;
  vi.spyOn(inventoryApi, 'createFeedInventory').mockImplementation(async input =>
    stored(input, 'imported-entry-' + ++createdCount));
  vi.spyOn(feedPurchaseExpenses, 'prepareFeedPurchaseExpense').mockImplementation(async (input, _owner, options) => ({
    input, expenses: [], matchingExpenses: [], linkableExpenses: [], ready: !options?.reviewOnly,
  }));
  vi.spyOn(feedPurchaseExpenses, 'bindFeedPurchaseExpenseReview').mockImplementation(async (prepared, purchase) => ({
    purchase, sourceId: 'feed-inventory:' + purchase.id, expenses: prepared.expenses,
  }));
  vi.spyOn(feedPurchaseExpenses, 'createFeedPurchaseExpense').mockImplementation(async (review, input) => savedExpense({
    id: 'expense:' + review.purchase.id, sourceId: review.sourceId,
    paymentDate: input.paymentDate, paymentMethod: input.paymentMethod, amount: input.amount,
    vendor: input.vendor, description: input.description, memo: input.memo,
  }));
  vi.spyOn(feedPurchaseExpenses, 'linkFeedPurchaseExpense').mockRejectedValue(new Error('These fixtures must not link another expense'));
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Document form tests must not access record APIs'));
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  cleanup(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear();
});

describe('納品書・請求書の候補から飼料入庫を確認して登録する', () => {
  it('反映では保存せず、同じ書類の未登録の品目を明示操作で1件ずつ登録する', async () => {
    const user = userEvent.setup(); mount();
    expect(importer.latest?.autoOpen).toBe(true);
    await user.click(screen.getByRole('button', { name: '書類の候補を反映' }));
    expect(screen.getByLabelText('飼料名')).toHaveValue('検証用配合飼料');
    expect(screen.getByLabelText(/数量/)).toHaveValue('2');
    expect(screen.getByRole('checkbox', { name: '経費にも登録する' })).not.toBeChecked();
    expect(screen.queryByLabelText(/^支払日/)).not.toBeInTheDocument();
    expect(inventoryApi.createFeedInventory).not.toHaveBeenCalled();
    expect(repository.getAllRecords).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '入庫を登録' }));
    await screen.findByText(/検証用配合飼料.*を入庫登録しました/);
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    expect(inventoryApi.createFeedInventory).toHaveBeenNthCalledWith(1, expect.objectContaining({
      transactionType: '入庫', sourceType: 'purchased', feedName: '検証用配合飼料',
      quantity: '2', unit: '袋', bagWeightKg: '20', totalWeightKg: '40',
      totalPrice: '2200', taxExcludedPrice: '2000', taxAmount: '200',
    }), expectedOwner);
    expect(repository.getAllRecords).toHaveBeenCalledWith('feedInventory');
    expect(inventoryApi.getFeedInventoryList).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '入庫を登録' })).not.toBeInTheDocument();
    expect(importer.latest?.initialSelection).toEqual(selection(0));
    expect(importer.latest?.completedLineIndexes).toEqual([0]);
    expect(() => importer.latest!.onApply(selection(0))).toThrow(/この品目は入庫登録済み/);
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);

    expect(screen.queryByRole('dialog', { name: '飼料購入の経費確認' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '経費を確認・登録' }));
    expect(screen.getByRole('dialog', { name: '飼料購入の経費確認' })).toBeInTheDocument();
    expect(screen.getByText('検証用配合飼料の購入金額 2200円')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'あとで確認' }));
    expect(screen.queryByText('飼料一覧に移動')).not.toBeInTheDocument();
    expect(importer.latest?.completedLineIndexes).toEqual([0]);

    nextSelection = { ...importer.latest!.initialSelection!, lineIndex: 1 };
    await user.click(screen.getByRole('button', { name: '次の品目を選ぶ' }));
    expect(screen.getByLabelText('飼料名')).toHaveValue('検証用牧草');
    expect(importer.latest?.completedLineIndexes).toEqual([0]);
    expect(importer.latest?.initialSelection?.candidate).toEqual(candidate);
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: '入庫を登録' }));
    await screen.findByText(/検証用牧草.*を入庫登録しました/);
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(2);
    expect(inventoryApi.createFeedInventory).toHaveBeenNthCalledWith(2, expect.objectContaining({
      feedName: '検証用牧草', quantity: '5', unit: 'kg', totalPrice: '1100',
    }), expectedOwner);
    expect(importer.latest?.completedLineIndexes).toEqual([0, 1]);
    expect(screen.queryByText('飼料一覧に移動')).not.toBeInTheDocument();
    expect(inventoryApi.getFeedInventoryList).not.toHaveBeenCalled();
    expect(feedPurchaseExpenses.prepareFeedPurchaseExpense).not.toHaveBeenCalled();
    expect(feedPurchaseExpenses.createFeedPurchaseExpense).not.toHaveBeenCalled();
  });

  it('経費も登録すると明示した品目は、同じ画面の1回の登録で入庫と確認済みの支払いを保存する', async () => {
    const pending = deferred<ExpenseRecord>();
    vi.mocked(feedPurchaseExpenses.createFeedPurchaseExpense).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '書類の候補を反映' }));
    expect(screen.getByRole('checkbox', { name: '経費にも登録する' })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: '経費にも登録する' }));
    expect(screen.getByLabelText(/^支払日/)).toHaveValue('');
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).toHaveTextContent('選択してください');
    await user.click(screen.getByRole('button', { name: '入庫と経費を登録' }));
    expect(inventoryApi.createFeedInventory).not.toHaveBeenCalled();
    expect(feedPurchaseExpenses.prepareFeedPurchaseExpense).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^支払日/), { target: { value: '2026-11-07' } });
    await user.click(screen.getByRole('combobox', { name: /^支払方法/ }));
    await user.click(screen.getByRole('option', { name: '銀行振込' }));

    const form = screen.getByRole('button', { name: '入庫と経費を登録' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(feedPurchaseExpenses.createFeedPurchaseExpense).toHaveBeenCalledTimes(1));
    expect(feedPurchaseExpenses.prepareFeedPurchaseExpense).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      paymentDate: '2026-11-07', paymentMethod: '銀行振込', amount: '2200', vendor: '検証用飼料店',
      description: '検証用配合飼料 購入', memo: expect.stringContaining('FEED-FIXTURE-001'), allowSeparatePayment: false,
    }), expect.objectContaining(expectedOwner), { reviewed: undefined, linkExpenseId: undefined });
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      feedName: '検証用配合飼料', transactionDate: '2026-11-01', totalPrice: '2200',
      taxExcludedPrice: '2000', taxAmount: '200',
    }), expectedOwner);
    expect(feedPurchaseExpenses.bindFeedPurchaseExpenseReview).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ ready: true }), expect.objectContaining({ id: 'imported-entry-1' }));
    expect(feedPurchaseExpenses.createFeedPurchaseExpense).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ sourceId: 'feed-inventory:imported-entry-1' }),
      expect.objectContaining({ paymentDate: '2026-11-07', paymentMethod: '銀行振込', amount: '2200', vendor: '検証用飼料店' }));
    expect(importer.latest?.completedLineIndexes).toEqual([0]);
    expect(importer.latest?.disabled).toBe(true);
    expect(screen.getByRole('button', { name: '次の品目を選ぶ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '登録中...' })).toBeDisabled();
    fireEvent.submit(form);
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    expect(feedPurchaseExpenses.createFeedPurchaseExpense).toHaveBeenCalledTimes(1);

    await act(async () => { pending.resolve(savedExpense()); });
    await screen.findByText(/検証用配合飼料.*の入庫と経費を登録しました/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('飼料一覧に移動')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '入庫と経費を登録' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '次の品目を選ぶ' })).toBeEnabled();
    expect(importer.latest?.completedLineIndexes).toEqual([0]);
    expect(feedPurchaseExpenses.linkFeedPurchaseExpense).not.toHaveBeenCalled();
  });

  it('経費だけ失敗しても入庫済み品目を保ち、次品目を止めて経費だけを再試行する', async () => {
    const retry = deferred<ExpenseRecord>();
    vi.mocked(feedPurchaseExpenses.createFeedPurchaseExpense)
      .mockRejectedValueOnce(new Error('確認用：経費の保存に失敗しました。'))
      .mockReturnValueOnce(retry.promise);
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '書類の候補を反映' }));
    await enableDocumentExpense(user);
    await user.click(screen.getByRole('button', { name: '入庫と経費を登録' }));
    await screen.findByText('確認用：経費の保存に失敗しました。');
    expect(screen.getByText(/入庫は保存済みです。経費の保存結果を確認/)).toBeInTheDocument();
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    expect(importer.latest?.completedLineIndexes).toEqual([0]);
    expect(importer.latest?.disabled).toBe(true);
    expect(screen.getByRole('button', { name: '次の品目を選ぶ' })).toBeDisabled();
    expect(() => importer.latest!.onApply(selection(1))).toThrow(/経費はあとで確認/);
    expect(screen.getByLabelText('飼料名')).toHaveValue('検証用配合飼料');
    expect(screen.getByLabelText('飼料名')).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: '経費にも登録する' })).toBeDisabled();
    expect(screen.getByLabelText(/^支払日/)).toBeEnabled();
    expect(screen.getByLabelText(/^支払日/)).toHaveValue('2026-11-07');
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).toHaveTextContent('銀行振込');

    const form = screen.getByRole('button', { name: '経費の登録を再試行' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(feedPurchaseExpenses.createFeedPurchaseExpense).toHaveBeenCalledTimes(2));
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    expect(repository.getAllRecords).toHaveBeenCalledTimes(1);
    expect(feedPurchaseExpenses.prepareFeedPurchaseExpense).toHaveBeenCalledTimes(1);
    expect(feedPurchaseExpenses.bindFeedPurchaseExpenseReview).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ ready: true }), expect.objectContaining({ id: 'imported-entry-1' }));
    expect(importer.latest?.completedLineIndexes).toEqual([0]);

    await act(async () => { retry.resolve(savedExpense()); });
    await screen.findByText(/検証用配合飼料.*の入庫と経費を登録しました/);
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('確認用：経費の保存に失敗しました。')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '次の品目を選ぶ' })).toBeEnabled();
    expect(importer.latest?.completedLineIndexes).toEqual([0]);
    expect(feedPurchaseExpenses.linkFeedPurchaseExpense).not.toHaveBeenCalled();
  });

  it('経費をあとで確認する場合は入庫済み状態を残して次品目へ進み、支払入力を引き継がない', async () => {
    vi.mocked(feedPurchaseExpenses.createFeedPurchaseExpense)
      .mockRejectedValueOnce(new Error('確認用：経費の保存結果を確認できませんでした。'));
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '書類の候補を反映' }));
    await enableDocumentExpense(user);
    await user.click(screen.getByRole('button', { name: '入庫と経費を登録' }));
    await screen.findByText('確認用：経費の保存結果を確認できませんでした。');
    expect(importer.latest?.completedLineIndexes).toEqual([0]);
    expect(screen.getByRole('button', { name: '次の品目を選ぶ' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '経費はあとで確認' }));
    await screen.findByText(/検証用配合飼料.*を入庫登録しました/);
    expect(screen.queryByText('確認用：経費の保存結果を確認できませんでした。')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '経費の登録を再試行' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '次の品目を選ぶ' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '経費を確認・登録' })).toBeInTheDocument();
    expect(importer.latest?.completedLineIndexes).toEqual([0]);
    expect(screen.queryByText('飼料一覧に移動')).not.toBeInTheDocument();

    nextSelection = { ...importer.latest!.initialSelection!, lineIndex: 1 };
    await user.click(screen.getByRole('button', { name: '次の品目を選ぶ' }));
    expect(screen.getByLabelText('飼料名')).toHaveValue('検証用牧草');
    expect(screen.getByRole('checkbox', { name: '経費にも登録する' })).not.toBeChecked();
    expect(importer.latest?.completedLineIndexes).toEqual([0]);
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('checkbox', { name: '経費にも登録する' }));
    expect(screen.getByLabelText(/^支払日/)).toHaveValue('');
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).toHaveTextContent('選択してください');
    await user.click(screen.getByRole('checkbox', { name: '経費にも登録する' }));
    await user.click(screen.getByRole('button', { name: '入庫を登録' }));
    await screen.findByText(/検証用牧草.*を入庫登録しました/);
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(2);
    expect(inventoryApi.createFeedInventory).toHaveBeenNthCalledWith(2, expect.objectContaining({
      feedName: '検証用牧草', quantity: '5', unit: 'kg', totalPrice: '1100',
    }), expectedOwner);
    expect(importer.latest?.completedLineIndexes).toEqual([0, 1]);
    expect(feedPurchaseExpenses.prepareFeedPurchaseExpense).toHaveBeenCalledTimes(1);
    expect(feedPurchaseExpenses.createFeedPurchaseExpense).toHaveBeenCalledTimes(1);
    expect(feedPurchaseExpenses.linkFeedPurchaseExpense).not.toHaveBeenCalled();
  });

  it('明記された税抜19円・税1円を保持し、別品目で明示した税込0円も空欄にせず保存する', async () => {
    candidate.lines = [
      { ...emptyFeedDocumentLine, kind: 'feed', feedName: '端数確認用飼料',
        deliveryDate: '2026-11-01', quantity: '1', unit: 'kg', originalUnit: 'kg',
        grossYen: '20', netYen: '19', taxYen: '1', taxRate: '10' },
      { ...emptyFeedDocumentLine, kind: 'feed', feedName: 'ゼロ金額確認用飼料',
        deliveryDate: '2026-11-01', quantity: '1', unit: 'kg', originalUnit: 'kg',
        grossYen: '110', netYen: '100', taxYen: '10', taxRate: '10' },
    ];
    nextSelection = selection(0);
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '書類の候補を反映' }));
    expect(screen.getByLabelText('単価（税込）')).toHaveValue('');
    expect(screen.getByLabelText('金額（税込）')).toHaveValue('20');
    expect(screen.getByLabelText('税抜金額')).toHaveValue('19');
    expect(screen.getByLabelText('消費税額')).toHaveValue('1');
    await user.click(screen.getByRole('button', { name: '入庫を登録' }));
    await screen.findByText(/端数確認用飼料.*を入庫登録しました/);
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    expect(inventoryApi.createFeedInventory).toHaveBeenNthCalledWith(1, expect.objectContaining({
      unitPrice: '', totalPrice: '20', taxRate: '10', taxExcludedPrice: '19', taxAmount: '1',
    }), expectedOwner);

    nextSelection = { ...importer.latest!.initialSelection!, lineIndex: 1 };
    await user.click(screen.getByRole('button', { name: '次の品目を選ぶ' }));
    expect(screen.getByLabelText('単価（税込）')).toHaveValue('');
    expect(screen.getByLabelText('金額（税込）')).toHaveValue('110');
    await user.clear(screen.getByLabelText('金額（税込）'));
    await user.type(screen.getByLabelText('金額（税込）'), '0');
    expect(screen.getByLabelText('金額（税込）')).toHaveValue('0');
    expect(screen.getByLabelText('税抜金額')).toHaveValue('0');
    expect(screen.getByLabelText('消費税額')).toHaveValue('0');
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: '入庫を登録' }));
    await waitFor(() => expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(2));
    expect(inventoryApi.createFeedInventory).toHaveBeenNthCalledWith(2, expect.objectContaining({
      feedName: 'ゼロ金額確認用飼料', unitPrice: '', totalPrice: '0',
      taxRate: '10', taxExcludedPrice: '0', taxAmount: '0',
    }), expectedOwner);
  });

  it('同日・同飼料・同数量の入庫は金額やメモが違っても止め、別納品の明示確認を待つ', async () => {
    const existing = stored({
      transactionDate: '2026-11-01', transactionType: '入庫', sourceType: 'purchased',
      feedName: '検証用配合飼料', quantity: '2.0', unit: '袋', bagWeightKg: '20', totalWeightKg: '40',
      supplier: candidate.supplier, totalPrice: '9999', memo: '以前の納品書のメモ',
    }, 'existing-delivery');
    vi.mocked(repository.getAllRecords).mockResolvedValue([existing]);
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '書類の候補を反映' }));
    await user.click(screen.getByRole('button', { name: '入庫を登録' }));
    await screen.findByText(/同じ日付・飼料・数量の入庫があります/);
    expect(repository.getAllRecords).toHaveBeenCalledTimes(1);
    expect(inventoryApi.getFeedInventoryList).not.toHaveBeenCalled();
    expect(inventoryApi.createFeedInventory).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /2026-11-01.*検証用配合飼料.*を確認/ }))
      .toHaveAttribute('href', '/feed-inventory/existing-delivery/edit');
    await user.click(screen.getByRole('checkbox', { name: '別の納品分であることを確認して登録します' }));
    await user.click(screen.getByRole('button', { name: '入庫を登録' }));
    await waitFor(() => expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1));
    expect(repository.getAllRecords).toHaveBeenCalledTimes(2);
    expect(inventoryApi.getFeedInventoryList).not.toHaveBeenCalled();
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledWith(
      expect.objectContaining({ totalPrice: '2200' }), expectedOwner);
  });

  it.each(['farmId', 'id'] as const)('既存在庫の読み取り待ち中に%sが変わったら保存しない', async key => {
    const pending = deferred<inventoryApi.FeedInventoryRecord[]>();
    vi.mocked(repository.getAllRecords).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '書類の候補を反映' }));
    await user.click(screen.getByRole('button', { name: '入庫を登録' }));
    expect(repository.getAllRecords).toHaveBeenCalledTimes(1);
    expect(inventoryApi.createFeedInventory).not.toHaveBeenCalled();
    localStorage.setItem('farmpro.authUser', JSON.stringify({ ...owner, [key]: 'different-owner' }));
    await act(async () => { pending.resolve([]); });
    await screen.findByText(/ログイン中の農場が変わりました/);
    expect(inventoryApi.createFeedInventory).not.toHaveBeenCalled();
    expect(inventoryApi.getFeedInventoryList).not.toHaveBeenCalled();
  });

  it.each(['-1', 'Infinity'])('反映後の数量を%sへ変えた場合も正式保存前に止める', async quantity => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '書類の候補を反映' }));
    fireEvent.change(screen.getByLabelText(/数量/), { target: { value: quantity } });
    await user.click(screen.getByRole('button', { name: '入庫を登録' }));
    await screen.findByText(/数量を0より大きい数値で確認/);
    expect(inventoryApi.createFeedInventory).not.toHaveBeenCalled();
    expect(repository.getAllRecords).not.toHaveBeenCalled();
  });

  it('保存処理中の連続submitを1回に抑え、保存完了後は入力フォームを閉じる', async () => {
    const pending = deferred<inventoryApi.FeedInventoryRecord>();
    vi.mocked(inventoryApi.createFeedInventory).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '書類の候補を反映' }));
    const button = screen.getByRole('button', { name: '入庫を登録' });
    const form = button.closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1));
    expect(button).toBeDisabled();
    fireEvent.submit(form);
    expect(repository.getAllRecords).toHaveBeenCalledTimes(1);
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    const saved = stored(vi.mocked(inventoryApi.createFeedInventory).mock.calls[0][0], 'pending-entry');
    await act(async () => { pending.resolve(saved); });
    await screen.findByText(/を入庫登録しました/);
    expect(screen.queryByRole('button', { name: '入庫を登録' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '登録内容を確認' }))
      .toHaveAttribute('href', '/feed-inventory/pending-entry/edit');
    expect(importer.latest?.completedLineIndexes).toEqual([0]);
  });

  it('金額のない納品書は空欄を保ち、不明な税率を農場設定の10%で埋めない', async () => {
    candidate = { ...candidate, documentType: 'delivery-note', lines: [
      { ...emptyFeedDocumentLine, kind: 'feed', feedName: '金額未記載の確認用飼料',
        deliveryDate: '2026-11-01', quantity: '15', unit: 'kg', originalUnit: 'kg' },
    ] };
    nextSelection = selection(0);
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '書類の候補を反映' }));
    expect(settingsApi.getFarmSettings).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: '消費税率' })).toHaveTextContent('確認してください');
    await user.click(screen.getByRole('combobox', { name: '消費税率' }));
    await user.click(screen.getByRole('option', { name: '10%' }));
    expect(screen.getByRole('combobox', { name: '消費税率' })).toHaveTextContent('10%');
    await user.click(screen.getByRole('combobox', { name: '消費税率' }));
    await user.click(screen.getByRole('option', { name: '確認してください' }));
    expect(screen.getByRole('combobox', { name: '消費税率' })).toHaveTextContent('確認してください');
    expect(screen.getByLabelText('金額（税込）')).toHaveValue('');
    expect(screen.getByLabelText('税抜金額')).toHaveValue('');
    expect(screen.getByLabelText('消費税額')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: '入庫を登録' }));
    await waitFor(() => expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1));
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledWith(expect.objectContaining({
      quantity: '15', unitPrice: '', totalPrice: '', taxRate: undefined, taxExcludedPrice: '', taxAmount: '',
    }), expectedOwner);
  });
});
