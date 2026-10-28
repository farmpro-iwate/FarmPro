import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthToken, getStoredAuthUser } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { clearCloudSettlementAttempt, hasPendingCloudSettlement, submitCloudSettlement,
  CloudSettlementRejectedError, type CloudSettlementSaveInput } from './cloudSettlementSave';

vi.mock('./authClient', () => ({ getAuthToken: vi.fn(), getStoredAuthUser: vi.fn() }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: vi.fn() }));

const input: CloudSettlementSaveInput = {
  confirmed: true,
  expectedSale: { targetType: '子牛', targetNumber: 'TEST5954', targetName: '検証牛', birthday: '2026-01-01', saleDate: '2026-10-27' },
  grossYen: 500000, adjustmentYen: 0,
  deductions: [{ label: '市場手数料', amountYen: 10000 }],
  bundle: {
    settlement: { saleId: 'sale:one', settlementNumber: 'S-1', expectedNetYen: 490000,
      expenseIds: ['expense:new'], linkedExpenseIds: [], createdAt: '2026-10-27T00:00:00Z' },
    expenses: [{ id: 'expense:new', paymentDate: '2026-10-27', category: '手数料',
      description: '市場手数料', vendor: '市場', amount: '10000', target: 'TEST5954' }],
  },
};

describe('formal cloud settlement transport', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    vi.mocked(getAuthToken).mockReturnValue('test-session');
    vi.mocked(getStoredAuthUser).mockReturnValue({ farmId: 'farm-a', plan: 'standard' } as ReturnType<typeof getStoredAuthUser>);
    vi.mocked(getCurrentFarmProPlanId).mockReturnValue('standard');
    vi.stubGlobal('fetch', vi.fn());
  });

  it('requires confirmation, paid entitlement, and the same signed-in farm before any POST', async () => {
    await expect(submitCloudSettlement({ ...input, confirmed: false } as unknown as CloudSettlementSaveInput, 'farm-a')).rejects.toThrow('確認');
    vi.mocked(getCurrentFarmProPlanId).mockReturnValue('free');
    await expect(submitCloudSettlement(input, 'farm-a')).rejects.toThrow('Standard');
    vi.mocked(getCurrentFarmProPlanId).mockReturnValue('standard');
    await expect(submitCloudSettlement(input, 'farm-b')).rejects.toThrow('農場');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records uncertainty before sending and never automatically repeats a lost request', async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      expect(hasPendingCloudSettlement('farm-a', 'sale:one')).toBe(true);
      throw new TypeError('network lost');
    });
    await expect(submitCloudSettlement(input, 'farm-a')).rejects.toThrow('network lost');
    await expect(submitCloudSettlement(input, 'farm-a')).rejects.toThrow('未確認');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(hasPendingCloudSettlement('farm-b', 'sale:one')).toBe(false);
  });

  it('retains the pending marker for uncertain 503 and malformed success responses', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await expect(submitCloudSettlement(input, 'farm-a')).rejects.toThrow('登録結果');
    expect(hasPendingCloudSettlement('farm-a', 'sale:one')).toBe(true);
    clearCloudSettlementAttempt('farm-a', 'sale:one');
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ registered: true, saleId: 'different-sale' }));
    await expect(submitCloudSettlement(input, 'farm-a')).rejects.toThrow('応答');
    expect(hasPendingCloudSettlement('farm-a', 'sale:one')).toBe(true);
  });

  it('distinguishes a server validation rejection from an unknown save', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ message: '販売金額が一致しません' }, { status: 409 }));
    await expect(submitCloudSettlement(input, 'farm-a')).rejects.toBeInstanceOf(CloudSettlementRejectedError);
    expect(hasPendingCloudSettlement('farm-a', 'sale:one')).toBe(false);
  });

  it('sends exactly the confirmed input with the existing bearer session', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ registered: true, saleId: 'sale:one' }, { status: 201 }));
    await submitCloudSettlement(input, 'farm-a');
    expect(fetch).toHaveBeenCalledWith('/api/expenses/settlement-sync', expect.objectContaining({
      method: 'POST', headers: { Authorization: 'Bearer test-session', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }));
    expect(hasPendingCloudSettlement('farm-a', 'sale:one')).toBe(true);
  });
});
