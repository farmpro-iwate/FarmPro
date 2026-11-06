import { describe, expect, it } from 'vitest';
import {
  emptyFeedDocumentCandidate, emptyFeedDocumentLine, normalizeFeedDocumentCandidate,
  validateFeedDocumentInput, validateFeedDocumentLine, type FeedDocumentCandidate, type FeedDocumentLine,
} from './feedDocumentImport';

function line(changes: Partial<FeedDocumentLine> = {}): FeedDocumentLine {
  return {
    ...emptyFeedDocumentLine, kind: 'feed', feedName: '検証用配合飼料A', deliveryDate: '2026-10-04',
    quantity: '10', unit: '袋', originalUnit: '袋', bagWeightKg: '20',
    unitPriceYen: '1000', unitPriceBasis: 'tax-excluded', priceUnit: '袋',
    grossYen: '11000', netYen: '10000', taxYen: '1000', taxRate: '10', notes: [], ...changes,
  };
}

function document(lineChanges: Partial<FeedDocumentLine> = {}, changes: Partial<FeedDocumentCandidate> = {}): FeedDocumentCandidate {
  return {
    ...emptyFeedDocumentCandidate, documentType: 'invoice', documentNumber: 'TEST-DOC-01',
    issueDate: '2026-10-05', deliveryDate: '2026-10-03', supplier: '検証用仕入先',
    lines: [line(lineChanges)], notes: [], ...changes,
  };
}

const noAmounts = { unitPriceYen: '', grossYen: '', netYen: '', taxYen: '' };

