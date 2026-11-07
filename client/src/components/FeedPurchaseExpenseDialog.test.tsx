import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedPurchaseExpenseDialog } from './FeedPurchaseExpenseDialog';
import type { FeedInventoryRecord } from '../services/feedInventoryApi';
import type { ExpenseRecord } from '../services/expensesApi';
import type { FeedPurchaseExpenseInput, FeedPurchaseExpenseReview } from '../services/feedPurchaseExpenses';

const api = vi.hoisted(() => ({
  load: vi.fn(),
  create: vi.fn(),
  link: vi.fn(),
  matching: vi.fn(),
  linkable: vi.fn(),
}));
vi.mock('../services/feedPurchaseExpenses', () => ({
  loadFeedPurchaseExpenseReview: api.load,
  createFeedPurchaseExpense: api.create,
  linkFeedPurchaseExpense: api.link,
  findMatchingFeedPurchaseExpenses: api.matching,
  isLinkableFeedPurchaseExpense: api.linkable,
}));

function purchase(overrides: Partial<FeedInventoryRecord> = {}): FeedInventoryRecord {
  return {
    id: 'fixture-purchase', transactionDate: '2026-10-20', feedName: '確認用配合飼料',
    transactionType: '入庫', sourceType: 'purchased', quantity: '2', unit: '袋',
    bagWeightKg: '20', totalWeightKg: '40', unitPrice: '1100', totalPrice: '2200',
    taxRate: '10', taxExcludedPrice: '2000', taxAmount: '200', supplier: '確認用仕入先',
    memo: '', createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z',
    ...overrides,
  };
}

function expense(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    id: 'fixture-expense', paymentDate: '2026-11-07', category: '飼料費',
    description: '確認済みの飼料代', vendor: '確認用仕入先', amount: '2200',
    paymentMethod: '銀行振込', target: '農場全体', memo: '元の経費のメモ',
    createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z',
    ...overrides,
  };
}

function review(overrides: Partial<FeedPurchaseExpenseReview> = {}): FeedPurchaseExpenseReview {
  // Ownership and source-version validation belong to the mocked service.
  return {
    purchase: purchase(), sourceId: 'feed-inventory:fixture-purchase', expenses: [],
    ...overrides,
  } as FeedPurchaseExpenseReview;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

function view(record: FeedInventoryRecord | null, onClose = vi.fn(), onSaved = vi.fn()) {
  return <MemoryRouter>
    <FeedPurchaseExpenseDialog record={record} onClose={onClose} onSaved={onSaved} />
  </MemoryRouter>;
}

async function fillPayment(user: ReturnType<typeof userEvent.setup>, date = '2026-11-07') {
  fireEvent.change(screen.getByLabelText(/^支払日/), { target: { value: date } });
  await user.click(screen.getByRole('combobox', { name: /^支払方法/ }));
  await user.click(screen.getByRole('option', { name: '銀行振込' }));
}

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  api.load.mockReset().mockResolvedValue(review());
  api.create.mockReset().mockResolvedValue(expense());
  api.link.mockReset().mockResolvedValue(expense());
  api.matching.mockReset().mockReturnValue([]);
  api.linkable.mockReset().mockReturnValue(true);
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('UI fixtures must not access record APIs'));
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  cleanup();
  vi.restoreAllMocks();
});

