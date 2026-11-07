import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedInventoryForm } from './FeedInventoryForm';
import * as inventoryApi from '../services/feedInventoryApi';
import * as paymentApi from '../services/feedPurchaseExpenses';
import * as settingsApi from '../services/settingsApi';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';
import type { ExpenseRecord } from '../services/expensesApi';

vi.mock('../components/FeedDocumentImport', () => ({ FeedDocumentImport: () => null }));
vi.mock('../components/FeedPurchaseExpenseDialog', () => ({
  FeedPurchaseExpenseDialog: ({ record }: any) => record ? <div role="dialog">経費確認</div> : null,
}));
vi.mock('../components/FeedSearchField', () => ({
  FeedSearchField: ({ value, onChange }: any) =>
    <input aria-label="飼料名" value={value} onChange={event => onChange(event.target.value)} />,
}));
vi.mock('../components/PartnerSearchField', () => ({
  PartnerSearchField: ({ label, value, onChange }: any) =>
    <input aria-label={label} value={value} onChange={event => onChange(event.target.value)} />,
}));

const owner = { id: 'inline-feed-user', farmId: 'inline-feed-farm', plan: 'free' };
const expense: ExpenseRecord = {
  id: 'existing-payment', category: '飼料費', paymentDate: '2026-11-07',
  amount: '2200', vendor: '検証用飼料店', description: '検証用配合飼料 購入',
  paymentMethod: '銀行振込', memo: '検証用メモ', target: '農場全体',
  createdAt: '2026-11-07T00:00:00Z', updatedAt: '2026-11-07T00:00:00Z',
};

function mount() {
  render(<MemoryRouter initialEntries={['/feed-inventory/new']}><Routes>
    <Route path="/feed-inventory/new" element={<FeedInventoryForm />} />
    <Route path="/feed-inventory" element={<div>飼料一覧に移動</div>} />
  </Routes></MemoryRouter>);
}
function fillPurchase() {
  fireEvent.change(screen.getByLabelText(/入出庫日/), { target: { value: '2026-11-07' } });
  fireEvent.change(screen.getByLabelText('飼料名'), { target: { value: '検証用配合飼料' } });
  fireEvent.change(screen.getByLabelText('仕入先'), { target: { value: '検証用飼料店' } });
  fireEvent.change(screen.getByLabelText(/数量/), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText(/単価（税込）/), { target: { value: '1100' } });
  fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '検証用メモ' } });
}
async function fillPayment(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '入庫日と同じ' }));
  await user.click(screen.getByRole('combobox', { name: /支払方法/ }));
  await user.click(screen.getByRole('option', { name: '銀行振込' }));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { resolve, promise };
}

