import { describe, expect, it } from 'vitest';
import { buildMaternalAnalysis, type MaternalSnapshot } from './maternalAnalysis';
import { buildCycleEfficiency, buildReproductiveEfficiency, shiftAnalysisDate } from './reproductiveEfficiency';

const cow = (id: number) => ({ id, earTag: `00${id}`, name: `検証母${id}`, sex: '雌' });
const birth = (id: string, tag = '001', date = '2026-07-01') => ({ id, cowId: tag, actualCalvingDate: date });
const ai = (id: string, date: string, extra = {}) => ({ id, cowEarTag: '001', breedingMethod: '種付', inseminationDate: date,
  heatDate: date, pregnancyCheckDate: '2026-10-01', pregnancyResult: '空胎', ...extra });
const snapshot = (extra: Partial<MaternalSnapshot> = {}): MaternalSnapshot => ({ cattle: [cow(1), cow(2), cow(3), cow(4)], calves: [], calvings: [birth('c')], breedings: [], sales: [], ...extra });
function calculate(data: MaternalSnapshot, year = '', today = '2026-11-08') {
  const analysis = buildMaternalAnalysis(data, { today });
  return { analysis, report: buildReproductiveEfficiency(analysis, today, year) };
}
const cycle = (data: MaternalSnapshot, keys = ['1', '2', '3', '4'], start = '2026-08-01') => {
  const { analysis, report } = calculate(data);
  return buildCycleEfficiency(analysis, report, start, keys, '2026-11-08');
};

