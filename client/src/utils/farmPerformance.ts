import { analysisMean, type MaternalAnalysis } from './maternalAnalysis';

export type FarmPerformanceRow = {
  period: string; calvingCount: number; intervalCount: number; averageInterval: number | null;
  serviceCount: number; checkedCount: number; conceivedCount: number; pregnancyRate: number | null;
  soldCount: number; priceCount: number; saleTotal: number | null; averagePrice: number | null;
  shippingCount: number; averageShippingAge: number | null; unmatchedCalvings: number;
};
export type FarmPerformance = {
  total: FarmPerformanceRow; periods: FarmPerformanceRow[]; years: string[];
  undatedPriceCount: number; missingSalePriceCount: number;
};

/** Aggregate observations, not mother averages: each confirmed result has the same weight. */
export function buildFarmPerformance(analysis: MaternalAnalysis, year: string, asOf: string): FarmPerformance {
  const { births, services, offspring } = analysis.observations;
  const matches = (date: string, period: string) => Boolean(date) && date <= asOf && (!period || date.startsWith(period));
  const aggregate = (period: string): FarmPerformanceRow => {
    const calvings = births.filter(b => matches(b.date, period));
    const intervals = calvings.flatMap(b => b.days !== null && b.days > 0 ? [b.days] : []);
    const checks = services.filter(s => s.conceived !== null && matches(s.checkDate, period));
    const conceived = checks.filter(s => s.conceived).length;
    const sold = offspring.filter(c => !c.saleConflict && matches(c.saleDate, period));
    const prices = sold.flatMap(c => c.price !== null ? [c.price] : []);
    const shipped = offspring.filter(c => !c.saleConflict && c.shippingAge !== null && matches(c.shippingDate, period));
    return {
      period, calvingCount: calvings.length, intervalCount: intervals.length, averageInterval: analysisMean(intervals),
      serviceCount: services.filter(s => matches(s.date, period)).length,
      checkedCount: checks.length, conceivedCount: conceived, pregnancyRate: checks.length ? conceived / checks.length * 100 : null,
      soldCount: sold.length, priceCount: prices.length, saleTotal: prices.length ? prices.reduce((sum, v) => sum + v, 0) : null,
      averagePrice: analysisMean(prices), shippingCount: shipped.length,
      averageShippingAge: analysisMean(shipped.map(c => c.shippingAge!)), unmatchedCalvings: calvings.filter(c => !c.matchedMother).length,
    };
  };
  const years = [...new Set([
    ...births.map(b => b.date), ...services.flatMap(s => [s.date, s.checkDate]),
    ...offspring.flatMap(c => [c.shippingDate, c.saleDate]),
  ].filter(Boolean).map(d => d.slice(0, 4)))].sort().reverse();
  const periodKeys = year ? Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).filter(p => p <= asOf.slice(0, 7)) : [...years].reverse();
  const total = aggregate(year);
  return {
    total, periods: periodKeys.map(aggregate), years,
    undatedPriceCount: offspring.filter(c => !c.saleConflict && c.price !== null && !c.saleDate).length,
    missingSalePriceCount: total.soldCount - total.priceCount,
  };
}
