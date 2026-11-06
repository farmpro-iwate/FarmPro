import { describe, expect, it } from 'vitest';
import { emptyFeedInventoryInput, type FeedInventoryRecord } from '../services/feedInventoryApi';
import { findPotentialFeedDocumentDuplicates } from './feedDocumentEntry';

const incoming = { ...emptyFeedInventoryInput, transactionDate: '2026-10-24', feedName: '確認用配合飼料',
  quantity: '2', unit: '袋', bagWeightKg: '20', totalWeightKg: '40', totalPrice: '2200', supplier: '確認用仕入先' };
const existing = { ...incoming, id: 'existing', createdAt: '', updatedAt: '', unit: 'kg', quantity: '40',
  bagWeightKg: '', totalWeightKg: '', totalPrice: '2000', memo: '先に届いた納品書' } as FeedInventoryRecord;

describe('書類による二重入庫の確認候補', () => {
  it('納品書と請求書で金額や袋/kg表記が違っても同じ入庫数量を確認でき、記録を変更しない', () => {
    const before = structuredClone(existing);
    expect(findPotentialFeedDocumentDuplicates(incoming, [existing])).toEqual([existing]);
    expect(existing).toEqual(before);
  });
  it('日付・飼料・数量・仕入先が違う入庫や、出庫・自家製・削除済みは混ぜない', () => {
    const records = [
      { ...existing, id: 'different-date', transactionDate: '2026-10-23' },
      { ...existing, id: 'different-feed', feedName: '別の飼料' },
      { ...existing, id: 'different-quantity', quantity: '41' },
      { ...existing, id: 'different-supplier', supplier: '別の仕入先' },
      { ...existing, id: 'outbound', transactionType: '出庫' },
      { ...existing, id: 'homegrown', sourceType: 'homegrown' as const },
      { ...existing, id: 'deleted', deletedAt: '2026-10-25' },
    ];
    expect(findPotentialFeedDocumentDuplicates(incoming, records)).toEqual([]);
  });
  it('仕入先不明の場合も同じ入庫の可能性を残し、不正な数量は一致扱いしない', () => {
    expect(findPotentialFeedDocumentDuplicates({ ...incoming, supplier: '' }, [existing])).toEqual([existing]);
    expect(findPotentialFeedDocumentDuplicates(incoming, [{ ...existing, quantity: 'Infinity' }])).toEqual([]);
    expect(findPotentialFeedDocumentDuplicates({ ...incoming, quantity: '' }, [existing])).toEqual([]);
  });
});
