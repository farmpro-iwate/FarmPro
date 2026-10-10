import { describe, expect, it } from 'vitest';
import { homeBreedingPlansInWindow, homeTaskStatus } from './homeTaskWindow';
import { projectBreedingPlans } from './breedingPlans';

describe('home display windows', () => {
  it.each([
    ['2026-10-02', null], ['2026-10-03', '期限超過'],
    ['2026-10-09', '期限超過'], ['2026-10-10', '今日'],
    ['2026-10-17', '近日中'], ['2026-10-18', null],
  ])('judges calendar day %s at local day ten', (date, status) => {
    expect(homeTaskStatus(date, '2026-10-10')).toBe(status);
  });
  it('labels overdue heat guidance separately and rejects invalid days', () => {
    expect(homeTaskStatus('2026-10-03', '2026-10-10', '発情予定日')).toBe('発情未確認');
    expect(homeTaskStatus('2026-10-03', '2026-10-10', '次回発情確認')).toBe('発情未確認');
    expect(homeTaskStatus('2026-02-30', '2026-10-10')).toBeNull();
  });
  it.each([
    ['2026-10-12', false], ['2026-10-13', true], ['2026-10-20', true],
    ['2026-10-27', true], ['2026-10-28', false],
  ])('shows feed review around October 20 only (%s)', (today, visible) => {
    const projection = projectBreedingPlans({
      id: 'cow-cycle', inseminationDate: '2026-03-09', pregnancyResult: '受胎', expectedCalvingDate: '2026-12-19',
    }, { today });
    const before = JSON.stringify(projection);
    const shown = homeBreedingPlansInWindow(projection.plans, today);
    const feed = shown.find((item) => item.kind === 'feed-review');
    expect(Boolean(feed)).toBe(visible);
    if (feed) {
      expect(feed.date).toBe('2026-10-20');
      expect(feed.relatedDate).toBe('2026-12-19');
    }
    expect(JSON.stringify(projection)).toBe(before);
  });
  it('retains overdue history in the projection and keeps undated guidance', () => {
    const projection = projectBreedingPlans({
      id: 'cycle', inseminationDate: '2026-08-01', pregnancyResult: '未鑑定',
    }, { today: '2026-10-10' });
    expect(projection.plans).toHaveLength(2);
    expect(homeBreedingPlansInWindow(projection.plans, '2026-10-10')).toEqual([]);
    const choice = projectBreedingPlans({ id: 'heat', heatDate: '2026-10-10' }, { today: '2026-10-10' });
    expect(homeBreedingPlansInWindow(choice.plans, '2026-10-10')).toEqual(choice.plans);
  });
});
