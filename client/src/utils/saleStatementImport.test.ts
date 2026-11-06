import { describe, expect, it } from 'vitest';
import {
  emptySaleStatementCandidate, getSaleStatementTargetErrors, normalizeSaleStatementCandidate,
  validateSaleStatementCandidate, type SaleStatementCandidate,
} from './saleStatementImport';

function statement(overrides: Partial<SaleStatementCandidate> = {}): SaleStatementCandidate {
  return {
    ...emptySaleStatementCandidate,
    documentType: 'sale-settlement', animalCount: '1', statementNumber: 'EXAMPLE-1',
    saleDate: '2026-10-01', paymentDate: '2026-10-05', marketName: '見本市場', issuerName: '見本組合',
    identificationNumber: '1111110123', earTag: '0123', animalName: '確認用子牛',
    birthday: '2026-01-01', sex: '雌', saleWeightKg: '260.5',
    grossYen: '110000', netYen: '105250', deductionTotalYen: '4750',
    deductions: [
      { label: '市場手数料', amountYen: '3300' },
      { label: '入場料', amountYen: '1100' },
      { label: '組合会費', amountYen: '550' },
    ],
    adjustments: [{ label: '預り金戻し', amountYen: '200' }],
    notes: [],
    ...overrides,
  };
}

describe('sale statement candidates', () => {
  it('reconciles a refund without registering it as a negative expense', () => {
    expect(validateSaleStatementCandidate(statement())).toEqual({
      errors: [], grossYen: 110000, netYen: 105250,
      deductionsYen: 4950, adjustmentYen: 200, calculatedNetYen: 105250,
    });
  });

  it('supports a signed reduction', () => {
    expect(validateSaleStatementCandidate(statement({
      adjustments: [{ label: '精算差額調整', amountYen: '-100' }], netYen: '104950', deductionTotalYen: '5050',
    })).errors).toEqual([]);
  });

  it('keeps zero-charge amounts intact while blocking statements outside the supported settlement flow', () => {
    const candidate = statement({
      deductions: [], adjustments: [], netYen: '110000', deductionTotalYen: '0',
    });
    expect(validateSaleStatementCandidate(candidate)).toMatchObject({
      errors: ['この取り込みは、控除明細がある販売精算書に対応しています。'],
      deductionsYen: 0, adjustmentYen: 0, calculatedNetYen: 110000,
    });
    expect(candidate.deductions).toEqual([]);
    expect(candidate.netYen).toBe('110000');
  });

  it('normalizes complete numeric glyphs without guessing missing amounts or ear tags', () => {
    const normalized = normalizeSaleStatementCandidate(statement({
      grossYen: ' １１０，０００ ', netYen: '', earTag: '',
      deductions: [{ label: ' 手数料 ', amountYen: '３，３００' }],
      adjustments: [{ label: '調整', amountYen: '−１００' }],
    }));
    expect(normalized.grossYen).toBe('110000');
    expect(normalized.netYen).toBe('');
    expect(normalized.earTag).toBe('');
    expect(normalized.deductions).toEqual([{ label: '手数料', amountYen: '3300' }]);
    expect(normalized.adjustments[0].amountYen).toBe('-100');
    expect(validateSaleStatementCandidate(normalized).netYen).toBeNull();
  });

  it.each(['', '不明', '1,00', '1e3', '1.5', '-1', '9007199254740992'])('does not convert an invalid sale amount %s into zero or a balanced statement', (grossYen) => {
    const normalized = normalizeSaleStatementCandidate(statement({ grossYen }));
    expect(normalized.grossYen).toBe(grossYen);
    expect(validateSaleStatementCandidate(normalized)).toMatchObject({ grossYen: null, calculatedNetYen: null });
    expect(validateSaleStatementCandidate(normalized).errors).toContain('販売金額を整数の円で確認してください。');
  });

  it.each([undefined, null, 0, false, [], {}])('rejects a malformed amount type instead of filling a default: %j', (grossYen) => {
    expect(() => normalizeSaleStatementCandidate({ ...statement(), grossYen })).toThrow(/形式が不正/);
  });

  it.each([
    { deductions: undefined }, { adjustments: undefined }, { notes: 'unknown' }, { sex: [] },
    { deductions: [{ label: '手数料', amountYen: null }] },
    { deductions: [{ label: null, amountYen: '100' }] },
  ])('rejects incomplete structures without dropping unreadable rows: %j', (changes) => {
    expect(() => normalizeSaleStatementCandidate({ ...statement(), ...changes })).toThrow(/形式が不正/);
  });

  it('rejects oversized responses without truncating fee rows', () => {
    expect(() => normalizeSaleStatementCandidate(statement({
      deductions: Array.from({ length: 101 }, (_, index) => ({ label: `明細${index + 1}`, amountYen: '1' })),
    }))).toThrow(/形式が不正/);
    expect(validateSaleStatementCandidate(statement({
      deductions: Array.from({ length: 100 }, (_, index) => ({ label: `明細${index + 1}`, amountYen: '1' })),
    })).errors).toContain('控除・調整の明細は合計100件以内で確認してください。');
  });

  it.each(['other', 'unknown'] as const)('does not use another document type: %s', (documentType) => {
    expect(validateSaleStatementCandidate(statement({ documentType })).errors.some((message) => message.includes('販売精算書として確認できません'))).toBe(true);
  });

  it.each(['', '0', '2', '1.5'])('does not treat an unknown or multi-animal statement as one animal: %s', (animalCount) => {
    expect(validateSaleStatementCandidate(statement({ animalCount })).errors.some((message) => message.includes('1頭分'))).toBe(true);
  });

  it.each(['-200', '0', '', '1.25', '不明'])('requires each expense to be a known positive integer: %s', (amountYen) => {
    const checked = validateSaleStatementCandidate(statement({ deductions: [{ label: '手数料', amountYen }] }));
    expect(checked.deductionsYen).toBeNull();
    expect(checked.errors.some((message) => message.includes('控除明細1の金額'))).toBe(true);
  });

  it('does not treat an unknown adjustment as zero', () => {
    const checked = validateSaleStatementCandidate(statement({ adjustments: [{ label: '返金', amountYen: '' }] }));
    expect(checked.adjustmentYen).toBeNull();
    expect(checked.calculatedNetYen).toBeNull();
  });

  it.each(['控除合計', '(内消費税)', '標準税率対象', '軽減税率対象', '8%対象額', '小計'])('blocks a duplicate subtotal or tax breakdown row: %s', (label) => {
    const checked = validateSaleStatementCandidate(statement({
      deductions: [{ label, amountYen: '4750' }], adjustments: [],
    }));
    expect(checked.calculatedNetYen).toBe(105250);
    expect(checked.errors.some((message) => message.includes('税額内訳・合計'))).toBe(true);
  });

  it('detects duplicate fee rows even when spacing and number formatting differ', () => {
    const checked = validateSaleStatementCandidate(statement({
      deductions: [{ label: '市場 手数料', amountYen: '3,300' }, { label: '市場手数料', amountYen: '3300' }],
    }));
    expect(checked.errors).toContain('同じ名称・金額の明細があります。重複していないか確認してください。');
  });

  it('checks the printed net and the printed deduction total independently', () => {
    expect(validateSaleStatementCandidate(statement({ netYen: '105251' })).errors).toContain('販売金額・控除・調整額から計算した差引が、精算書の金額と一致しません。');
    expect(validateSaleStatementCandidate(statement({ deductionTotalYen: '4751' })).errors).toContain('明細の差引控除合計が、精算書の控除合計と一致しません。');
    expect(validateSaleStatementCandidate(statement({ deductionTotalYen: '' })).errors).toEqual([]);
  });

  it('rejects arithmetic overflow instead of comparing rounded totals', () => {
    const checked = validateSaleStatementCandidate(statement({
      grossYen: String(Number.MAX_SAFE_INTEGER), netYen: String(Number.MAX_SAFE_INTEGER),
      deductions: [], adjustments: [{ label: '返金', amountYen: '2' }], deductionTotalYen: '',
    }));
    expect(checked.calculatedNetYen).toBeNull();
    expect(checked.errors).toContain('差引計算が扱える金額を超えています。');
  });

  it.each(['2026-02-29', '2026-13-01', '2026-04-31', '2026-2-01', '0000-01-01'])('checks actual calendar dates without silently normalizing %s', (saleDate) => {
    expect(validateSaleStatementCandidate(statement({ saleDate })).errors).toContain('販売日を正しい日付で確認してください。');
  });

  it('accepts a real leap day and leaves an unread payment date blank', () => {
    expect(validateSaleStatementCandidate(statement({ birthday: '2024-02-29', paymentDate: '' })).errors).toEqual([]);
  });

  it('does not pad an incomplete identification number', () => {
    const normalized = normalizeSaleStatementCandidate(statement({ identificationNumber: '111110123' }));
    expect(normalized.identificationNumber).toBe('111110123');
    expect(validateSaleStatementCandidate(normalized).errors).toContain('個体識別番号は、読み取れた10桁を確認してください。');
  });
});

