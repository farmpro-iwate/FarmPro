import type { MaternalAnalysis } from './maternalAnalysis';
import { buildBreedingTargetCandidates, DEFAULT_BREEDING_WAIT_DAYS } from './breedingTargetCandidates';
import { buildCycleEfficiency, shiftAnalysisDate, type CycleEfficiency, type ReproductiveEfficiency } from './reproductiveEfficiency';

export type MotherCycleReference = {
  serviceDate: string; start: string; end: string; candidateCount: number; reviewCount: number;
  cycle: CycleEfficiency | null; blockedReason: string;
};

/** Farm-level reference values for the 21 days ending on each mother's latest AI.
 * Candidates are provisional, never saved eligibility decisions or individual-cow rates. */
export function buildMotherCycleReferences(analysis: MaternalAnalysis, report: ReproductiveEfficiency, asOf: string, year = '') {
  const result = new Map<string, MotherCycleReference>();
  const cache = new Map<string, MotherCycleReference>();
  const inYear = (date: string) => date <= asOf && (!year || date.startsWith(`${year}-`));
  const unavailable = (reason: string): MotherCycleReference => ({ serviceDate: '', start: '', end: '', candidateCount: 0, reviewCount: 0, cycle: null, blockedReason: reason });
  for (const mother of analysis.mothers) {
    const own = report.services.filter(s => s.motherKey === mother.key && s.method === 'ai' && inYear(s.date));
    const latest = own.map(s => s.date).sort().slice(-1)[0];
    const uncertain = report.excludedServices.some(s => s.motherKey === mother.key && s.method !== 'et' &&
      (!s.date || inYear(s.date) && (!latest || s.date >= latest)));
    if (uncertain) { result.set(mother.key, unavailable('授精記録を確認')); continue; }
    if (!latest) { result.set(mother.key, unavailable('人工授精記録なし')); continue; }
    if (!cache.has(latest)) {
      const start = shiftAnalysisDate(latest, -20);
      const candidates = buildBreedingTargetCandidates(analysis, report, start, DEFAULT_BREEDING_WAIT_DAYS, asOf);
      const cycle = buildCycleEfficiency(analysis, report, start, candidates.candidateKeys, asOf);
      const periodAi = report.services.filter(s => s.method === 'ai' && s.date >= start && s.date <= latest);
      // Never silently drop an actually inseminated cow from the provisional denominator.
      const outside = periodAi.find(s => !candidates.candidateKeys.includes(s.motherKey));
      const outsideRow = candidates.rows.find(r => r.key === outside?.motherKey);
      const blockedReason = outside ? `対象牛を確認：${outsideRow ? `${outsideRow.name}（耳標 ${outsideRow.earTag || '未登録'}）／${outsideRow.reason}` : '授精した牛の対象条件が未確認です'}` :
        !candidates.valid ? '期間を確認' : !candidates.candidateKeys.length ? '対象牛を確認' : '';
      cache.set(latest, { serviceDate: latest, start, end: latest, candidateCount: candidates.candidateKeys.length,
        reviewCount: candidates.rows.filter(r => r.status === 'review').length, cycle, blockedReason });
    }
    result.set(mother.key, cache.get(latest)!);
  }
  return result;
}

export function referenceRate(reference: MotherCycleReference, metric: 'heatDetectionRate' | 'pregnancyRate') {
  if (reference.blockedReason) return reference.blockedReason;
  const cycle = reference.cycle;
  if (!cycle) return '授精記録なし';
  const value = cycle[metric];
  if (value !== null) return `${Number(value.toFixed(1))}%`;
  if (cycle.needsReview) return '記録を確認';
  if (!cycle.aiCount) return '授精記録なし';
  if (cycle.unresolvedCount) return '鑑定待ち';
  return '対象牛を確認';
}
