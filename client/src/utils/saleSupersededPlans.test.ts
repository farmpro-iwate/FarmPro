import { describe, expect, it } from 'vitest';
import type { SaleRecord } from '../services/salesApi';
import { findSupersededShippingPairs, findSupersededShippingPlans } from './saleSupersededPlans';

const plan = {
  id: 'planned-6408', targetType: '子牛', targetNumber: '6408', targetName: '嘉鶴',
  birthday: '2026-02-06', calfId: '', status: '出荷予定',
  shippingPlanDate: '2026-11-18', shippingDate: '', saleDate: '', salePrice: '',
} as SaleRecord;
const sold = {
  ...plan, id: 'sold-6408', status: '販売済み', saleDate: '2026-11-18',
  salePrice: '865000', saleWeight: '335',
} as SaleRecord;

describe('既存の予定と販売済みの読み取り専用照合', () => {
  it('6408と6409をそれぞれ一対一で結び、販売記録と金額は書き換えない', () => {
    const planned6409 = { ...plan, id: 'planned-6409', targetNumber: '6409',
      targetName: '嘉福', birthday: '2026-02-10' } as SaleRecord;
    const sold6409 = { ...planned6409, id: 'sold-6409', status: '販売済み',
      saleDate: '2026-11-18', salePrice: '852000' } as SaleRecord;
    const rows = [plan, sold, planned6409, sold6409];
    const before = JSON.stringify(rows);
    expect(findSupersededShippingPairs(rows).map(({ planned, sold }) =>
      [planned.id, sold.id, sold.salePrice])).toEqual([
      ['planned-6408', 'sold-6408', '865000'],
      ['planned-6409', 'sold-6409', '852000'],
    ]);
    expect(JSON.stringify(rows)).toBe(before);
  });
  it('同じ子牛に複数の販売記録がある時は自動対応付けしない', () => {
    expect(findSupersededShippingPairs([plan, sold, { ...sold, id: 'second-sold' }])).toEqual([]);
  });
});

describe('販売済みと対応する古い出荷予定の安全な表示整理', () => {
  it('6408の予定のみを表示整理対象にし、元の販売記録を変更しない', () => {
    const rows = [plan, sold];
    expect(findSupersededShippingPlans(rows).map(row => row.id)).toEqual(['planned-6408']);
    expect(rows).toEqual([plan, sold]);
    expect(sold.salePrice).toBe('865000');
  });
  it('同日でも個体番号や生年月日が異なる場合は対象にしない', () => {
    expect(findSupersededShippingPlans([plan, { ...sold, targetNumber: '6409' }])).toEqual([]);
    expect(findSupersededShippingPlans([plan, { ...sold, birthday: '2025-02-06' }])).toEqual([]);
    expect(findSupersededShippingPlans([{ ...plan, birthday: '' }, sold])).toEqual([]);
    expect(findSupersededShippingPlans([plan, { ...sold, birthday: '' }])).toEqual([]);
    expect(findSupersededShippingPlans([plan, { ...sold, saleDate: '2026-11-19' }])).toEqual([]);
  });
  it('不完全な取引や別の個体IDの組み合わせは対象にしない', () => {
    expect(findSupersededShippingPlans([plan, { ...sold, salePrice: '' }])).toEqual([]);
    expect(findSupersededShippingPlans([{ ...plan, salePrice: '100' }, sold])).toEqual([]);
    expect(findSupersededShippingPlans([{ ...plan, calfId: 'a' }, { ...sold, calfId: 'b' }])).toEqual([]);
    expect(findSupersededShippingPlans([{ ...plan, shippingPlanDate: '' }, sold])).toEqual([]);
  });
  it('同じ牛に出荷予定が複数ある時はどれも非表示にしない', () => {
    const duplicate = { ...plan, id: 'another-plan' };
    expect(findSupersededShippingPlans([plan, duplicate, sold])).toEqual([]);
    expect(findSupersededShippingPlans([plan, sold, { ...sold, id: 'other-sale' }])).toEqual([]);
  });
});
