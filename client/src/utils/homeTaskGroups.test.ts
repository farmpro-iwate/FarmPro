import { describe, expect, it } from 'vitest';
import { groupHomeTasks, homeTaskGroup, type TimedHomeTask } from './homeTaskGroups';

const today = '2026-10-05';

describe('home task timing groups', () => {
  it.each(['今日', '期限超過', '要対応'])('keeps %s items in the actionable section', (status) => {
    expect(homeTaskGroup({ status }, today)).toBe('today');
  });

  it('groups scheduled treatment by its due date without changing its progress', () => {
    expect(homeTaskGroup({ status: '注意', plannedDate: '2026-10-04' }, today)).toBe('today');
    expect(homeTaskGroup({ status: '注意', plannedDate: today }, today)).toBe('today');
    expect(homeTaskGroup({ status: '注意', plannedDate: '2026-10-06' }, today)).toBe('upcoming');
    expect(homeTaskGroup({ status: '注意' }, today)).toBe('ongoing');
  });

  it('keeps explicit recheck warnings actionable even with a future date', () => {
    expect(homeTaskGroup({ status: '要対応', plannedDate: '2026-10-10' }, today)).toBe('today');
  });

  it('does not mistake a future market date for the due date of current preparation', () => {
    expect(homeTaskGroup({ status: '市場まで20日', plannedDate: '2026-10-25', dateRole: 'reference' }, today)).toBe('ongoing');
    expect(homeTaskGroup({ status: '今日', plannedDate: today, dateRole: 'reference' }, today)).toBe('today');
    expect(homeTaskGroup({ status: '要対応', plannedDate: '2026-10-04', dateRole: 'reference' }, today)).toBe('today');
  });

  it.each(['', 'invalid', '2026-02-30', '2026-13-01', '2026-1-05'])('keeps undated or invalid dates visible: %s', (plannedDate) => {
    expect(homeTaskGroup({ status: '注意', plannedDate }, today)).toBe('ongoing');
  });

  it('handles leap dates and year boundaries', () => {
    expect(homeTaskGroup({ status: '近日中', plannedDate: '2028-02-29' }, '2028-02-28')).toBe('upcoming');
    expect(homeTaskGroup({ status: '注意', plannedDate: '2026-12-31' }, '2027-01-01')).toBe('today');
    expect(homeTaskGroup({ status: '近日中', plannedDate: '2027-01-01' }, '2026-12-31')).toBe('upcoming');
  });

  it('sorts copies across categories and retains each original item exactly once', () => {
    const tasks = Object.freeze([
      Object.freeze({ id: 'treatment', status: '注意', plannedDate: '2026-10-07' }),
      Object.freeze({ id: 'breeding', status: '近日中', plannedDate: '2026-10-06' }),
      Object.freeze({ id: 'today', status: '今日', plannedDate: today }),
      Object.freeze({ id: 'overdue', status: '期限超過', plannedDate: '2026-10-04' }),
      Object.freeze({ id: 'withdrawal', status: '注意' }),
      Object.freeze({ id: 'undated-recheck', status: '要対応' }),
    ] as (TimedHomeTask & { id: string })[]);
    const snapshot = JSON.stringify(tasks);
    const groups = groupHomeTasks(tasks, today);
    expect(groups.today.map((item) => item.id)).toEqual(['overdue', 'today', 'undated-recheck']);
    expect(groups.upcoming.map((item) => item.id)).toEqual(['breeding', 'treatment']);
    expect(groups.ongoing.map((item) => item.id)).toEqual(['withdrawal']);
    const all = [...groups.today, ...groups.upcoming, ...groups.ongoing];
    expect(all).toHaveLength(tasks.length);
    expect(new Set(all.map((item) => item.id)).size).toBe(tasks.length);
    tasks.forEach((task) => expect(all.find((item) => item.id === task.id)).toBe(task));
    expect(JSON.stringify(tasks)).toBe(snapshot);
  });

  it('does not discard a distant treatment follow-up that is already displayed', () => {
    const task = { id: 'follow-up', status: '注意', plannedDate: '2026-11-05' };
    expect(groupHomeTasks([task], today).upcoming).toEqual([task]);
  });
});