describe('postpartum and insemination efficiency', () => {
  it('uses the first recorded AI and the successful AI date, never the diagnosis date', () => {
    const { report } = calculate(snapshot({ breedings: [ai('first', '2026-08-15'), ai('second', '2026-09-05', { pregnancyResult: '受胎' })] }));
    expect(report.mothers[0].firstAiDays).toBe(45);
    expect(report.mothers[0].daysOpen).toBe(66);
    expect(report.mothers[0].episodes[0].conceptionDate).toBe('2026-09-05');
    expect(report.total.conceptionRate).toBe(50);
    expect(report.total.aiCount).toBe(2);
  });
  it('includes a confirmed ET in conception results while keeping AI and ET counts distinct', () => {
    const { report } = calculate(snapshot({ breedings: [ai('et', '', { breedingMethod: '受精卵移植', transferDate: '2026-08-15', heatDate: '2026-08-08', pregnancyResult: '受胎' })] }));
    expect(report.total.firstAiDays).toBeNull(); expect(report.total.aiCount).toBe(0);
    expect(report.total.firstServiceDays).toBe(45); expect(report.total.firstServiceCount).toBe(1);
    expect(report.total.etCount).toBe(1); expect(report.total.serviceCount).toBe(1);
    expect(report.total.conceivedCount).toBe(1); expect(report.total.conceptionRate).toBe(100);
    expect(report.total.aiConceptionRate).toBeNull(); expect(report.total.etConceptionRate).toBe(100);
    expect(report.total.daysOpen).toBe(38);
    expect(report.mothers[0].episodes[0].conceptionMethod).toBe('ET（発情日基準）');
    expect(report.mothers[0].episodes[0].firstServiceMethod).toBe('et');
    expect(report.mothers[0].episodes[0].firstServiceDate).toBe('2026-08-15');
  });
  it('uses all AI and ET attempts as the combined denominator and reports each method separately', () => {
    const { report } = calculate(snapshot({ breedings: [ai('ai', '2026-08-15'),
      ai('et', '', { cowEarTag: '002', breedingMethod: '受精卵移植', transferDate: '2026-08-20', heatDate: '2026-08-13', pregnancyResult: '受胎' })] }));
    expect(report.total.aiCount).toBe(1); expect(report.total.etCount).toBe(1); expect(report.total.serviceCount).toBe(2);
    expect(report.total.aiConceivedCount).toBe(0); expect(report.total.etConceivedCount).toBe(1);
    expect(report.total.conceptionRate).toBe(50); expect(report.total.aiConceptionRate).toBe(0); expect(report.total.etConceptionRate).toBe(100);
  });
  it('uses the first AI or ET procedure for the new postpartum measure without changing first-AI history', () => {
    const { report } = calculate(snapshot({ breedings: [ai('et-first', '', { breedingMethod: '受精卵移植', transferDate: '2026-08-08', heatDate: '2026-08-01' }),
      ai('ai-later', '2026-08-29', { pregnancyResult: '受胎' })] }));
    expect(report.total.firstServiceDays).toBe(38); expect(report.total.firstAiDays).toBe(59);
    expect(report.mothers[0].episodes[0].firstServiceMethod).toBe('et');
  });
  it('leaves the combined and ET rates unconfirmed when an ET outcome is pending', () => {
    const { report } = calculate(snapshot({ breedings: [ai('ai', '2026-08-15', { pregnancyResult: '受胎' }),
      ai('et-pending', '', { cowEarTag: '002', breedingMethod: '受精卵移植', transferDate: '2026-08-20', heatDate: '2026-08-13', pregnancyCheckDate: '', pregnancyResult: '未鑑定' })] }));
    expect(report.total.serviceCount).toBe(2); expect(report.total.unresolvedCount).toBe(1); expect(report.total.etUnresolvedCount).toBe(1);
    expect(report.total.conceptionRate).toBeNull(); expect(report.total.etConceptionRate).toBeNull(); expect(report.total.aiConceptionRate).toBe(100);
  });
  it.each(['', '2026-08-20', '2026-06-01'])('does not substitute a transfer date for an invalid/missing ET estrus date %s', heatDate => {
    const { report } = calculate(snapshot({ breedings: [ai('et', '', { breedingMethod: '受精卵移植', transferDate: '2026-08-15', heatDate, pregnancyResult: '受胎' })] }));
    expect(report.total.daysOpen).toBeNull(); expect(report.issues.join()).toContain('ETの発情日');
    expect(report.mothers[0].episodes[0].elapsedUnconfirmedDays).toBeNull();
  });
  it('keeps unconfirmed elapsed days separate from the mean of completed days open', () => {
    const { report } = calculate(snapshot({ breedings: [ai('pending', '2026-08-15', { pregnancyResult: '未鑑定', pregnancyCheckDate: '' })] }));
    expect(report.total.daysOpen).toBeNull(); expect(report.total.conceptionRate).toBeNull();
    expect(report.total.aiCount).toBe(1); expect(report.total.unresolvedCount).toBe(1);
    expect(report.mothers[0].episodes[0].elapsedUnconfirmedDays).toBe(130);
  });
  it('does not mix the next lactation into the previous first insemination or conception', () => {
    const { report } = calculate(snapshot({ calvings: [birth('old', '001', '2025-01-01'), birth('new')],
      breedings: [ai('first', '2026-08-15', { pregnancyResult: '受胎' })] }));
    expect(report.mothers[0].episodes[0].firstAiDays).toBeNull();
    expect(report.mothers[0].episodes[1].firstAiDays).toBe(45);
  });
  it('uses calving year for postpartum episodes and service year for conception rate, including leap days', () => {
    const { report } = calculate(snapshot({ calvings: [birth('leap', '001', '2023-12-31')],
      breedings: [ai('leap-ai', '2024-02-29', { pregnancyCheckDate: '2024-04-01', pregnancyResult: '受胎' })] }), '2023');
    expect(report.total.firstAiDays).toBe(60); expect(report.total.daysOpen).toBe(60); expect(report.total.aiCount).toBe(0);
  });
  it('weights observations rather than the averages of mothers', () => {
    const { report } = calculate(snapshot({ calvings: [birth('a1', '001', '2025-01-01'), birth('a2'), birth('b1', '002', '2026-07-01')],
      breedings: [ai('a1', '2025-02-10', { pregnancyCheckDate: '2025-04-01' }), ai('a2', '2026-08-20'), ai('b1', '2026-08-30', { cowEarTag: '002' })] }));
    expect(report.mothers[0].firstAiDays).toBe(45); expect(report.mothers[1].firstAiDays).toBe(60);
    expect(report.total.firstAiCount).toBe(3); expect(report.total.firstAiDays).toBe(50);
  });
  it('does not replace an ambiguous first service with a later service or inflate conception rates', () => {
    const { report } = calculate(snapshot({ breedings: [ai('dup1', '2026-08-15'), ai('dup2', '2026-08-15'), ai('later', '2026-09-05', { pregnancyResult: '受胎' })] }));
    expect(report.excludedCount).toBe(2); expect(report.total.firstAiDays).toBeNull();
    expect(report.total.daysOpen).toBeNull(); expect(report.total.conceptionRate).toBeNull();
    expect(report.total.firstServiceDays).toBeNull();
  });
  it('does not discard duplicate ET attempts and report a later AI as the first procedure or a complete rate', () => {
    const et = ai('dup-et-1', '', { breedingMethod: '受精卵移植', transferDate: '2026-08-08', heatDate: '2026-08-01' });
    const { report } = calculate(snapshot({ breedings: [et, { ...et, id: 'dup-et-2' }, ai('later', '2026-08-29', { pregnancyResult: '受胎' })] }));
    expect(report.excludedCount).toBe(2); expect(report.total.firstServiceDays).toBeNull();
    expect(report.total.firstAiDays).toBe(59); expect(report.total.conceptionRate).toBeNull();
    expect(report.total.aiConceptionRate).toBe(100); expect(report.total.etConceptionRate).toBeNull();
  });
  it('requires review for AI and ET reporting the same pregnancy even without a calving record', () => {
    const { report } = calculate(snapshot({ calvings: [], breedings: [ai('ai-positive', '2026-08-01', { pregnancyResult: '受胎' }),
      ai('et-positive', '', { breedingMethod: '受精卵移植', transferDate: '2026-08-08', heatDate: '2026-08-01', pregnancyResult: '受胎' })] }));
    expect(report.total.conceptionRate).toBeNull(); expect(report.total.aiConceptionRate).toBeNull(); expect(report.total.etConceptionRate).toBeNull();
    expect(report.issues.join()).toContain('複数の受胎記録');
  });
  it('does not report a first procedure when an undated legacy procedure may have occurred earlier', () => {
    const { report } = calculate(snapshot({ breedings: [ai('known', '2026-08-15'),
      { id: 'unknown-date', cowEarTag: '001', breedingType: 'AI', serviceDate: '' }] }));
    expect(report.total.firstServiceDays).toBeNull(); expect(report.total.conceptionRate).toBeNull();
  });
  it('requires review of multiple positive services in one postpartum episode', () => {
    const { report } = calculate(snapshot({ breedings: [ai('a', '2026-08-15', { pregnancyResult: '受胎' }), ai('b', '2026-09-05', { pregnancyResult: '受胎' })] }));
    expect(report.total.daysOpen).toBeNull(); expect(report.total.conceptionRate).toBeNull();
    expect(report.issues.join()).toContain('複数の受胎記録');
  });
  it('rejects plans, cancelled, deleted, future, invalid and unlinked services without mutating records', () => {
    const data = snapshot({ breedings: [ai('plan', ''), ai('cancel', '2026-08-15', { breedingStatus: '中止' }),
      ai('deleted', '2026-08-15', { deletedAt: '2026-08-16' }), ai('future', '2027-01-01'), ai('invalid', '2026-02-30'), ai('unlinked', '2026-08-15', { cowEarTag: '999' })] });
    const before = JSON.stringify(data); const { report } = calculate(data);
    expect(report.total.aiCount).toBe(0); expect(report.total.firstAiDays).toBeNull();
    expect(JSON.stringify(data)).toBe(before);
  });
  it('does not use future pregnancy checks for a historical snapshot', () => {
    const { report } = calculate(snapshot({ breedings: [ai('future-check', '2026-08-15', { pregnancyResult: '受胎', pregnancyCheckDate: '2026-12-01' })] }));
    expect(report.total.conceptionRate).toBeNull(); expect(report.total.daysOpen).toBeNull();
  });
});

