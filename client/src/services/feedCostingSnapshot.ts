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
import { getFeedAllocationTargets } from './feedAllocationTargets';
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

  if (movingAverage.quantityOnHand <= 0) {
    throw new Error(`${input.feedName}の原価計算に使える在庫がありません。`);
  }

  if (normalizedUsage.quantity > movingAverage.quantityOnHand) {
    throw new Error(
      `${input.feedName}の出庫量が原価計算上の在庫量を超えています。` +
      ` 在庫：${movingAverage.quantityOnHand.toLocaleString('ja-JP')}${movingAverage.costUnit}`,
    );
  }

  if (movingAverage.averageUnitCost <= 0) {
    throw new Error(`${input.feedName}の仕入価格が未登録のため、原価を計算できません。`);
  }

  const usedQuantity = normalizedUsage.quantity;
  const usedCost = usedQuantity * movingAverage.averageUnitCost;
  const allocationMethod = allocationMethodForTarget(targetType);

  let allocations: FeedCostAllocationItem[] = [];

  if (targetType !== 'farm') {
    const targets = await getFeedAllocationTargets(targetType, input.transactionDate);
    if (targets.length === 0) {
      throw new Error('この使用先に按分できる牛がいません。');
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
    averageUnitCost: movingAverage.averageUnitCost,
    usedQuantity,
    usedCost,
    allocations,
    ageWeightSettings: targetType === 'calfGroup' ? { ...defaultCalfAgeWeightSettings } : undefined,
    calculatedAt: new Date().toISOString(),
  };
}
