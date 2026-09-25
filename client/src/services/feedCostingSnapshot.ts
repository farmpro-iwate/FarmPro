import {
  allocateByWeight,
  calculateMovingAverageCost,
  defaultCalfAgeWeightSettings,
  feedCostQuantity,
  type FeedAllocationMethod,
  type FeedAllocationTargetType,
  type FeedCostAllocationItem,
  type FeedCostingSnapshot,
} from './feedCostAllocation';
import { getFeedAllocationTargets, type FeedAllocationTargetAnimal } from './feedAllocationTargets';
import { getFeedInventoryList, type FeedInventoryInput } from './feedInventoryApi';

function allocationMethodForTarget(targetType: FeedAllocationTargetType): FeedAllocationMethod {
  if (targetType === 'farm') return 'none';
  if (targetType === 'calfGroup') return 'calfAgeWeighted';
  if (targetType === 'growingCattleGroup' || targetType === 'breedingCattleGroup') return 'equal';
  return 'individual';
}

export async function buildFeedCostingSnapshot(
  input: FeedInventoryInput,
  targetType: FeedAllocationTargetType,
  individualTarget?: FeedAllocationTargetAnimal,
): Promise<FeedCostingSnapshot> {
  if (input.transactionType !== '出庫') {
    throw new Error('原価按分は出庫記録にだけ作成できます。');
  }

  const normalizedUsage = feedCostQuantity({
    quantity: input.quantity,
    unit: input.unit,
    bagWeightKg: input.bagWeightKg,
    totalWeightKg: input.totalWeightKg,
  });

  if (normalizedUsage.quantity <= 0) {
    throw new Error('出庫量を計算できません。');
  }

  const rows = await getFeedInventoryList();
  const movingAverage = calculateMovingAverageCost(
    rows,
    input.feedName,
    normalizedUsage.costUnit,
    input.transactionDate,
  );

  // FarmPro allows outbound records even when stock is zero or insufficient.
  // When a moving-average cost is available, apply it to the full outbound quantity.
  // If no cost can be calculated, keep the outbound record with zero cost so field work
  // is not blocked; a later stock correction can be handled separately.
  const usedQuantity = normalizedUsage.quantity;
  const averageUnitCost = movingAverage.averageUnitCost > 0 ? movingAverage.averageUnitCost : 0;
  const usedCost = usedQuantity * averageUnitCost;
  const allocationMethod = allocationMethodForTarget(targetType);

  let allocations: FeedCostAllocationItem[] = [];

  if (targetType !== 'farm') {
    const targets = targetType === 'individual' && individualTarget
      ? [{ ...individualTarget, weight: 1 }]
      : await getFeedAllocationTargets(targetType, input.transactionDate);
    if (targets.length === 0) {
      throw new Error(targetType === 'individual'
        ? '個体を選択してください。'
        : 'この使用先に按分できる牛がいません。');
    }

    allocations = allocateByWeight(targets, usedQuantity, usedCost).map((item) => ({
      animalType: item.animalType,
      animalId: item.animalId,
      earTag: item.earTag,
      animalName: item.animalName,
      ageDays: item.ageDays,
      weight: item.weight,
      allocatedQuantity: item.allocatedQuantity,
      allocatedCost: item.allocatedCost,
    }));
  }

  return {
    targetType,
    allocationMethod,
    costUnit: movingAverage.costUnit,
    averageUnitCost,
    usedQuantity,
    usedCost,
    allocations,
    ageWeightSettings: targetType === 'calfGroup' ? { ...defaultCalfAgeWeightSettings } : undefined,
    calculatedAt: new Date().toISOString(),
  };
}
