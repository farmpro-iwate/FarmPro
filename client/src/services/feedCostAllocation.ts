export type FeedAllocationTargetType =
  | 'farm'
  | 'calfGroup'
  | 'growingCattleGroup'
  | 'breedingCattleGroup'
  | 'individual';

export type FeedAllocationMethod =
  | 'none'
  | 'equal'
  | 'calfAgeWeighted'
  | 'individual';

export type FeedAllocationAnimalType = 'calf' | 'cattle';

export type FeedCostAllocationItem = {
  animalType: FeedAllocationAnimalType;
  animalId: string;
  earTag: string;
  animalName: string;
  weight: number;
  allocatedQuantity: number;
  allocatedCost: number;
};

export type FeedCostingSnapshot = {
  targetType: FeedAllocationTargetType;
  allocationMethod: FeedAllocationMethod;
  costUnit: string;
  averageUnitCost: number;
  usedQuantity: number;
  usedCost: number;
  allocations: FeedCostAllocationItem[];
  calculatedAt: string;
};

export type FeedCostSourceRecord = {
  transactionDate: string;
  feedName: string;
  transactionType: string;
  quantity: string;
  unit: string;
  bagWeightKg: string;
  totalWeightKg: string;
  unitPrice: string;
  totalPrice: string;
  createdAt?: string;
  costing?: FeedCostingSnapshot;
};

export type FeedAverageCost = {
  costUnit: string;
  quantityOnHand: number;
  inventoryValue: number;
  averageUnitCost: number;
};

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function feedCostQuantity(record: Pick<FeedCostSourceRecord, 'quantity' | 'unit' | 'bagWeightKg' | 'totalWeightKg'>) {
  if (record.unit === '袋') {
    const totalWeight = numberValue(record.totalWeightKg);
    if (totalWeight > 0) {
      return { quantity: totalWeight, costUnit: 'kg' };
    }

    const bags = numberValue(record.quantity);
    const bagWeight = numberValue(record.bagWeightKg);
    return { quantity: bags * bagWeight, costUnit: 'kg' };
  }

  return {
    quantity: numberValue(record.quantity),
    costUnit: record.unit || 'その他',
  };
}

function recordPurchaseValue(record: FeedCostSourceRecord, normalizedQuantity: number) {
  const totalPrice = numberValue(record.totalPrice);
  if (totalPrice > 0) return totalPrice;

  const unitPrice = numberValue(record.unitPrice);
  return unitPrice > 0 && normalizedQuantity > 0
    ? unitPrice * normalizedQuantity
    : 0;
}

function compareRecords(a: FeedCostSourceRecord, b: FeedCostSourceRecord) {
  const dateCompare = String(a.transactionDate || '').localeCompare(String(b.transactionDate || ''));
  if (dateCompare !== 0) return dateCompare;
  return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

export function calculateMovingAverageCost(
  rows: FeedCostSourceRecord[],
  feedName: string,
  costUnit: string,
  asOfDate?: string,
): FeedAverageCost {
  let quantityOnHand = 0;
  let inventoryValue = 0;

  const targetName = feedName.trim();
  const targetRows = rows
    .filter((row) => row.feedName.trim() === targetName)
    .filter((row) => !asOfDate || !row.transactionDate || row.transactionDate <= asOfDate)
    .sort(compareRecords);

  for (const row of targetRows) {
    const normalized = feedCostQuantity(row);
    if (normalized.costUnit !== costUnit || normalized.quantity <= 0) continue;

    if (row.transactionType === '入庫') {
      const purchaseValue = recordPurchaseValue(row, normalized.quantity);
      quantityOnHand += normalized.quantity;
      inventoryValue += purchaseValue;
      continue;
    }

    if (row.transactionType === '出庫') {
      const averageUnitCost = quantityOnHand > 0 ? inventoryValue / quantityOnHand : 0;
      const usedQuantity = Math.min(normalized.quantity, Math.max(quantityOnHand, 0));
      const usedCost = row.costing?.usedCost && row.costing.usedCost > 0
        ? row.costing.usedCost
        : usedQuantity * averageUnitCost;

      quantityOnHand = Math.max(0, quantityOnHand - usedQuantity);
      inventoryValue = Math.max(0, inventoryValue - usedCost);
      continue;
    }

    if (row.transactionType === '調整') {
      const averageUnitCost = quantityOnHand > 0 ? inventoryValue / quantityOnHand : 0;
      quantityOnHand += normalized.quantity;
      inventoryValue += normalized.quantity * averageUnitCost;
    }
  }

  const averageUnitCost = quantityOnHand > 0 ? inventoryValue / quantityOnHand : 0;

  return {
    costUnit,
    quantityOnHand,
    inventoryValue,
    averageUnitCost,
  };
}

export function calfAgeWeight(ageDays: number) {
  if (ageDays <= 30) return 1;
  if (ageDays <= 60) return 2;
  if (ageDays <= 90) return 3;
  return 4;
}

export function allocateByWeight<T extends { weight: number }>(
  items: T[],
  totalQuantity: number,
  totalCost: number,
) {
  const totalWeight = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (totalWeight <= 0) {
    return items.map((item) => ({ ...item, allocatedQuantity: 0, allocatedCost: 0 }));
  }

  let quantityAssigned = 0;
  let costAssigned = 0;

  return items.map((item, index) => {
    const isLast = index === items.length - 1;
    const ratio = Math.max(0, item.weight) / totalWeight;
    const allocatedQuantity = isLast
      ? totalQuantity - quantityAssigned
      : totalQuantity * ratio;
    const allocatedCost = isLast
      ? totalCost - costAssigned
      : totalCost * ratio;

    quantityAssigned += allocatedQuantity;
    costAssigned += allocatedCost;

    return {
      ...item,
      allocatedQuantity,
      allocatedCost,
    };
  });
}
