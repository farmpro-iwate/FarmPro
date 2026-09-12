import type { Cattle } from '../types/cattle';
import type { Calf } from '../types/calf';
import { getRecordById } from '../storage/repository';
import { getAnimalFeedCostTotal } from './feedInventoryApi';
import { getAnimalExpenseTotals } from './expensesApi';
import { getCalfFarmExpenseAllocation } from './farmExpenseAllocation';
import { getBreedingCattleAcquisitionAllocationForCalf } from './breedingCattleAcquisitionAllocation';

export type CattleAcquisitionCostResult = {
  method: 'purchase' | 'retained' | 'none';
  amount: number;
  sourceCalfId?: number;
};

export async function getRetainedCalfProductionCost(sourceCalfId: number): Promise<number> {
  const calf = await getRecordById<Calf>('calves', sourceCalfId);
  if (!calf) return 0;

  const calfId = String(sourceCalfId);
  const earTag = String(calf.calfNumber || '');
  const [feedCost, expenseTotals, farmExpense, acquisitionAllocation] = await Promise.all([
    getAnimalFeedCostTotal('calf', calfId).catch(() => 0),
    getAnimalExpenseTotals('calf', calfId, earTag).catch(() => ({
      medical: 0,
      breeding: 0,
      other: 0,
      nonFeedTotal: 0,
    })),
    getCalfFarmExpenseAllocation(calfId).catch(() => 0),
    getBreedingCattleAcquisitionAllocationForCalf(calf).catch(() => ({
      amount: 0,
      allocationParity: 7,
    })),
  ]);

  return Math.round(
    feedCost +
    expenseTotals.nonFeedTotal +
    farmExpense +
    acquisitionAllocation.amount
  );
}

export async function getCattleAcquisitionCost(cattle: Pick<Cattle, 'sourceCalfId' | 'acquisitionMethod' | 'acquisitionPrice' | 'acquisitionCost'>): Promise<CattleAcquisitionCostResult> {
  if (cattle.acquisitionMethod === 'retained' || cattle.sourceCalfId) {
    if (typeof cattle.acquisitionCost === 'number' && Number.isFinite(cattle.acquisitionCost)) {
      return {
        method: 'retained',
        amount: Math.round(cattle.acquisitionCost),
        sourceCalfId: cattle.sourceCalfId,
      };
    }

    if (cattle.sourceCalfId) {
      return {
        method: 'retained',
        amount: await getRetainedCalfProductionCost(cattle.sourceCalfId),
        sourceCalfId: cattle.sourceCalfId,
      };
    }
  }

  if (
    cattle.acquisitionMethod === 'purchased-calf' ||
    cattle.acquisitionMethod === 'purchased-pregnant'
  ) {
    const price = Number(cattle.acquisitionPrice || 0);
    return {
      method: 'purchase',
      amount: Number.isFinite(price) ? Math.round(price) : 0,
    };
  }

  return { method: 'none', amount: 0 };
}
