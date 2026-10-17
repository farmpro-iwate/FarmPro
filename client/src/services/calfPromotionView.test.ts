import { describe, expect, it } from 'vitest';
import { displayedCalfStatus, resolvePromotedCattle } from './calfPromotionView';

const calf = { name: 'ひめこ', calfNumber: '5754', identificationNumber: '1391057543', birthday: '2026-01-04', managementStatus: '育成中' };
const cow = { id: 19, name: 'ひめこ', earTag: '5754', identificationNumber: '1391057543', birthday: '2026-01-04' };
describe('子牛の牛台帳移行表示', () => {
  it('別端末の内部IDではなく個体識別番号で照合する', () => expect(resolvePromotedCattle(calf, [cow])?.id).toBe(19));
  it('牛台帳に存在すれば移行済みとして表示する', () => expect(displayedCalfStatus(calf, [cow])).toBe('牛台帳へ移行済み'));
  it('牛台帳にいない子牛は育成中のまま', () => expect(displayedCalfStatus(calf, [])).toBe('育成中'));
  it('同一番号の牛が複数いれば照合を保留する', () => expect(resolvePromotedCattle(calf, [cow, { ...cow, id: 22 }])).toBeNull());
  it('耳標が異なれば照合しない', () => expect(resolvePromotedCattle(calf, [{ ...cow, earTag: '9999' }])).toBeNull());
  it('販売済みの状態は書き換えて見せない', () => expect(displayedCalfStatus({ ...calf, managementStatus: '販売済み' }, [cow])).toBe('販売済み'));
});
