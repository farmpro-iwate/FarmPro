import { getAnimalLifecycleState } from './animalLifecycle';
import { planAnimalMatch } from './cattleBreedingPlans';
import { analysisDate, analysisDays, type AnalysisRecord, type MaternalAnalysis } from './maternalAnalysis';
import { shiftAnalysisDate, type ReproductiveEfficiency } from './reproductiveEfficiency';

export const DEFAULT_BREEDING_WAIT_DAYS = 40;
export type TargetCandidate = {
  key: string; name: string; earTag: string; status: 'candidate' | 'excluded' | 'review';
  reason: string; lastCalving: string; daysSinceCalving: number | null;
};
export type TargetCandidatePlan = { rows: TargetCandidate[]; candidateKeys: string[]; valid: boolean; signature: string };
const text = (v: unknown) => v === null || v === undefined ? '' : String(v).trim();
const positive = (v: unknown) => ['受胎', '妊娠', '妊娠中'].includes(text(v));
const negative = (v: unknown) => ['空胎', '不受胎'].includes(text(v));
const cancelled = (b: AnalysisRecord) => ['取消', '取消済み', '中止', '移植中止'].includes(text(b.breedingStatus || b.status));
const dateLabel = (d: string) => d.replace(/-/g, '/');

/** Provisional candidates, never a saved health/pregnancy state or a confirmed denominator.
 * Services performed within the selected window do not remove a cow merely because she conceived. */
