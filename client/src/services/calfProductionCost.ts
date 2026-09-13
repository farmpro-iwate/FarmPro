import type { Calf } from '../types/calf';
import { getAllRecords } from '../storage/repository';
import { getAnimalFeedCostTotal } from './feedInventoryApi';
import { getAnimalExpenseTotals } from './expensesApi';
import { getCalfFarmExpenseAllocation } from './farmExpenseAllocation';
import { getBreedingCattleAcquisitionAllocationForCalf } from './breedingCattleAcquisitionAllocation';

export type CalfProductionCostBreakdown = {
  acquisition: number;
  feed: number;
  medical: number;
  breeding: number;
  other: number;
  farmCommon: number;
  total: number;
};

export async function getCalfProductionCostBreakdown(
  calfId: string | number,
  earTag = '',
): Promise<CalfProductionCostBreakdown> {
  const id = String(calfId);
  const calves = await getAllRecords<Calf>('calves');
  const calf = calves.find((item) => String(item.id) === id);
  const [feedCost, expenses, farmExpense] = await Promise.all([
    getAnimalFeedCostTotal('calf', id),
    getAnimalExpenseTotals('calf', id, earTag),
    getCalfFarmExpenseAllocation(id).catch(() => 0),
  ]);
  const acquisitionAllocation = calf
    ? await getBreedingCattleAcquisitionAllocationForCalf(calf).catch(() => ({ amount: 0, allocationParity: 7 }))
    : { amount: 0, allocationParity: 7 };

  const breakdown = {
    acquisition: Math.round(acquisitionAllocation.amount),
    feed: Math.round(feedCost),
    medical: Math.round(expenses.medical),
    breeding: Math.round(expenses.breeding),
    other: Math.round(expenses.other),
    farmCommon: Math.round(farmExpense),
  };

  return {
    ...breakdown,
    total: Math.round(
      breakdown.acquisition +
      breakdown.feed +
      breakdown.medical +
      breakdown.breeding +
      breakdown.other +
      breakdown.farmCommon,
    ),
  };
}

export async function getCalfProductionCost(calfId: string | number, earTag = '') {
  const breakdown = await getCalfProductionCostBreakdown(calfId, earTag);
  return breakdown.total;
}
