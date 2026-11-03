import {
  AI_RECORD_FORM_DEFINITIONS, getAiRecordFormDefinition, isAiRecordCalendarDate,
  type AiRecordFormCandidate, type AiRecordFormKind,
} from './recordFormDraft';

const datePattern = '(?:\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}|\\d{4}年\\d{1,2}月\\d{1,2}日?|\\d{1,2}月\\d{1,2}日|今日|昨日|おととい|一昨日)';
const dateLabels = ['生年月日', '誕生日', '出生年月日', '出荷予定日', '出荷日', '販売日', '支払日', '検査日', '次回検査日', '対応日', '次回確認日', '肥育開始日', '開始日', '導入日', '離乳予定日', '離乳日', 'ミルク終了日', '実施日', '治療日', '接種日', '次回接種予定日', '使用期限', '有効期限', '休薬終了日', '次回予定日'];
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function localToday() {
  const now = new Date();
  return String(now.getFullYear()).padStart(4, '0') + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

function toDate(raw: string, today: string): string | undefined {
  if (['今日', '昨日', 'おととい', '一昨日'].includes(raw)) {
    if (!isAiRecordCalendarDate(today)) return undefined;
    const date = new Date(today + 'T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() - (raw === '今日' ? 0 : raw === '昨日' ? 1 : 2));
    return date.toISOString().slice(0, 10);
  }
  const full = raw.match(/^(\d{4})(?:[-/]|年)(\d{1,2})(?:[-/]|月)(\d{1,2})日?$/);
  const short = raw.match(/^(\d{1,2})月(\d{1,2})日$/);
  const day = full ? full[1] + '-' + full[2].padStart(2, '0') + '-' + full[3].padStart(2, '0')
    : short && isAiRecordCalendarDate(today) ? today.slice(0, 4) + '-' + short[1].padStart(2, '0') + '-' + short[2].padStart(2, '0') : '';
  return isAiRecordCalendarDate(day) ? day : undefined;
}

function labeledDate(text: string, labels: readonly string[], today: string) {
  for (const label of [...labels].sort((a, b) => b.length - a.length)) {
    const match = text.match(new RegExp('(?:^|[\\s、,。])' + escape(label) + '(?:は|が|[:：])?\\s*(' + datePattern + ')'));
    if (match) return toDate(match[1], today);
  }
  return undefined;
}

function primaryDate(text: string, labels: readonly string[], today: string) {
  const explicit = text.match(new RegExp('(?:^|[\\s、,。])(?:' + [...labels].sort((a, b) => b.length - a.length).map(escape).join('|') + ')(?:は|が|[:：])?\\s*(' + datePattern + ')'));
  if (explicit) return toDate(explicit[1], today);
  // A birthday/expiry/next check date is not the performed event date.
  const otherDates = new RegExp('(?:' + [...dateLabels].sort((a, b) => b.length - a.length).map(escape).join('|') + ')(?:は|が|[:：])?\\s*' + datePattern, 'g');
  const unlabelled = text.replace(otherDates, '').replace(new RegExp(datePattern + '\\s*(?:生まれ|生)', 'g'), '');
  const match = unlabelled.match(new RegExp(datePattern));
  return match ? toDate(match[0], today) : undefined;
}

function labeledText(text: string, labels: readonly string[]) {
  for (const label of [...labels].sort((a, b) => b.length - a.length)) {
    const match = text.match(new RegExp('(?:^|[\\s、,。])' + escape(label) + '\\s*(?:[:：]|は)\\s*(?:「([^」]+)」|"([^"\\n]+)"|([^\\s、,。\\n]+))'));
    if (match) return (match[1] || match[2] || match[3]).trim();
  }
  return undefined;
}

function numeric(raw: string): string | undefined {
  const value = raw.trim();
  if (!/^(?:\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)$/.test(value)) return undefined;
  const clean = value.replace(/,/g, '');
  return Number.isFinite(Number(clean)) ? clean : undefined;
}

function moneyValue(raw: string, unit: string): string | undefined {
  const clean = numeric(raw);
  if (clean === undefined) return undefined;
  if (unit !== '万円') return clean;
  const [whole, fraction = ''] = clean.split('.');
  const moved = whole + fraction.padEnd(4, '0').slice(0, 4);
  const remainder = fraction.slice(4);
  const result = moved.replace(/^0+(?=\d)/, '') + (remainder ? '.' + remainder : '');
  return Number.isFinite(Number(result)) ? result : undefined;
}

function money(text: string, labels: readonly string[], fallback = false) {
  for (const label of labels) {
    const match = text.match(new RegExp(escape(label) + '(?:は|が|[:：])?\\s*([+-]?\\d[\\d,]*(?:\\.\\d+)?)\\s*(万円|円)'));
    if (match) return moneyValue(match[1], match[2]);
  }
  if (!fallback || /単価|1(?:本|個|瓶|箱|分包|袋)あたり/.test(text)) return undefined;
  const amounts = [...text.matchAll(/([+-]?\d[\d,]*(?:\.\d+)?)\s*(万円|円)/g)];
  return amounts.length === 1 ? moneyValue(amounts[0][1], amounts[0][2]) : undefined;
}

function labeledNumber(text: string, labels: readonly string[]) {
  for (const label of labels) {
    const match = text.match(new RegExp(escape(label) + '(?:は|が|[:：])?\\s*([+-]?\\d[\\d,]*(?:\\.\\d+)?)'));
    if (match) return numeric(match[1]);
  }
  return undefined;
}

function targetNumber(text: string): string | undefined {
  const explicit = text.match(/(?:耳標(?:番号)?|対象番号|子牛番号)\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9-]{0,29})/);
  if (explicit) return explicit[1];
  const cow = text.match(/(?:子牛|成牛|母牛|繁殖牛|育成牛|牛)\s*(\d{3,12})(?!\d|年|月|日|円|万円|kg)/i);
  if (cow) return cow[1];
  const numbered = text.match(/(?:^|[\s、,])([0-9]{3,12})番(?:の|は|を|に|へ|が|[\s、,]|$)/);
  if (numbered) return numbered[1];
  // Bare leading numbers are supported only directly before an animal activity.
  const leading = text.match(/^(\d{3,12})\s+(?:(?:今日|昨日)\s*)?(?:BLV|削蹄|去勢|繁殖治療|治療|ワクチン|肥育|出荷|販売)/i);
  return leading?.[1];
}

