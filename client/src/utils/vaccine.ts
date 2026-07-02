import dayjs from 'dayjs';
export function daysUntil(dateText: string) { if (!dateText) return 0; return dayjs(dateText).diff(dayjs(), 'day'); }
export function judgeVaccineDue(status: string, nextDueDate: string) { if (status === '接種済み') return '接種済み'; const remaining = daysUntil(nextDueDate); if (!nextDueDate) return '未定'; if (remaining < 0) return '期限超過'; if (remaining <= 14) return 'まもなく'; return '予定あり'; }
