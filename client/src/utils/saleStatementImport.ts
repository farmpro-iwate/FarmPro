/** Read-only candidates. These helpers never create or update business records. */
export type SaleStatementLine = { label: string; amountYen: string };

export type SaleStatementCandidate = {
  documentType: 'sale-settlement' | 'other' | 'unknown';
  animalCount: string;
  statementNumber: string;
  saleDate: string;
  paymentDate: string;
  marketName: string;
  issuerName: string;
  identificationNumber: string;
  earTag: string;
  animalName: string;
  birthday: string;
  sex: '' | '雌' | '雄' | '去勢';
  saleWeightKg: string;
  grossYen: string;
  deductionTotalYen: string;
  netYen: string;
  deductions: SaleStatementLine[];
  /** Positive adds to the payment; negative subtracts from it. */
  adjustments: SaleStatementLine[];
  notes: string[];
};

export const emptySaleStatementCandidate: SaleStatementCandidate = {
  documentType: 'unknown', animalCount: '', statementNumber: '', saleDate: '',
  paymentDate: '', marketName: '', issuerName: '', identificationNumber: '',
  earTag: '', animalName: '', birthday: '', sex: '', saleWeightKg: '',
  grossYen: '', deductionTotalYen: '', netYen: '', deductions: [], adjustments: [], notes: [],
};

const textFields = [
  'animalCount', 'statementNumber', 'saleDate', 'paymentDate', 'marketName',
  'issuerName', 'identificationNumber', 'earTag', 'animalName', 'birthday',
  'saleWeightKg', 'grossYen', 'deductionTotalYen', 'netYen',
] as const;
const amountFields = ['animalCount', 'saleWeightKg', 'grossYen', 'deductionTotalYen', 'netYen'] as const;
const malformedResult = () => new Error('精算書の読み取り結果の形式が不正です。もう一度読み取ってください。');

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readText(value: unknown): string {
  // Missing values must be explicitly represented by an empty string. In
  // particular, a malformed amount must not silently turn into zero or blank.
  if (typeof value !== 'string' || value.length > 2000) throw malformedResult();
  return value.trim();
}

function normalizeAmountText(value: string): string {
  const text = value.trim().normalize('NFKC').replace(/−/g, '-');
  // Remove only correctly grouped separators. Preserve an invalid token so
  // validation can flag it; do not turn "1,00" or "1e3" into a valid amount.
  return /^[+-]?\d{1,3}(?:,\d{3})+$/.test(text) ? text.replace(/,/g, '') : text;
}

function readLines(value: unknown): SaleStatementLine[] {
  if (!Array.isArray(value) || value.length > 100) throw malformedResult();
  return value.map((line) => {
    if (!isRecord(line)) throw malformedResult();
    return { label: readText(line.label), amountYen: normalizeAmountText(readText(line.amountYen)) };
  });
}

export function normalizeSaleStatementCandidate(value: unknown): SaleStatementCandidate {
  if (!isRecord(value)) throw malformedResult();
  const documentType = readText(value.documentType);
  const sex = readText(value.sex);
  if (!['sale-settlement', 'other', 'unknown'].includes(documentType) ||
      !['', '雌', '雄', '去勢'].includes(sex)) throw malformedResult();
  const candidate: SaleStatementCandidate = {
    ...emptySaleStatementCandidate,
    documentType: documentType as SaleStatementCandidate['documentType'],
    sex: sex as SaleStatementCandidate['sex'],
    deductions: readLines(value.deductions),
    adjustments: readLines(value.adjustments),
    notes: [],
  };
  for (const field of textFields) candidate[field] = readText(value[field]);
  for (const field of amountFields) candidate[field] = normalizeAmountText(candidate[field]);
  candidate.identificationNumber = candidate.identificationNumber.normalize('NFKC');
  candidate.earTag = candidate.earTag.normalize('NFKC');
  if (!Array.isArray(value.notes) || value.notes.length > 100) throw malformedResult();
  candidate.notes = value.notes.map(readText);
  return candidate;
}

