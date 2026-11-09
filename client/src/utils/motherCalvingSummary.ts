import { analysisDate, analysisMean, type MaternalAnalysis } from './maternalAnalysis';

export type CalvingPeriodSummary = {
  calvingCount: number;
  intervalCount: number;
  averageInterval: number | null;
  latestCalvingDate: string;
};

/** Filter completed calvings, keeping intervals already derived from the full history. */
export function buildMotherCalvingSummaries(analysis: MaternalAnalysis, asOf: string, year = ''): {
  byMother: Map<string, CalvingPeriodSummary>;
  total: CalvingPeriodSummary;
} {
  const cutoff = analysisDate(asOf);
  const byMother = new Map<string, CalvingPeriodSummary>();
  const allIntervals: number[] = [];
  let totalCalvings = 0;
  let latestCalvingDate = '';

  for (const mother of analysis.mothers) {
    const intervals: number[] = [];
    let calvingCount = 0;
    let latest = '';
    for (const calving of mother.calvings) {
      const date = analysisDate(calving.date);
      if (!cutoff || !date || date > cutoff || year && !date.startsWith(`${year}-`)) continue;
      calvingCount++;
      if (date > latest) latest = date;
      // Recomputing after filtering would lose prior-year predecessors and
      // the interval supplied by the first imported offspring-history entry.
      if (calving.days !== null && Number.isFinite(calving.days) && calving.days > 0) intervals.push(calving.days);
    }
    byMother.set(mother.key, {
      calvingCount,
      intervalCount: intervals.length,
      averageInterval: analysisMean(intervals),
      latestCalvingDate: latest,
    });
    totalCalvings += calvingCount;
    allIntervals.push(...intervals);
    if (latest > latestCalvingDate) latestCalvingDate = latest;
  }

  return {
    byMother,
    total: {
      calvingCount: totalCalvings,
      intervalCount: allIntervals.length,
      averageInterval: analysisMean(allIntervals),
      latestCalvingDate,
    },
  };
}
