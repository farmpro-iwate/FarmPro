import { getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import { getCalfProductionCost } from './calfProductionCost';
import {
  getCattleSaleProductionCost,
  getCattleSaleProductionCostBreakdown,
  type CattleSaleProductionCostBreakdown,
} from './cattleSaleProductionCost';
import { recordToInput, updateSale, type SaleRecord } from './salesApi';

export type SaleRecordWithCostSnapshot = SaleRecord & {
  productionCostSnapshot?: number;
  profitSnapshot?: number;
  costSnapshotAt?: string;
  productionCostBreakdownSnapshot?: CattleSaleProductionCostBreakdown;
};

export type SaleCostSnapshot = {
  productionCost: number;
  profit: number;
  breakdown?: CattleSaleProductionCostBreakdown;
};

function readSnapshot(record: SaleRecordWithCostSnapshot): SaleCostSnapshot | null {
  const productionCost = Number(record.productionCostSnapshot);
  const profit = Number(record.profitSnapshot);
  if (!Number.isFinite(productionCost) || !Number.isFinite(profit)) return null;
  return {
    productionCost,
    profit,
    breakdown: record.productionCostBreakdownSnapshot,
  };
}

async function calculateCurrentCost(record: SaleRecordWithCostSnapshot): Promise<SaleCostSnapshot | null> {
  if (record.status !== '販売済み') return null;

  const animalId = record.targetType === '子牛' ? record.calfId : record.targetType === '成牛' ? record.cattleId : '';
  if (!animalId) return null;

  const salePrice = Number(record.salePrice);
  if (!Number.isFinite(salePrice)) return null;

  if (record.targetType === '成牛') {
    const breakdown = await getCattleSaleProductionCostBreakdown(animalId, record.targetNumber);
    return {
      productionCost: breakdown.total,
      profit: Math.round(salePrice - breakdown.total),
      breakdown,
    };
  }

  const productionCost = record.targetType === '子牛'
    ? await getCalfProductionCost(animalId, record.targetNumber)
    : await getCattleSaleProductionCost(animalId, record.targetNumber);

  return {
    productionCost: Math.round(productionCost),
    profit: Math.round(salePrice - productionCost),
  };
}

async function persistSnapshot(
  current: SaleRecordWithCostSnapshot,
  snapshot: SaleCostSnapshot,
  keepSnapshotDate: boolean,
) {
  const saved = await saveRecordPreservingTimestamps<SaleRecordWithCostSnapshot>('sales', {
    ...current,
    productionCostSnapshot: snapshot.productionCost,
    profitSnapshot: snapshot.profit,
    productionCostBreakdownSnapshot: snapshot.breakdown ?? current.productionCostBreakdownSnapshot,
    costSnapshotAt: keepSnapshotDate && current.costSnapshotAt
      ? current.costSnapshotAt
      : new Date().toISOString(),
  });

  // updateSale keeps unknown fields from the existing record and performs the normal cloud sync.
  await updateSale(saved.id, recordToInput(saved));
}

export async function getOrCreateSaleCostSnapshot(record: SaleRecord): Promise<SaleCostSnapshot | null> {
  const typed = record as SaleRecordWithCostSnapshot;
  const existingSnapshot = readSnapshot(typed);
  if (existingSnapshot) {
    if (typed.targetType === '成牛' && !existingSnapshot.breakdown) {
      const current = await getRecordById<SaleRecordWithCostSnapshot>('sales', record.id);
      if (!current) return existingSnapshot;
      const calculated = await calculateCurrentCost(current);
      if (!calculated) return existingSnapshot;
      await persistSnapshot(current, {
        productionCost: existingSnapshot.productionCost,
        profit: existingSnapshot.profit,
        breakdown: calculated.breakdown,
      }, true);
      return {
        ...existingSnapshot,
        breakdown: calculated.breakdown,
      };
    }
    return existingSnapshot;
  }

  const calculated = await calculateCurrentCost(typed);
  if (!calculated) return null;

  const current = await getRecordById<SaleRecordWithCostSnapshot>('sales', record.id);
  if (!current) return calculated;

  await persistSnapshot(current, calculated, false);
  return calculated;
}

export async function refreshSaleProfitFromFixedCost(saleId: string): Promise<SaleCostSnapshot | null> {
  const current = await getRecordById<SaleRecordWithCostSnapshot>('sales', saleId);
  if (!current || current.status !== '販売済み') return null;

  const salePrice = Number(current.salePrice);
  if (!Number.isFinite(salePrice)) return null;

  const existingSnapshot = readSnapshot(current);
  if (!existingSnapshot) {
    return getOrCreateSaleCostSnapshot(current);
  }

  let breakdown = existingSnapshot.breakdown;
  if (current.targetType === '成牛' && !breakdown && current.cattleId) {
    breakdown = await getCattleSaleProductionCostBreakdown(current.cattleId, current.targetNumber);
  }

  const refreshed = {
    productionCost: existingSnapshot.productionCost,
    profit: Math.round(salePrice - existingSnapshot.productionCost),
    breakdown,
  };

  await persistSnapshot(current, refreshed, true);
  return refreshed;
}

export async function clearSaleCostSnapshot(saleId: string): Promise<void> {
  const current = await getRecordById<SaleRecordWithCostSnapshot>('sales', saleId);
  if (!current) return;

  const saved = await saveRecordPreservingTimestamps<SaleRecordWithCostSnapshot>('sales', {
    ...current,
    productionCostSnapshot: undefined,
    profitSnapshot: undefined,
    productionCostBreakdownSnapshot: undefined,
    costSnapshotAt: undefined,
  });

  await updateSale(saved.id, recordToInput(saved));
}