function inferredKind(text: string): AiRecordFormKind | null {
  // A castrated animal can be registered or sold without recording another castration.
  if (/子牛(?:の|を)?(?:新規)?登録|子牛台帳.*登録|子牛.*新規登録/.test(text)) return 'calf';
  if (/(?:牛|育成牛|繁殖牛)(?:の|を)?(?:新規)?登録|牛台帳.*登録/.test(text)) return 'cattle';
  if (/出荷|販売|売却|売った/.test(text) && !/削蹄|治療|ワクチン|授精|種付|移植/.test(text)) return 'sale';
  const medicalDetails = /削蹄|去勢|繁殖治療|その他(?:の)?処置|予防(?!接種)/.test(text) ||
    (/子牛/.test(text) && /治療|投薬/.test(text)) ||
    (/(?:農場在庫|獣医師(?:が|の)?(?:処方|持参)|薬剤(?:の)?使用元)/.test(text) && /治療|投薬|薬剤|薬品/.test(text));
  if (medicalDetails && !/経費|支払|購入|仕入|入庫/.test(text)) return 'treatment';
  if (/子牛/.test(text) && /ワクチン|予防接種/.test(text) && !/購入|仕入|入庫/.test(text)) return 'vaccine';
  if (/医薬品|薬品|薬剤|(?:^|[\s、,])薬(?:を|の|は|\s|$)/.test(text) && /購入|買った|仕入|入庫|使用|出庫|廃棄|棚卸/.test(text)) return 'medicine-inventory';
  if (/受精卵/.test(text) && /購入|買った|仕入|入庫|廃棄|棚卸/.test(text)) return 'embryo-inventory';
  if (/受精卵/.test(text) && /使用|出庫/.test(text) && !/移植|\bET\b/i.test(text)) return 'embryo-inventory';
  if (/BLV|牛白血病/i.test(text)) return 'blv';
  if (/給与アラート|給与注意.*対応/.test(text)) return 'feeding-action';
  if (/肥育移行|肥育(?:へ|に)移|肥育を開始|肥育開始/.test(text)) return 'fattening';
  if (/飼料給与(?:の)?(?:記録|登録)|給与記録/.test(text)) return 'feeding';
  if (/経費|支払(?:った|い|日)|水道光熱費|燃料費|修繕費|消耗品費/.test(text) && !/治療|ワクチン|授精|種付|移植/.test(text)) return 'expense';
  return null;
}

