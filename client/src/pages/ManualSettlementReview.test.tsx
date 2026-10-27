import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManualSettlementReview } from './ManualSettlementReview';
import { getSale, type SaleRecord } from '../services/salesApi';
import { getExpensesList, type ExpenseRecord } from '../services/expensesApi';
import { getSavedSettlement, saveManualSettlement } from '../services/manualSettlementSave';
import { getAuthToken, getStoredAuthUser } from '../services/authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import type { CloudSettlementSaveInput } from '../services/cloudSettlementSave';

vi.mock('../services/salesApi', () => ({ getSale: vi.fn() }));
vi.mock('../services/expensesApi', () => ({ getExpensesList: vi.fn(), retryPendingExpenseSync: vi.fn() }));
vi.mock('../services/manualSettlementSave', () => ({ getSavedSettlement: vi.fn(), saveManualSettlement: vi.fn() }));
vi.mock('../services/authClient', () => ({ getAuthToken: vi.fn(), getStoredAuthUser: vi.fn() }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: vi.fn() }));

const sale = {
  id: 'local-sale', syncRecordId: 'sale:cloud-sale', targetType: '子牛',
  targetNumber: 'TEST5954', targetName: '検証牛', birthday: '2026-01-01',
  calfId: 'calf-one', cattleId: '', saleDate: '2026-10-27', salePrice: '500000', status: '販売済み',
} as SaleRecord;
const linkedExpense = {
  id: 'local-expense', syncRecordId: 'expense:cloud-expense', amount: '10000',
  description: '市場手数料', category: '手数料', paymentDate: '2026-10-27',
  target: 'TEST5954', animalEarTag: 'TEST5954',
  animalType: 'calf', animalId: 'calf-one',
} as ExpenseRecord;

