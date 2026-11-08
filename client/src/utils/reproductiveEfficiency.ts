import { analysisDate, analysisDays, analysisMean, type AnalysisService, type MaternalAnalysis } from './maternalAnalysis';

export type ReproductiveService = AnalysisService & { motherKey: string; method: 'ai' | 'et' };
export type PostpartumEpisode = {
  calvingDate: string; firstAiDate: string; firstAiDays: number | null;
  conceptionDate: string; conceptionMethod: string; daysOpen: number | null;
  elapsedUnconfirmedDays: number | null;
};
export type EfficiencyRow = {
  key: string; name: string; earTag: string; episodes: PostpartumEpisode[];
  firstAiCount: number; firstAiDays: number | null; openCount: number; daysOpen: number | null;
  aiCount: number; conceivedCount: number; unresolvedCount: number; conceptionRate: number | null;
};
export type ReproductiveEfficiency = {
  mothers: EfficiencyRow[]; total: EfficiencyRow; services: ReproductiveService[];
  issues: string[]; excludedCount: number; excludedServices: AnalysisService[];
};
export function shiftAnalysisDate(date: string, days: number): string {
  if (!analysisDate(date)) return '';
  const result = new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  return analysisDate(result);
}
const meanDays = (episodes: PostpartumEpisode[], key: 'firstAiDays' | 'daysOpen') => analysisMean(episodes.flatMap(e => e[key] === null ? [] : [e[key]!]));

/** These are read-only observations. Do not infer conception from a due date or a missing check. */
export function buildReproductiveEfficiency(analysis: MaternalAnalysis, asOf: string, year = ''): ReproductiveEfficiency {
  const issues = new Set<string>();
  const today = analysisDate(asOf);
  const keys = new Set(analysis.mothers.map(m => m.key));
  let excludedCount = 0;
  const excludedServices: AnalysisService[] = [];
  const groups = new Map<string, ReproductiveService[]>();
  for (const s of analysis.observations.services) {
    if (!today || !analysisDate(s.date) || s.date > today || s.cancelled || !s.motherKey || !keys.has(s.motherKey) || s.method !== 'ai' && s.method !== 'et') {
      excludedCount++;
      if (!s.cancelled) excludedServices.push(s);
      continue;
    }
    const service: ReproductiveService = { ...s, motherKey: s.motherKey, method: s.method,
      conceived: s.conceived !== null && analysisDate(s.checkDate) && s.checkDate >= s.date && s.checkDate <= today ? s.conceived : null };
    const key = `${s.motherKey}:${s.method}:${s.date}`;
    groups.set(key, [...(groups.get(key) || []), service]);
  }
  const services: ReproductiveService[] = [];
  for (const group of groups.values()) {
    if (group.length !== 1) { excludedCount += group.length; excludedServices.push(...group); issues.add('同じ母牛・同じ方法・同じ実施日の繁殖記録が複数あります。重複か複数回の実施かを判断できないため、新しい5指標から除外しています。'); }
    else services.push(group[0]);
  }
  services.sort((a, b) => a.date.localeCompare(b.date));
  if (excludedCount) issues.add(`照合できない母牛・方法不明・取消・重複などの繁殖記録${excludedCount}件を、新しい5指標から除外しています。`);
  const inYear = (date: string) => !year || date.startsWith(`${year}-`);
  function summarize(key: string, name: string, earTag: string, episodes: PostpartumEpisode[], ai: ReproductiveService[], conflict: boolean): EfficiencyRow {
    const unresolvedCount = ai.filter(s => s.conceived === null).length;
    const conceivedCount = ai.filter(s => s.conceived === true).length;
    return { key, name, earTag, episodes, firstAiCount: episodes.filter(e => e.firstAiDays !== null).length,
      firstAiDays: meanDays(episodes, 'firstAiDays'), openCount: episodes.filter(e => e.daysOpen !== null).length,
      daysOpen: meanDays(episodes, 'daysOpen'), aiCount: ai.length, conceivedCount, unresolvedCount,
      conceptionRate: ai.length && !unresolvedCount && !conflict ? conceivedCount / ai.length * 100 : null };
  }
  const conflicted = new Set<string>();
  const mothers = analysis.mothers.map(mother => {
    const own = services.filter(s => s.motherKey === mother.key);
    const uncertain = excludedServices.filter(s => s.motherKey === mother.key);
    const births = [...new Set(mother.calvings.map(c => c.date).filter(d => analysisDate(d) && d <= today))].sort();
    const episodes = births.map((calvingDate, i): PostpartumEpisode => {
      const next = births[i + 1] || '';
      const after = own.filter(s => s.date > calvingDate && (!next || s.date < next));
      const candidate = after.find(s => s.method === 'ai')?.date || '';
      const unclear = uncertain.filter(s => s.date > calvingDate && (!next || s.date < next));
      const firstUnclear = unclear.some(s => s.method !== 'et' && (!candidate || s.date <= candidate));
      const firstAiDate = firstUnclear ? '' : candidate;
      const positive = after.filter(s => s.conceived === true);
      if (positive.length > 1) {
        conflicted.add(mother.key);
        issues.add(`${mother.name}（耳標 ${mother.earTag || '未登録'}）：同じ分娩後に複数の受胎記録があります。空胎日数・受胎率の計算前に経過を確認してください。`);
      }
      const conception = positive.length === 1 ? positive[0] : undefined;
      // For ET, pregnancy age is based on the recorded estrus date, never the transfer/check date.
      const conceptionDate = conception?.method === 'et' ? analysisDate(conception.heatDate) : conception?.date || '';
      const validConception = Boolean(conception && !unclear.length && conceptionDate && conceptionDate > calvingDate && conceptionDate <= conception.date && (!next || conceptionDate < next));
      if (conception?.method === 'et' && !validConception && !unclear.length) issues.add('受胎したETの発情日が未入力、または分娩日・移植日との順序が不正なため、該当する空胎日数は計算していません。');
      return { calvingDate, firstAiDate, firstAiDays: firstAiDate ? analysisDays(calvingDate, firstAiDate) : null,
        conceptionDate: validConception ? conceptionDate : '', conceptionMethod: validConception ? conception!.method === 'ai' ? '人工授精' : 'ET（発情日基準）' : '',
        daysOpen: validConception ? analysisDays(calvingDate, conceptionDate) : null,
        elapsedUnconfirmedDays: !next && !positive.length && !unclear.length ? analysisDays(calvingDate, today) : null };
    }).filter(e => inYear(e.calvingDate));
    return summarize(mother.key, mother.name, mother.earTag, episodes, own.filter(s => s.method === 'ai' && inYear(s.date)),
      conflicted.has(mother.key) || uncertain.some(s => s.method !== 'et' && inYear(s.date)));
  });
  const total = summarize('farm', '農場全体', '', mothers.flatMap(m => m.episodes), services.filter(s => s.method === 'ai' && inYear(s.date)),
    conflicted.size > 0 || excludedServices.some(s => s.method !== 'et' && inYear(s.date)));
  return { mothers, total, services, issues: [...issues], excludedCount, excludedServices };
}

