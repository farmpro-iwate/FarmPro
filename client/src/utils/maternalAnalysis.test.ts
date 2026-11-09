import { describe, expect, it } from 'vitest';
import { analysisDate, analysisDays, buildMaternalAnalysis, type MaternalSnapshot } from './maternalAnalysis';

const cow = (id = 1, earTag = '0123', name = '検証母A') => ({ id, earTag, name, sex: '雌' });
const calf = (id = 10, extra = {}) => ({ id, calfNumber: `TEST-${id}`, motherCowId: '0123', motherName: '検証母A', birthday: '2026-01-01', sex: '去勢', ...extra });
const sale = (id = 's1', extra = {}) => ({ id, targetType: '子牛', targetNumber: 'TEST-10', birthday: '2026-01-01', status: '販売済み', shippingDate: '2026-10-01', saleDate: '2026-10-02', salePrice: '700000', ...extra });
function fixture(extra: Partial<MaternalSnapshot> = {}): MaternalSnapshot {
  return { cattle: [cow()], calves: [], calvings: [], breedings: [], sales: [], ...extra };
}
const run = (data: MaternalSnapshot, extra = {}) => buildMaternalAnalysis(data, { today: '2026-11-07', ...extra });

describe('maternal analysis from existing records', () => {
  it('calculates calendar days across leap years and rejects impossible dates', () => {
    expect(analysisDays('2024-02-28', '2024-03-01')).toBe(2);
    expect(analysisDays('2026-01-01', '2026-01-01')).toBe(0);
    expect(analysisDate('2026/02/28')).toBe('2026-02-28');
    expect(analysisDate('2026-02-30')).toBe('');
    expect(analysisDays('2026-01-02', '2026-01-01')).toBeNull();
  });
  it('uses actual calvings and imported history without double counting a calf or twin date', () => {
    const result = run(fixture({
      cattle: [{ ...cow(), importedOffspringHistory: [{ birthday: '2024-01-01', salePrice: '600000', calvingIntervalDays: '365' }, { birthday: '2025-01-01' }] }],
      calvings: [{ id: 'c1', cowId: '0123', cowName: '検証母A', actualCalvingDate: '2025-01-01' }, { id: 'c2', cowId: '0123', actualCalvingDate: '2026-01-01' }, { id: 'plan', cowId: '0123', expectedCalvingDate: '2026-11-01' }],
      calves: [calf(10, { calvingId: 'c2' }), calf(11, { calvingId: 'c2' })],
    }));
    expect(result.mothers[0].calvings.map(c => c.date)).toEqual(['2024-01-01', '2025-01-01', '2026-01-01']);
    expect(result.mothers[0].intervals).toEqual([365, 366, 365]);
    expect(result.mothers[0].offspring).toHaveLength(4);
  });
  it('preserves missing prices and intervals as null, while accepting a genuine zero price', () => {
    const row = run(fixture({ calves: [calf()], sales: [sale('s1', { salePrice: '' })] })).mothers[0];
    expect(row.averageInterval).toBeNull(); expect(row.averagePrice).toBeNull(); expect(row.priceCount).toBe(0);
    expect(run(fixture({ calves: [calf()], sales: [sale('s1', { salePrice: '0' })] })).mothers[0].averagePrice).toBe(0);
  });
  it('uses the shipping date, never the sale or planned date, for shipping age', () => {
    const row = run(fixture({ calves: [calf()], sales: [sale()] })).mothers[0];
    expect(row.averageShippingAge).toBe(273); expect(row.averagePrice).toBe(700000);
    const noShipping = run(fixture({ calves: [calf()], sales: [sale('s', { shippingDate: '', shippingPlanDate: '2026-10-01' })] })).mothers[0];
    expect(noShipping.averageShippingAge).toBeNull(); expect(noShipping.averagePrice).toBe(700000);
  });
  it('excludes plans, cancellations, adult sales, deletions, future and invalid sale dates', () => {
    for (const extra of [{ status: '出荷予定' }, { status: '取消' }, { targetType: '成牛' }, { deletedAt: '2026-10-03' }, { saleDate: '2027-01-01' }, { saleDate: '2026-02-30' }]) {
      const row = run(fixture({ calves: [calf()], sales: [sale('s', extra)] })).mothers[0];
      expect(row.averagePrice).toBeNull(); expect(row.averageShippingAge).toBeNull();
    }
  });
  it('keeps shipping performance for shipped calves without counting their provisional price', () => {
    const row = run(fixture({ calves: [calf()], sales: [sale('s', { status: '出荷済み' })] })).mothers[0];
    expect(row.averageShippingAge).toBe(273); expect(row.averagePrice).toBeNull();
  });
  it('does not calculate prices or ages when completed sales are duplicated', () => {
    const result = run(fixture({ calves: [calf()], sales: [sale(), sale('duplicate', { salePrice: '800000' })] }));
    expect(result.mothers[0].priceCount).toBe(0); expect(result.mothers[0].shippingCount).toBe(0);
    expect(result.issues.join()).toContain('複数の完了済み');
  });
  it('uses the completed sale over a shipped snapshot and imported price', () => {
    const row = run(fixture({ cattle: [{ ...cow(), importedOffspringHistory: [{ birthday: '2026-01-01', salePrice: '500000' }] }],
      calves: [calf()], sales: [sale(), sale('shipped', { status: '出荷済み', salePrice: '999999' })] })).mothers[0];
    expect(row.offspring).toHaveLength(1); expect(row.averagePrice).toBe(700000);
  });
  it('does not treat a local cattle ID as a matching ear tag', () => {
    const data = fixture({ cattle: [cow(123, '0999', '別の牛'), cow(2, '0123')],
      calvings: [{ id: 'a', cattleId: '123', cowId: '0123', cowName: '検証母A', actualCalvingDate: '2026-01-01' }] });
    const rows = run(data).mothers;
    expect(rows.find(r => r.key === '123')?.calvings).toHaveLength(0);
    expect(rows.find(r => r.key === '2')?.calvings).toHaveLength(1);
  });
  it('does not guess a mother from duplicated names or uncorroborated local IDs', () => {
    const result = run(fixture({ cattle: [cow(), cow(2, '0999')], calves: [calf(10, { motherCowId: '', motherName: '検証母A' })],
      calvings: [{ id: 'c', cattleId: '1', actualCalvingDate: '2026-01-01' }] }));
    expect(result.mothers.every(r => !r.offspring.length && !r.calvings.length)).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);
  });
  it('does not attach a sale via a reused numeric calf ID with a conflicting number', () => {
    const row = run(fixture({ calves: [calf()], sales: [sale('s', { calfId: '10', targetNumber: 'OTHER-CALF' })] })).mothers[0];
    expect(row.averagePrice).toBeNull();
  });
  it('does not use a calving link to override contradictory calf identity', () => {
    const row = run(fixture({ calves: [calf(10, { calvingId: 'c1' })], sales: [sale('s', { calvingId: 'c1', targetNumber: 'OTHER' })] })).mothers[0];
    expect(row.averagePrice).toBeNull();
  });
  it('keeps ET recipient reproduction separate from donor offspring performance', () => {
    const data = fixture({ cattle: [cow(), cow(2, '0456', '供卵母')],
      calves: [calf(10, { breedingMethod: '受精卵移植', recipientCowId: '0123', recipientCowName: '検証母A', motherCowId: '0456', motherName: '供卵母', geneticMotherCowId: '0456', geneticMotherCowName: '供卵母' })], sales: [sale()] });
    const birth = run(data).mothers, genetic = run(data, { basis: 'genetic' }).mothers;
    expect(birth[0].averagePrice).toBe(700000); expect(birth[1].averagePrice).toBeNull();
    expect(genetic[0].averagePrice).toBeNull(); expect(genetic[1].averagePrice).toBe(700000);
    expect(genetic[0].calvings).toHaveLength(1); expect(genetic[1].calvings).toHaveLength(0);
  });
  it('uses imported history even when there is no calf ledger or completed sale left', () => {
    const row = run(fixture({ cattle: [{ ...cow(), importedOffspringHistory: [
      { birthday: '2024-01-01', salePrice: '650,000', sire: '検証父A', sex: '雌' },
      { birthday: '2025-01-01', salePrice: '', sire: '検証父B' },
    ] }] })).mothers[0];
    expect(row.averageInterval).toBe(366); expect(row.averagePrice).toBe(650000); expect(row.priceCount).toBe(1);
    expect(row.offspring.find(c => c.birthday === '2024-01-01')?.sire).toBe('検証父A');
  });
  it('does not turn a donor imported offspring history into an ET calving', () => {
    const data = fixture({ cattle: [cow(), { ...cow(2, '0456', '供卵母'), importedOffspringHistory: [{ birthday: '2026-01-01', salePrice: '700000' }] }],
      calves: [calf(10, { breedingMethod: '受精卵移植', recipientCowId: '0123', recipientCowName: '検証母A', motherCowId: '0456', motherName: '供卵母', geneticMotherCowId: '0456', geneticMotherCowName: '供卵母' })] });
    const rows = run(data, { basis: 'genetic' }).mothers;
    expect(rows[1].offspring).toHaveLength(1); expect(rows[1].calvings).toHaveLength(0);
  });
  it('does not silently merge conflicting imported sex/sire values into a calf price', () => {
    const result = run(fixture({ cattle: [{ ...cow(), importedOffspringHistory: [{ birthday: '2026-01-01', sex: '雌', salePrice: '999999' }] }], calves: [calf()] }));
    expect(result.mothers[0].averagePrice).toBeNull(); expect(result.issues.join()).toContain('性別・父牛が一致しない');
  });
  it('keeps a sale-only historic calf and does not invent its genetic mother or birth event', () => {
    const result = run(fixture({ sales: [sale('s', { motherCowId: '0123', motherName: '検証母A' })] }));
    expect(result.mothers[0].averagePrice).toBe(700000); expect(result.mothers[0].calvings).toHaveLength(0);
    expect(run(fixture({ sales: [sale('s', { motherCowId: '0123', motherName: '検証母A' })] }), { basis: 'genetic' }).mothers[0].priceCount).toBe(0);
  });
  it('counts only performed services and dated definitive pregnancy checks', () => {
    const base = { cowEarTag: '0123', cowName: '検証母A', breedingMethod: '種付', inseminationDate: '2026-05-01', pregnancyCheckDate: '2026-06-01' };
    const row = run(fixture({ breedings: [
      { id: '1', ...base, pregnancyResult: '受胎' }, { id: '2', ...base, pregnancyResult: '空胎' },
      { id: '3', ...base, pregnancyResult: '再確認' }, { id: '4', ...base, pregnancyResult: '受胎', pregnancyCheckDate: '' },
      { id: '5', ...base, inseminationDate: '', pregnancyResult: '受胎' },
      { id: '6', ...base, breedingMethod: '受精卵移植', inseminationDate: '', transferDate: '2026-05-01', pregnancyResult: '受胎' },
    ] })).mothers[0];
    expect(row.serviceCount).toBe(5); expect(row.checkedCount).toBe(3); expect(row.conceivedCount).toBe(2);
  });
  it('retains actual heats for ET, heat-only entries and a cancelled transfer without inventing services', () => {
    const data = fixture({ breedings: [
      { id: 'observed', cowEarTag: '0123', breedingMethod: '未選択', breedingStatus: '発情確認', heatDate: '2026-02-10' },
      { id: 'et', cowEarTag: '0123', breedingMethod: '受精卵移植', heatDate: '2026-02-10', transferDate: '2026-02-17' },
      { id: 'cancelled', cowEarTag: '0123', breedingMethod: '受精卵移植', breedingStatus: '中止', heatDate: '2026-03-01', transferPlannedDate: '2026-03-08' },
      { id: 'planned', cowEarTag: '0123', breedingMethod: '受精卵移植', heatDate: '2026-04-01', transferPlannedDate: '2026-04-08' },
    ] });
    const before = JSON.stringify(data);
    const result = run(data);
    expect(result.observations.heats).toEqual([
      { date: '2026-02-10', motherKey: '1' }, { date: '2026-02-10', motherKey: '1' },
      { date: '2026-03-01', motherKey: '1' }, { date: '2026-04-01', motherKey: '1' },
    ]);
    expect(result.observations.services).toHaveLength(1);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('never substitutes expected dates or ET dates for actual heats, and rejects future, deleted and inconsistent heats', () => {
    const base = { cowEarTag: '0123', breedingMethod: '受精卵移植' };
    const result = run(fixture({ breedings: [
      { id: 'expected', ...base, nextHeatExpectedDate: '2026-02-10', transferPlannedDate: '2026-02-17' },
      { id: 'et-only', ...base, transferDate: '2026-02-10' },
      { id: 'future', ...base, heatDate: '2027-01-20' },
      { id: 'invalid', ...base, heatDate: '2026-02-30' },
      { id: 'deleted', ...base, heatDate: '2026-03-01', deletedAt: '2026-03-02' },
      { id: 'reversed', ...base, heatDate: '2026-04-10', transferDate: '2026-04-01' },
      { id: 'unmatched', ...base, cowEarTag: '9999', heatDate: '2026-05-01' },
    ] }));
    expect(result.observations.heats).toEqual([{ date: '2026-05-01', motherKey: '' }]);
    expect(result.issues.join()).toContain('発情日が授精・移植日より後');
  });
  it('filters offspring by sex without changing reproduction and does not mutate source records', () => {
    const data = fixture({ calves: [calf(), calf(11, { sex: '雌', birthday: '2025-01-01' })], sales: [sale()] });
    const before = JSON.stringify(data);
    const row = run(data, { sex: '雌' }).mothers[0];
    expect(row.offspring).toHaveLength(1); expect(row.averagePrice).toBeNull(); expect(row.intervals).toEqual([365]);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('excludes future births, impossible chronology and invalid numeric values', () => {
    const result = run(fixture({ calves: [calf(), calf(11, { birthday: '2027-01-01' })], sales: [sale('s', { shippingDate: '2025-01-01', salePrice: '-500' })] }));
    expect(result.mothers[0].calvings).toHaveLength(1); expect(result.mothers[0].averagePrice).toBeNull();
    expect(result.mothers[0].averageShippingAge).toBeNull(); expect(result.issues.join()).toContain('生年月日より前');
  });
});