describe('FeedPurchaseExpenseDialog', () => {
  it('開いていない間は読み取りも保存もせず、開いても支払日や支払方法を補わない', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(view(null, onClose));
    expect(api.load).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(view(purchase(), onClose));
    const date = await screen.findByLabelText(/^支払日/);
    expect(date).toHaveValue('');
    expect(screen.getByRole('combobox', { name: /^支払方法/ })).toHaveTextContent('選択してください');
    expect(screen.getByLabelText(/^金額/)).toHaveValue('2200');
    expect(screen.getByLabelText('支払先')).toHaveValue('確認用仕入先');
    expect(screen.getByText('2026-10-20')).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.link).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '経費を登録' }));
    expect(screen.getByText('実際の支払日を入力してください。')).toBeInTheDocument();
    fireEvent.change(date, { target: { value: '2026-11-07' } });
    await user.click(screen.getByRole('button', { name: '経費を登録' }));
    expect(screen.getByText('支払方法を選択してください。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.create).not.toHaveBeenCalled();
    expect(api.link).not.toHaveBeenCalled();
  });

  it('確認した支払内容だけを1回保存し、保存中は閉じず、成功後の再登録を止める', async () => {
    const user = userEvent.setup();
    const pending = deferred<ExpenseRecord>();
    const currentReview = review();
    api.load.mockResolvedValue(currentReview);
    api.create.mockReturnValueOnce(pending.promise);
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(view(purchase(), onClose, onSaved));
    await screen.findByLabelText(/^支払日/);
    await fillPayment(user);
    await user.type(screen.getByLabelText('メモ（任意）'), '明細を確認');
    await user.dblClick(screen.getByRole('button', { name: '経費を登録' }));
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.create).toHaveBeenCalledWith(currentReview, {
      paymentDate: '2026-11-07', paymentMethod: '銀行振込', amount: '2200',
      vendor: '確認用仕入先', description: '確認用配合飼料 購入', memo: '明細を確認',
      allowSeparatePayment: false,
    });
    expect(screen.getByRole('button', { name: '閉じる' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    const saved = expense({ memo: '明細を確認' });
    await act(async () => { pending.resolve(saved); await pending.promise; });
    expect(await screen.findByText('経費に登録しました。')).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(saved);
    expect(screen.queryByRole('button', { name: '経費を登録' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '経費を開く' })).toHaveAttribute('href', '/expenses/fixture-expense/edit');
    expect(screen.getByRole('link', { name: '経費を開く' })).toHaveAttribute('target', '_blank');
    expect(api.link).not.toHaveBeenCalled();
  });

  it('同じ支払いの候補があれば別支払いの確認を要求し、入力変更後は確認を引き継がない', async () => {
    const user = userEvent.setup();
    const existing = expense();
    api.load.mockResolvedValue(review({ expenses: [existing] }));
    api.matching.mockImplementation((_review: FeedPurchaseExpenseReview, input: FeedPurchaseExpenseInput) =>
      input.paymentDate === existing.paymentDate && input.vendor === existing.vendor && input.amount === existing.amount
        ? [existing] : []);
    render(view(purchase()));
    await screen.findByLabelText(/^支払日/);
    await fillPayment(user);
    const save = () => screen.getByRole('button', { name: '経費を登録' });
    const confirmation = () => screen.getByRole('checkbox', { name: '表示された経費とは別の支払いです' });
    expect(save()).toBeDisabled();
    expect(screen.getByText('確認済みの飼料代')).toBeInTheDocument();
    await user.click(confirmation());
    expect(save()).toBeEnabled();
    await user.type(screen.getByLabelText('メモ（任意）'), '別伝票');
    expect(confirmation()).not.toBeChecked();
    expect(save()).toBeDisabled();
    expect(api.create).not.toHaveBeenCalled();
    await user.click(confirmation());
    await user.click(save());
    expect(api.create).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({
      allowSeparatePayment: true, memo: '別伝票',
    }));
  });

  it('既存経費は選択と同じ支払いの確認後だけ関連付け、元の支払内容を送信し直さない', async () => {
    const user = userEvent.setup();
    const existing = expense();
    const differentAmount = expense({ id: 'fixture-combined', description: 'まとめ払いの候補', amount: '4400' });
    const excluded = expense({ id: 'fixture-ineligible', description: 'ほかの記録に連動済み' });
    const currentReview = review({ expenses: [existing, differentAmount, excluded] });
    api.load.mockResolvedValue(currentReview);
    api.linkable.mockImplementation((value: ExpenseRecord) => value.id !== excluded.id);
    const onSaved = vi.fn();
    render(view(purchase(), vi.fn(), onSaved));
    await screen.findByLabelText(/^支払日/);
    await user.click(screen.getByRole('radio', { name: '登録済みの経費を選ぶ' }));
    const linkButton = () => screen.getByRole('button', { name: 'この経費と関連付ける' });
    expect(linkButton()).toBeDisabled();
    await user.click(screen.getByRole('combobox', { name: '登録済みの飼料費' }));
    expect(screen.getByRole('option', { name: /まとめ払いの候補/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('option', { name: /ほかの記録に連動済み/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /確認済みの飼料代/ }));
    expect(screen.getByText('元の経費のメモ')).toBeInTheDocument();
    expect(linkButton()).toBeDisabled();
    expect(api.link).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: '同じ支払いであることを確認しました' }));
    await user.click(linkButton());
    expect(api.link).toHaveBeenCalledExactlyOnceWith(currentReview, existing.id);
    expect(api.create).not.toHaveBeenCalled();
    expect(await screen.findByText('登録済みの経費と関連付けました。')).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(existing);
    expect(existing).toEqual(expense());
  });

  it('すでに関連付け済みなら経費の確認だけを表示し、新規作成や再関連付けを出さない', async () => {
    const linked = expense({ id: 'fixture-linked' });
    api.load.mockResolvedValue(review({ linkedExpense: linked }));
    render(view(purchase()));
    expect(await screen.findByText('この入庫には経費が関連付けられています。')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '経費を開く' })).toHaveAttribute('href', '/expenses/fixture-linked/edit');
    expect(screen.queryByRole('button', { name: '経費を登録' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'この経費と関連付ける' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^支払日/)).not.toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.link).not.toHaveBeenCalled();
  });

  it('購入を切り替えた後に古い読み取りが戻っても新しい購入や支払欄を上書きしない', async () => {
    const first = deferred<FeedPurchaseExpenseReview>();
    const second = deferred<FeedPurchaseExpenseReview>();
    api.load.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const firstRecord = purchase();
    const secondRecord = purchase({ id: 'fixture-purchase-B', feedName: '別の確認用飼料', totalPrice: '3300' });
    const { rerender } = render(view(firstRecord));
    await waitFor(() => expect(api.load).toHaveBeenCalledWith(firstRecord.id));
    rerender(view(secondRecord));
    await waitFor(() => expect(api.load).toHaveBeenCalledWith(secondRecord.id));
    await act(async () => { second.resolve(review({ purchase: secondRecord })); await second.promise; });
    expect(await screen.findByLabelText(/^金額/)).toHaveValue('3300');
    fireEvent.change(screen.getByLabelText(/^支払日/), { target: { value: '2026-11-08' } });
    await act(async () => { first.resolve(review({ purchase: firstRecord })); await first.promise; });
    expect(screen.getByText('別の確認用飼料')).toBeInTheDocument();
    expect(screen.queryByText('確認用配合飼料')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^金額/)).toHaveValue('3300');
    expect(screen.getByLabelText(/^支払日/)).toHaveValue('2026-11-08');
    expect(api.create).not.toHaveBeenCalled();
    expect(api.link).not.toHaveBeenCalled();
  });

  it('所有者や元記録の確認で保存を拒否された場合は、入力を保持して未完了を示す', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    api.load.mockResolvedValueOnce(review()).mockResolvedValueOnce(review({
      purchase: purchase({ totalPrice: '3300', updatedAt: '2026-11-07T01:00:00.000Z' }),
    }));
    api.create.mockRejectedValue(new Error('入庫内容が更新されています。画面を開き直してください。'));
    render(view(purchase(), vi.fn(), onSaved));
    await screen.findByLabelText(/^支払日/);
    await fillPayment(user);
    await user.type(screen.getByLabelText('メモ（任意）'), '保存前の確認内容');
    await user.click(screen.getByRole('button', { name: '経費を登録' }));
    expect(await screen.findByText('入庫内容が更新されています。画面を開き直してください。')).toBeInTheDocument();
    expect(screen.getByLabelText(/^支払日/)).toHaveValue('2026-11-07');
    expect(screen.getByLabelText('メモ（任意）')).toHaveValue('保存前の確認内容');
    expect(screen.queryByText('経費に登録しました。')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '閉じる' })).toBeEnabled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByText('読み直すと、入力中の支払内容は初期表示に戻ります。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '最新の内容を読み直す' }));
    expect(await screen.findByLabelText(/^金額/)).toHaveValue('3300');
    expect(screen.getByLabelText(/^支払日/)).toHaveValue('');
    expect(screen.getByLabelText('メモ（任意）')).toHaveValue('');
    expect(api.create).toHaveBeenCalledTimes(1);
  });

  it('金額のない購入の確認では在庫原価を転用せず、支払金額の入力を求める', async () => {
    const user = userEvent.setup();
    const currentPurchase = purchase({ totalPrice: '', taxExcludedPrice: '2000' });
    api.load.mockResolvedValue(review({ purchase: currentPurchase }));
    render(view(currentPurchase));
    await screen.findByLabelText(/^支払日/);
    expect(screen.getByLabelText(/^金額/)).toHaveValue('');
    await fillPayment(user);
    await user.click(screen.getByRole('button', { name: '経費を登録' }));
    expect(screen.getByText('金額は0より大きい数字で入力してください。')).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
  });
});
