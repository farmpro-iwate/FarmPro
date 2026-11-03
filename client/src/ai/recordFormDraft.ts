import { getStoredAuthUser } from '../services/authClient';

export type AiRecordFormKind = 'medicine-inventory' | 'embryo-inventory' | 'sale' | 'expense' |
  'blv' | 'feeding-action' | 'fattening' | 'cattle' | 'calf' | 'feeding' | 'treatment' | 'vaccine';

export type AiRecordFormCandidate = { kind: AiRecordFormKind; sourceText: string; fields: Record<string, string> };
export type AiRecordFormDraft = AiRecordFormCandidate & { version: 1; scope: { farmId: string; userId: string } };
export type AiRecordFormField = {
  label: string;
  hintOnly?: boolean;
  valueType?: 'number';
  format?: 'date' | 'number';
  options?: readonly string[];
};
export type AiRecordFormDefinition = {
  kind: AiRecordFormKind; label: string; route: string; fields: Record<string, AiRecordFormField>;
};

const stringField = (label: string): AiRecordFormField => ({ label });
const dateField = (label: string): AiRecordFormField => ({ label, format: 'date' });
const numberField = (label: string, valueType?: 'number'): AiRecordFormField => ({ label, format: 'number', ...(valueType ? { valueType } : {}) });
const optionField = (label: string, options: readonly string[]): AiRecordFormField => ({ label, options });
const payments = ['現金', '口座振替', '銀行振込', 'クレジットカード', 'JA精算', 'その他'];
const supplyFields = {
  action: optionField('区分', ['購入', '使用', '廃棄', '棚卸増', '棚卸減']), date: dateField('日付'),
  itemName: stringField('品名'), lotNumber: stringField('ロット番号・受精卵番号'),
  quantity: numberField('数量', 'number'), expiryDate: dateField('使用期限・確認日'),
  supplier: stringField('購入先'), storageLocation: stringField('保管場所'),
  unitPrice: numberField('単価（円）', 'number'), amount: numberField('購入金額（円）', 'number'),
  cowEarTag: stringField('使用した牛の耳標番号'), purchaseReference: stringField('購入伝票・明細番号'),
  note: stringField('メモ'),
};

