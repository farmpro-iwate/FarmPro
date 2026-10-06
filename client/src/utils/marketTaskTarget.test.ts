import { describe, expect, it } from 'vitest';
import { resolveMarketTaskTarget } from './marketTaskTarget';

type SaleTarget = Parameters<typeof resolveMarketTaskTarget>[0];
type CalfTarget = Parameters<typeof resolveMarketTaskTarget>[1][number];
const sale: SaleTarget = {
  targetType: '子牛', targetNumber: '5754', targetName: '子牛（耳標未装着）',
  birthday: '2026-01-04', calfId: '1',
};
const calf: CalfTarget = {
  id: 91, calfNumber: '5754', identificationNumber: '1234565754',
  name: 'ひめこ', birthday: '2026-01-04',
};
const original = (record: SaleTarget) => ({ targetNumber: record.targetNumber || '', targetName: record.targetName || '' });

describe('read-only current calf labels for market tasks', () => {
  it.each([
    ['5754', 'ひめこ', '2026-01-04'],
    ['5755', 'かつこ', '2026-01-16'],
  ])('uses the current ledger name for tagged calf %s', (number, name, birthday) => {
    const record = { ...sale, targetNumber: number, birthday };
    const animal = { ...calf, calfNumber: number, name, birthday };
    expect(resolveMarketTaskTarget(record, [animal])).toEqual({ targetNumber: number, targetName: name });
  });

  it('uses an exact identification number and displays the current ear-tag number', () => {
    expect(resolveMarketTaskTarget({ ...sale, targetNumber: '1234565754' }, [calf])).toEqual({
      targetNumber: '5754', targetName: 'ひめこ',
    });
  });

  it('preserves leading zeroes and permits only whitespace normalization', () => {
    expect(resolveMarketTaskTarget({ ...sale, targetNumber: ' 0254 ' }, [
      { ...calf, calfNumber: '0254' },
    ])).toEqual({ targetNumber: '0254', targetName: 'ひめこ' });
  });

  it('follows a retained raw temporary identifier after the ear tag and name are registered', () => {
    expect(resolveMarketTaskTarget({ ...sale, targetNumber: 'TEMP-MANUAL-1' }, [
      { ...calf, temporaryCalfNumber: 'TEMP-MANUAL-1' },
    ])).toEqual({ targetNumber: '5754', targetName: 'ひめこ' });
  });

  it('uses a unique calving link for an old temporary record even when local IDs differ', () => {
    expect(resolveMarketTaskTarget({ ...sale, targetNumber: 'TEMP-old', calvingId: 'birth-1' }, [
      { ...calf, calvingId: 'birth-1' },
    ])).toEqual({ targetNumber: '5754', targetName: 'ひめこ' });
  });

  it('does not select a different calf from a device-local ID', () => {
    const other = { id: 1, calfNumber: '5755', name: '別の子牛', birthday: '2026-01-04' };
    expect(resolveMarketTaskTarget(sale, [other, calf])).toEqual({ targetNumber: '5754', targetName: 'ひめこ' });
    const unlinked = { ...sale, targetNumber: 'TEMP-old' };
    expect(resolveMarketTaskTarget(unlinked, [other])).toEqual(original(unlinked));
  });

  it.each(['', '耳標未装着', '子牛（耳標未装着）', 'TEMP-NAME'])('does not infer missing ear tags from placeholder name %s', (name) => {
    expect(resolveMarketTaskTarget(sale, [{ ...calf, name }])).toEqual({
      targetNumber: '5754', targetName: '名号未登録',
    });
  });

  it('keeps genuinely temporary calves distinguishable from tagged calves', () => {
    const record = { ...sale, targetNumber: 'TEMP-MANUAL-2' };
    expect(resolveMarketTaskTarget(record, [
      { ...calf, calfNumber: 'TEMP-MANUAL-2', name: '耳標未装着' },
    ])).toEqual({ targetNumber: '仮-0104', targetName: '子牛（耳標未装着）' });
  });

  it.each(['成牛', 'その他', undefined] as const)('does not join calf data for target type %s', (targetType) => {
    const record = { ...sale, targetType };
    expect(resolveMarketTaskTarget(record, [calf])).toEqual(original(record));
  });

  it('keeps the recorded identity when the ledger is unavailable or no exact match exists', () => {
    expect(resolveMarketTaskTarget(sale, [])).toEqual(original(sale));
    expect(resolveMarketTaskTarget(sale, [{ ...calf, calfNumber: '9999', identificationNumber: '' }])).toEqual(original(sale));
  });

  it.each(['575', '754', '仮-0104', '254'])('does not guess from partial or abbreviated identifier %s', (targetNumber) => {
    const record = { ...sale, targetNumber, targetName: 'ひめこ' };
    expect(resolveMarketTaskTarget(record, [calf])).toEqual(original(record));
  });

  it('does not match only by a shared name and birthday', () => {
    const record = { ...sale, targetNumber: '', targetName: 'ひめこ', calfId: '91' };
    expect(resolveMarketTaskTarget(record, [calf])).toEqual(original(record));
  });

  it('does not choose the first of duplicate ear-tag matches', () => {
    const duplicate = { ...calf, id: 92, name: '別の子牛' };
    expect(resolveMarketTaskTarget(sale, [calf, duplicate])).toEqual(original(sale));
    expect(resolveMarketTaskTarget(sale, [duplicate, calf])).toEqual(original(sale));
  });

  it('rejects conflicting birth dates or calving identities even when a number matches', () => {
    expect(resolveMarketTaskTarget(sale, [{ ...calf, birthday: '2026-01-16' }])).toEqual(original(sale));
    const record = { ...sale, calvingId: 'birth-1' };
    expect(resolveMarketTaskTarget(record, [{ ...calf, calvingId: 'birth-2' }])).toEqual(original(record));
  });

  it('does not guess between twins from the calving ID or override an unmatched real tag', () => {
    const twins = [
      { ...calf, calvingId: 'birth-1' },
      { ...calf, id: 92, calfNumber: '5755', name: '双子', calvingId: 'birth-1' },
    ];
    const temporary = { ...sale, targetNumber: 'TEMP-old', calvingId: 'birth-1' };
    expect(resolveMarketTaskTarget(temporary, twins)).toEqual(original(temporary));
    const mismatched = { ...temporary, targetNumber: '9999' };
    expect(resolveMarketTaskTarget(mismatched, [twins[0]])).toEqual(original(mismatched));
  });

  it('does not mutate the original sale or calf while projecting the current display', () => {
    const record = Object.freeze({ ...sale, shippingPlanDate: '2026-10-14', salePrice: '700000' });
    const animal = Object.freeze({ ...calf });
    const records = Object.freeze([animal]);
    const before = JSON.stringify({ record, records });
    expect(resolveMarketTaskTarget(record, records)).toEqual({ targetNumber: '5754', targetName: 'ひめこ' });
    expect(JSON.stringify({ record, records })).toBe(before);
  });
});