export type CycleEfficiency = {
  end: string; eligibleCount: number; inseminatedCount: number; detectedCount: number;
  aiCount: number; conceivedCount: number; unresolvedCount: number;
  heatDetectionRate: number | null; conceptionRate: number | null; pregnancyRate: number | null;
  issues: string[];
};
/** A user-confirmed cohort is required: absence of a service is not evidence of ineligibility. */
export function buildCycleEfficiency(analysis: MaternalAnalysis, report: ReproductiveEfficiency, start: string, eligibleKeys: string[], asOf: string): CycleEfficiency {
  const end = shiftAnalysisDate(start, 20);
  const issues: string[] = [];
  const validPeriod = Boolean(analysisDate(start) && analysisDate(asOf) && start <= asOf && end && end <= asOf);
  if (!validPeriod) issues.push('開始日を確認してください。本日までに終了した21日間を選びます。');
  const knownKeys = new Set(analysis.mothers.map(m => m.key));
  const eligible = new Set(eligibleKeys.filter(k => knownKeys.has(k)));
  if (!eligible.size) issues.push('期間開始時に授精対象だった未妊娠牛を選択してください。');
  const own = report.services.filter(s => eligible.has(s.motherKey));
  const period = own.filter(s => validPeriod && s.date >= start && s.date <= end);
  const ai = period.filter(s => s.method === 'ai');
  const inseminated = new Set(ai.map(s => s.motherKey));
  const detected = new Set(ai.filter(s => s.heatDate && s.heatDate >= start && s.heatDate <= s.date).map(s => s.motherKey));
  const unresolvedCount = ai.filter(s => s.conceived === null).length;
  const conceivedCount = ai.filter(s => s.conceived === true).length;
  const missingHeat = ai.some(s => !s.heatDate || s.heatDate < start || s.heatDate > s.date);
  const repeated = inseminated.size !== ai.length;
  const et = period.some(s => s.method === 'et');
  const priorPregnancy = [...eligible].some(key => {
    const birth = analysis.mothers.find(m => m.key === key)?.calvings.map(c => c.date).filter(d => d < start).sort().slice(-1)[0] || '';
    return own.some(s => s.motherKey === key && s.conceived === true && s.date < start && (!birth || s.date > birth));
  });
  if (priorPregnancy) issues.push('対象牛に、開始日前の受胎記録があり、その後の分娩を確認できない牛がいます。妊娠・流産などの経過と対象牛の選択を確認してください。');
  if (et) issues.push('対象牛に期間内のET実施記録があります。人工授精の21日指標とは分けるため、対象牛と期間を確認してください。');
  if (missingHeat) issues.push('授精記録の発情日が未入力、期間外、または授精日より後のため、発情発見率・妊娠率は計算していません。定時授精など発情確認のない授精も、この発情発見率には使いません。');
  if (repeated) issues.push('同じ牛に期間内の複数授精があります。頭数と回数を混同しないよう、21日間の受胎率・妊娠率は計算していません。個々の授精記録を確認してください。');
  if (unresolvedCount) issues.push(`期間内授精のうち${unresolvedCount}回は結果未確定・要確認です。鑑定結果が揃うまで受胎率・妊娠率は計算していません。`);
  const uncertain = report.excludedServices.some(s => s.date >= start && s.date <= end && (!s.motherKey || eligible.has(s.motherKey)));
  if (uncertain) issues.push('対象期間・対象牛に集計除外の繁殖記録があります。21日間の率を計算する前に「集計元の確認」で内容を確認してください。');
  const cohortValid = validPeriod && eligible.size > 0 && !priorPregnancy && !et && !uncertain;
  const heatDetectionRate = cohortValid && !missingHeat ? detected.size / eligible.size * 100 : null;
  const conceptionRate = cohortValid && ai.length > 0 && !unresolvedCount && !repeated ? conceivedCount / ai.length * 100 : null;
  // With no inseminations the conception rate has no denominator. Do not manufacture 0% pregnancy.
  const pregnancyRate = heatDetectionRate !== null && conceptionRate !== null ? heatDetectionRate * conceptionRate / 100 : null;
  return { end, eligibleCount: eligible.size, inseminatedCount: inseminated.size, detectedCount: detected.size,
    aiCount: ai.length, conceivedCount, unresolvedCount, heatDetectionRate, conceptionRate, pregnancyRate, issues };
}