function integerYen(value: string, signed = false): number | null {
  const text = normalizeAmountText(value);
  if (!/^[+-]?\d+$/.test(text)) return null;
  const amount = Number(text);
  return Number.isSafeInteger(amount) && (signed || amount >= 0) ? amount : null;
}

function safeNumber(value: bigint): number | null {
  return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value) : null;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function normalizedLabel(label: string): string {
  return label.normalize('NFKC').replace(/\s/g, '').toLocaleLowerCase();
}

function isSummaryLine(label: string): boolean {
  const text = normalizedLabel(label).replace(/[()【】\[\]]/g, '');
  return /^(?:合計|小計)(?:額|金額)?$/.test(text) ||
    /(?:控除|販売|精算|税込|税抜|調整).*(?:合計|小計)/.test(text) ||
    /(?:内|うち|内訳).*消費税/.test(text) ||
    /税率.*対象/.test(text) ||
    /(?:標準|軽減).*対象/.test(text) ||
    /^(?:8|10)%.*対象/.test(text) ||
    /^消費税(?:等)?(?:額)?$/.test(text);
}

export type SaleStatementValidation = {
  errors: string[];
  grossYen: number | null;
  netYen: number | null;
  deductionsYen: number | null;
  adjustmentYen: number | null;
  calculatedNetYen: number | null;
};

export function validateSaleStatementCandidate(candidate: SaleStatementCandidate): SaleStatementValidation {
  const errors: string[] = [];
  if (candidate.documentType !== 'sale-settlement') errors.push('販売精算書として確認できません。書類を確認してください。');
  if (integerYen(candidate.animalCount) !== 1) errors.push('今回は1頭分の販売精算書に対応しています。頭数を確認してください。');
  if (candidate.deductions.length === 0) errors.push('この取り込みは、控除明細がある販売精算書に対応しています。');
  if (candidate.deductions.length + candidate.adjustments.length > 100) errors.push('控除・調整の明細は合計100件以内で確認してください。');
  const grossYen = integerYen(candidate.grossYen);
  const netYen = integerYen(candidate.netYen);
  if (grossYen === null) errors.push('販売金額を整数の円で確認してください。');
  if (netYen === null) errors.push('差引精算額を整数の円で確認してください。');
  for (const [field, label] of [['saleDate', '販売日'], ['paymentDate', '精算日'], ['birthday', '生年月日']] as const) {
    if (candidate[field] && !validDate(candidate[field])) errors.push(`${label}を正しい日付で確認してください。`);
  }
  if (candidate.identificationNumber && !/^\d{10}$/.test(candidate.identificationNumber)) {
    errors.push('個体識別番号は、読み取れた10桁を確認してください。');
  }
  if (candidate.saleWeightKg && (!/^\d+(?:\.\d+)?$/.test(candidate.saleWeightKg) ||
      !Number.isFinite(Number(candidate.saleWeightKg)) || Number(candidate.saleWeightKg) <= 0 ||
      Number(candidate.saleWeightKg) > Number.MAX_SAFE_INTEGER)) {
    errors.push('販売体重を正しいkgの数値で確認してください。');
  }
  const seenLines = new Set<string>();
  function totalLines(lines: SaleStatementLine[], signed: boolean, kind: string): number | null {
    if (lines.length > 100) {
      errors.push(`${kind}は100件以内で確認してください。`);
      return null;
    }
    let total = 0n;
    let valid = true;
    lines.forEach((line, index) => {
      const amount = integerYen(line.amountYen, signed);
      if (!line.label.trim()) errors.push(`${kind}${index + 1}の名称を確認してください。`);
      if (amount === null || (!signed && amount === 0)) {
        errors.push(`${kind}${index + 1}の金額を確認してください。${signed ? '加算は＋、減算は－の整数です。' : '控除は正の整数です。返金は調整額に分けてください。'}`);
        valid = false;
      } else {
        total += BigInt(amount);
      }
      if (isSummaryLine(line.label)) errors.push(`${kind}${index + 1}に税額内訳・合計が含まれています。明細へ重ねて入れていないか確認してください。`);
      const key = `${normalizedLabel(line.label)}|${amount ?? normalizeAmountText(line.amountYen)}`;
      if (seenLines.has(key)) errors.push('同じ名称・金額の明細があります。重複していないか確認してください。');
      seenLines.add(key);
    });
    const result = valid ? safeNumber(total) : null;
    if (valid && result === null) errors.push(`${kind}の合計が扱える金額を超えています。`);
    return result;
  }
  const deductionsYen = totalLines(candidate.deductions, false, '控除明細');
  const adjustmentYen = totalLines(candidate.adjustments, true, '調整明細');
  let calculatedNetYen: number | null = null;
  if (grossYen !== null && deductionsYen !== null && adjustmentYen !== null) {
    calculatedNetYen = safeNumber(BigInt(grossYen) - BigInt(deductionsYen) + BigInt(adjustmentYen));
    if (calculatedNetYen === null) errors.push('差引計算が扱える金額を超えています。');
    else if (netYen !== null && calculatedNetYen !== netYen) errors.push('販売金額・控除・調整額から計算した差引が、精算書の金額と一致しません。');
  }
  if (candidate.deductionTotalYen.trim()) {
    const statedTotal = integerYen(candidate.deductionTotalYen, true);
    if (statedTotal === null) errors.push('精算書の控除合計を整数の円で確認してください。');
    else if (deductionsYen !== null && adjustmentYen !== null &&
        BigInt(statedTotal) !== BigInt(deductionsYen) - BigInt(adjustmentYen)) {
      errors.push('明細の差引控除合計が、精算書の控除合計と一致しません。');
    }
  }
  return { errors: [...new Set(errors)], grossYen, netYen, deductionsYen, adjustmentYen, calculatedNetYen };
}

