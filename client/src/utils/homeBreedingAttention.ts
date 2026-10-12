import { resolveCattleBreedingPlans, type CattlePlanSnapshot, type PlanAnimal } from './cattleBreedingPlans';
import { homeBreedingPlansInWindow } from './homeTaskWindow';

/** One source for the home cattle count and its breeding alert destination.
 * Only the current cycle and the home display window are included. */
export function homeCattleBreedingPlans(animals: readonly PlanAnimal[], snapshot: CattlePlanSnapshot, today: string) {
  return animals.flatMap((animal) => {
    const summary = resolveCattleBreedingPlans(animal, snapshot, today);
    if (summary.isSold) return [];
    return [{ animal, plans: homeBreedingPlansInWindow(summary.plans, today), issues: summary.issues }];
  });
}

export function homeBreedingAttentionCount(groups: ReturnType<typeof homeCattleBreedingPlans>): number {
  return new Set(groups.filter((group) => group.plans.length > 0)
    .map(({ animal }) => String(animal.earTag || animal.id))).size;
}