export function buildBreedingTargetCandidates(analysis: MaternalAnalysis, report: ReproductiveEfficiency, start: string, waitingDays: number, asOf: string): TargetCandidatePlan {
  const end = shiftAnalysisDate(start, 20);
  const valid = Boolean(analysisDate(start) && analysisDate(asOf) && end && end <= asOf && Number.isInteger(waitingDays) && waitingDays >= 1 && waitingDays <= 365);
  const source = analysis.candidateSources;
  const rows = analysis.mothers.map(mother => {
    const births = mother.calvings.map(c => c.date).filter(d => analysisDate(d) && d <= start).sort();
    const lastCalving = births.slice(-1)[0] || '';
    const daysSinceCalving = lastCalving ? analysisDays(lastCalving, start) : null;
    const row = (status: TargetCandidate['status'], reason: string): TargetCandidate => ({ key: mother.key, name: mother.name, earTag: mother.earTag, status, reason, lastCalving, daysSinceCalving });
    if (!valid) return row('review', '期間と産後日数の条件を確認してください');
    const cows = source?.cattle.filter(c => text(c.id) === mother.key) || [];
    if (cows.length !== 1) return row('review', '牛台帳の情報を確認してください');
    const cow = cows[0];
    const animal = { id: text(cow.id), earTag: text(cow.earTag), name: text(cow.name) };
    const lifecycle = getAnimalLifecycleState(cow, start);
    if (lifecycle.legacyDeceased) return row('review', '死亡・その他の記録があります。時期を確認してください');
    if (lifecycle.deceased) return row('excluded', `期間開始前に死亡（${dateLabel(lifecycle.deathDate)}）`);
    if (lifecycle.culled) return row('excluded', `期間開始前に廃用（${dateLabel(lifecycle.cullingDate)}）`);
    if (cow.lifecycle) {
      const raw = cow.lifecycle as Record<string, unknown>;
      if (typeof raw !== 'object' || raw.version !== 1 || ['death', 'culling'].some(k => raw[k] && !analysisDate((raw[k] as Record<string, unknown>).date))) return row('review', '死亡・廃用の記録の日付を確認してください');
    }
    if (cow.acquisitionDate && !analysisDate(cow.acquisitionDate)) return row('review', '導入日を確認してください');
    const acquisition = analysisDate(cow.acquisitionDate);
    if (acquisition && acquisition > start) return row('excluded', `期間開始後に導入（${dateLabel(acquisition)}）`);
    if (cow.birthday && !analysisDate(cow.birthday)) return row('review', '生年月日を確認してください');
    if (analysisDate(cow.birthday) > start) return row('excluded', '期間開始時点では生まれていません');

    for (const sale of source?.sales || []) {
      if (sale.deletedAt || sale.targetType !== '成牛' || !['販売済み', '出荷済み'].includes(text(sale.status))) continue;
      const dates = [analysisDate(sale.shippingDate), sale.status === '販売済み' ? analysisDate(sale.saleDate) : ''].filter(Boolean).sort();
      const exit = dates[0] || '';
      if (exit && exit > start) continue;
      const match = planAnimalMatch(sale, animal);
      if (match === 'uncertain') return row('review', '出荷・販売の記録と牛の照合を確認してください');
      if (match === 'match') return exit ? row('excluded', `期間開始前に出荷・販売（${dateLabel(exit)}）`) : row('review', '出荷・販売済みの記録の日付を確認してください');
    }
    if (!lastCalving) return row('review', cow.stage === '育成牛' ? '育成牛です。授精を始める時期を確認してください' : '分娩日の記録がありません。授精対象か確認してください');
    if (cow.stage === '育成牛') return row('review', '育成牛の区分と分娩記録を確認してください');
    if (daysSinceCalving! < waitingDays) return row('excluded', `開始時点で産後${daysSinceCalving}日（基準${waitingDays}日未満）`);
    if (mother.calvings.some(c => c.date > start && c.date <= end)) return row('review', 'この期間に分娩の記録があります。開始時点の状況を確認してください');
    if (cow.acquisitionMethod === 'purchased-pregnant' && (!acquisition || lastCalving < acquisition)) return row('review', '妊娠牛として導入されています。その後の分娩・妊娠状況を確認してください');

    const own = report.services.filter(s => s.motherKey === mother.key && s.date > lastCalving && s.date < start);
    const pregnancies = own.filter(s => s.conceived === true);
    if (pregnancies.length) return row('excluded', `開始日前の${dateLabel(pregnancies[0].date)}の種付けで受胎確認`);
    for (const b of source?.breedings || []) {
      if (b.deletedAt || cancelled(b)) continue;
      const dates = [b.inseminationDate, b.serviceDate, b.transferDate, b.transferPlannedDate, b.heatDate].map(analysisDate).filter(Boolean);
      const match = planAnimalMatch(b, animal);
      const earliest = [...dates].sort()[0] || '';
      if (earliest && earliest > end || dates.length && dates.every(d => d <= lastCalving)) continue;
      if (match === 'uncertain') return row('review', '繁殖記録と牛の照合を確認してください');
      if (match !== 'match') continue;
      const isEt = b.breedingMethod === '受精卵移植' || b.breedingType === '受精卵移植';
      const transfer = analysisDate(b.transferDate);
      const planned = analysisDate(b.transferPlannedDate);
      const check = analysisDate(b.pregnancyCheckDate);
      const etFinishedOpen = negative(b.pregnancyResult) && check && check <= start && transfer && check >= transfer;
      if (isEt && !etFinishedOpen && ((transfer && transfer > lastCalving && transfer <= end) || (planned && planned > lastCalving && planned <= end))) return row('excluded', 'この期間のET予定・ETの経過確認の記録あり');
      const serviceDate = analysisDate(b.inseminationDate) || transfer || analysisDate(b.serviceDate);
      if (positive(b.pregnancyResult) && (!serviceDate || serviceDate < start) && !own.some(s => s.date === serviceDate)) return row('review', '受胎の記録があります。実施日・鑑定日を確認してください');
      if ((b.recordKind && b.recordKind !== 'standard' || 'breedingType' in b || 'serviceDate' in b) && (!serviceDate || serviceDate < start)) return row('review', '旧形式の繁殖記録があります。開始時点の状況を確認してください');
    }
    if (own.some(s => s.conceived === null)) return row('review', '開始日前の種付けの鑑定結果を確認してください');
    if (own.some(s => s.conceived === false && s.checkDate > start)) return row('review', '開始時点では前回の鑑定結果が未確認です');
    if (report.excludedServices.some(s => s.motherKey === mother.key && (!s.date || s.date > lastCalving && s.date < start))) return row('review', '重複などで集計できない繁殖記録があります');
    return row('candidate', `開始時点で産後${daysSinceCalving}日・受胎確認の記録なし`);
  });
  const candidateKeys = rows.filter(r => r.status === 'candidate').map(r => r.key);
  return { rows, candidateKeys, valid, signature: JSON.stringify([start, waitingDays, asOf, rows.map(r => [r.key, r.status, r.reason])]) };
}