/** Only visible business input values. Record IDs, links, sync state and expense checkboxes are excluded. */
export const AI_RECORD_FORM_DEFINITIONS: readonly AiRecordFormDefinition[] = [
  { kind: 'medicine-inventory', label: '医薬品の購入・入出庫', route: '/supply-inventory/new?kind=%E5%8C%BB%E8%96%AC%E5%93%81', fields: {
    ...supplyFields, unit: optionField('単位', ['本', '瓶', '箱', 'mL', '錠', '分包', '個']),
  } },
  { kind: 'embryo-inventory', label: '受精卵の購入・入出庫', route: '/supply-inventory/new?kind=%E5%8F%97%E7%B2%BE%E5%8D%B5', fields: {
    ...supplyFields, unit: optionField('単位', ['個']), donorCow: stringField('供卵牛'), sire: stringField('父牛'), grade: stringField('受精卵ランク'),
  } },
  { kind: 'sale', label: '出荷・販売', route: '/sales/new', fields: {
    targetType: optionField('対象区分', ['子牛', '成牛', 'その他']), targetNumber: stringField('対象番号'), targetName: stringField('対象名'),
    sex: optionField('性別', ['雌', '雄', '去勢', '不明']), birthday: dateField('生年月日'), motherName: stringField('母牛名'),
    shippingPlanDate: dateField('出荷予定日'), shippingDate: dateField('出荷日'), saleDate: dateField('販売日'),
    buyer: stringField('販売先'), marketName: stringField('市場名'), saleWeight: numberField('販売体重（kg）'), salePrice: numberField('販売金額（円）'),
    status: optionField('状態', ['出荷予定', '出荷済み', '販売済み', '取消']), reason: stringField('出荷・販売理由'), memo: stringField('メモ'),
  } },
  { kind: 'expense', label: '経費', route: '/expenses/new', fields: {
    paymentDate: dateField('支払日'), category: stringField('経費科目'), description: stringField('内容'), vendor: stringField('支払先'),
    amount: numberField('金額（円）'), paymentMethod: optionField('支払方法', payments), target: stringField('対象'), memo: stringField('メモ'),
  } },
  { kind: 'blv', label: 'BLV検査', route: '/blv/new', fields: {
    cowEarTag: stringField('耳標番号'), cowName: stringField('名号'), testDate: dateField('検査日'),
    result: optionField('結果', ['未検査', '陰性', '陽性']), nextTestDate: dateField('次回検査日'), isolationMemo: stringField('隔離メモ'), note: stringField('メモ'),
  } },
  { kind: 'feeding-action', label: '給与アラート対応', route: '/feeding-alert-actions/new', fields: {
    actionDate: dateField('対応日'), calfName: stringField('子牛名'), calfNumber: { label: '子牛番号（対象確認用）', hintOnly: true }, ageDays: numberField('日齢'),
    alertType: optionField('アラート', ['不足気味', '多め', '実績なし', '生年月日なし', '給与目安なし', 'その他']),
    actionType: optionField('対応内容', ['確認のみ', '給与量を増やした', '給与量を減らした', 'スターターを調整', '育成配合を調整', '粗飼料を調整', '給与実績を登録', '生年月日を確認', '目安表を見直し', '様子を見る', '相談する', 'その他']),
    nextCheckDate: dateField('次回確認日'), status: optionField('状態', ['未対応', '対応中', '対応済み', '様子見', '再確認必要']), memo: stringField('メモ'),
  } },
  { kind: 'fattening', label: '肥育移行', route: '/fattening-transitions/new', fields: {
    targetNumber: stringField('対象番号'), targetName: stringField('対象名'), startDate: dateField('肥育開始日'),
    transitionReason: stringField('移行理由'), startWeight: numberField('開始体重（kg）'), targetWeight: numberField('目標体重（kg）'),
    targetShippingDate: dateField('出荷予定日'), housingLocation: stringField('飼養場所'), withdrawalEndDate: dateField('休薬終了日'),
    status: optionField('状態', ['肥育中', '出荷準備', '出荷済み']), memo: stringField('メモ'),
  } },
  { kind: 'cattle', label: '牛の登録', route: '/cattle/new', fields: {
    earTag: stringField('耳標番号'), identificationNumber: stringField('個体識別番号'), name: stringField('名号'), birthday: dateField('生年月日'),
    sex: optionField('性別', ['雌', '雄', '去勢']), sire: stringField('父牛'), dam: stringField('母牛'), parity: numberField('産次', 'number'),
    acquisitionMethod: optionField('導入区分', ['purchased-calf', 'purchased-pregnant', 'retained']), acquisitionDate: dateField('導入日'),
    acquisitionPrice: numberField('導入価格（円）', 'number'), note: stringField('メモ'),
  } },
  { kind: 'calf', label: '子牛の登録', route: '/calves/new', fields: {
    calfNumber: stringField('子牛番号'), identificationNumber: stringField('個体識別番号'), name: stringField('名号'), birthday: dateField('生年月日'),
    sex: optionField('性別', ['雌', '雄', '去勢']), motherName: stringField('母牛名'), sireName: stringField('父牛名'),
    startWeight: numberField('出生時体重（kg）', 'number'), currentWeight: numberField('現在体重（kg）', 'number'),
    milkAmount: numberField('ミルク量', 'number'), starterAmount: numberField('スターター量', 'number'),
    feedingMethod: optionField('哺育方法', ['人工哺育', '母乳哺育', '混合哺育']),
    weaningPlannedDate: dateField('離乳予定日'), weaningDate: dateField('離乳日'), weaningStatus: optionField('離乳状態', ['離乳前', '離乳済み']),
    weaningWeight: numberField('離乳体重（kg）', 'number'), weaningStarterAmount: numberField('離乳時スターター量', 'number'),
    milkEndDate: dateField('ミルク終了日'), note: stringField('メモ'),
  } },
  { kind: 'feeding', label: '飼料給与の記録', route: '/feedings/new', fields: {
    feedingDate: dateField('給与日'), target: stringField('対象'), feedName: stringField('飼料名'), amount: numberField('給与量'),
    unit: optionField('単位', ['kg', '袋', 'ロール', '束', '個', 'その他']), unitPrice: numberField('単価（円）'), totalPrice: numberField('金額（円）'),
    purpose: optionField('目的', ['維持', '増体', '繁殖', '分娩前', '子牛育成', 'その他']), memo: stringField('メモ'),
  } },
  { kind: 'treatment', label: '治療・予防・処置（詳細）', route: '/treatments/new', fields: {
    targetType: { ...optionField('対象区分', ['成牛', '子牛']), hintOnly: true },
    recordType: optionField('記録区分', ['治療', '繁殖治療', '予防', '去勢', '削蹄', 'その他の処置']),
    breedingTreatmentType: optionField('繁殖治療の種類', ['発情誘起処置', '排卵誘起処置', '発情・排卵同期化', '黄体関連処置', 'その他の繁殖処置']),
    targetNumber: stringField('対象番号'), targetName: stringField('対象名'), treatmentDate: dateField('実施日'), symptom: stringField('症状'), diagnosis: stringField('診断'),
    treatmentProcedure: stringField('処置'), medicine: stringField('薬剤'), dosage: stringField('投薬量'),
    medicineSource: optionField('薬剤の使用元', ['farm_stock', 'veterinarian']),
    medicineCost: numberField('薬剤費（円）'), medicalFee: numberField('診療費（円）'), withdrawalEndDate: dateField('休薬終了日'),
    veterinarian: stringField('獣医師・担当者'), hoofAbnormality: optionField('蹄の異常', ['未記録', '異常なし', '異常あり']),
    nextScheduledDate: dateField('次回予定日'), progress: optionField('経過', ['治療中', '経過観察', '回復', '要再診', '繁殖継続', '繁殖終了']), note: stringField('メモ'),
  } },
  { kind: 'vaccine', label: 'ワクチン（子牛・詳細）', route: '/vaccines/new', fields: {
    targetType: optionField('対象区分', ['成牛', '子牛']), targetNumber: stringField('対象番号'), targetName: stringField('対象名'),
    vaccineName: stringField('ワクチン名'), vaccineCost: numberField('ワクチン費用（円）'), vaccinationDate: dateField('接種日'),
    nextDueDate: dateField('次回接種予定日'), status: optionField('状態', ['未接種', '接種済み']), note: stringField('メモ'),
  } },
];