describe('21-day cohort efficiency', () => {
  const twoServices = () => snapshot({ breedings: [ai('a', '2026-08-15', { pregnancyResult: '受胎' }), ai('b', '2026-08-20', { cowEarTag: '002' })] });
  it('uses the same cohort and window: 2/4 detected, 1/2 conceived, 25% pregnancy', () => {
    const result = cycle(twoServices());
    expect(result.end).toBe('2026-08-21'); expect(result.eligibleCount).toBe(4);
    expect(result.heatDetectionRate).toBe(50); expect(result.conceptionRate).toBe(50); expect(result.pregnancyRate).toBe(25);
  });
  it('requires a selected denominator and does not guess all cows are eligible', () => {
    const result = cycle(twoServices(), []);
    expect(result.heatDetectionRate).toBeNull(); expect(result.pregnancyRate).toBeNull();
    expect(cycle(twoServices(), ['1', '1', 'unknown']).eligibleCount).toBe(1);
  });
  it('uses only selected cows even if other cows were inseminated', () => {
    const result = cycle(twoServices(), ['2', '3']);
    expect(result.aiCount).toBe(1); expect(result.heatDetectionRate).toBe(50); expect(result.conceptionRate).toBe(0); expect(result.pregnancyRate).toBe(0);
  });
  it('counts both interval boundaries but does not include day 22', () => {
    const result = cycle(snapshot({ breedings: [ai('start', '2026-08-01'), ai('end', '2026-08-21', { cowEarTag: '002' }), ai('outside', '2026-08-22', { cowEarTag: '003' })] }));
    expect(result.aiCount).toBe(2); expect(result.heatDetectionRate).toBe(50);
  });
  it('reports no confirmed pregnancies in the selected cohort even when no procedures were performed', () => {
    const result = cycle(snapshot());
    expect(result.heatDetectionRate).toBe(0); expect(result.conceptionRate).toBeNull(); expect(result.pregnancyRate).toBe(0);
  });
  it('shows undetermined outcomes rather than silently changing the conception denominator', () => {
    const data = twoServices(); data.breedings[1].pregnancyResult = '未鑑定';
    const result = cycle(data);
    expect(result.heatDetectionRate).toBe(50); expect(result.aiCount).toBe(2); expect(result.unresolvedCount).toBe(1);
    expect(result.conceptionRate).toBeNull(); expect(result.pregnancyRate).toBeNull();
  });
  it('does not treat AI without a recorded heat as confirmed heat detection', () => {
    const data = twoServices(); data.breedings[1].heatDate = '';
    const result = cycle(data);
    expect(result.conceptionRate).toBe(50); expect(result.heatDetectionRate).toBe(25); expect(result.pregnancyRate).toBe(25);
    expect(result.missingHeatCount).toBe(1); expect(result.needsReview).toBe(false);
  });
  it('does not mix cow counts with repeat insemination counts', () => {
    const result = cycle(snapshot({ breedings: [ai('a', '2026-08-01'), ai('repeat', '2026-08-21', { pregnancyResult: '受胎' })] }));
    expect(result.aiCount).toBe(2); expect(result.inseminatedCount).toBe(1);
    expect(result.heatDetectionRate).toBe(25); expect(result.conceptionRate).toBe(50); expect(result.pregnancyRate).toBe(25);
    expect(result.conceivedCount).toBe(1); expect(result.needsReview).toBe(false);
  });
  it('includes an ET recipient in the same cohort with its recorded heat and confirmed outcome', () => {
    const result = cycle(snapshot({ breedings: [ai('et', '', { breedingMethod: '受精卵移植', transferDate: '2026-08-15', heatDate: '2026-08-08', pregnancyResult: '受胎' })] }));
    expect(result.aiCount).toBe(0); expect(result.etCount).toBe(1); expect(result.serviceCount).toBe(1);
    expect(result.inseminatedCount).toBe(1); expect(result.detectedCount).toBe(1); expect(result.conceivedCount).toBe(1);
    expect(result.heatDetectionRate).toBe(25); expect(result.conceptionRate).toBe(100); expect(result.pregnancyRate).toBe(25); expect(result.needsReview).toBe(false);
  });
  it('counts a recorded heat even when no AI or ET procedure follows', () => {
    const result = cycle(snapshot({ breedings: [ai('heat-only', '', { heatDate: '2026-08-08', pregnancyCheckDate: '', pregnancyResult: '' })] }));
    expect(result.serviceCount).toBe(0); expect(result.detectedCount).toBe(1);
    expect(result.heatDetectionRate).toBe(25); expect(result.conceptionRate).toBeNull(); expect(result.pregnancyRate).toBe(0);
  });
  it('does not infer heat detection from an ET procedure without an observed heat', () => {
    const result = cycle(snapshot({ breedings: [ai('et', '', { breedingMethod: '受精卵移植', transferDate: '2026-08-15', heatDate: '', pregnancyResult: '受胎' })] }));
    expect(result.detectedCount).toBe(0); expect(result.heatDetectionRate).toBe(0);
    expect(result.conceptionRate).toBe(100); expect(result.pregnancyRate).toBe(25); expect(result.needsReview).toBe(false);
  });
  it('does not multiply heat detection by conception when observed cows and procedure counts differ', () => {
    const data = snapshot({ cattle: Array.from({ length: 10 }, (_, i) => cow(i + 1)), breedings: [
      ai('ai-positive', '2026-08-05', { pregnancyResult: '受胎' }),
      ai('ai-negative', '2026-08-08', { cowEarTag: '002' }),
      ai('et-positive', '', { cowEarTag: '003', breedingMethod: '受精卵移植', transferDate: '2026-08-15', heatDate: '2026-08-08', pregnancyResult: '受胎' }),
      ai('et-negative', '', { cowEarTag: '004', breedingMethod: '受精卵移植', transferDate: '2026-08-18', heatDate: '2026-08-11' }),
      ai('heat-only', '', { cowEarTag: '005', heatDate: '2026-08-20', pregnancyCheckDate: '', pregnancyResult: '' }),
    ] });
    const result = cycle(data, Array.from({ length: 10 }, (_, i) => String(i + 1)));
    expect(result.eligibleCount).toBe(10); expect(result.detectedCount).toBe(5); expect(result.serviceCount).toBe(4);
    expect(result.aiCount).toBe(2); expect(result.etCount).toBe(2); expect(result.conceivedCount).toBe(2);
    expect(result.heatDetectionRate).toBe(50); expect(result.conceptionRate).toBe(50); expect(result.pregnancyRate).toBe(20);
  });
  it('counts each observed cow once and keeps observations inside the selected cohort and period', () => {
    const result = cycle(snapshot({ breedings: [ai('heat-a', '', { heatDate: '2026-08-01' }), ai('heat-a-again', '', { heatDate: '2026-08-20' }),
      ai('heat-b-outside', '', { cowEarTag: '002', heatDate: '2026-08-22' }), ai('heat-c-unselected', '', { cowEarTag: '003', heatDate: '2026-08-10' })] }), ['1', '2']);
    expect(result.detectedCount).toBe(1); expect(result.heatDetectionRate).toBe(50);
  });
  it('does not conceal a missing repeat-service heat date using an earlier heat on the same cow', () => {
    const result = cycle(snapshot({ breedings: [ai('first', '2026-08-01'), ai('repeat', '2026-08-21', { heatDate: '', pregnancyResult: '受胎' })] }));
    expect(result.detectedCount).toBe(1); expect(result.missingHeatCount).toBe(1);
    expect(result.heatDetectionRate).toBe(25); expect(result.conceptionRate).toBe(50); expect(result.pregnancyRate).toBe(25);
  });
  it('requires review for an unlinked heat observation that could belong to the selected cohort', () => {
    const { analysis, report } = calculate(twoServices());
    analysis.observations.heats!.push({ date: '2026-08-10' });
    const result = buildCycleEfficiency(analysis, report, '2026-08-01', ['1', '2', '3', '4'], '2026-11-08');
    expect(result.heatDetectionRate).toBeNull(); expect(result.pregnancyRate).toBeNull(); expect(result.needsReview).toBe(true);
    expect(result.issues.join()).toContain('母牛を照合できない発情記録');
  });
  it('uses recorded service heat dates only when an older analysis has no heat-observation field', () => {
    const { analysis, report } = calculate(snapshot({ breedings: [ai('et', '', { breedingMethod: '受精卵移植', transferDate: '2026-08-15', heatDate: '2026-08-08', pregnancyResult: '受胎' })] }));
    delete analysis.observations.heats;
    const result = buildCycleEfficiency(analysis, report, '2026-08-01', ['1', '2'], '2026-11-08');
    expect(result.heatDetectionRate).toBe(50); expect(result.pregnancyRate).toBe(50);
  });
  it('requires review when a cow has more than one positive AI/ET in the same window', () => {
    const result = cycle(snapshot({ breedings: [ai('positive-ai', '2026-08-01', { pregnancyResult: '受胎' }),
      ai('positive-et', '', { breedingMethod: '受精卵移植', transferDate: '2026-08-08', heatDate: '2026-08-01', pregnancyResult: '受胎' })] }));
    expect(result.conceivedCount).toBe(1); expect(result.conceptionRate).toBeNull(); expect(result.pregnancyRate).toBeNull(); expect(result.needsReview).toBe(true);
  });
  it('requires review when a later procedure follows an already confirmed successful service', () => {
    const result = cycle(snapshot({ breedings: [ai('positive', '2026-08-01', { pregnancyResult: '受胎' }), ai('later', '2026-08-21')] }));
    expect(result.conceptionRate).toBeNull(); expect(result.pregnancyRate).toBeNull(); expect(result.needsReview).toBe(true);
  });
  it('requires cohort review when selected cows have an earlier confirmed pregnancy', () => {
    const pregnant = cycle(snapshot({ breedings: [ai('prior', '2026-07-15', { pregnancyResult: '受胎' })] }));
    expect(pregnant.pregnancyRate).toBeNull(); expect(pregnant.issues.join()).toContain('開始日前');
  });
  it('does not carry a pregnancy across a later actual calving', () => {
    const result = cycle(snapshot({ breedings: [ai('prior', '2025-09-01', { pregnancyResult: '受胎', pregnancyCheckDate: '2025-11-01' }), ai('new', '2026-08-15')] }));
    expect(result.heatDetectionRate).toBe(25); expect(result.conceptionRate).toBe(0);
  });
  it('does not let unrelated old exclusions block a complete current cohort', () => {
    const data = twoServices(); data.breedings.push(ai('old-unlinked', '2020-01-01', { cowEarTag: '999' }));
    expect(cycle(data).pregnancyRate).toBe(25);
  });
  it('does not report complete rates when legacy service records may belong to the same cohort', () => {
    const data = twoServices(); data.breedings.push({ id: 'legacy', cowEarTag: '003', breedingType: 'AI', serviceDate: '2026-08-15' });
    const result = cycle(data);
    expect(result.heatDetectionRate).toBeNull(); expect(result.pregnancyRate).toBeNull();
    expect(calculate(data).report.total.conceptionRate).toBeNull();
    const unrelated = cycle(data, ['1', '2']);
    expect(unrelated.heatDetectionRate).toBe(100); expect(unrelated.pregnancyRate).toBe(50);
  });
  it.each(['2026-02-30', '', '2026-11-01'])('rejects invalid or not-yet-completed windows %s', start => {
    expect(cycle(twoServices(), ['1'], start).heatDetectionRate).toBeNull();
  });
  it('adds days in UTC across leap days independently of local timezones', () => {
    expect(shiftAnalysisDate('2024-02-20', 20)).toBe('2024-03-11');
  });
});
