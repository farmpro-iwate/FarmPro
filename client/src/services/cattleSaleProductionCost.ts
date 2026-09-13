import type { Cattle } from '../types/cattle';
import { getAllRecords } from '../storage/repository';
import { getAnimalExpenseTotals } from './expensesApi';
import { getAnimalFeedCostTotal } from './feedInventoryApi';
import { getBreedingCattleUnallocatedAcquisitionCost } from './breedingCattleUnallocatedAcquisitionCost';

export type CattleSaleProductionCostBreakdown = {
  acquisition: number;
  feed: number;
  medical: number;
  breeding: number;
  other: number;
  total: number;
};

export async function getCattleSaleProductionCostBreakdown(
  cattleId: string | number,
  earTag = '',
): Promise<CattleSaleProductionCostBreakdown> {
  const id = String(cattleId);
  const [cattleList, feedCost, expenseTotals] = await Promise.all([
    getAllRecords<Cattle>('cattle'),
    getAnimalFeedCostTotal('cattle', id),
    getAnimalExpenseTotals('cattle', id, earTag),
  ]);

  const cattle = cattleList.find((item) => String(item.id) === id);
  const unallocatedAcquisitionCost = cattle
    ? await getBreedingCattleUnallocatedAcquisitionCost(cattle).catch(() => null)
    : null;

  const breakdown = {
    acquisition: Math.round(unallocatedAcquisitionCost?.remainingAmount ?? 0),
    feed: Math.round(feedCost),
    medical: Math.round(expenseTotals.medical),
    breeding: Math.round(expenseTotals.breeding),
    other: Math.round(expenseTotals.other),
  };

  return {
    ...breakdown,
    total: Math.round(
      breakdown.acquisition +
      breakdown.feed +
      breakdown.medical +
      breakdown.breeding +
      breakdown.other,
    ),
  };
}

export async function getCattleSaleProductionCost(cattleId: string | number, earTag = '') {
  const breakdown = await getCattleSaleProductionCostBreakdown(cattleId, earTag);
  return breakdown.total;
}