export function getAiRecordFormDefinition(kind: AiRecordFormKind): AiRecordFormDefinition {
  const definition = AI_RECORD_FORM_DEFINITIONS.find(item => item.kind === kind);
  if (!definition) throw new Error('登録する記録の種類を確認してください。');
  return definition;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function currentScope(): AiRecordFormDraft['scope'] | null {
  try {
    const user = getStoredAuthUser();
    if (typeof user?.farmId !== 'string' || !user.farmId.trim() || typeof user.id !== 'string' || !user.id.trim()) return null;
    return { farmId: user.farmId, userId: user.id };
  } catch { return null; }
}

export function isAiRecordCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function cleanFields(kind: AiRecordFormKind, fields: unknown): Record<string, string> {
  const clean: Record<string, string> = {};
  if (!object(fields)) return clean;
  for (const [key, field] of Object.entries(getAiRecordFormDefinition(kind).fields)) {
    if (!Object.prototype.hasOwnProperty.call(fields, key) || typeof fields[key] !== 'string') continue;
    const value = (fields[key] as string).trim();
    const limit = ['note', 'memo', 'description', 'isolationMemo', 'symptom'].includes(key) ? 2000 : 200;
    if (!value || value.length > limit || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) continue;
    if (field.options && !field.options.includes(value)) continue;
    if (field.format === 'date' && !isAiRecordCalendarDate(value)) continue;
    if (field.format === 'number' && (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value)) || Number(value) < 0)) continue;
    clean[key] = value;
  }
  return clean;
}

export function createAiRecordFormDraft(candidate: AiRecordFormCandidate): AiRecordFormDraft {
  const scope = currentScope();
  if (!scope) throw new Error('利用者と農場を確認できません。ログインし直して候補を作成してください。');
  if (!object(candidate) || !AI_RECORD_FORM_DEFINITIONS.some(item => item.kind === candidate.kind) ||
      typeof candidate.sourceText !== 'string' || candidate.sourceText.length > 2000 || !object(candidate.fields)) {
    throw new Error('登録候補を確認できません。2000文字以内で入力してください。');
  }
  return { version: 1, scope, kind: candidate.kind, sourceText: candidate.sourceText.trim(), fields: cleanFields(candidate.kind, candidate.fields) };
}

/** The caller must use this only for a new-record screen; existing record forms ignore router drafts. */
export function readAiRecordFormDraft(state: unknown, kind: AiRecordFormKind | readonly AiRecordFormKind[]): AiRecordFormDraft | null {
  if (!object(state) || !object(state.farmproAiDraft)) return null;
  const value = state.farmproAiDraft;
  const allowed = typeof kind === 'string' ? [kind] : kind;
  if (value.version !== 1 || typeof value.kind !== 'string' || !allowed.includes(value.kind as AiRecordFormKind) ||
      !AI_RECORD_FORM_DEFINITIONS.some(item => item.kind === value.kind) || typeof value.sourceText !== 'string' || value.sourceText.length > 2000 ||
      !object(value.fields) || !object(value.scope)) return null;
  const scope = currentScope();
  if (!scope || value.scope.farmId !== scope.farmId || value.scope.userId !== scope.userId) return null;
  return { version: 1, scope, kind: value.kind as AiRecordFormKind, sourceText: value.sourceText.trim(), fields: cleanFields(value.kind as AiRecordFormKind, value.fields) };
}

export function assertAiRecordFormDraftOwner(draft: AiRecordFormDraft | null): void {
  if (!draft) return;
  const scope = currentScope();
  if (!scope || scope.farmId !== draft.scope.farmId || scope.userId !== draft.scope.userId) {
    throw new Error('利用者または農場が変わりました。AIで記録から候補を作り直してください。');
  }
}

export function getAiRecordFormValues<T>(draft: AiRecordFormDraft | null): Partial<T> {
  if (!draft) return {};
  assertAiRecordFormDraftOwner(draft);
  const fields = cleanFields(draft.kind, draft.fields);
  const definition = getAiRecordFormDefinition(draft.kind);
  return Object.fromEntries(Object.entries(fields).filter(([key]) => !definition.fields[key].hintOnly)
    .map(([key, value]) => [key, definition.fields[key].valueType === 'number' ? Number(value) : value])) as Partial<T>;
}
