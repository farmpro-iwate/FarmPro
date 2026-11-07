import { describe, expect, it } from 'vitest';
import { buildMaternalAnalysis, type MaternalSnapshot } from './maternalAnalysis';
import { buildFarmPerformance } from './farmPerformance';

const base = (data: Partial<MaternalSnapshot> = {}): MaternalSnapshot => ({ cattle: [{ id: 1, earTag: '0123', name: '検証母A', sex: '雌' }], calves: [], calvings: [], breedings: [], sales: [], ...data });
const calc = (data: MaternalSnapshot, year = '', options = {}) => buildFarmPerformance(buildMaternalAnalysis(data, { today: '2026-11-07', ...options }), year, '2026-11-07');
const calf = (id: number, birthday: string) => ({ id, calfNumber: `FIX-${id}`, motherCowId: '0123', motherName: '検証母A', birthday, sex: '去勢' });
const sale = (id: string, number: string, price: string, saleDate = '2026-11-01', shippingDate = '2026-10-01') => ({ id, targetType: '子牛', targetNumber: number, status: '販売済み', salePrice: price, saleDate, shippingDate });
describe('farm performance periods and denominators', () => {
  it('keeps the previous-year calving to calculate January intervals', () => {
    const data = base({ calves: [calf(10, '2025-01-01'), calf(11, '2026-01-01')] });
    const farm = calc(data, '2026');
    expect(farm.total.calvingCount).toBe(1); expect(farm.total.averageInterval).toBe(365);
    expect(farm.periods[0].averageInterval).toBe(365); expect(farm.periods).toHaveLength(11);
    expect(farm.periods.some(p => p.period === '2026-12')).toBe(false);
  });
  it('weights each price and interval rather than weighting each mother equally', () => {
    const data = base({ cattle: [{ id: 1, earTag: '0123', name: '検証母A' }, { id: 2, earTag: '0456', name: '検証母B' }],
      calves: [calf(10, '2023-01-01'), calf(11, '2024-01-01'), { ...calf(12, '2025-01-01'), motherCowId: '0456', motherName: '検証母B' }],
      calvings: [{ id: 'c1', cowId: '0456', cowName: '検証母B', actualCalvingDate: '2024-02-01' }],
      sales: [sale('s1', 'FIX-10', '700000'), sale('s2', 'FIX-11', '800000'), sale('s3', 'FIX-12', '1000000')] });
    const farm = calc(data);
    expect(farm.total.averagePrice).toBeCloseTo(2500000 / 3);
    expect(farm.total.averageInterval).toBe((365 + 335) / 2);
    expect(farm.total.saleTotal).toBe(2500000); expect(farm.total.priceCount).toBe(3);
  });
  it('groups sales and shipments by their own dates', () => {
    const data = base({ calves: [calf(10, '2026-01-01')], sales: [sale('s', 'FIX-10', '700000')] });
    const farm = calc(data, '2026');
    const october = farm.periods.find(p => p.period === '2026-10')!;
    const november = farm.periods.find(p => p.period === '2026-11')!;
    expect(october.soldCount).toBe(0); expect(october.averageShippingAge).toBe(273);
    expect(november.soldCount).toBe(1); expect(november.saleTotal).toBe(700000); expect(november.averageShippingAge).toBeNull();
  });
  it('counts a January check separately from a December service and includes unlinked mothers', () => {
    const farm = calc(base({ breedings: [{ id: 'b', cowEarTag: 'OUTSIDE', cowName: '台帳外の母', breedingMethod: '種付', inseminationDate: '2025-12-01', pregnancyCheckDate: '2026-01-01', pregnancyResult: '受胎' }] }), '2026');
    expect(farm.total.serviceCount).toBe(0); expect(farm.total.checkedCount).toBe(1); expect(farm.total.pregnancyRate).toBe(100);
  });
  it('deduplicates an unlinked calving and its registered calf at the farm level', () => {
    const farm = calc(base({ cattle: [], calvings: [{ id: 'c', cowId: 'OUTSIDE', actualCalvingDate: '2026-01-01' }],
      calves: [{ ...calf(10, '2026-01-01'), motherCowId: 'OUTSIDE', motherName: '台帳外の母', calvingId: 'c' }] }), '2026');
    expect(farm.total.calvingCount).toBe(1); expect(farm.total.unmatchedCalvings).toBe(1); expect(farm.total.averageInterval).toBeNull();
  });
  it('includes identifiable sold calves with no mother but excludes duplicate completed sales', () => {
    const farm = calc(base({ cattle: [], sales: [sale('s', 'UNLINKED-1', '700000')] }), '2026');
    expect(farm.total.soldCount).toBe(1); expect(farm.total.saleTotal).toBe(700000);
    const duplicate = calc(base({ cattle: [], sales: [sale('s1', 'UNLINKED-1', '700000'), sale('s2', 'UNLINKED-1', '800000')] }), '2026');
    expect(duplicate.total.saleTotal).toBeNull(); expect(duplicate.total.soldCount).toBe(0);
  });
  it('does not turn a sale with contradictory calf references into an unlinked sale', () => {
    const farm = calc(base({ calves: [calf(10, '2026-01-01')], sales: [{ ...sale('s', 'WRONG', '700000'), calfId: '10', birthday: '2026-02-01', motherCowId: '0123', motherName: '検証母A' }] }), '2026');
    expect(farm.total.soldCount).toBe(0); expect(farm.total.saleTotal).toBeNull();
  });
  it('does not put undated imported prices into a dated farm total', () => {
    const farm = calc(base({ cattle: [{ id: 1, name: '検証母A', earTag: '0123', importedOffspringHistory: [{ birthday: '2025-01-01', salePrice: '700000' }] }] }));
    expect(farm.total.soldCount).toBe(0); expect(farm.total.saleTotal).toBeNull(); expect(farm.undatedPriceCount).toBe(1);
    expect(farm.periods[0].period).toBe('2025');
  });
  it('shows missing sale prices separately and preserves a genuine zero amount', () => {
    const farm = calc(base({ calves: [calf(10, '2026-01-01'), calf(11, '2026-01-01')], sales: [sale('s1', 'FIX-10', ''), sale('s2', 'FIX-11', '0')] }), '2026');
    expect(farm.total.soldCount).toBe(2); expect(farm.total.priceCount).toBe(1); expect(farm.total.saleTotal).toBe(0); expect(farm.missingSalePriceCount).toBe(1);
  });
  it('does not inherit sex or ET filters from the mother comparison', () => {
    const data = base({ calves: [calf(10, '2026-01-01')], sales: [sale('s', 'FIX-10', '700000')] });
    expect(calc(data, '2026', { sex: '雌', basis: 'genetic' }).total.saleTotal).toBe(700000);
  });
  it('distinguishes empty period counts from missing averages', () => {
    const farm = calc(base(), '2026');
    expect(farm.total.calvingCount).toBe(0); expect(farm.total.soldCount).toBe(0);
    expect(farm.total.averageInterval).toBeNull(); expect(farm.total.pregnancyRate).toBeNull(); expect(farm.total.averagePrice).toBeNull();
  });
});
