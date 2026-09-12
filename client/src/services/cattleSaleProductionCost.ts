import type { Cattle } from '../types/cattle';
import { getAllRecords } from '../storage/repository';
import { getAnimalExpenseTotals } from './expensesApi';
import { getAnimalFeedCostTotal } from './feedInventoryApi';
import { getBreedingCattleUnallocatedAcquisitionCost } from './breedingCattleUnallocatedAcquisitionCost';

export async function getCattleSaleProductionCost(cattleId: string | number, earTag = '') {
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

  return Math.round(
    feedCost +
    expenseTotals.nonFeedTotal +
    (unallocatedAcquisitionCost?.remainingAmount ?? 0),
  );
}