export function getSaleStatementTargetErrors(candidate: SaleStatementCandidate, target: {
  targetNumber: string; targetName?: string; salePrice?: string; identificationNumber?: string; saleDate?: string;
}): string[] {
  const errors: string[] = [];
  const targetNumber = target.targetNumber.trim().normalize('NFKC');
  const explicitId = (target.identificationNumber || '').trim().normalize('NFKC');
  const knownId = /^\d{10}$/.test(explicitId) ? explicitId : /^\d{10}$/.test(targetNumber) ? targetNumber : '';
  const candidateId = candidate.identificationNumber.trim().normalize('NFKC');
  if (/^\d{10}$/.test(candidateId) && knownId && candidateId !== knownId) {
    errors.push('精算書の個体識別番号と、選択した牛の番号が一致しません。');
  }
  const targetTag = targetNumber === knownId ? '' : targetNumber;
  const candidateTag = candidate.earTag.trim().normalize('NFKC');
  if (candidateTag && targetTag && candidateTag !== targetTag) {
    errors.push('精算書の耳標番号と、選択した牛の番号が一致しません。');
  }
  // Missing identity information is not a match. The UI must always ask the
  // user to confirm the selected animal; names and ID suffixes aren't proof.
  if (target.salePrice !== undefined) {
    const currentGross = integerYen(target.salePrice);
    const readGross = integerYen(candidate.grossYen);
    if (currentGross === null) errors.push('登録済みの販売金額を確認してください。');
    else if (readGross !== null && currentGross !== readGross) {
      errors.push('精算書の販売金額と、登録済みの販売金額が一致しません。販売記録を確認してください。');
    }
  }
  if (target.saleDate?.trim() && candidate.saleDate.trim() && target.saleDate.trim() !== candidate.saleDate.trim()) {
    errors.push('精算書の販売日と、登録済みの販売日が一致しません。販売記録を確認してください。');
  }
  return errors;
}
