import type { FeedInventoryInput } from '../services/feedInventoryApi';

export type FeedDocumentUnit = '' | 'kg' | '袋' | 'ロール' | '束' | '個' | 'その他';
export type FeedDocumentLine = {
  kind: 'feed' | 'other' | 'unknown';
  feedName: string;
  deliveryDate: string;
  quantity: string;
  unit: FeedDocumentUnit;
  originalUnit: string;
  bagWeightKg: string;
  unitPriceYen: string;
  unitPriceBasis: 'tax-included' | 'tax-excluded' | 'unknown';
  priceUnit: FeedDocumentUnit;
  grossYen: string;
  netYen: string;
  taxYen: string;
  taxRate: '' | '10' | '8' | '0';
  notes: string[];
};

export type FeedDocumentCandidate = {
  documentType: 'delivery-note' | 'invoice' | 'other' | 'unknown';
  documentNumber: string;
  issueDate: string;
  deliveryDate: string;
  supplier: string;
  lines: FeedDocumentLine[];
  notes: string[];
};

export type FeedDocumentSelection = {
  sessionId: string;
  candidate: FeedDocumentCandidate;
  lineIndex: number;
};

export const emptyFeedDocumentLine: FeedDocumentLine = {
  kind: 'unknown', feedName: '', deliveryDate: '', quantity: '', unit: '',
  originalUnit: '', bagWeightKg: '', unitPriceYen: '', unitPriceBasis: 'unknown',
  priceUnit: '', grossYen: '', netYen: '', taxYen: '', taxRate: '', notes: [],
};

export const emptyFeedDocumentCandidate: FeedDocumentCandidate = {
  documentType: 'unknown', documentNumber: '', issueDate: '', deliveryDate: '',
  supplier: '', lines: [], notes: [],
};

const units: readonly string[] = ['', 'kg', '袋', 'ロール', '束', '個', 'その他'];
const taxRates: readonly string[] = ['', '10', '8', '0'];
const candidateKeys = Object.keys(emptyFeedDocumentCandidate);
const lineKeys = Object.keys(emptyFeedDocumentLine);
const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
const malformed = () => new Error('納品書・請求書の読み取り結果の形式が不正です。もう一度読み取ってください。');

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireKeys(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).length !== keys.length ||
      keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) throw malformed();
}

function readText(value: unknown, maxLength = 500): string {
  if (typeof value !== 'string' || value.length > maxLength) throw malformed();
  return value.trim();
}

function readNotes(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 20) throw malformed();
  return value.map((note) => readText(note, 1000));
}

function numberText(value: string): string {
  const normalized = value.trim().normalize('NFKC').replace(/−/g, '-');
  // Only remove complete grouping separators. Broken grouping, units and
  // exponential notation remain visible and must be corrected by the user.
  return /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(normalized)
    ? normalized.replace(/,/g, '') : normalized;
}

function readNumberText(value: unknown): string {
  return numberText(readText(value, 64));
}

function readDate(value: unknown): string {
  return readText(value, 32).normalize('NFKC');
}

function normalizeLine(value: unknown): FeedDocumentLine {
  requireKeys(value, lineKeys);
  const kind = readText(value.kind, 20);
  const unit = readText(value.unit, 20);
  const priceUnit = readText(value.priceUnit, 20);
  const basis = readText(value.unitPriceBasis, 20);
  const taxRate = readText(value.taxRate, 8);
  if (!['feed', 'other', 'unknown'].includes(kind) || !units.includes(unit) ||
      !units.includes(priceUnit) || !['tax-included', 'tax-excluded', 'unknown'].includes(basis) ||
      !taxRates.includes(taxRate)) throw malformed();
  return {
    kind: kind as FeedDocumentLine['kind'],
    feedName: readText(value.feedName, 300), deliveryDate: readDate(value.deliveryDate),
    quantity: readNumberText(value.quantity), unit: unit as FeedDocumentUnit,
    originalUnit: readText(value.originalUnit, 80), bagWeightKg: readNumberText(value.bagWeightKg),
    unitPriceYen: readNumberText(value.unitPriceYen),
    unitPriceBasis: basis as FeedDocumentLine['unitPriceBasis'], priceUnit: priceUnit as FeedDocumentUnit,
    grossYen: readNumberText(value.grossYen), netYen: readNumberText(value.netYen),
    taxYen: readNumberText(value.taxYen), taxRate: taxRate as FeedDocumentLine['taxRate'],
    notes: readNotes(value.notes),
  };
}

