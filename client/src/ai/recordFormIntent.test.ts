import { describe, expect, it, vi, afterEach } from 'vitest';
import { parseAiRecordFormCandidate as parse } from './recordFormIntent';
import { parseRegistrationIntent } from './registrationIntent';
import type { AiRecordFormKind } from './recordFormDraft';

const today = '2026-11-03';
afterEach(() => { vi.restoreAllMocks(); });

describe('additional AI record categories', () => {
  it.each<[AiRecordFormKind, string]>([
    ['medicine-inventory', '医薬品の試験薬を10.5分包購入した'],
    ['embryo-inventory', '受精卵を2個購入、受精卵番号E-12'],
    ['sale', '子牛1234を80万円で販売した'],
    ['expense', '昨日、電気代5000円を支払った'],
    ['blv', '耳標1234、BLV検査は陰性'],
    ['feeding-action', '子牛1234の給与アラートに対応、給与量を増やした'],
    ['fattening', '耳標1234を肥育へ移行した'],
    ['cattle', '牛を登録、耳標1234、名号は試験牛、2025年1月2日生まれ'],
    ['calf', '子牛を登録、子牛番号5678、2026年11月1日生まれ'],
    ['feeding', '飼料給与記録、飼料名は試験飼料、給与量10kg、対象は子牛群'],
    ['treatment', '子牛1234の削蹄を記録'],
    ['vaccine', '子牛1234にワクチン接種した'],
  ])('recognizes %s without HTTP or saving', (kind, text) => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(parse(text, { today })).toMatchObject({ kind, sourceText: text });
    expect(fetch).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('allows an explicitly selected type without guessing information from ambiguous text', () => {
    expect(parse('後で内容を確認する', { kind: 'expense', today })).toEqual({ kind: 'expense', sourceText: '後で内容を確認する', fields: {} });
    expect(parse('後で内容を確認する', { today })).toBeNull();
    expect(parse('', { kind: 'blv', today })?.fields).toEqual({});
    expect(parse('x'.repeat(2001), { kind: 'expense', today })).toBeNull();
  });

  it('keeps medicine decimals, packet units, explicit zero and the correct event date', () => {
    expect(parse('2026年11月3日、医薬品の試験薬を10.5分包購入、購入金額2000円', { today })?.fields).toEqual({
      itemName: '試験薬', date: today, quantity: '10.5', unit: '分包', amount: '2000', action: '購入',
    });
    expect(parse('薬を2分包購入、購入金額0円', { today })?.fields).toMatchObject({ quantity: '2', unit: '分包', amount: '0', action: '購入' });
    expect(parse('農薬を2本購入', { today })).toBeNull();
  });

  it('does not infer missing quantity, unit or total from a unit price', () => {
    const result = parse('医薬品を購入、単価100円、ロット11755', { today })!;
    expect(result.fields).toEqual({ action: '購入', unitPrice: '100', lotNumber: '11755' });
    expect(result.fields).not.toHaveProperty('quantity');
    expect(result.fields).not.toHaveProperty('amount');
  });

  it('keeps embryo identity separate from animal identity and never calls it feed', () => {
    const result = parse('2026-11-03 受精卵を2個入庫、受精卵番号ET-1234、金額35000円', { today })!;
    expect(result.kind).toBe('embryo-inventory');
    expect(result.fields).toMatchObject({ date: today, quantity: '2', unit: '個', lotNumber: 'ET-1234', amount: '35000' });
    expect(result.fields).not.toHaveProperty('cowEarTag');
    expect(result.fields).not.toHaveProperty('action');
  });

  it('does not use dates, lots or prices as animal numbers', () => {
    expect(parse('2026-11-03、医薬品を購入、ロット11755、金額35000円', { today })?.fields).not.toHaveProperty('cowEarTag');
    expect(parse('BLV検査、検査日2026-11-03、名号は試験牛', { today })?.fields).toEqual({ testDate: today, cowName: '試験牛' });
    expect(parse('子牛2026年11月3日生まれを販売した', { today })?.fields).not.toHaveProperty('targetNumber');
  });

  it('uses decimal ten-thousand-yen amounts precisely, including free transfers', () => {
    expect(parse('子牛1234を65.80001万円で販売した', { today })?.fields).toMatchObject({ targetType: '子牛', targetNumber: '1234', salePrice: '658000.1', status: '販売済み' });
    expect(parse('子牛1234を0円で販売した', { today })?.fields.salePrice).toBe('0');
    expect(parse('経費 金額:1,000円', { today })?.fields.amount).toBe('1000');
    expect(parse('経費 金額:1,00円', { today })?.fields).not.toHaveProperty('amount');
    expect(parse('経費 金額:-100円', { today })?.fields).not.toHaveProperty('amount');
  });

  it('handles relative dates at a year boundary and leaves unsupplied dates blank', () => {
    expect(parse('昨日、電気代5000円を支払った', { today: '2026-01-01' })?.fields.paymentDate).toBe('2025-12-31');
    expect(parse('今日、子牛1234を80万円で販売した', { today })?.fields.saleDate).toBe(today);
    expect(parse('経費 金額:100円', { today })?.fields).not.toHaveProperty('paymentDate');
    expect(parse('BLV検査、検査日2026年2月30日、今日入力', { today })?.fields).not.toHaveProperty('testDate');
  });

  it('does not copy a birthday or next check date into a performed event', () => {
    const sale = parse('子牛1234を販売した、生年月日2026-07-20', { today })!;
    expect(sale.fields.birthday).toBe('2026-07-20');
    expect(sale.fields).not.toHaveProperty('saleDate');
    const test = parse('BLV検査、次回検査日2027-01-15', { today })!;
    expect(test.fields.nextTestDate).toBe('2027-01-15');
    expect(test.fields).not.toHaveProperty('testDate');
  });

  it.each(['陰性ではない', '陰性ではなかった', '陽性ではありません', '陰性かも', '陰性か陽性か不明'])(
    'does not turn uncertain/negated BLV information into a result: %s', result => {
      expect(parse('BLV検査 ' + result, { today })?.fields).not.toHaveProperty('result');
    },
  );

  it('uses the stated animal kind, and never treats a castrated sale/registration as another procedure', () => {
    expect(parse('去勢の子牛1234を販売した', { today })).toMatchObject({ kind: 'sale', fields: { targetType: '子牛', targetNumber: '1234', sex: '去勢' } });
    expect(parse('牛を登録、性別:去勢', { today })).toMatchObject({ kind: 'cattle', fields: { sex: '去勢' } });
    expect(parse('子牛を登録、性別:去勢', { today })).toMatchObject({ kind: 'calf', fields: { sex: '去勢' } });
    expect(parse('1234 削蹄を記録', { today })).toMatchObject({ kind: 'treatment', fields: { recordType: '削蹄', targetNumber: '1234' } });
    expect(parse('1234 削蹄を記録', { today })?.fields).not.toHaveProperty('targetType');
  });

  it('passes animal hints and stated medicine source, not inventory identities or guessed amounts', () => {
    const treatment = parse('子牛1234を治療、薬剤の使用元は農場在庫、薬剤:試験薬、投薬量:2mL', { today })!;
    expect(treatment).toMatchObject({ kind: 'treatment', fields: { targetType: '子牛', targetNumber: '1234', medicineSource: 'farm_stock', medicine: '試験薬', dosage: '2mL' } });
    expect(treatment.fields).not.toHaveProperty('medicineInventoryBatchKey');
    expect(treatment.fields).not.toHaveProperty('medicineInventoryQuantity');
    expect(parse('子牛1234の給与アラート対応', { today })?.fields.calfNumber).toBe('1234');
  });

  it('preserves the nine existing guided flows', () => {
    const examples = ['1234 発情を登録', '1234 授精を登録', '1234 ETを登録', '1234 妊娠鑑定を登録',
      '1234 分娩を登録', '1234 治療を登録', '1234 ワクチンを登録',
      '腹づくりを子牛群に10kg使った', '腹づくりを10袋入庫'];
    for (const text of examples) {
      expect(parse(text, { today })).toBeNull();
      expect(parseRegistrationIntent(text, { recordMode: true })).not.toBeNull();
    }
  });
});