beforeEach(() => {
  vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('farmpro.authUser', JSON.stringify(owner));
  vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ defaultTaxRate: '10' } as any);
  vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([]);
  vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([]);
  vi.spyOn(inventoryApi, 'createFeedInventory').mockImplementation(async input => ({
    ...input, id: 'inline-stock', createdAt: '2026-11-07T00:00:00Z', updatedAt: '2026-11-07T00:00:00Z',
  }));
  vi.spyOn(paymentApi, 'prepareFeedPurchaseExpense').mockImplementation(async (input, _owner, options) => ({
    input: { ...input }, expenses: options?.linkExpenseId ? [expense] : [], matchingExpenses: [],
    linkableExpenses: options?.linkExpenseId ? [expense] : [], ready: true, linkExpenseId: options?.linkExpenseId,
  }));
  vi.spyOn(paymentApi, 'bindFeedPurchaseExpenseReview').mockImplementation(async (prepared, purchase) => ({
    purchase, sourceId: 'feed-inventory:' + purchase.id, expenses: prepared.expenses,
  }));
  vi.spyOn(paymentApi, 'createFeedPurchaseExpense').mockResolvedValue(expense);
  vi.spyOn(paymentApi, 'linkFeedPurchaseExpense').mockResolvedValue(expense);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe('飼料在庫の新規登録で支払いもまとめて登録する', () => {
  it('支払日と方法は推測せず、入力が揃うまで入庫を保存しない', async () => {
    const user = userEvent.setup(); mount(); fillPurchase();
    expect(screen.getByRole('checkbox', { name: '経費にも登録する' })).toBeChecked();
    expect(screen.getByLabelText(/支払日/)).toHaveValue('');
    expect(screen.getByRole('combobox', { name: /支払方法/ })).toHaveTextContent('選択してください');
    await user.click(screen.getByRole('button', { name: '入庫と経費を登録' }));
    expect(paymentApi.prepareFeedPurchaseExpense).not.toHaveBeenCalled();
    expect(inventoryApi.createFeedInventory).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '入庫日と同じ' }));
    await user.click(screen.getByRole('button', { name: '入庫と経費を登録' }));
    expect(inventoryApi.createFeedInventory).not.toHaveBeenCalled();
  });

  it('購入金額と仕入先を再入力せず1回の保存で入庫と経費を登録し、追加dialogを開かない', async () => {
    const user = userEvent.setup(); mount(); fillPurchase(); await fillPayment(user);
    await user.click(screen.getByRole('button', { name: '入庫と経費を登録' }));
    await screen.findByText('飼料一覧に移動');
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledWith(expect.objectContaining({
      totalPrice: '2200', taxExcludedPrice: '2000', taxAmount: '200', supplier: '検証用飼料店',
    }), { farmId: owner.farmId, userId: owner.id });
    expect(paymentApi.prepareFeedPurchaseExpense).toHaveBeenCalledWith(expect.objectContaining({
      paymentDate: '2026-11-07', amount: '2200', vendor: '検証用飼料店', paymentMethod: '銀行振込',
      description: '検証用配合飼料 購入', memo: '検証用メモ',
    }), expect.objectContaining({ farmId: owner.farmId, userId: owner.id }), expect.anything());
    expect(paymentApi.createFeedPurchaseExpense).toHaveBeenCalledTimes(1);
    expect(vi.mocked(paymentApi.prepareFeedPurchaseExpense).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(inventoryApi.createFeedInventory).mock.invocationCallOrder[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('未払いではチェックを外して入庫だけ登録できる', async () => {
    const user = userEvent.setup(); mount(); fillPurchase();
    await user.click(screen.getByRole('checkbox', { name: '経費にも登録する' }));
    expect(screen.queryByLabelText(/支払日/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '入庫のみ登録' }));
    await screen.findByText('飼料一覧に移動');
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    expect(paymentApi.prepareFeedPurchaseExpense).not.toHaveBeenCalled();
    expect(paymentApi.createFeedPurchaseExpense).not.toHaveBeenCalled();
  });

  it('経費の金額チェックで止まった場合は入庫も保存しない', async () => {
    vi.mocked(paymentApi.prepareFeedPurchaseExpense).mockRejectedValueOnce(new Error('支払金額を確認してください。'));
    const user = userEvent.setup(); mount(); fillPurchase(); await fillPayment(user);
    fireEvent.change(screen.getByLabelText(/金額（税込）/), { target: { value: '0' } });
    await user.click(screen.getByRole('button', { name: '入庫と経費を登録' }));
    await screen.findByText('支払金額を確認してください。');
    expect(inventoryApi.createFeedInventory).not.toHaveBeenCalled();
    expect(paymentApi.createFeedPurchaseExpense).not.toHaveBeenCalled();
  });

  it.each(['existing', 'separate'])('似た経費を表示する間は保存せず、%sの明示選択後に1度だけ処理する', async choice => {
    vi.mocked(paymentApi.prepareFeedPurchaseExpense).mockImplementationOnce(async input => ({
      input, expenses: [expense], matchingExpenses: [expense], linkableExpenses: [expense], ready: false, message: '似た支払いを確認してください。',
    }));
    const user = userEvent.setup(); mount(); fillPurchase(); await fillPayment(user);
    await user.click(screen.getByRole('button', { name: '入庫と経費を登録' }));
    await screen.findByText('似た支払いを確認してください。');
    expect(inventoryApi.createFeedInventory).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /この登録済み経費を使う/ })).not.toBeChecked();
    await user.click(screen.getByRole('radio', { name: choice === 'existing' ? /この登録済み経費を使う/ : '別の支払いとして新しく登録' }));
    await user.click(screen.getByRole('button', { name: '入庫と経費を登録' }));
    await screen.findByText('飼料一覧に移動');
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    expect(paymentApi.prepareFeedPurchaseExpense).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowSeparatePayment: choice === 'separate' }), expect.anything(),
      expect.objectContaining({ reviewed: expect.objectContaining({ ready: false }),
        linkExpenseId: choice === 'existing' ? expense.id : undefined }));
    if (choice === 'existing') {
      expect(paymentApi.linkFeedPurchaseExpense).toHaveBeenCalledWith(expect.anything(), expense.id);
      expect(paymentApi.createFeedPurchaseExpense).not.toHaveBeenCalled();
    } else {
      expect(paymentApi.createFeedPurchaseExpense).toHaveBeenCalledTimes(1);
      expect(paymentApi.linkFeedPurchaseExpense).not.toHaveBeenCalled();
    }
  });

  it('経費保存の通信失敗後は入庫を固定し、同じ確認内容で経費だけ再試行する', async () => {
    vi.mocked(paymentApi.createFeedPurchaseExpense).mockRejectedValueOnce(new Error('経費の応答を確認できませんでした。'));
    const user = userEvent.setup(); mount(); fillPurchase(); await fillPayment(user);
    await user.click(screen.getByRole('button', { name: '入庫と経費を登録' }));
    await screen.findByText('経費の応答を確認できませんでした。');
    expect(screen.getByText(/入庫は保存済みです/)).toBeInTheDocument();
    expect(screen.getByLabelText(/数量/)).toBeDisabled();
    expect(screen.getByLabelText(/支払日/)).not.toBeDisabled();
    expect(screen.getByRole('checkbox', { name: '経費にも登録する' })).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '経費の登録を再試行' }));
    await screen.findByText('飼料一覧に移動');
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    expect(paymentApi.createFeedPurchaseExpense).toHaveBeenCalledTimes(2);
    expect(paymentApi.prepareFeedPurchaseExpense).toHaveBeenCalledTimes(1);
    const bindCalls = vi.mocked(paymentApi.bindFeedPurchaseExpenseReview).mock.calls;
    expect(bindCalls[1][0]).toBe(bindCalls[0][0]);
    expect(bindCalls[1][1]).toBe(bindCalls[0][1]);
  });

  it('支払日や方法を再入力せず既存の経費を選べ、応答が失われても同じ選択で再試行できる', async () => {
    vi.mocked(paymentApi.prepareFeedPurchaseExpense).mockImplementationOnce(async input => ({
      input, expenses: [expense], matchingExpenses: [], linkableExpenses: [expense], ready: false,
    }));
    vi.mocked(paymentApi.linkFeedPurchaseExpense).mockRejectedValueOnce(new Error('紐付けの応答を確認できませんでした。'));
    const user = userEvent.setup(); mount(); fillPurchase();
    await user.click(screen.getByRole('button', { name: '登録済みの経費を確認' }));
    await screen.findByRole('radio', { name: /この登録済み経費を使う/ });
    expect(paymentApi.prepareFeedPurchaseExpense).toHaveBeenCalledWith(expect.objectContaining({
      paymentDate: '', paymentMethod: '',
    }), expect.anything(), { reviewOnly: true });
    expect(inventoryApi.createFeedInventory).not.toHaveBeenCalled();
    await user.click(screen.getByRole('radio', { name: /この登録済み経費を使う/ }));
    expect(screen.getByLabelText(/^支払日/)).not.toBeRequired();
    await user.click(screen.getByRole('button', { name: '入庫と経費を登録' }));
    await screen.findByText('紐付けの応答を確認できませんでした。');
    expect(screen.getByLabelText(/^支払日/)).not.toBeRequired();
    await user.click(screen.getByRole('button', { name: '経費の登録を再試行' }));
    await screen.findByText('飼料一覧に移動');
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    expect(paymentApi.prepareFeedPurchaseExpense).toHaveBeenCalledTimes(2);
    expect(paymentApi.linkFeedPurchaseExpense).toHaveBeenCalledTimes(2);
    expect(paymentApi.createFeedPurchaseExpense).not.toHaveBeenCalled();
  });

  it('保存中に連続submitされても入庫と経費は1件ずつ登録する', async () => {
    const pending = deferred<ExpenseRecord>();
    vi.mocked(paymentApi.createFeedPurchaseExpense).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup(); mount(); fillPurchase(); await fillPayment(user);
    const form = screen.getByRole('button', { name: '入庫と経費を登録' }).closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form);
    await waitFor(() => expect(paymentApi.createFeedPurchaseExpense).toHaveBeenCalledTimes(1));
    fireEvent.submit(form);
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(expense); });
    await screen.findByText('飼料一覧に移動');
    expect(paymentApi.createFeedPurchaseExpense).toHaveBeenCalledTimes(1);
  });

  it('入庫保存中に農場が切り替わっても保存済み記録を保持し、別農場で再登録しない', async () => {
    const pending = deferred<inventoryApi.FeedInventoryRecord>();
    vi.mocked(inventoryApi.createFeedInventory).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup(); mount(); fillPurchase(); await fillPayment(user);
    await user.click(screen.getByRole('button', { name: '入庫と経費を登録' }));
    await waitFor(() => expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1));
    localStorage.setItem('farmpro.authUser', JSON.stringify({ ...owner, farmId: 'different-farm' }));
    const input = vi.mocked(inventoryApi.createFeedInventory).mock.calls[0][0];
    await act(async () => { pending.resolve({ ...input, id: 'saved-before-switch',
      createdAt: '2026-11-07T00:00:00Z', updatedAt: '2026-11-07T00:00:00Z' }); });
    await screen.findByText(/ログインまたは農場の情報が変わった/);
    expect(screen.getByText(/入庫は保存済みです/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '経費の登録を再試行' }));
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    expect(paymentApi.createFeedPurchaseExpense).not.toHaveBeenCalled();
    localStorage.setItem('farmpro.authUser', JSON.stringify(owner));
    await user.click(screen.getByRole('button', { name: '経費の登録を再試行' }));
    await screen.findByText('飼料一覧に移動');
    expect(inventoryApi.createFeedInventory).toHaveBeenCalledTimes(1);
    expect(paymentApi.createFeedPurchaseExpense).toHaveBeenCalledTimes(1);
  });

  it('自家製入庫・出庫・調整には支払い欄を出さない', async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('combobox', { name: /入庫元/ }));
    await user.click(screen.getByRole('option', { name: '自家製' }));
    expect(screen.queryByText('支払い・経費')).not.toBeInTheDocument();
    for (const value of ['出庫', '調整']) {
      await user.click(screen.getByRole('combobox', { name: /区分/ }));
      await user.click(screen.getByRole('option', { name: value }));
      expect(screen.queryByText('支払い・経費')).not.toBeInTheDocument();
    }
  });
});