describe('feed document candidates', () => {
  it('maps one selected feed line into purchased inbound input without changing the candidate', () => {
    const candidate = document();
    const before = JSON.stringify(candidate);
    const checked = validateFeedDocumentLine(candidate, 0);
    expect(checked).toEqual({ errors: [], warnings: [], taxCalculated: false, input: {
      transactionDate: '2026-10-04', feedName: '検証用配合飼料A', transactionType: '入庫',
      quantity: '10', unit: '袋', bagWeightKg: '20', totalWeightKg: '200',
      unitPrice: '1100', totalPrice: '11000', supplier: '検証用仕入先', sourceType: 'purchased',
      taxRate: '10', taxExcludedPrice: '10000', taxAmount: '1000',
      memo: '請求書 / TEST-DOC-01 / 明細1 / 発行日2026-10-05',
    } });
    expect(JSON.stringify(candidate)).toBe(before);
  });

  it('selects only one feed line and never uses another line or document metadata as its amount', () => {
    const candidate = document({}, { lines: [line({ kind: 'other', feedName: '送料' }), line({ feedName: '検証用配合飼料B' })] });
    expect(validateFeedDocumentLine(candidate, 0).input).toBeNull();
    expect(validateFeedDocumentLine(candidate, 1).input).toMatchObject({ feedName: '検証用配合飼料B', memo: expect.stringContaining('明細2') });
    expect(validateFeedDocumentLine(candidate, 2).input).toBeNull();
  });

  it('normalizes full-width, correctly grouped decimals while preserving unknown values', () => {
    const normalized = normalizeFeedDocumentCandidate(document({ quantity: ' １，０００．５ ', unit: 'kg', originalUnit: '㎏',
      bagWeightKg: '', unitPriceYen: '２', priceUnit: 'kg', netYen: '２，００１', taxYen: '２００', grossYen: '２，２０１' }));
    expect(normalized.lines[0]).toMatchObject({ quantity: '1000.5', unitPriceYen: '2', netYen: '2001', taxYen: '200', grossYen: '2201', originalUnit: '㎏' });
    expect(validateFeedDocumentLine(normalized, 0).input).toMatchObject({ quantity: '1000.5', unit: 'kg', totalPrice: '2201', unitPrice: '2.2' });
    const missing = normalizeFeedDocumentCandidate(document({ ...noAmounts, taxRate: '' }, { documentType: 'delivery-note' }));
    expect(missing.lines[0].grossYen).toBe('');
    expect(missing.lines[0].taxRate).toBe('');
  });

  it.each([undefined, null, 1, false, [], {}])('rejects a malformed numeric field instead of turning it into zero: %j', (grossYen) => {
    expect(() => normalizeFeedDocumentCandidate(document({ grossYen } as any))).toThrow(/形式が不正/);
  });

  it('rejects incomplete, extra, or oversized structures without dropping rows', () => {
    const complete = document();
    const { supplier: _supplier, ...missing } = complete;
    expect(() => normalizeFeedDocumentCandidate(missing)).toThrow(/形式が不正/);
    expect(() => normalizeFeedDocumentCandidate({ ...complete, totalYen: '999999' })).toThrow(/形式が不正/);
    expect(() => normalizeFeedDocumentCandidate(document({}, { lines: [] }))).toThrow(/形式が不正/);
    expect(() => normalizeFeedDocumentCandidate(document({}, { lines: Array.from({ length: 101 }, () => line()) }))).toThrow(/形式が不正/);
    expect(() => normalizeFeedDocumentCandidate(document({ notes: Array(21).fill('注意') }))).toThrow(/形式が不正/);
    expect(() => normalizeFeedDocumentCandidate(document({ feedName: 'a'.repeat(301) }))).toThrow(/形式が不正/);
    expect(() => normalizeFeedDocumentCandidate(document({ unit: 't' } as any))).toThrow(/形式が不正/);
    expect(() => normalizeFeedDocumentCandidate(document({ notes: '注意' } as any))).toThrow(/形式が不正/);
  });

  it.each(['', '0', '-1', 'Infinity', '1e3', '1,00', '0.0000001', '9007199254740992'])('rejects an unsafe or unknown quantity without guessing: %s', (quantity) => {
    const candidate = normalizeFeedDocumentCandidate(document({ quantity }));
    expect(candidate.lines[0].quantity).toBe(quantity);
    const checked = validateFeedDocumentLine(candidate, 0);
    expect(checked.input).toBeNull();
    expect(checked.errors.some(message => message.includes('数量を0より大きい'))).toBe(true);
  });

  it.each(['-1', '1.5', '1e3', '不明', '9007199254740992'])('rejects an unsafe or unknown yen amount: %s', (grossYen) => {
    const checked = validateFeedDocumentLine(document({ grossYen }), 0);
    expect(checked.input).toBeNull();
    expect(checked.errors.some(message => /税込金額/.test(message))).toBe(true);
  });

  it('requires a real delivery date and never substitutes an invoice issue date', () => {
    const candidate = document({ deliveryDate: '' }, { deliveryDate: '' });
    expect(validateFeedDocumentLine(candidate, 0).errors.some(message => message.includes('発行日は代用しません'))).toBe(true);
    expect(validateFeedDocumentLine(document({ deliveryDate: '' }), 0).input?.transactionDate).toBe('2026-10-03');
    expect(validateFeedDocumentLine(document({ deliveryDate: '2026-02-29' }), 0).input).toBeNull();
    expect(validateFeedDocumentLine(document({ deliveryDate: '2024-02-29' }), 0).input?.transactionDate).toBe('2024-02-29');
    expect(validateFeedDocumentLine(document({}, { issueDate: '2026-02-30' }), 0).input).toBeNull();
  });

  it('keeps bags separate from kg and requires their weight without guessing a common bag size', () => {
    expect(validateFeedDocumentLine(document({ bagWeightKg: '' }), 0).input).toBeNull();
    const checked = validateFeedDocumentLine(document({ quantity: '.25', bagWeightKg: '80', unitPriceYen: '800',
      netYen: '200', taxYen: '20', grossYen: '220' }), 0);
    expect(checked.input).toMatchObject({ quantity: '0.25', unit: '袋', bagWeightKg: '80', totalWeightKg: '20', unitPrice: '880' });
  });

  it('does not convert a printed tonne quantity into kg when a unit is selected', () => {
    const unknown = document({ ...noAmounts, unit: '', originalUnit: 't', taxRate: '' }, { documentType: 'delivery-note' });
    expect(validateFeedDocumentLine(unknown, 0).input).toBeNull();
    const checked = validateFeedDocumentLine({ ...unknown, lines: [{ ...unknown.lines[0], unit: 'kg', quantity: '1' }] }, 0);
    expect(checked.input).toMatchObject({ quantity: '1', unit: 'kg', bagWeightKg: '', totalWeightKg: '' });
    expect(checked.warnings.some(message => message.includes('数量は自動換算していません'))).toBe(true);
  });

  it.each([
    { grossYen: '11001', netYen: '10000', taxYen: '1001' },
    { grossYen: '', netYen: '10000', taxYen: '1001' },
    { grossYen: '11001', netYen: '', taxYen: '1001' },
    { grossYen: '11001', netYen: '10000', taxYen: '' },
  ])('preserves written tax rounding and only completes exact additions/subtractions: %j', (amounts) => {
    const checked = validateFeedDocumentLine(document({ ...amounts, unitPriceYen: '' }), 0);
    expect(checked.errors).toEqual([]);
    expect(checked.input).toMatchObject({ totalPrice: '11001', taxExcludedPrice: '10000', taxAmount: '1001' });
    expect(checked.taxCalculated).toBe(false);
  });

  it('uses the existing gross-price split when only the gross amount is written', () => {
    const checked = validateFeedDocumentLine(document({ ...noAmounts, grossYen: '11001' }), 0);
    expect(checked.errors).toEqual([]);
    expect(checked.input).toMatchObject({ totalPrice: '11001', taxExcludedPrice: '10001', taxAmount: '1000' });
    expect(checked.taxCalculated).toBe(true);
    expect(checked.warnings.some(message => message.includes('税込金額と税率から'))).toBe(true);
  });

  it.each([
    ['10', '12005', '1201', '13206'], ['8', '12500', '1000', '13500'], ['0', '11', '0', '11'],
  ] as const)('shows rate-based additions as calculated candidates (%s%%)', (taxRate, netYen, taxYen, grossYen) => {
    const checked = validateFeedDocumentLine(document({ ...noAmounts, netYen, taxRate }), 0);
    expect(checked.errors).toEqual([]);
    expect(checked.input).toMatchObject({ totalPrice: grossYen, taxExcludedPrice: netYen, taxAmount: taxYen, taxRate });
    expect(checked.taxCalculated).toBe(true);
    expect(checked.warnings.some(message => message.includes('四捨五入'))).toBe(true);
  });

  it.each([
    { grossYen: '11000', netYen: '10000', taxYen: '999' },
    { grossYen: '11500', netYen: '10000', taxYen: '1500' },
    { grossYen: '10001', netYen: '10000', taxYen: '1', taxRate: '0' },
    { grossYen: '10', netYen: '', taxYen: '100' },
    { grossYen: '', netYen: '', taxYen: '1000' },
  ] as const)('rejects conflicting or insufficient monetary evidence: %j', (amounts) => {
    expect(validateFeedDocumentLine(document({ ...amounts, unitPriceYen: '' }), 0).input).toBeNull();
  });

  it('never guesses an omitted tax rate from apparently ten-percent amounts', () => {
    const checked = validateFeedDocumentLine(document({ taxRate: '' }), 0);
    expect(checked.input).toBeNull();
    expect(checked.errors.some(message => message.includes('税率は推測していません'))).toBe(true);
  });

  it('allows unpriced delivery quantities, keeps money unknown, and blocks an unread invoice amount', () => {
    const checked = validateFeedDocumentLine(document({ ...noAmounts, taxRate: '' }, { documentType: 'delivery-note' }), 0);
    expect(checked.errors).toEqual([]);
    expect(checked.input).toMatchObject({ quantity: '10', totalPrice: '', unitPrice: '', taxExcludedPrice: '', taxAmount: '', taxRate: undefined });
    expect(checked.taxCalculated).toBe(false);
    expect(validateFeedDocumentLine(document({ ...noAmounts, taxRate: '' }), 0).input).toBeNull();
    expect(validateFeedDocumentLine(document({ ...noAmounts, grossYen: '0', netYen: '0', taxYen: '0', taxRate: '0' }), 0).input)
      .toMatchObject({ totalPrice: '0', taxExcludedPrice: '0', taxAmount: '0' });
  });

  it.each([
    { priceUnit: 'kg' }, { priceUnit: '' }, { unitPriceBasis: 'unknown' },
  ] as const)('leaves an ambiguous unit price out while keeping known line amounts: %j', (changes) => {
    const checked = validateFeedDocumentLine(document(changes), 0);
    expect(checked.errors).toEqual([]);
    expect(checked.input).toMatchObject({ quantity: '10', unit: '袋', totalPrice: '11000', unitPrice: '' });
    expect(checked.warnings.some(message => message.includes('単価は空欄'))).toBe(true);
    expect(validateFeedDocumentLine(document({ ...changes, grossYen: '', netYen: '', taxYen: '' }), 0).input).toBeNull();
  });

  it('can calculate a line from a known quantity and matching price unit, with a review warning', () => {
    const checked = validateFeedDocumentLine(document({ grossYen: '', netYen: '', taxYen: '' }), 0);
    expect(checked.input).toMatchObject({ totalPrice: '11000', taxExcludedPrice: '10000', taxAmount: '1000', unitPrice: '1100' });
    expect(checked.warnings.some(message => message.includes('数量と単価から'))).toBe(true);
    expect(checked.taxCalculated).toBe(true);
  });

  it('checks the correct tax basis for unit-price multiplication with one-yen rounding tolerance', () => {
    expect(validateFeedDocumentLine(document({ grossYen: '11001', netYen: '10001' }), 0).input).not.toBeNull();
    const inconsistent = validateFeedDocumentLine(document({ grossYen: '11002', netYen: '10002' }), 0);
    expect(inconsistent.input).toBeNull();
    expect(inconsistent.errors.some(message => message.includes('数量×単価'))).toBe(true);
  });

  it('keeps precise totals when a gross unit price cannot be represented safely with six decimals', () => {
    const checked = validateFeedDocumentLine(document({ quantity: '1000000000', unit: 'kg', originalUnit: 'kg',
      priceUnit: 'kg', bagWeightKg: '', unitPriceYen: '0.000001', netYen: '1000', taxYen: '100', grossYen: '1100' }), 0);
    expect(checked.errors).toEqual([]);
    expect(checked.input).toMatchObject({ unitPrice: '', totalPrice: '1100', taxExcludedPrice: '1000', taxAmount: '100' });
    expect(checked.warnings.some(message => message.includes('税込単価は空欄'))).toBe(true);
  });

  it('rejects overflowing totals, quantities and tax additions rather than producing Infinity', () => {
    expect(validateFeedDocumentLine(document({ quantity: '9007199254740991', unitPriceYen: '2' }), 0).input).toBeNull();
    expect(validateFeedDocumentLine(document({ ...noAmounts, netYen: '9007199254740991' }), 0).input).toBeNull();
    const weight = validateFeedDocumentLine(document({ ...noAmounts, taxRate: '', quantity: '9007199254740991', bagWeightKg: '2' }, { documentType: 'delivery-note' }), 0);
    expect(weight.input).toBeNull();
    expect(weight.errors.some(message => message.includes('合計重量'))).toBe(true);
  });

  it.each(['送料', '値引き', '返品 配合飼料', '前月分繰越金額', '今回ご請求額', '小計',
    '税込金額', '10%対象額', '消費税10%', '課税対象外', '金額合計', '税率別集計'])('rejects non-feed headers even if mislabeled as feed: %s', (feedName) => {
    const checked = validateFeedDocumentLine(document({ feedName }), 0);
    expect(checked.input).toBeNull();
    expect(checked.errors.some(message => message.includes('飼料の入庫として取り込めません'))).toBe(true);
  });

  it.each(['調整配合A', '検証用配合飼料（非課税）'])('does not reject normal feed names because of an annotation: %s', (feedName) => {
    expect(validateFeedDocumentLine(document({ feedName }), 0).input?.feedName).toBe(feedName);
  });

  it.each(['other', 'unknown'] as const)('does not turn a different or unclassified document into inbound stock: %s', (documentType) => {
    expect(validateFeedDocumentLine(document({}, { documentType }), 0).input).toBeNull();
  });
});

