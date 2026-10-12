import { describe, expect, it } from 'vitest';
import { homeCattleBreedingPlans, homeBreedingAttentionCount } from './homeBreedingAttention';
import type { CattlePlanSnapshot } from './cattleBreedingPlans';

const animal = { id: 'cow', earTag: '0254', name: '母牛' };
const today = '2026-10-12';

describe('shared home and breeding attention selection', () => {
  it.each([
    ['2026-10-04', 0], ['2026-10-05', 1], ['2026-10-12', 1],
    ['2026-10-19', 1], ['2026-10-20', 0],
  ])('uses the feed-review date window at %s', (reviewDate, count) => {
    const calving = new Date(`${reviewDate}T00:00:00Z`);
    calving.setUTCDate(calving.getUTCDate() + 60);
    const snapshot: CattlePlanSnapshot = {
      breedings: [{ id: 'pregnant', cowEarTag: animal.earTag, inseminationDate: '2026-02-01',
        pregnancyResult: '受胎', expectedCalvingDate: calving.toISOString().slice(0, 10) }],
      calvings: [], sales: [], cycleDays: 21, unavailable: [],
    };
    const original = JSON.stringify(snapshot);
    const groups = homeCattleBreedingPlans([animal], snapshot, today);
    expect(homeBreedingAttentionCount(groups)).toBe(count);
    if (count) expect(groups[0].plans.find((plan) => plan.kind === 'feed-review')?.date).toBe(reviewDate);
    expect(JSON.stringify(snapshot)).toBe(original);
  });

  it('counts one cow once even with two pending plans and excludes a sold cow', () => {
    const snapshot: CattlePlanSnapshot = {
      breedings: [{ id: 'ai', cowEarTag: animal.earTag, inseminationDate: '2026-09-01', pregnancyResult: '未鑑定', nextHeatExpectedDate: '2026-10-13', pregnancyCheckExpectedDate: '2026-10-14' }],
      calvings: [], sales: [], cycleDays: 21, unavailable: [],
    };
    const groups = homeCattleBreedingPlans([animal], snapshot, today);
    expect(groups[0].plans.length).toBeGreaterThan(1);
    expect(homeBreedingAttentionCount(groups)).toBe(1);
    expect(homeCattleBreedingPlans([animal], { ...snapshot, sales: [
      { id: 'sold', targetType: '成牛', status: '販売済み', targetNumber: animal.earTag },
    ] }, today)).toEqual([]);
  });
});
