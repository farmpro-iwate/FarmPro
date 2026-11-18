import { describe, expect, it } from 'vitest';
import { findPlannedSoldPairs, isSameSaleAnimal } from './saleDuplicateGuard';
import type { SaleRecord } from '../services/salesApi';

const record = (values: Partial<SaleRecord>): SaleRecord => ({
  id: 'planned', targetType: '子牛', targetNumber: '6408', targetName: '嘉鶴',
  sex: '', birthday: '2026-01-01', motherName: '', calfId: 'calf-6408',
  shippingPlanDate: '2026-11-18', shippingDate: '', saleDate: '', buyer: '', marketName: '',
  saleWeight: '', salePrice: '', status: '出荷予定', reason: '', memo: '',
  createdAt: '', updatedAt: '', ...values,
});

describe('予定と販売済みの重複検知（読み取り専用）', () => {
  it('同じ子牛の別IDの予定と販売済みを検出し、記録は変更しない', () => {
    const planned = record({});
    const sold = record({ id: 'sold', status: '販売済み', saleDate: '2026-11-18', salePrice: '865000' });
    const original = JSON.stringify([planned, sold]);
    expect(findPlannedSoldPairs([planned, sold])).toEqual([{ planned, sold }]);
    expect(JSON.stringify([planned, sold])).toBe(original);
  });
  it('異なる牛、異なる生年月日の番号再利用、同一レコードは検出しない', () => {
    const base = record({});
    expect(isSameSaleAnimal(base, record({ id: 'other', calfId: 'other', targetNumber: '6409' }))).toBe(false);
    expect(isSameSaleAnimal(
      record({ calfId: '', birthday: '2025-01-01' }),
      record({ calfId: '', birthday: '2026-01-01' }),
    )).toBe(false);
    expect(findPlannedSoldPairs([base])).toEqual([]);
  });
  it('名号だけの一致は重複と判断しない', () => {
    expect(isSameSaleAnimal(record({ calfId: '', targetNumber: '' }), record({ calfId: '', targetNumber: '' }))).toBe(false);
  });
});
