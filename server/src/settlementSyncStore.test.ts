import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ files: new Map<string, unknown>(), farm: 'farm-a', writes: 0 }));
vi.mock('./jsonStore', () => ({
  readJson: vi.fn(async (name: string, fallback: unknown) => state.files.get(state.farm + '/' + name) ?? fallback),
  writeJson: vi.fn(async (name: string, value: unknown) => {
    state.writes++;
    state.files.set(state.farm + '/' + name, structuredClone(value));
  }),
}));

import { commitCloudSettlement, getCloudSettlement, type CloudSettlementBundle } from './settlementSyncStore';

const makeBundle = (saleId: string): CloudSettlementBundle => ({
  settlement: {
    saleId, settlementNumber: 'TEST-001', expectedNetYen: 499000,
    expenseIds: ['expense-test-1'], createdAt: '2026-10-24T00:00:00.000Z',
  },
  expenses: [{
    id: 'expense-test-1', paymentDate: '2026-04-21', category: '手数料',
    description: 'テスト市場手数料', vendor: 'テストJA', amount: '1000', target: 'TEST5954',
  }],
});

describe('cloud settlement bundle foundations', () => {
  it('stores the settlement and its expense snapshot together', async () => {
    state.files.clear(); state.farm = 'farm-a'; state.writes = 0;
    const bundle = makeBundle('sale-one');
    await commitCloudSettlement(bundle);
    expect(await getCloudSettlement('sale-one')).toEqual(bundle);
    expect(state.writes).toBe(1);
  });

  it('rejects duplicate settlement for the same sale without adding expenses', async () => {
    state.files.clear(); state.farm = 'farm-a'; state.writes = 0;
    await commitCloudSettlement(makeBundle('sale-one'));
    await expect(commitCloudSettlement(makeBundle('sale-one'))).rejects.toThrow('CLOUD_SETTLEMENT_EXISTS');
    expect(state.writes).toBe(1);
    expect(await getCloudSettlement('sale-one')).toEqual(makeBundle('sale-one'));
  });

  it('keeps farms isolated through the farm-scoped store', async () => {
    state.files.clear(); state.farm = 'farm-a';
    await commitCloudSettlement(makeBundle('sale-one'));
    state.farm = 'farm-b';
    expect(await getCloudSettlement('sale-one')).toBeNull();
    await commitCloudSettlement(makeBundle('sale-one'));
    expect(await getCloudSettlement('sale-one')).toEqual(makeBundle('sale-one'));
    state.farm = 'farm-a';
    expect(await getCloudSettlement('sale-one')).toEqual(makeBundle('sale-one'));
  });

  it('rejects mismatched expense IDs without a partial write', async () => {
    state.files.clear(); state.farm = 'farm-a'; state.writes = 0;
    const bundle = makeBundle('sale-one');
    bundle.settlement.expenseIds = ['wrong-id'];
    await expect(commitCloudSettlement(bundle)).rejects.toThrow('INVALID_CLOUD_SETTLEMENT');
    expect(state.writes).toBe(0);
    expect(await getCloudSettlement('sale-one')).toBeNull();
  });
});
