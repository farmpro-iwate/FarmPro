import { describe, expect, it } from 'vitest';
import { findEligibleHeiferForPromotion } from './breedingStagePromotion';
import type { Cattle } from '../types/cattle';
import type { Breeding } from '../types/breeding';

const cow = { id: 12, name: 'ひめこ', earTag: '5754', stage: '育成牛' } as Cattle;
const record = { cowEarTag: '5754', cowName: 'ひめこ', pregnancyResult: '受胎', pregnancyCheckDate: '2026-12-01' } as Breeding;
describe('育成牛から繁殖牛への移行判定', () => {
  it('受胎確認と鑑定日があれば対象牛を特定', () => expect(findEligibleHeiferForPromotion(record, [cow])?.id).toBe(12));
  it('種付のみでは移行しない', () => expect(findEligibleHeiferForPromotion({ ...record, pregnancyResult: '未鑑定' }, [cow])).toBeNull());
  it('空胎では移行しない', () => expect(findEligibleHeiferForPromotion({ ...record, pregnancyResult: '空胎' }, [cow])).toBeNull());
  it('鑑定日なしでは移行しない', () => expect(findEligibleHeiferForPromotion({ ...record, pregnancyCheckDate: '' }, [cow])).toBeNull());
  it('同じ耳標の候補が複数なら移行しない', () => expect(findEligibleHeiferForPromotion(record, [cow, { ...cow, id: 21 }])).toBeNull());
  it('繁殖牛は変更対象にしない', () => expect(findEligibleHeiferForPromotion(record, [{ ...cow, stage: '繁殖牛' }])).toBeNull());
  it('牛名が食い違えば移行しない', () => expect(findEligibleHeiferForPromotion({ ...record, cowName: '別の牛' }, [cow])).toBeNull());
});
