export type HomeTaskGroup = 'today' | 'upcoming' | 'ongoing';

export type TimedHomeTask = {
  status: string;
  plannedDate?: string;
  // A market date describes a preparation task; it is not the task's due date.
  dateRole?: 'due' | 'reference';
};

function validDate(value?: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : '';
}

export function homeTaskGroup(task: TimedHomeTask, today: string): HomeTaskGroup {
  if (['今日', '期限超過', '要対応'].includes(task.status)) return 'today';
  if (task.dateRole === 'reference') return 'ongoing';
  const date = validDate(task.plannedDate);
  if (date) return date <= today ? 'today' : 'upcoming';
  return 'ongoing';
}

export function groupHomeTasks<T extends TimedHomeTask>(tasks: readonly T[], today: string): Record<HomeTaskGroup, T[]> {
  const groups: Record<HomeTaskGroup, T[]> = { today: [], upcoming: [], ongoing: [] };
  tasks.forEach((task) => groups[homeTaskGroup(task, today)].push(task));
  // Sort copies only. Do not mutate, filter, or save any source records.
  for (const key of ['today', 'upcoming'] as const) {
    groups[key].sort((a, b) => {
      const aDate = validDate(a.plannedDate);
      const bDate = validDate(b.plannedDate);
      if (!aDate && bDate) return 1;
      if (aDate && !bDate) return -1;
      return aDate.localeCompare(bDate);
    });
  }
  return groups;
}
