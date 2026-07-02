import dayjs from 'dayjs';

export function daysUntil(dateText: string) {
  if (!dateText) return 0;
  return dayjs(dateText).diff(dayjs(), 'day');
}

export function judgeSchedule(status: string, dueDate: string) {
  if (status === '完了') return '完了';
  if (!dueDate) return '未定';

  const remaining = daysUntil(dueDate);
  if (remaining < 0) return '期限超過';
  if (remaining === 0) return '今日';
  if (remaining <= 7) return 'まもなく';
  return '予定あり';
}
