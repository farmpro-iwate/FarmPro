import { describe, expect, it } from 'vitest';
import { findMatchingPlannedSales, promotePlannedSaleInput } from './salePlanPromotion';
import type { SaleRecord, SaleInput } from '../services/salesApi';

const plan: SaleRecord = {
  id: 'planned-6408', targetType: '子牛', targetNumber: '6408', targetName: '嘉鶴',
  sex: '雄', birthday: '2026-02-06', motherName: '', calfId: 'calf-6408',
  shippingPlanDate: '2026-11-18', shippingDate: '', saleDate: '', buyer: '',
  marketName: '岩手中央家畜市場', saleWeight: '', salePrice: '', status: '出荷予定',
  reason: '', memo: '市場出荷予定から登録', createdAt: '2026-10-06', updatedAt: '2026-10-06',
};
const confirmed: SaleInput = {
  targetType: '子牛', targetNumber: '6408', targetName: '嘉鶴',
  sex: '雄', birthday: '2026-02-06', motherName: '', calfId: 'calf-6408',
  shippingPlanDate: '', shippingDate: '', saleDate: '2026-11-18', buyer: '買受人',
  marketName: '', saleWeight: '335', salePrice: '865000', status: '販売済み',
  reason: '', memo: '',
};

describe('出荷予定を販売精算へ引き継ぐ判断', () => {
  it('同一個体IDの出荷予定だけを選び、販売金額と元の出荷予定日を残す', () => {
    const match = findMatchingPlannedSales([plan], confirmed);
    expect(match.map(x => x.id)).toEqual(['planned-6408']);
    const input = promotePlannedSaleInput(plan, confirmed);
    expect(input).toMatchObject({
      targetNumber: '6408', status: '販売済み', salePrice: '865000',
      saleDate: '2026-11-18', shippingPlanDate: '2026-11-18',
      marketName: '岩手中央家畜市場', buyer: '買受人',
    });
    expect(plan.status).toBe('出荷予定');
    expect(plan.salePrice).toBe('');
  });
  it('個体IDが不明な場合は番号と生年月日の両方を要求する', () => {
    const missingId = { ...confirmed, calfId: '' };
    expect(findMatchingPlannedSales([{ ...plan, calfId: '' }], missingId)).toHaveLength(1);
    expect(findMatchingPlannedSales([{ ...plan, calfId: '', birthday: '' }], missingId)).toHaveLength(0);
    expect(findMatchingPlannedSales([{ ...plan, calfId: '', birthday: '2025-02-06' }], missingId)).toHaveLength(0);
    expect(findMatchingPlannedSales([{ ...plan, calfId: '', targetNumber: '6409' }], missingId)).toHaveLength(0);
  });
  it('販売済みを引き継ぎ対象にせず、複数候補はすべて返して呼び出し元で停止できる', () => {
    expect(findMatchingPlannedSales([{ ...plan, status: '販売済み' }], confirmed)).toEqual([]);
    expect(findMatchingPlannedSales([plan, { ...plan, id: 'another-plan' }], confirmed)).toHaveLength(2);
  });
});
