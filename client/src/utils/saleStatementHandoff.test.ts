import { describe, expect, it } from 'vitest';
import { createSaleStatementHandoff, readSaleStatementHandoff } from './saleStatementHandoff';
import { emptySaleStatementCandidate } from './saleStatementImport';

const owner = { id: 'test-user', farmId: 'test-farm' };
const sale = { id: 'test-sale', targetType: '子牛', targetNumber: '1201', targetName: '確認用子牛', calfId: '12', birthday: '2026-01-02' };
const candidate = { ...emptySaleStatementCandidate, documentType: 'sale-settlement' as const, animalCount: '1',
  grossYen: '110000', netYen: '106200', deductionTotalYen: '3800',
  deductions: [{ label: '確認用手数料', amountYen: '4000' }], adjustments: [{ label: '戻し金', amountYen: '200' }] };

describe('販売精算書候補の引継ぎ範囲', () => {
  const state = { farmproSaleStatement: createSaleStatementHandoff(candidate, owner, sale) };
  it('同じ利用者・農場・販売・個体にだけ候補を渡す', () => {
    expect(readSaleStatementHandoff(state, owner, sale)).toEqual(candidate);
  });
  it.each([
    [{ ...owner, farmId: 'different-farm' }, sale],
    [{ ...owner, id: 'different-user' }, sale],
    [null, sale],
    [owner, { ...sale, id: 'different-sale' }],
    [owner, { ...sale, targetNumber: '1202' }],
    [owner, { ...sale, calfId: '13' }],
  ])('別の所有者や記録には候補を採用しない', (currentOwner, currentSale) => {
    expect(readSaleStatementHandoff(state, currentOwner, currentSale)).toBeNull();
  });
  it('壊れた履歴や候補を採用しない', () => {
    expect(readSaleStatementHandoff({}, owner, sale)).toBeNull();
    expect(readSaleStatementHandoff({ farmproSaleStatement: { ...state.farmproSaleStatement, candidate: { grossYen: '110000' } } }, owner, sale)).toBeNull();
  });
});
