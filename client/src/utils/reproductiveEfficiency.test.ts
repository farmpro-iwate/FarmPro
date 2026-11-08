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
  it('uses the estrus date of a confirmed ET for days open, and excludes ET from AI counts', () => {
    const { report } = calculate(snapshot({ breedings: [ai('et', '', { breedingMethod: '受精卵移植', transferDate: '2026-08-15', heatDate: '2026-08-08', pregnancyResult: '受胎' })] }));
    expect(report.total.firstAiDays).toBeNull(); expect(report.total.aiCount).toBe(0);
    expect(report.total.daysOpen).toBe(38);
    expect(report.mothers[0].episodes[0].conceptionMethod).toBe('ET（発情日基準）');
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
  it('does not invent conception or pregnancy percentages with no services', () => {
    const result = cycle(snapshot());
    expect(result.heatDetectionRate).toBe(0); expect(result.conceptionRate).toBeNull(); expect(result.pregnancyRate).toBeNull();
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
    expect(result.conceptionRate).toBe(50); expect(result.heatDetectionRate).toBeNull(); expect(result.pregnancyRate).toBeNull();
  });
  it('does not mix cow counts with repeat insemination counts', () => {
    const result = cycle(snapshot({ breedings: [ai('a', '2026-08-01'), ai('repeat', '2026-08-21', { pregnancyResult: '受胎' })] }));
    expect(result.aiCount).toBe(2); expect(result.inseminatedCount).toBe(1);
    expect(result.heatDetectionRate).toBe(25); expect(result.conceptionRate).toBeNull(); expect(result.pregnancyRate).toBeNull();
  });
  it('requires cohort review when selected cows have ET or an earlier confirmed pregnancy', () => {
    const et = cycle(snapshot({ breedings: [ai('et', '', { breedingMethod: '受精卵移植', transferDate: '2026-08-15' })] }));
    expect(et.heatDetectionRate).toBeNull();
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
