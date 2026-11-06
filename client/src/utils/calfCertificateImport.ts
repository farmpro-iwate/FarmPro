import type { CalfInput } from '../types/calf';

export type CalfCertificateCandidate = {
  documentType: 'calf-registration-certificate' | 'other' | 'unknown';
  identificationNumber: string;
  earTag: string;
  registrationNumber: string;
  name: string;
  birthday: string;
  sex: '' | '雌' | '雄' | '去勢';
  sire: string;
  dam: string;
  maternalSire: string;
  maternalGrandSire: string;
  notes: string[];
};

export const emptyCalfCertificateCandidate: CalfCertificateCandidate = {
  documentType: 'unknown',
  identificationNumber: '', earTag: '', registrationNumber: '', name: '',
  birthday: '', sex: '', sire: '', dam: '', maternalSire: '', maternalGrandSire: '',
  notes: [],
};

const candidateKeys = Object.keys(emptyCalfCertificateCandidate);
const sexes = ['', '雌', '雄', '去勢'];
const malformed = () => new Error('子牛登録証明書の読み取り結果の形式が不正です。もう一度読み取ってください。');

function readText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || value.length > maxLength) throw malformed();
  return value.trim();
}

export function normalizeCalfCertificateIdentifier(value: string): string {
  return value.normalize('NFKC').replace(/[\s‐‑‒–—―−-]/g, '');
}

/** Parses candidates only. It never creates an animal or guesses missing digits. */
export function normalizeCalfCertificateCandidate(value: unknown): CalfCertificateCandidate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw malformed();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== candidateKeys.length ||
      candidateKeys.some(key => !Object.prototype.hasOwnProperty.call(record, key))) throw malformed();
  const documentType = readText(record.documentType, 40);
  const sex = readText(record.sex, 10);
  if (!['calf-registration-certificate', 'other', 'unknown'].includes(documentType) || !sexes.includes(sex)) throw malformed();
  if (!Array.isArray(record.notes) || record.notes.length > 20) throw malformed();
  return {
    documentType: documentType as CalfCertificateCandidate['documentType'],
    identificationNumber: normalizeCalfCertificateIdentifier(readText(record.identificationNumber, 64)),
    earTag: normalizeCalfCertificateIdentifier(readText(record.earTag, 64)),
    registrationNumber: readText(record.registrationNumber, 200),
    name: readText(record.name, 300),
    birthday: readText(record.birthday, 32).normalize('NFKC'),
    sex: sex as CalfCertificateCandidate['sex'],
    sire: readText(record.sire, 300),
    dam: readText(record.dam, 300),
    maternalSire: readText(record.maternalSire, 300),
    maternalGrandSire: readText(record.maternalGrandSire, 300),
    notes: record.notes.map(note => readText(note, 1000)),
  };
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

export function validateCalfCertificateCandidate(value: CalfCertificateCandidate): string[] {
  let candidate: CalfCertificateCandidate;
  try { candidate = normalizeCalfCertificateCandidate(value); }
  catch { return [malformed().message]; }
  const errors: string[] = [];
  if (candidate.documentType !== 'calf-registration-certificate') {
    errors.push('1頭分の子牛登録証明書を確認してください。');
  }
  if (!/^\d{10}$/.test(candidate.identificationNumber)) {
    errors.push('子牛本人の個体識別番号を10桁の数字で確認してください。');
  }
  if (candidate.earTag && !/^\d{1,10}$/.test(candidate.earTag)) {
    errors.push('耳標番号を1〜10桁の数字で確認してください。');
  }
  if (!validDate(candidate.birthday)) errors.push('子牛の生年月日を正しい日付で確認してください。');
  if (!candidate.sex) errors.push('子牛の性別を選んでください。');
  return errors;
}

function nameKey(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, '');
}

function appendNoteLines(existing: string, lines: string[]): string {
  const present = new Set(existing.split(/\r?\n/).map(line => line.trim()));
  const additions = lines.filter(line => {
    if (present.has(line)) return false;
    present.add(line);
    return true;
  });
  if (!additions.length) return existing;
  return existing + (existing && !existing.endsWith('\n') ? '\n' : '') + additions.join('\n');
}

export type CalfCertificatePatchResult = {
  errors: string[];
  warnings: string[];
  patch: Partial<CalfInput> | null;
};

