import type { StoredRecord } from '../storage/types';

export type AnalysisRecord = StoredRecord;
export type MaternalSnapshot = Record<'cattle' | 'calves' | 'calvings' | 'breedings' | 'sales', AnalysisRecord[]>;
export type MotherBasis = 'birth' | 'genetic';
export type AnalysisOffspring = {
  key: string; number: string; name: string; birthday: string; sex: string; sire: string;
  birthMother: string; geneticMother: string; et: boolean; sources: string[];
  shippingDate: string; shippingAge: number | null; saleDate: string;
  price: number | null; weight: number | null; saleConflict: boolean;
};
export type CalvingInterval = { date: string; previous: string; days: number | null; source: string };
export type MotherAnalysis = {
  key: string; name: string; earTag: string; identificationNumber: string;
  calvings: CalvingInterval[]; intervals: number[]; averageInterval: number | null;
  serviceCount: number; checkedCount: number; conceivedCount: number;
  offspring: AnalysisOffspring[]; priceCount: number; averagePrice: number | null;
  shippingCount: number; averageShippingAge: number | null;
};
export type AnalysisService = {
  date: string; checkDate: string; conceived: boolean | null;
  motherKey?: string; method?: 'ai' | 'et' | 'other'; heatDate?: string; cancelled?: boolean;
};
export type AnalysisBirth = { date: string; days: number | null; matchedMother: boolean };
export type MaternalAnalysis = {
  mothers: MotherAnalysis[]; issues: string[];
  observations: { births: AnalysisBirth[]; services: AnalysisService[]; offspring: AnalysisOffspring[]; unclassifiedServices?: AnalysisService[] };
};

