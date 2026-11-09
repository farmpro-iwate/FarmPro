import { describe, expect, it } from 'vitest';
import { buildMaternalAnalysis, type CalvingInterval, type MaternalAnalysis, type MaternalSnapshot, type MotherAnalysis } from './maternalAnalysis';
import { buildMotherCalvingSummaries } from './motherCalvingSummary';

const asOf = '2026-11-09';
const emptySummary = { calvingCount: 0, intervalCount: 0, averageInterval: null, latestCalvingDate: '' };
const calving = (date: string, days: number | null): CalvingInterval => ({ date, days, previous: '', source: '検証用履歴' });
const mother = (key: string, calvings: CalvingInterval[]): MotherAnalysis => ({
  key, name: `検証母${key}`, earTag: `09${key}`, identificationNumber: '', calvings, intervals: [], averageInterval: null,
  serviceCount: 0, checkedCount: 0, conceivedCount: 0, offspring: [], priceCount: 0, averagePrice: null,
  shippingCount: 0, averageShippingAge: null,
});
const analysisWith = (...mothers: MotherAnalysis[]): MaternalAnalysis => ({ mothers, issues: [], observations: { births: [], services: [], offspring: [] } });
const snapshot = (extra: Partial<MaternalSnapshot> = {}): MaternalSnapshot => ({
  cattle: [{ id: '1', name: '検証母1', earTag: '0901', sex: '雌' }], calves: [], calvings: [], breedings: [], sales: [], ...extra,
});

describe('mother calving summaries for a selected period', () => {
  it('counts a current-year calving with the interval from its prior-year predecessor', () => {
    const analysis = buildMaternalAnalysis(snapshot({ calvings: [
      { id: 'previous', cowId: '0901', actualCalvingDate: '2025-09-01' },
      { id: 'current', cowId: '0901', actualCalvingDate: '2026-08-01' },
    ] }), { today: asOf });
    const result = buildMotherCalvingSummaries(analysis, asOf, '2026');
    expect(result.byMother.get('1')).toEqual({ calvingCount: 1, intervalCount: 1, averageInterval: 334, latestCalvingDate: '2026-08-01' });
    expect(result.total).toEqual(result.byMother.get('1'));
  });

  it('retains an imported first interval without requiring a recorded predecessor', () => {
    const analysis = buildMaternalAnalysis(snapshot({ cattle: [{
      id: '1', name: '検証母1', earTag: '0901', sex: '雌',
      importedOffspringHistory: [{ birthday: '2026-04-02', calvingIntervalDays: '377' }],
    }] }), { today: asOf });
    expect(analysis.mothers[0].calvings[0].previous).toBe('');
    expect(buildMotherCalvingSummaries(analysis, asOf, '2026').total).toEqual({
      calvingCount: 1, intervalCount: 1, averageInterval: 377, latestCalvingDate: '2026-04-02',
    });
  });

  it('weights the farm average by interval records rather than mother averages, including all years by default', () => {
    const analysis = analysisWith(
      mother('1', [calving('2024-04-01', 300), calving('2025-03-27', 360)]),
      mother('2', [calving('2026-06-01', 450)]),
    );
    const result = buildMotherCalvingSummaries(analysis, asOf);
    expect(result.byMother.get('1')?.averageInterval).toBe(330);
    expect(result.byMother.get('2')?.averageInterval).toBe(450);
    expect(result.total).toEqual({ calvingCount: 3, intervalCount: 3, averageInterval: 370, latestCalvingDate: '2026-06-01' });
  });

  it('rejects invalid, future and out-of-year dates while counting dated calvings with unknown intervals', () => {
    const analysis = analysisWith(mother('1', [
      calving('', 365), calving('2026-02-30', 365), calving('2027-01-01', 365), calving('2026-12-01', 365), calving('2025-12-01', 365),
      calving('2026-05-01', null), calving('2026-08-01', Number.NaN), calving('2026-09-01', Number.POSITIVE_INFINITY),
      calving('2026-10-01', 0), calving('2026-10-02', -1),
    ]));
    expect(buildMotherCalvingSummaries(analysis, asOf, '2026').total).toEqual({
      calvingCount: 5, intervalCount: 0, averageInterval: null, latestCalvingDate: '2026-10-02',
    });
  });

  it('keeps an empty mother and does not substitute an all-time latest calving for an empty selected year', () => {
    const analysis = analysisWith(mother('1', [calving('2025-08-01', 380)]), mother('2', []));
    const result = buildMotherCalvingSummaries(analysis, asOf, '2026');
    expect(result.byMother.size).toBe(2);
    expect(result.byMother.get('1')).toEqual(emptySummary);
    expect(result.byMother.get('2')).toEqual(emptySummary);
    expect(result.total).toEqual(emptySummary);
  });

  it.each(['', '2026-02-30'])('does not assign a period when the cutoff is invalid: %s', cutoff => {
    const result = buildMotherCalvingSummaries(analysisWith(mother('1', [calving('2026-05-01', 365)])), cutoff, '2026');
    expect(result.byMother.get('1')).toEqual(emptySummary);
    expect(result.total).toEqual(emptySummary);
  });

  it('includes the cutoff day and finds the latest date without sorting or modifying the source history', () => {
    const analysis = analysisWith(mother('1', [calving('2026-11-09', 380), calving('2025-10-01', 360), calving('2026-11-10', 366)]));
    const before = structuredClone(analysis);
    Object.freeze(analysis.mothers[0].calvings);
    const result = buildMotherCalvingSummaries(analysis, asOf, '2026');
    expect(result.total).toEqual({ calvingCount: 1, intervalCount: 1, averageInterval: 380, latestCalvingDate: '2026-11-09' });
    expect(analysis).toEqual(before);
  });
});