function mountPage() {
  return render(<MemoryRouter initialEntries={['/sales/local-sale/settlement']}>
    <Routes><Route path="/sales/:id/settlement" element={<ManualSettlementReview />} /></Routes>
  </MemoryRouter>);
}
async function fillForm() {
  await screen.findByText('保存前の照合が完了しました。明細を入力して確認してください。');
  for (const [label, value] of [
    ['精算番号', 'S-1'], ['差引精算額（円）', '490000'], ['控除名', '市場手数料'],
    ['控除額（税込円）', '10000'], ['精算日', '2026-10-27'], ['支払先', '市場'],
  ]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  await waitFor(() => expect(screen.getByRole('button', { name: '内容を確認して正式保存' })).toBeEnabled());
}

describe('formal settlement confirmation and recovery', () => {
  let registered: boolean;
  let offline: boolean;
  let failPost: 'before' | 'after' | null;
  let posted: CloudSettlementSaveInput | null;
  let postCount: number;

  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    registered = false; offline = false; failPost = null; posted = null; postCount = 0;
    vi.mocked(getCurrentFarmProPlanId).mockReturnValue('standard');
    vi.mocked(getAuthToken).mockReturnValue('test-session');
    vi.mocked(getStoredAuthUser).mockReturnValue({ farmId: 'farm-one', plan: 'standard' } as ReturnType<typeof getStoredAuthUser>);
    vi.mocked(getSale).mockResolvedValue(sale);
    vi.mocked(getExpensesList).mockResolvedValue([linkedExpense]);
    vi.mocked(getSavedSettlement).mockResolvedValue(null);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        postCount += 1;
        posted = JSON.parse(String(init.body));
        if (failPost === 'before') { offline = true; throw new TypeError('network lost'); }
        registered = true;
        if (failPost === 'after') throw new TypeError('response lost');
        return Response.json({ registered: true, saleId: sale.syncRecordId }, { status: 201 });
      }
      if (offline) throw new TypeError('offline');
      if (String(url).endsWith('/details')) {
        return Response.json({
          settlement: {
            saleId: sale.syncRecordId, settlementNumber: 'S-1', expectedNetYen: 490000,
            grossYen: 500000, adjustmentYen: 0,
            expenseIds: posted?.bundle.settlement.expenseIds || [],
            linkedExpenseIds: posted?.bundle.settlement.linkedExpenseIds || [],
            deductions: posted?.deductions || [{ label: '市場手数料', amountYen: 10000 }],
            createdAt: '2026-10-27T00:00:00Z',
          },
          expenses: posted?.bundle.expenses || [],
        });
      }
      return Response.json({ saleId: sale.syncRecordId, registered, saleReady: true, settlementNumber: registered ? 'S-1' : null });
    }));
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('shows exact confirmation, allows cancellation, then saves once and refreshes projected expenses', async () => {
    const user = userEvent.setup();
    mountPage();
    await fillForm();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await user.click(screen.getByRole('button', { name: '内容を確認して正式保存' }));
    expect(postCount).toBe(0);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('販売金額：500,000円'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('市場手数料：10,000円'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('差引支払額：490,000円'));
    await user.click(screen.getByRole('button', { name: '内容を確認して正式保存' }));
    await screen.findByText('販売精算は登録済みです。');
    await waitFor(() => expect(getExpensesList).toHaveBeenCalledTimes(2));
    expect(postCount).toBe(1);
    expect(posted).toMatchObject({ confirmed: true, grossYen: 500000, expectedSale: {
      targetNumber: 'TEST5954', targetType: '子牛', targetName: '検証牛', birthday: '2026-01-01',
      saleDate: '2026-10-27', calfId: 'calf-one', cattleId: '',
    } });
    expect(saveManualSettlement).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '内容を確認して正式保存' })).not.toBeInTheDocument();
  });

  it('links the canonical cloud expense ID without creating another expense', async () => {
    const user = userEvent.setup();
    mountPage();
    await fillForm();
    await user.click(screen.getByLabelText('登録済み経費と紐づけ（任意）'));
    await user.click(screen.getByRole('option', { name: /市場手数料 \/ 10000円/ }));
    await user.click(screen.getByRole('button', { name: '内容を確認して正式保存' }));
    await screen.findByText('販売精算は登録済みです。');
    expect(posted).toMatchObject({ deductions: [{ label: '市場手数料', amountYen: 10000, expenseId: 'expense:cloud-expense' }],
      bundle: { settlement: { linkedExpenseIds: ['expense:cloud-expense'], expenseIds: [],
        paymentDate: '2026-10-27', vendor: '市場' }, expenses: [] } });
    expect(postCount).toBe(1);
  });

  it('recovers a lost success response by reading the saved settlement, without a second POST', async () => {
    failPost = 'after';
    mountPage();
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: '内容を確認して正式保存' }));
    await screen.findByText('販売精算は登録済みです。');
    await screen.findByText('登録済み精算');
    expect(postCount).toBe(1);
    expect(screen.queryByRole('button', { name: '内容を確認して正式保存' })).not.toBeInTheDocument();
  });

  it('keeps an uncertain request locked across reload until an explicit status check, then requires fresh confirmation', async () => {
    failPost = 'before';
    const first = mountPage();
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: '内容を確認して正式保存' }));
    await screen.findByText('通信が切れたため登録結果は不明です。再送信せず、通信回復後に精算状況を確認してください');
    expect(postCount).toBe(1);
    first.unmount();
    offline = false; failPost = null;
    mountPage();
    await screen.findByText('前回の保存結果を確認中です。登録状況を再確認してください。');
    expect(screen.getByRole('button', { name: '内容を確認して正式保存' })).toBeDisabled();
    expect(postCount).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: '登録状況を再確認' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '内容を確認して正式保存' })).toBeEnabled());
    expect(postCount).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: '内容を確認して正式保存' }));
    await screen.findByText('販売精算は登録済みです。');
    expect(postCount).toBe(2);
    expect(window.confirm).toHaveBeenCalledTimes(2);
  });

  it('opens an existing settlement on another device as read-only', async () => {
    registered = true;
    mountPage();
    await screen.findByText('登録済み精算');
    expect(screen.getByText('差引精算額：490,000円')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '内容を確認して正式保存' })).not.toBeInTheDocument();
    expect(postCount).toBe(0);
    expect(saveManualSettlement).not.toHaveBeenCalled();
  });
});