/** Candidate parsing has no storage, master creation or synchronization side effects. */
export function normalizeFeedDocumentCandidate(value: unknown): FeedDocumentCandidate {
  requireKeys(value, candidateKeys);
  const documentType = readText(value.documentType, 30);
  if (!['delivery-note', 'invoice', 'other', 'unknown'].includes(documentType) ||
      !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 100) throw malformed();
  return {
    documentType: documentType as FeedDocumentCandidate['documentType'],
    documentNumber: readText(value.documentNumber, 200), issueDate: readDate(value.issueDate),
    deliveryDate: readDate(value.deliveryDate), supplier: readText(value.supplier, 300),
    lines: value.lines.map(normalizeLine), notes: readNotes(value.notes),
  };
}

type Decimal = { value: bigint; scale: bigint };

function positiveDecimal(value: string): Decimal | null {
  if (value.length > 64) return null;
  const text = numberText(value);
  if (!/^\+?(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/.test(text)) return null;
  const [whole, fraction = ''] = text.replace(/^\+/, '').split('.');
  const numerator = BigInt((whole || '0') + fraction);
  const scale = 10n ** BigInt(fraction.length);
  if (numerator <= 0n || numerator > maxSafe * scale) return null;
  return { value: numerator, scale };
}

function optionalYen(text: string, label: string, errors: string[]): bigint | undefined {
  if (!text) return undefined;
  if (text.length > 64) {
    errors.push(`${label}が扱える金額を超えています。`);
    return undefined;
  }
  const normalized = numberText(text);
  if (!/^\+?\d+$/.test(normalized)) {
    errors.push(`${label}を0以上の整数の円で確認してください。`);
    return undefined;
  }
  const value = BigInt(normalized.replace(/^\+/, ''));
  if (value > maxSafe) {
    errors.push(`${label}が扱える金額を超えています。`);
    return undefined;
  }
  return value;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function nonFeedLabel(value: string): boolean {
  const text = value.normalize('NFKC').replace(/[\s()【】\[\]]/g, '');
  return /(?:合計|小計|総計|総額)(?:額|金額)?(?:税込|税抜|税別)?$/.test(text) ||
    /^(?:税込|税抜|税別)?(?:計|合計|小計|総計|総額)$/.test(text) ||
    /^(?:税込|税抜|税別|商品|納品|明細)(?:金額|額)$/.test(text) ||
    /^(?:内|内訳|うち|外)?(?:消費税|地方消費税)/.test(text) ||
    /^税率(?:別)?(?:集計|内訳)/.test(text) ||
    /^(?:消費税(?:等)?)?(?:課税対象(?:外)?|非課税(?:対象)?|不課税(?:対象)?|(?:8|10)%対象)(?:額|金額|合計|小計)*$/.test(text) ||
    /^(?:(?:前回|前月|今回|当月|今月|翌月|次回)(?:分)?)?(?:ご|お)?(?:繰越|残高|入金|振込|請求額|請求金額|支払額)/.test(text) ||
    /^(?:送料|運賃|配送料|配送費|代引|手数料|値引|割引|返品|返金|端数調整|調整額)/.test(text);
}

function roundDivision(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function abs(value: bigint): bigint { return value < 0n ? -value : value; }

function decimalText(value: bigint, scale: bigint): string {
  const places = scale.toString().length - 1;
  if (!places) return value.toString();
  const digits = value.toString().padStart(places + 1, '0');
  return `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/\.?0+$/, '');
}

function productYen(quantity: Decimal, price: Decimal): bigint {
  return roundDivision(quantity.value * price.value, quantity.scale * price.scale);
}

function taxMatches(net: bigint, tax: bigint, rate: bigint): boolean {
  if (rate === 0n) return tax === 0n;
  const numerator = net * rate;
  const floor = numerator / 100n;
  const ceil = (numerator + 99n) / 100n;
  // Documents may round tax once for a group of lines. Preserve an explicit
  // line tax within one yen of the usual floor/round/ceil results.
  return tax >= (floor > 0n ? floor - 1n : 0n) && tax <= ceil + 1n;
}

function validWeightProduct(quantity: Decimal, bagWeight: Decimal): boolean {
  return quantity.value * bagWeight.value <= maxSafe * quantity.scale * bagWeight.scale;
}

export type FeedDocumentValidation = {
  errors: string[];
  warnings: string[];
  input: FeedInventoryInput | null;
  taxCalculated: boolean;
};

export function validateFeedDocumentLine(value: FeedDocumentCandidate, index: number): FeedDocumentValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let taxCalculated = false;
  let candidate: FeedDocumentCandidate;
  try { candidate = normalizeFeedDocumentCandidate(value); }
  catch { return { errors: [malformed().message], warnings, input: null, taxCalculated }; }
  if (!['delivery-note', 'invoice'].includes(candidate.documentType)) errors.push('納品書または請求書を選んでください。');
  if (!Number.isInteger(index) || index < 0 || index >= candidate.lines.length) {
    return { errors: [...errors, '取り込む飼料の明細を1件選んでください。'], warnings, input: null, taxCalculated };
  }
  const line = candidate.lines[index];
  if (line.kind !== 'feed') errors.push('飼料の入庫に使う明細を確認してください。');
  if (!line.feedName) errors.push('飼料名を確認してください。');
  else if (nonFeedLabel(line.feedName)) errors.push('送料・値引き・返品・税額・合計などは飼料の入庫として取り込めません。');
  const date = line.deliveryDate || candidate.deliveryDate;
  if (!validDate(date)) errors.push('実際の入庫日・納品日を確認してください。請求書の発行日は代用しません。');
  if (candidate.issueDate && !validDate(candidate.issueDate)) errors.push('書類の発行日を正しい日付で確認してください。');
  if (candidate.deliveryDate && !validDate(candidate.deliveryDate)) errors.push('書類の納品日を正しい日付で確認してください。');
  const quantity = positiveDecimal(line.quantity);
  if (!quantity) errors.push('数量を0より大きい数値で確認してください（小数6桁以内）。');
  if (!line.unit) errors.push('数量の単位を選んでください。書類と異なる単位にする場合は数量も確認してください。');
  const bagWeight = line.unit === '袋' ? positiveDecimal(line.bagWeightKg) : null;
  if (line.unit === '袋' && !bagWeight) errors.push('1袋の重量を0より大きいkgで確認してください（小数6桁以内）。');
  if (quantity && bagWeight && !validWeightProduct(quantity, bagWeight)) errors.push('袋数と1袋の重量から計算した合計重量が扱える範囲を超えています。');
  if (line.unit && line.originalUnit && line.originalUnit.normalize('NFKC').toLowerCase() !== line.unit.toLowerCase()) {
    warnings.push(`書類の単位「${line.originalUnit}」と入力単位「${line.unit}」が異なります。数量は自動換算していません。`);
  }

  const hasPrice = Boolean(line.unitPriceYen || line.grossYen || line.netYen || line.taxYen);
  const price = line.unitPriceYen ? positiveDecimal(line.unitPriceYen) : null;
  if (line.unitPriceYen && !price) errors.push('単価を0より大きい数値で確認してください（小数6桁以内）。');
  if (hasPrice && !line.taxRate) errors.push('書類の税率を確認してください。税率は推測していません。');
  if (!hasPrice && candidate.documentType === 'invoice') errors.push('請求書の明細金額を確認してください。');
  if (!hasPrice && candidate.documentType === 'delivery-note') warnings.push('金額のない納品書として、数量だけを入力します。金額は0円に置き換えません。');
  const samePriceUnit = Boolean(line.unit && line.priceUnit === line.unit);
  const knownPriceBasis = line.unitPriceBasis !== 'unknown';
  if (line.unitPriceYen && !samePriceUnit) warnings.push('単価の対象単位が数量の単位と一致しないか不明なため、入力欄の単価は空欄にします。');
  if (line.unitPriceYen && !knownPriceBasis) warnings.push('単価の税込・税抜が不明なため、入力欄の単価は空欄にします。');
  const usablePrice = price && samePriceUnit && knownPriceBasis ? price : null;
  let gross = optionalYen(line.grossYen, '税込金額', errors);
  let net = optionalYen(line.netYen, '税抜金額', errors);
  let tax = optionalYen(line.taxYen, '消費税額', errors);
  let multipliedPrice: bigint | undefined;
  if (quantity && usablePrice) {
    const product = productYen(quantity, usablePrice);
    if (product > maxSafe) errors.push('数量と単価から計算した金額が扱える範囲を超えています。');
    else multipliedPrice = product;
  }
  if (gross === undefined && net === undefined && multipliedPrice !== undefined) {
    if (line.unitPriceBasis === 'tax-included') gross = multipliedPrice;
    else net = multipliedPrice;
    warnings.push('数量と単価から明細金額を計算しました。書類の金額と一致するか確認してください。');
  }
  if (gross !== undefined && net !== undefined) {
    if (gross < net) errors.push('税込金額が税抜金額より小さくなっています。');
    else if (tax === undefined) tax = gross - net;
    else if (gross !== net + tax) errors.push('税込金額と、税抜金額＋消費税額が一致しません。');
  } else if (net !== undefined && tax !== undefined) {
    gross = net + tax;
  } else if (gross !== undefined && tax !== undefined) {
    if (gross < tax) errors.push('消費税額が税込金額を超えています。');
    else net = gross - tax;
  }
  const rate = line.taxRate ? BigInt(line.taxRate) : undefined;
  if (rate !== undefined && tax === undefined) {
    if (gross !== undefined) {
      net = roundDivision(gross * 100n, 100n + rate);
      tax = gross - net;
      taxCalculated = true;
      warnings.push('税込金額と税率から、税抜金額・消費税額を計算しました。書類と確認してください。');
    } else if (net !== undefined) {
      tax = roundDivision(net * rate, 100n);
      gross = net + tax;
      taxCalculated = true;
      warnings.push('税抜金額と税率から消費税を四捨五入し、税込金額を計算しました。書類と確認してください。');
    }
  }
  if (hasPrice && (gross === undefined || net === undefined || tax === undefined)) {
    errors.push('税込金額または税抜金額を確認してください。不明な単価や税額だけから明細金額は推測しません。');
  }
  if ([gross, net, tax].some((amount) => amount !== undefined && (amount < 0n || amount > maxSafe))) {
    errors.push('計算した金額が扱える範囲を超えています。');
  }
  if (net !== undefined && tax !== undefined && rate !== undefined && !taxMatches(net, tax, rate)) {
    errors.push('消費税額と税率が税抜金額に見合いません。書類の明細金額を確認してください。');
  }
  if (multipliedPrice !== undefined) {
    const amount = line.unitPriceBasis === 'tax-included' ? gross : net;
    if (amount !== undefined && abs(multipliedPrice - amount) > 1n) {
      errors.push('数量×単価と明細金額が一致しません。単位・数量・金額を確認してください。');
    }
  }

  let inputPrice = '';
  if (usablePrice && quantity && gross !== undefined && rate !== undefined) {
    if (line.unitPriceBasis === 'tax-included') {
      inputPrice = decimalText(usablePrice.value, usablePrice.scale);
    } else {
      const scaled = roundDivision(usablePrice.value * (100n + rate) * 1_000_000n, usablePrice.scale * 100n);
      const converted = { value: scaled, scale: 1_000_000n };
      if (scaled > 0n && scaled <= maxSafe * converted.scale && abs(productYen(quantity, converted) - gross) <= 1n) {
        inputPrice = decimalText(scaled, converted.scale);
      } else {
        warnings.push('税の端数調整を含むため税込単価は空欄にし、確認した明細金額を使います。');
      }
    }
  }
  const input: FeedInventoryInput = {
    transactionDate: date, feedName: line.feedName, transactionType: '入庫',
    quantity: quantity ? decimalText(quantity.value, quantity.scale) : line.quantity,
    unit: line.unit, bagWeightKg: bagWeight ? decimalText(bagWeight.value, bagWeight.scale) : '',
    totalWeightKg: quantity && bagWeight
      ? decimalText(quantity.value * bagWeight.value, quantity.scale * bagWeight.scale) : '',
    unitPrice: inputPrice, totalPrice: gross?.toString() ?? '', supplier: candidate.supplier,
    sourceType: 'purchased', taxRate: line.taxRate || undefined,
    taxExcludedPrice: net?.toString() ?? '', taxAmount: tax?.toString() ?? '',
    memo: [candidate.documentType === 'invoice' ? '請求書' : '納品書',
      candidate.documentNumber, `明細${index + 1}`, candidate.issueDate ? `発行日${candidate.issueDate}` : '']
      .filter(Boolean).join(' / '),
  };
  if (!errors.length) errors.push(...validateFeedDocumentInput(input));
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], input: errors.length ? null : input, taxCalculated };
}

/** Recheck an imported entry after edits, immediately before the existing save. */
export function validateFeedDocumentInput(input: FeedInventoryInput): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return ['取り込んだ入庫内容を確認してください。'];
  const requiredText = ['transactionDate', 'feedName', 'quantity', 'unit', 'bagWeightKg', 'totalWeightKg',
    'unitPrice', 'totalPrice', 'supplier', 'memo'] as const;
  if (requiredText.some((field) => typeof input[field] !== 'string') ||
      (input.taxExcludedPrice !== undefined && typeof input.taxExcludedPrice !== 'string') ||
      (input.taxAmount !== undefined && typeof input.taxAmount !== 'string')) {
    return ['取り込んだ入庫内容の形式を確認してください。'];
  }
  if (input.transactionType !== '入庫' || input.sourceType !== 'purchased') errors.push('書類の明細は購入飼料の入庫として確認してください。');
  if (!validDate(input.transactionDate)) errors.push('入庫日を正しい日付で確認してください。');
  if (!input.feedName.trim() || input.feedName.length > 300) errors.push('飼料名を確認してください。');
  else if (nonFeedLabel(input.feedName)) errors.push('送料・値引き・返品・税額・合計などは飼料の入庫として取り込めません。');
  if (input.supplier.length > 300 || input.memo.length > 2000) errors.push('仕入先またはメモが長すぎます。内容を確認してください。');
  if (!input.unit || !units.includes(input.unit)) errors.push('数量の単位を確認してください。');
  const quantity = positiveDecimal(input.quantity);
  if (!quantity) errors.push('数量を0より大きい数値で確認してください（小数6桁以内）。');
  if (input.unit === '袋') {
    const bagWeight = positiveDecimal(input.bagWeightKg);
    if (!bagWeight) errors.push('1袋の重量を0より大きいkgで確認してください（小数6桁以内）。');
    if (quantity && bagWeight) {
      const suppliedWeight = Number(input.totalWeightKg);
      const expectedWeight = Number(decimalText(quantity.value * bagWeight.value, quantity.scale * bagWeight.scale));
      if (!validWeightProduct(quantity, bagWeight) || !input.totalWeightKg.trim() ||
          !Number.isFinite(suppliedWeight) || suppliedWeight <= 0 || suppliedWeight > Number.MAX_SAFE_INTEGER ||
          Math.abs(suppliedWeight - expectedWeight) > Number.EPSILON * Math.max(1, expectedWeight) * 4) {
        errors.push('合計重量を、袋数×1袋の重量と一致させてください。');
      }
    }
  }
  const price = input.unitPrice ? positiveDecimal(input.unitPrice) : null;
  if (input.unitPrice && !price) errors.push('税込単価を0より大きい数値で確認してください（小数6桁以内）。');
  const gross = optionalYen(input.totalPrice, '税込金額', errors);
  const net = optionalYen(input.taxExcludedPrice || '', '税抜金額', errors);
  const tax = optionalYen(input.taxAmount || '', '消費税額', errors);
  const hasPrice = Boolean(input.unitPrice || input.totalPrice || input.taxExcludedPrice || input.taxAmount);
  if (input.taxRate !== undefined && !['10', '8', '0'].includes(input.taxRate)) errors.push('税率を確認してください。');
  if (hasPrice && !input.taxRate) errors.push('金額に対応する税率を確認してください。');
  if (hasPrice && (gross === undefined || net === undefined || tax === undefined)) {
    errors.push('税込金額・税抜金額・消費税額を確認してください。不明な金額は0円に置き換えません。');
  }
  if (gross !== undefined && net !== undefined && tax !== undefined) {
    if (gross !== net + tax) errors.push('税込金額と、税抜金額＋消費税額が一致しません。');
    if (input.taxRate && ['10', '8', '0'].includes(input.taxRate) && !taxMatches(net, tax, BigInt(input.taxRate))) {
      errors.push('消費税額と税率が税抜金額に見合いません。');
    }
  }
  if (quantity && price && gross !== undefined) {
    const amount = productYen(quantity, price);
    if (amount > maxSafe || abs(amount - gross) > 1n) errors.push('数量×税込単価と税込金額が一致しません。');
  }
  return [...new Set(errors)];
}