/** Only confirmed basic fields are returned; existing operational records stay in the parent form. */
export function buildCalfCertificatePatch(
  value: CalfCertificateCandidate,
  current: CalfInput,
): CalfCertificatePatchResult {
  let candidate: CalfCertificateCandidate;
  try { candidate = normalizeCalfCertificateCandidate(value); }
  catch { return { errors: [malformed().message], warnings: [], patch: null }; }
  const errors = validateCalfCertificateCandidate(candidate);
  const warnings: string[] = [];
  const requiredText = ['identificationNumber', 'calfNumber', 'motherName', 'note'] as const;
  const optionalText = ['motherCowId', 'motherCowName', 'geneticMotherCowId', 'geneticMotherCowName',
    'recipientCowId', 'recipientCowName', 'breedingId', 'breedingMethod'] as const;
  if (!current || typeof current !== 'object' ||
      requiredText.some(key => typeof current[key] !== 'string') ||
      optionalText.some(key => current[key] !== undefined && typeof current[key] !== 'string')) {
    return { errors: [...errors, '現在の子牛情報を確認できません。画面を開き直してください。'], warnings, patch: null };
  }

  const currentIdentity = normalizeCalfCertificateIdentifier(current.identificationNumber);
  if (/^\d{10}$/.test(currentIdentity) && currentIdentity !== candidate.identificationNumber) {
    errors.push('証明書の個体識別番号が、入力中の子牛と一致しません。対象の子牛を確認してください。');
  }
  const currentEarTag = current.calfNumber.trim();
  if (currentEarTag && !currentEarTag.startsWith('TEMP-') && candidate.earTag &&
      normalizeCalfCertificateIdentifier(currentEarTag) !== candidate.earTag) {
    errors.push('証明書の耳標番号が、入力中の子牛と一致しません。対象の子牛を確認してください。');
  }
  if (errors.length) return { errors, warnings, patch: null };

  const patch: Partial<CalfInput> = {
    identificationNumber: candidate.identificationNumber,
    birthday: candidate.birthday,
    sex: candidate.sex,
  };
  if (candidate.earTag) patch.calfNumber = candidate.earTag;
  if (candidate.name) patch.name = candidate.name;
  if (candidate.sire) patch.sireName = candidate.sire;

  const noteLines: string[] = [];
  if (candidate.registrationNumber) noteLines.push('登録証明書の登録番号：' + candidate.registrationNumber);
  if (candidate.maternalSire) noteLines.push('登録証明書の母の父：' + candidate.maternalSire);
  if (candidate.maternalGrandSire) noteLines.push('登録証明書の祖母の父：' + candidate.maternalGrandSire);
  if (candidate.dam) {
    // The recipient is a different relationship. Its ear tag is never used as a genetic-mother link.
    const hasMotherLink = Boolean(current.motherCowId?.trim() || current.geneticMotherCowId?.trim() || current.breedingId?.trim());
    const currentMotherNames = [current.motherName, current.motherCowName || '', current.geneticMotherCowName || '']
      .map(name => name.trim()).filter(Boolean);
    const motherUnconfirmed = !currentMotherNames.length || currentMotherNames.some(name => nameKey(name) !== nameKey(candidate.dam));
    if (hasMotherLink && motherUnconfirmed) {
      warnings.push('現在の母牛情報と証明書の母牛名を照合できません。母牛名を保持し、証明書の母牛名を備考へ追記します。');
      noteLines.push('登録証明書の母牛名：' + candidate.dam);
    } else {
      patch.motherName = candidate.dam;
      patch.motherCowName = candidate.dam;
      const isEt = current.breedingMethod === '受精卵移植' || Boolean(current.recipientCowId?.trim() || current.recipientCowName?.trim());
      if (isEt) patch.geneticMotherCowName = candidate.dam;
    }
  }
  if (noteLines.length) {
    const note = appendNoteLines(current.note, noteLines);
    if (note !== current.note) patch.note = note;
  }
  return { errors, warnings, patch };
}

/** Rechecks fields editable after applying a certificate, immediately before the existing save. */
export function validateCalfCertificateForm(input: CalfInput): string[] {
  if (!input || typeof input !== 'object') return ['取り込んだ子牛情報を確認してください。'];
  const errors: string[] = [];
  if (typeof input.identificationNumber !== 'string' || !/^\d{10}$/.test(input.identificationNumber.trim())) {
    errors.push('子牛本人の個体識別番号を10桁の数字で確認してください。');
  }
  if (typeof input.birthday !== 'string' || !validDate(input.birthday)) {
    errors.push('子牛の生年月日を正しい日付で確認してください。');
  }
  if (!['雌', '雄', '去勢'].includes(input.sex)) errors.push('子牛の性別を選んでください。');
  if (typeof input.calfNumber !== 'string' ||
      (input.calfNumber.trim() && !/^TEMP-\S+$/.test(input.calfNumber.trim()) && !/^\d{1,10}$/.test(input.calfNumber.trim()))) {
    errors.push('耳標番号を1〜10桁の数字で確認してください。未装着の場合は空欄にできます。');
  }
  if (typeof input.name !== 'string' || input.name.length > 300 ||
      typeof input.sireName !== 'string' || input.sireName.length > 300) {
    errors.push('名号と父牛名を確認してください。');
  }
  return errors;
}
