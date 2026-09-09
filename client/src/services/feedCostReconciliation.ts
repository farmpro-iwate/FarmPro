import {
  calculateMovingAverageCost,
  feedCostQuantity,
  type FeedCostingSnapshot,
} from './feedCostAllocation';
import {
  recordToInput,
  type FeedInventoryRecord,
  updateFeedInventory,
} from './feedInventoryApi';

function compareRows(a: FeedInventoryRecord, b: FeedInventoryRecord) {
  const dateCompare = String(a.transactionDate || '').localeCompare(String(b.transactionDate || ''));
  if (dateCompare !== 0) return dateCompare;
  return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

function recalculateCosting(costing: FeedCostingSnapshot, averageUnitCost: number) {
  const usedCost = costing.usedQuantity * averageUnitCost;
  return {
    ...costing,
    averageUnitCost,
    usedCost,
    allocations: costing.allocations.map((item) => ({
      ...item,
      allocatedCost: item.allocatedQuantity * averageUnitCost,
    })),
    actualIntake: costing.actualIntake
      ? {
          ...costing.actualIntake,
          averageUnitCost,
          totalCost: costing.actualIntake.totalQuantity * averageUnitCost,
          items: costing.actualIntake.items.map((item) => ({
            ...item,
            actualCost: item.actualQuantity * averageUnitCost,
          })),
        }
      : undefined,
    calculatedAt: new Date().toISOString(),
  };
}

export async function reconcileTaxAdjustedOutboundCosts(rows: FeedInventoryRecord[]) {
  const ordered = [...rows].sort(compareRows);
  const working: FeedInventoryRecord[] = [];
  const changed = new Map<string, FeedInventoryRecord>();

  for (const row of ordered) {
    if (row.transactionType !== '出庫' || !row.costing) {
      working.push(row);
      continue;
    }

    const normalized = feedCostQuantity(row);
    if (normalized.quantity <= 0) {
      working.push(row);
      continue;
    }

    const hasTaxAwarePurchaseBeforeOutflow = working.some((item) =>
      item.feedName.trim() === row.feedName.trim() &&
      item.transactionType === '入庫' &&
      Number(item.taxExcludedPrice || 0) > 0,
    );

    if (!hasTaxAwarePurchaseBeforeOutflow) {
      working.push(row);
      continue;
    }

    const movingAverage = calculateMovingAverageCost(
      working,
      row.feedName,
      normalized.costUnit,
      row.transactionDate,
    );

    if (movingAverage.averageUnitCost <= 0) {
      working.push(row);
      continue;
    }

    const expectedUsedCost = row.costing.usedQuantity * movingAverage.averageUnitCost;
    const currentAverage = Number(row.costing.averageUnitCost || 0);
    const currentUsedCost = Number(row.costing.usedCost || 0);
    const alreadyCorrect =
      Math.abs(currentAverage - movingAverage.averageUnitCost) < 0.005 &&
      Math.abs(currentUsedCost - expectedUsedCost) < 0.5;

    if (alreadyCorrect) {
      working.push(row);
      continue;
    }

    const costing = recalculateCosting(row.costing, movingAverage.averageUnitCost);
    const saved = await updateFeedInventory(row.id, {
      ...recordToInput(row),
      unitPrice: String(movingAverage.averageUnitCost),
      totalPrice: String(costing.usedCost),
      costing,
    });

    changed.set(saved.id, saved);
    working.push(saved);
  }

  return rows.map((row) => changed.get(row.id) || row);
}