describe('sale statement target checks', () => {
  it('checks complete IDs rather than a coinciding last-four-digit tag or name', () => {
    expect(getSaleStatementTargetErrors(statement(), {
      targetNumber: '0123', targetName: '確認用子牛', identificationNumber: '9999990123',
    })).toContain('精算書の個体識別番号と、選択した牛の番号が一致しません。');
  });

  it('compares explicitly printed ear tags and never pads leading zeroes', () => {
    expect(getSaleStatementTargetErrors(statement(), { targetNumber: '123' })).toContain('精算書の耳標番号と、選択した牛の番号が一致しません。');
    expect(getSaleStatementTargetErrors(statement(), { targetNumber: '0123' })).toEqual([]);
  });

  it('does not compare a short tag against a complete identification number', () => {
    expect(getSaleStatementTargetErrors(statement(), { targetNumber: '1111110123' })).toEqual([]);
    expect(getSaleStatementTargetErrors(statement(), { targetNumber: '9999990123' })).toContain('精算書の個体識別番号と、選択した牛の番号が一致しません。');
  });

  it('leaves an unavailable identity check to explicit user confirmation', () => {
    expect(getSaleStatementTargetErrors(statement({ earTag: '' }), { targetNumber: '0456' })).toEqual([]);
    expect(getSaleStatementTargetErrors(statement({ earTag: '', identificationNumber: '' }), { targetNumber: '0123' })).toEqual([]);
  });

  it('compares existing sale prices only when supplied', () => {
    expect(getSaleStatementTargetErrors(statement(), { targetNumber: '0123' })).toEqual([]);
    expect(getSaleStatementTargetErrors(statement(), { targetNumber: '0123', salePrice: '110,000' })).toEqual([]);
    expect(getSaleStatementTargetErrors(statement(), { targetNumber: '0123', salePrice: '110001' })).toContain('精算書の販売金額と、登録済みの販売金額が一致しません。販売記録を確認してください。');
    expect(getSaleStatementTargetErrors(statement(), { targetNumber: '0123', salePrice: '' })).toContain('登録済みの販売金額を確認してください。');
  });

  it('checks the sale date, never substitutes the settlement date for it', () => {
    expect(getSaleStatementTargetErrors(statement(), { targetNumber: '0123', saleDate: '2026-10-01' })).toEqual([]);
    expect(getSaleStatementTargetErrors(statement(), { targetNumber: '0123', saleDate: '2026-10-05' })).toContain('精算書の販売日と、登録済みの販売日が一致しません。販売記録を確認してください。');
    expect(getSaleStatementTargetErrors(statement({ saleDate: '' }), { targetNumber: '0123', saleDate: '2026-10-01' })).toEqual([]);
  });
});