const aliases: Record<string, readonly string[]> = {
  itemName: ['医薬品名', '薬品名', '受精卵名', '品名'], lotNumber: ['ロット番号', 'ロット', '受精卵番号', '管理番号'],
  targetName: ['対象名', '名号', '牛名'], name: ['名号', '名前'], cowName: ['名号', '牛名'], calfName: ['子牛名', '名号'],
  donorCow: ['供卵牛'], sire: ['父牛', '父'], dam: ['母牛', '母'], sireName: ['父牛名', '父牛', '父'], motherName: ['母牛名', '母牛', '母'],
  buyer: ['販売先', '買受人'], vendor: ['支払先'], supplier: ['購入先', '仕入先'], medicine: ['薬剤', '薬剤名', '薬品名'],
  vaccineName: ['ワクチン名', 'ワクチン'], description: ['内容'], category: ['経費科目', '科目'], target: ['対象', '給与先'],
  dosage: ['投薬量', '用量'], note: ['メモ', '備考'], memo: ['メモ', '備考'], isolationMemo: ['隔離メモ'],
};

/** Extract only explicitly supplied values; no API, database or automatic save is used. */
export function parseAiRecordFormCandidate(text: string, options: { kind?: AiRecordFormKind; today?: string } = {}): AiRecordFormCandidate | null {
  if (typeof text !== 'string' || text.length > 2000) return null;
  const sourceText = text.trim();
  const normalized = sourceText.normalize('NFKC');
  const kind = options.kind || inferredKind(normalized);
  if (!kind || !AI_RECORD_FORM_DEFINITIONS.some(item => item.kind === kind)) return null;
  const today = options.today || localToday();
  const fields: Record<string, string> = {};
  const definition = getAiRecordFormDefinition(kind);
  const put = (key: string, value: string | undefined) => { if (value !== undefined && value !== '') fields[key] = value; };
  for (const [key, field] of Object.entries(definition.fields)) {
    const labels = aliases[key] || [field.label.replace(/（.*?）/g, '')];
    if (field.format === 'date') put(key, labeledDate(normalized, labels, today));
    else if (field.format === 'number') put(key, labeledNumber(normalized, labels));
    else put(key, labeledText(normalized, labels));
  }
  const number = targetNumber(normalized);
  const numberKey = kind === 'cattle' ? 'earTag' : kind === 'calf' || kind === 'feeding-action' ? 'calfNumber'
    : kind === 'blv' || kind.endsWith('-inventory') ? 'cowEarTag' : 'targetNumber';
  if (definition.fields[numberKey]) put(numberKey, number);
  const birth = labeledDate(normalized, ['生年月日', '誕生日', '出生年月日'], today) || (() => {
    const match = normalized.match(new RegExp('(' + datePattern + ')\\s*生まれ'));
    return match ? toDate(match[1], today) : undefined;
  })();
  if (definition.fields.birthday) put('birthday', birth);
  if (definition.fields.sex) {
    if (/去勢/.test(normalized)) put('sex', '去勢');
    else if (/雌|メス|♀/.test(normalized)) put('sex', '雌');
    else if (/雄|オス|♂/.test(normalized)) put('sex', '雄');
  }
  if (definition.fields.targetType) {
    if (/子牛/.test(normalized)) put('targetType', '子牛');
    else if (/成牛|母牛|繁殖牛|育成牛/.test(normalized)) put('targetType', '成牛');
  }
  if (kind === 'medicine-inventory' || kind === 'embryo-inventory') {
    put('date', primaryDate(normalized, ['日付', '購入日', '入出庫日', '使用日'], today));
    const action = ['棚卸減', '棚卸増', '廃棄', '使用'].find(value => normalized.includes(value)) || (/購入|買った|仕入/.test(normalized) ? '購入' : undefined);
    put('action', action);
    const qty = normalized.match(/([+-]?\d[\d,]*(?:\.\d+)?)\s*(分包|mL|ml|本|瓶|箱|錠|個)(?!あたり)/);
    if (qty && (kind !== 'embryo-inventory' || qty[2] === '個')) {
      put('quantity', numeric(qty[1])); put('unit', qty[2].toLowerCase() === 'ml' ? 'mL' : qty[2]);
      if (!fields.itemName) {
        const before = normalized.slice(0, qty.index).replace(new RegExp(datePattern, 'g'), '').replace(/^[\s、,。]+/, '').replace(/^(?:医薬品|薬品|薬剤|受精卵|薬)(?:の)?\s*/, '').replace(/を?\s*$/, '').trim();
        if (before && !/[、,。\n:：]|番号|ロット|数量|単価|購入先|仕入先|購入|棚卸|使用|廃棄/.test(before)) put('itemName', before);
      }
    }
    const lot = normalized.match(/(?:ロット(?:番号)?|受精卵番号|管理番号)\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9-]*)/);
    if (lot) put('lotNumber', lot[1]);
    put('unitPrice', money(normalized, ['単価']));
    put('amount', money(normalized, ['購入金額', '合計金額', '合計', '金額'], true));
  } else if (kind === 'sale') {
    const status = ['販売済み', '出荷済み', '出荷予定', '取消'].find(value => normalized.includes(value)) ||
      (/売った|販売した|売却した/.test(normalized) ? '販売済み' : /出荷した/.test(normalized) ? '出荷済み' : undefined);
    put('status', status);
    const dateKey = status === '出荷予定' ? 'shippingPlanDate' : status === '出荷済み' ? 'shippingDate' : 'saleDate';
    put(dateKey, primaryDate(normalized, dateKey === 'saleDate' ? ['販売日'] : dateKey === 'shippingDate' ? ['出荷日'] : ['出荷予定日'], today));
    put('salePrice', money(normalized, ['販売金額', '販売額', '販売価格'], true));
    put('saleWeight', labeledNumber(normalized, ['販売体重', '体重']));
  } else if (kind === 'expense') {
    put('paymentDate', primaryDate(normalized, ['支払日', '日付'], today));
    put('amount', money(normalized, ['金額', '支払額'], true));
    const category = ['種付け・繁殖費', '水道光熱費', '機械・資材費', '医薬品費', '購入牛費', '消耗品費', '飼料費', '敷料費', '診療費', '燃料費', '修繕費', '車両費', '保険料', '手数料'].find(value => normalized.includes(value));
    if (!fields.category) put('category', category);
    const payment = ['クレジットカード', '口座振替', '銀行振込', 'JA精算', '現金'].find(value => normalized.includes(value));
    put('paymentMethod', payment);
  } else if (kind === 'blv') {
    put('testDate', primaryDate(normalized, ['検査日'], today));
    const results = ['陰性', '陽性', '未検査'].filter(value => normalized.includes(value));
    if (results.length === 1 && !new RegExp(results[0] + '(?:では(?:ない|なかった|ありません)|で(?:ない|なかった)|じゃ(?:ない|なかった)|かも|疑い)').test(normalized)) put('result', results[0]);
  } else if (kind === 'feeding-action') {
    put('actionDate', primaryDate(normalized, ['対応日'], today));
    for (const key of ['alertType', 'actionType', 'status']) {
      const found = definition.fields[key].options?.filter(value => value !== 'その他' && normalized.includes(value));
      if (found?.length === 1) put(key, found[0]);
    }
    const age = normalized.match(/(\d+)\s*日齢/); if (age) put('ageDays', age[1]);
  } else if (kind === 'fattening') {
    put('startDate', primaryDate(normalized, ['肥育開始日', '開始日'], today));
    put('startWeight', labeledNumber(normalized, ['開始体重', '体重']));
    if (!fields.transitionReason && normalized.includes('繁殖終了')) put('transitionReason', '繁殖終了');
    const status = definition.fields.status.options?.find(value => normalized.includes(value)); put('status', status);
  } else if (kind === 'cattle') {
    const method = normalized.includes('妊娠牛で購入') ? 'purchased-pregnant' : normalized.includes('子牛で購入') ? 'purchased-calf' : normalized.includes('自家留保') ? 'retained' : undefined;
    put('acquisitionMethod', method); put('acquisitionPrice', money(normalized, ['導入価格', '購入価格']));
  } else if (kind === 'calf') {
    for (const key of ['feedingMethod', 'weaningStatus']) {
      const selected = definition.fields[key].options?.filter(value => normalized.includes(value)); if (selected?.length === 1) put(key, selected[0]);
    }
    put('startWeight', labeledNumber(normalized, ['出生時体重', '出生体重', '生時体重']));
    put('currentWeight', labeledNumber(normalized, ['現在体重']));
  } else if (kind === 'feeding') {
    put('feedingDate', primaryDate(normalized, ['給与日'], today));
    const quantity = normalized.match(/([+-]?\d[\d,]*(?:\.\d+)?)\s*(kg|キロ|袋|ロール|束|個)/i);
    if (quantity) { put('amount', numeric(quantity[1])); put('unit', /kg|キロ/i.test(quantity[2]) ? 'kg' : quantity[2]); }
    put('unitPrice', money(normalized, ['単価'])); put('totalPrice', money(normalized, ['合計', '金額'], true));
  } else if (kind === 'treatment') {
    put('treatmentDate', primaryDate(normalized, ['実施日', '治療日'], today));
    const recordType = ['繁殖治療', 'その他の処置', '削蹄', '去勢', '予防', '治療'].find(value => normalized.includes(value));
    put('recordType', recordType);
    const farmStock = /農場在庫/.test(normalized), veterinarian = /獣医師(?:が|の)?(?:処方|持参)|獣医師から処方/.test(normalized);
    if (farmStock !== veterinarian) put('medicineSource', farmStock ? 'farm_stock' : 'veterinarian');
    put('medicineCost', money(normalized, ['薬剤費', '薬代'])); put('medicalFee', money(normalized, ['診療費', '診療代']));
  } else if (kind === 'vaccine') {
    put('vaccinationDate', primaryDate(normalized, ['接種日'], today));
    put('vaccineCost', money(normalized, ['ワクチン費用', '費用', '接種代'], true));
    const status = ['未接種', '接種済み'].find(value => normalized.includes(value)) || (/接種した/.test(normalized) ? '接種済み' : undefined);
    put('status', status);
  }
  // Unknown enums and malformed explicit inputs are retained in sourceText, not turned into form values.
  for (const [key, value] of Object.entries(fields)) {
    const field = definition.fields[key];
    if (!field || field.options && !field.options.includes(value) || field.format === 'date' && !isAiRecordCalendarDate(value) ||
        field.format === 'number' && numeric(value) === undefined) delete fields[key];
  }
  return { kind, sourceText, fields };
}