describe('imported feed input after user edits', () => {
  it('continues to accept precisely confirmed tax amounts and small floating-point weight artifacts', () => {
    const input = validateFeedDocumentLine(document({ ...noAmounts, grossYen: '11001', netYen: '10000', taxYen: '1001' }), 0).input!;
    expect(validateFeedDocumentInput(input)).toEqual([]);
    expect(validateFeedDocumentInput({ ...input, quantity: '0.1', bagWeightKg: '0.2', totalWeightKg: String(0.1 * 0.2) })).toEqual([]);
  });

  it.each([
    { transactionType: '出庫' }, { sourceType: 'homegrown' }, { transactionDate: '2026-02-30' },
    { quantity: '-1' }, { unit: 't' }, { bagWeightKg: '' }, { totalWeightKg: '201' },
    { totalPrice: '12000' }, { taxRate: undefined }, { taxAmount: '' }, { feedName: '送料' },
    { unitPrice: 'Infinity' }, { unitPrice: '1000' },
  ] as const)('blocks an inconsistent or unsafe edit before saving: %j', (changes) => {
    const input = validateFeedDocumentLine(document(), 0).input!;
    expect(validateFeedDocumentInput({ ...input, ...changes }).length).toBeGreaterThan(0);
  });

  it('still permits unknown prices without filling zeros after a delivery-note import', () => {
    const input = validateFeedDocumentLine(document({ ...noAmounts, taxRate: '' }, { documentType: 'delivery-note' }), 0).input!;
    expect(validateFeedDocumentInput(input)).toEqual([]);
    expect(validateFeedDocumentInput({ ...input, unitPrice: '100' }).length).toBeGreaterThan(0);
  });
});
