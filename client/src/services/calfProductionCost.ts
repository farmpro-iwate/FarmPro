import type { Calf } from '../types/calf';
import { getAllRecords } from '../storage/repository';
import { getAnimalFeedCostTotal } from './feedInventoryApi';
import { getAnimalExpenseTotals } from './expensesApi';
import { getCalfFarmExpenseAllocation } from './farmExpenseAllocation';
import { getBreedingCattleAcquisitionAllocationForCalf } from './breedingCattleAcquisitionAllocation';

export async function getCalfProductionCost(calfId: string | number, earTag = '') {
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
  return Math.round(feedCost + expenses.nonFeedTotal + farmExpense + acquisitionAllocation.amount);
}