const text = (v: unknown) => typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
const first = (...values: unknown[]) => values.map(text).find(Boolean) || '';
const unique = <T,>(values: T[]) => [...new Set(values)];
export function analysisDate(value: unknown): string {
  const raw = text(value).replace(/\//g, '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const stamp = Date.parse(`${raw}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === raw ? raw : '';
}
export function analysisDays(start: string, end: string): number | null {
  if (!analysisDate(start) || !analysisDate(end) || end < start) return null;
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
}
function numeric(value: unknown): number | null {
  const raw = text(value).replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function analysisMean(values: number[]): number | null {
  return values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
}
function validRows(rows: AnalysisRecord[]) { return rows.filter(r => !r.deletedAt); }

/** Read-only calculations. Namespace-aware references never equate local IDs with ear tags. */
export function buildMaternalAnalysis(
  input: MaternalSnapshot, options: { today: string; basis?: MotherBasis; sex?: string },
): MaternalAnalysis {
  const today = analysisDate(options.today);
  const issues = new Set<string>();
  const cows = validRows(input.cattle).filter(c => !['雄', 'オス', '去勢'].includes(text(c.sex)));
  const calves = validRows(input.calves);
  const calvings = validRows(input.calvings);
  const breedings = validRows(input.breedings);
  const sales = validRows(input.sales).filter(s => s.targetType === '子牛' && ['出荷済み', '販売済み'].includes(text(s.status)));
  const pastDate = (v: unknown) => { const d = analysisDate(v); return d && d <= today ? d : ''; };
  const byCow = new Map<string, MotherAnalysis>(cows.map(c => [text(c.id), {
    key: text(c.id), name: first(c.name, '名号未登録'), earTag: text(c.earTag), identificationNumber: text(c.identificationNumber),
    calvings: [], intervals: [], averageInterval: null, serviceCount: 0, checkedCount: 0, conceivedCount: 0,
    offspring: [], priceCount: 0, averagePrice: null, shippingCount: 0, averageShippingAge: null,
  }]));
  function resolveCow(number: unknown, name: unknown, localId?: unknown): string {
    const ref = text(number), label = text(name), id = text(localId);
    let matches: AnalysisRecord[];
    if (ref) {
      matches = cows.filter(c => [c.earTag, c.identificationNumber, c.syncId].map(text).filter(Boolean).includes(ref));
      // Legacy local reference is usable only with a corroborating name.
      if (!matches.length && label) matches = cows.filter(c => text(c.id) === ref && text(c.name) === label);
      if (label) matches = matches.filter(c => text(c.name) === label);
    } else if (id) {
      matches = label ? cows.filter(c => text(c.id) === id && text(c.name) === label) : [];
    } else matches = label ? cows.filter(c => text(c.name) === label) : [];
    return matches.length === 1 ? text(matches[0].id) : '';
  }
  const motherFromCalving = (c: AnalysisRecord) => resolveCow(c.cowId, c.cowName, c.cattleId);
  const events = new Map<string, Map<string, { source: Set<string>; importedInterval: number | null }>>();
  function event(mother: string, value: unknown, source: string, importedInterval: unknown = '', unmatchedKey = '') {
    const date = pastDate(value);
    if (!date || !mother && !unmatchedKey) return;
    const key = mother || `unmatched:${unmatchedKey}`;
    const group = events.get(key) || new Map();
    const entry = group.get(date) || { source: new Set<string>(), importedInterval: null };
    entry.source.add(source);
    const interval = numeric(importedInterval);
    if (interval !== null && interval > 0) entry.importedInterval = interval;
    group.set(date, entry); events.set(key, group);
  }
  function unlinkedBirthKey(row: AnalysisRecord, calf = false): string {
    const linked = calf && row.calvingId ? calvings.find(c => text(c.id) === text(row.calvingId)) : undefined;
    if (linked) return unlinkedBirthKey(linked);
    const ref = calf ? first(row.recipientCowId, row.breedingMethod === '受精卵移植' ? '' : row.motherCowId) : text(row.cowId);
    return ref ? `mother:${ref}` : calf && row.calvingId ? `calving:${row.calvingId}` : `${calf ? 'calf' : 'calving'}:${row.id}`;
  }
  const children: AnalysisOffspring[] = [];
  const rawCalf = new Map<string, AnalysisRecord>();
  const childByCalving = new Map<string, AnalysisOffspring[]>();
  function addChild(row: AnalysisOffspring) { children.push(row); return row; }
  const emptyChild = (key: string): AnalysisOffspring => ({
    key, number: '', name: '', birthday: '', sex: '', sire: '', birthMother: '', geneticMother: '', et: false,
    sources: [], shippingDate: '', shippingAge: null, saleDate: '', price: null, weight: null, saleConflict: false,
  });
  for (const calf of calves) {
    const et = calf.breedingMethod === '受精卵移植' || Boolean(calf.recipientCowId && calf.geneticMotherCowId && calf.recipientCowId !== calf.geneticMotherCowId);
    const genetic = resolveCow(first(calf.geneticMotherCowId, calf.motherCowId), first(calf.geneticMotherCowName, calf.motherCowName, calf.motherName));
    const birth = calf.recipientCowId || calf.recipientCowName
      ? resolveCow(calf.recipientCowId, calf.recipientCowName) : et ? '' : genetic;
    const birthday = pastDate(first(calf.birthday, calf.birthDate));
    const child = addChild({ ...emptyChild(`calf:${calf.id}`), number: first(calf.calfNumber, calf.earTag, calf.identificationNumber),
      name: text(calf.name), birthday, sex: text(calf.sex), sire: text(calf.sireName), birthMother: birth, geneticMother: genetic,
      et, sources: ['子牛台帳'] });
    rawCalf.set(child.key, calf);
    if (calf.calvingId) childByCalving.set(text(calf.calvingId), [...(childByCalving.get(text(calf.calvingId)) || []), child]);
    if (!birth || !genetic) issues.add('母牛を一意に照合できない子牛があります。照合できた母牛の集計だけに含めています。');
    if (!birthday) issues.add('生年月日が未入力・不正・未来の子牛は、日齢と分娩間隔の計算から除外しています。');
    event(birth, birthday, '子牛台帳', '', unlinkedBirthKey(calf, true));
  }
  for (const calving of calvings) {
    const mother = motherFromCalving(calving);
    const date = pastDate(first(calving.actualCalvingDate, calving.calvingDate));
    if (!date) { if (calving.actualCalvingDate) issues.add('不正・未来の実分娩日は、分娩間隔の計算から除外しています。'); continue; }
    if (!mother) issues.add('母牛を照合できない分娩記録があります。母牛別の集計から除外しています。');
    event(mother, date, '分娩記録', '', unlinkedBirthKey(calving));
    const linked = childByCalving.get(text(calving.id)) || [];
    if (linked.length) {
      linked.forEach(child => {
        if (child.birthMother && child.birthMother !== mother || child.birthday && child.birthday !== date) {
          issues.add('分娩記録と子牛台帳の母牛・生年月日に相違があります。自動で統合していません。'); return;
        }
        child.birthMother = mother; if (!child.et) child.geneticMother ||= mother;
        child.birthday ||= date; child.sources.push('分娩記録');
      });
      continue;
    }
    const same = mother ? children.filter(c => c.birthMother === mother && c.birthday === date) : [];
    if (same.length === 1) { same[0].sources.push('分娩記録'); continue; }
    if (same.length > 1) { issues.add('同一母牛・同日の産子が複数あるため、分娩記録は頭数へ重ねて加算していません。'); continue; }
    const breeding = breedings.find(b => text(b.id) === text(calving.breedingId));
    const et = breeding?.breedingMethod === '受精卵移植';
    addChild({ ...emptyChild(`calving:${calving.id}`), number: text(calving.calfName), birthday: date,
      sex: text(calving.calfSex), sire: first(et ? breeding?.embryoSireName : breeding?.bullName), birthMother: mother,
      geneticMother: et ? resolveCow(breeding?.donorCowEarTag, breeding?.donorCowName) : mother,
      et, sources: ['分娩記録'] });
  }
  for (const cow of cows) {
    const history = Array.isArray(cow.importedOffspringHistory) ? cow.importedOffspringHistory as Record<string, unknown>[] : [];
    history.forEach((h, index) => {
      if (!h || typeof h !== 'object' || Array.isArray(h)) { issues.add('形式を確認できない取込産子履歴を集計から除外しています。'); return; }
      const date = pastDate(h.birthday);
      if (!date) { issues.add('生年月日が未入力・不正・未来の取込産子履歴は集計から除外しています。'); return; }
      const mother = text(cow.id);
      const same = children.filter(c => (c.birthMother === mother || c.geneticMother === mother) && c.birthday === date);
      let child: AnalysisOffspring;
      if (same.length === 1) {
        child = same[0];
        if (child.sources.every(s => s === '取込履歴') && text(h.name) && child.name && text(h.name) !== child.name) {
          child.price = null; child.saleConflict = true;
          issues.add('同一母牛・同日の取込産子名が異なるため、該当する取込価格を平均から除外しています。'); return;
        }
        if (text(h.sex) && child.sex && text(h.sex) !== child.sex || text(h.sire) && child.sire && text(h.sire) !== child.sire) {
          issues.add('取込履歴と産子の性別・父牛が一致しない記録があります。価格を自動で統合していません。');
          if (!child.et || child.birthMother === mother) event(mother, date, '取込履歴'); return;
        }
        child.sources = unique([...child.sources, '取込履歴']);
        child.sire ||= text(h.sire); child.sex ||= text(h.sex);
      } else if (same.length > 1) {
        issues.add('同一母牛・同日の産子が複数あるため、取込履歴の販売価格を自動で割り当てていません。'); return;
      } else child = addChild({ ...emptyChild(`import:${cow.id}:${index}`), name: text(h.name), birthday: date,
        sex: text(h.sex), sire: text(h.sire), birthMother: mother, geneticMother: mother, sources: ['取込履歴'] });
      // A donor's imported offspring history is not evidence that she gave birth to an ET calf.
      if (!child.et || child.birthMother === mother) event(mother, date, '取込履歴', h.calvingIntervalDays);
      const price = numeric(h.salePrice);
      if (price !== null && child.price !== null && child.price !== price) {
        child.saleConflict = true; child.price = null; issues.add('同じ産子の取込販売価格が複数あるため、平均販売価格から除外しています。');
      } else if (!child.saleConflict) child.price = price ?? child.price;
    });
  }
  // Each calf can contribute one completed sale. Planned/cancelled/adult sales never enter these metrics.
  const salesForChild = new Map<AnalysisOffspring, AnalysisRecord[]>();
  for (const sale of sales) {
    if (!pastDate(sale.status === '販売済み' ? sale.saleDate : sale.shippingDate)) {
      issues.add('日付が未入力・不正・未来の出荷販売記録は、産子の販売成績から除外しています。'); continue;
    }
    const number = text(sale.targetNumber), birthday = pastDate(sale.birthday);
    let candidates = children.filter(child => {
      const raw = rawCalf.get(child.key);
      const numbers = unique([child.number, raw?.identificationNumber, raw?.earTag, raw?.calfNumber].map(text).filter(Boolean));
      if (birthday && child.birthday && birthday !== child.birthday) return false;
      if (number && numbers.includes(number)) return true;
      if (number && numbers.length && !numbers.includes(number)) return false;
      if (raw && sale.calfId && text(raw.id) === text(sale.calfId)) {
        if (number && numbers.length && !numbers.includes(number)) return false;
        return Boolean(birthday && child.birthday === birthday);
      }
      return Boolean(sale.calvingId && (childByCalving.get(text(sale.calvingId)) || []).includes(child));
    });
    const knownLink = Boolean(sale.calfId && calves.some(c => text(c.id) === text(sale.calfId)) ||
      sale.calvingId && (calvings.some(c => text(c.id) === text(sale.calvingId)) || childByCalving.has(text(sale.calvingId))));
    // A legacy sale may be the only retained record of a past calf.
    if (!candidates.length && !knownLink && number && birthday) {
      const mother = resolveCow(sale.motherCowId, sale.motherName);
      const same = children.filter(c => c.birthMother === mother && c.birthday === birthday);
      if (mother && same.length === 1 && same[0].sources.every(s => s === '取込履歴')) candidates = same;
      else if (mother && !same.length) {
        candidates = [addChild({ ...emptyChild(`sale:${sale.id}`), number, name: text(sale.targetName), birthday,
          sex: text(sale.sex), birthMother: mother, geneticMother: '', sources: ['出荷販売'] })];
      }
    }
    if (!candidates.length && !knownLink && number && !children.some(c => c.number === number)) {
      // An identifiable calf sale still belongs to the farm when its mother is not in the ledger.
      candidates = [addChild({ ...emptyChild(`sale:${sale.id}`), number, name: text(sale.targetName), birthday,
        sex: text(sale.sex), sources: ['出荷販売'] })];
      issues.add('母牛や産子台帳を照合できない子牛販売があります。農場全体には含め、母牛別には割り当てていません。');
    }
    if (candidates.length !== 1) { issues.add('産子を一意に照合できない出荷販売記録があります。販売成績へ重ねて加算していません。'); continue; }
    const child = candidates[0];
    salesForChild.set(child, [...(salesForChild.get(child) || []), sale]);
  }
  for (const [child, records] of salesForChild) {
    const completed = records.filter(s => s.status === '販売済み');
    if (completed.length > 1 || records.length > 1 && !completed.length) {
      child.saleConflict = true; child.price = null;
      issues.add('同じ産子に複数の完了済み出荷販売記録があります。重複分は価格・日齢の平均から除外しています。'); continue;
    }
    const sale = completed[0] || records[0];
    const saleDate = pastDate(sale.saleDate), shippingDate = pastDate(sale.shippingDate);
    if (saleDate && child.birthday && saleDate < child.birthday || shippingDate && child.birthday && shippingDate < child.birthday) {
      child.price = null; child.saleConflict = true;
      issues.add('生年月日より前の出荷・販売日があります。該当する販売成績を集計から除外しています。'); continue;
    }
    child.number ||= text(sale.targetNumber); child.sex ||= text(sale.sex);
    child.sources = unique([...child.sources, '出荷販売']);
    child.shippingDate = shippingDate; child.shippingAge = analysisDays(child.birthday, shippingDate);
    child.saleDate = sale.status === '販売済み' ? saleDate : '';
    child.price = sale.status === '販売済み' ? numeric(sale.salePrice) : null;
    child.saleConflict = false;
    const weight = numeric(sale.saleWeight); child.weight = weight !== null && weight > 0 ? weight : null;
  }
  const services: AnalysisService[] = [];
  const unclassifiedServices: AnalysisService[] = [];
  for (const breeding of breedings) {
    const standard = breeding.recordKind === 'standard' || breeding.recordKind === undefined && !('breedingType' in breeding) && !('serviceDate' in breeding);
    if (!standard) {
      issues.add('旧形式の繁殖記録は、授精・ET回数と妊娠鑑定の割合から除外しています。');
      unclassifiedServices.push({ date: pastDate(first(breeding.serviceDate, breeding.inseminationDate, breeding.transferDate)), checkDate: '', conceived: null,
        motherKey: resolveCow(breeding.cowEarTag, breeding.cowName), method: 'other' });
      continue;
    }
    const date = breeding.breedingMethod === '受精卵移植' ? pastDate(breeding.transferDate) : pastDate(breeding.inseminationDate);
    if (!date) continue;
    const result = text(breeding.pregnancyResult);
    const checkDate = pastDate(breeding.pregnancyCheckDate);
    const definitive = ['受胎', '妊娠', '妊娠中', '空胎', '不受胎'].includes(result) && checkDate >= date;
    const conceived = definitive ? ['受胎', '妊娠', '妊娠中'].includes(result) : null;
    const mother = resolveCow(breeding.cowEarTag, breeding.cowName);
    services.push({ date, checkDate: definitive ? checkDate : '', conceived, motherKey: mother,
      method: breeding.breedingMethod === '受精卵移植' ? 'et' : ['種付', '人工授精', 'AI'].includes(text(breeding.breedingMethod)) ? 'ai' : 'other',
      heatDate: pastDate(breeding.heatDate), cancelled: ['取消', '取消済み', '中止', '移植中止'].includes(text(breeding.breedingStatus)) });
    const row = byCow.get(mother);
    if (!row) { issues.add('母牛を照合できない繁殖記録があります。繁殖成績から除外しています。'); continue; }
    row.serviceCount++;
    if (definitive) {
      row.checkedCount++; if (['受胎', '妊娠', '妊娠中'].includes(result)) row.conceivedCount++;
    }
  }
  const births: AnalysisBirth[] = [];
  for (const [key, group] of events) {
    const entries = [...group.entries()].sort(([a], [b]) => a.localeCompare(b));
    const matchedMother = byCow.has(key);
    const history = entries.map(([date, item], index) => {
      const previous = index ? entries[index - 1][0] : '';
      const days = matchedMother ? index ? analysisDays(previous, date) : item.importedInterval : null;
      births.push({ date, days, matchedMother });
      return { date, previous, days,
        source: [...item.source].join('・') };
    });
    const row = byCow.get(key);
    if (row) row.calvings = history;
  }
  for (const row of byCow.values()) {
    row.intervals = row.calvings.flatMap(c => c.days !== null && c.days > 0 ? [c.days] : []);
    row.averageInterval = analysisMean(row.intervals);
    row.offspring = children.filter(c => c[options.basis === 'genetic' ? 'geneticMother' : 'birthMother'] === row.key &&
      (!options.sex || c.sex === options.sex)).sort((a, b) => b.birthday.localeCompare(a.birthday));
    const prices = row.offspring.flatMap(c => c.price !== null && !c.saleConflict ? [c.price] : []);
    const ages = row.offspring.flatMap(c => c.shippingAge !== null && !c.saleConflict ? [c.shippingAge] : []);
    row.priceCount = prices.length; row.averagePrice = analysisMean(prices);
    row.shippingCount = ages.length; row.averageShippingAge = analysisMean(ages);
  }
  return { mothers: [...byCow.values()], issues: [...issues], observations: { births, services, offspring: children, unclassifiedServices } };
}
