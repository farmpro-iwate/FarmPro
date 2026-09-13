import { getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import {
  getCalfProductionCost,
  getCalfProductionCostBreakdown,
  type CalfProductionCostBreakdown,
} from './calfProductionCost';
import {
  getCattleSaleProductionCost,
  getCattleSaleProductionCostBreakdown,
  type CattleSaleProductionCostBreakdown,
} from './cattleSaleProductionCost';
import { recordToInput, updateSale, type SaleRecord } from './salesApi';

export type SaleProductionCostBreakdown = (CattleSaleProductionCostBreakdown | CalfProductionCostBreakdown) & {
  adjustment?: number;
};

export type SaleRecordWithCostSnapshot = SaleRecord & {
  productionCostSnapshot?: number;
  profitSnapshot?: number;
  costSnapshotAt?: string;
  productionCostBreakdownSnapshot?: SaleProductionCostBreakdown;
};

export type SaleCostSnapshot = {
  productionCost: number;
  profit: number;
  breakdown?: SaleProductionCostBreakdown;
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

function reconcileCalfBreakdown(
  record: SaleRecordWithCostSnapshot,
  breakdown: SaleProductionCostBreakdown | undefined,
  productionCost: number,
): SaleProductionCostBreakdown | undefined {
  if (!breakdown || record.targetType !== '子牛') return breakdown;

  const calfBreakdown = breakdown as CalfProductionCostBreakdown & { adjustment?: number };
  const baseTotal = Math.round(
    Number(calfBreakdown.acquisition || 0) +
    Number(calfBreakdown.feed || 0) +
    Number(calfBreakdown.medical || 0) +
    Number(calfBreakdown.breeding || 0) +
    Number(calfBreakdown.other || 0) +
    Number(calfBreakdown.farmCommon || 0),
  );
  const adjustment = Math.round(productionCost - baseTotal);

  return {
    ...calfBreakdown,
    adjustment,
    total: Math.round(productionCost),
  };
}

function breakdownNeedsReconciliation(
  before: SaleProductionCostBreakdown | undefined,
  after: SaleProductionCostBreakdown | undefined,
) {
  if (!before || !after) return false;
  return Number(before.total || 0) !== Number(after.total || 0) ||
    Number((before as SaleProductionCostBreakdown & { adjustment?: number }).adjustment || 0) !==
      Number((after as SaleProductionCostBreakdown & { adjustment?: number }).adjustment || 0);
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

  if (record.targetType === '子牛') {
    const rawBreakdown = await getCalfProductionCostBreakdown(animalId, record.targetNumber);
    const breakdown = reconcileCalfBreakdown(record, rawBreakdown, rawBreakdown.total);
    return {
      productionCost: rawBreakdown.total,
      profit: Math.round(salePrice - rawBreakdown.total),
      breakdown,
    };
  }

  const productionCost = await getCattleSaleProductionCost(animalId, record.targetNumber);
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
    if ((typed.targetType === '成牛' || typed.targetType === '子牛') && !existingSnapshot.breakdown) {
      const current = await getRecordById<SaleRecordWithCostSnapshot>('sales', record.id);
      if (!current) return existingSnapshot;
      const calculated = await calculateCurrentCost(current);
      if (!calculated) return existingSnapshot;
      const breakdown = reconcileCalfBreakdown(current, calculated.breakdown, existingSnapshot.productionCost);
      await persistSnapshot(current, {
        productionCost: existingSnapshot.productionCost,
        profit: existingSnapshot.profit,
        breakdown,
      }, true);
      return {
        ...existingSnapshot,
        breakdown,
      };
    }

    if (typed.targetType === '子牛' && existingSnapshot.breakdown) {
      const reconciled = reconcileCalfBreakdown(typed, existingSnapshot.breakdown, existingSnapshot.productionCost);
      if (breakdownNeedsReconciliation(existingSnapshot.breakdown, reconciled)) {
        const current = await getRecordById<SaleRecordWithCostSnapshot>('sales', record.id);
        if (current) {
          await persistSnapshot(current, {
            productionCost: existingSnapshot.productionCost,
            profit: existingSnapshot.profit,
            breakdown: reconciled,
          }, true);
        }
      }
      return {
        ...existingSnapshot,
        breakdown: reconciled,
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
  if (!breakdown) {
    if (current.targetType === '成牛' && current.cattleId) {
      breakdown = await getCattleSaleProductionCostBreakdown(current.cattleId, current.targetNumber);
    } else if (current.targetType === '子牛' && current.calfId) {
      breakdown = await getCalfProductionCostBreakdown(current.calfId, current.targetNumber);
    }
  }
  breakdown = reconcileCalfBreakdown(current, breakdown, existingSnapshot.productionCost);

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
