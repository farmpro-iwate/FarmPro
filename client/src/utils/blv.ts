import dayjs from 'dayjs';
export function daysUntil(dateText: string) { if (!dateText) return 0; return dayjs(dateText).diff(dayjs(), 'day'); }
export function judgeBlvNextTest(result: string, nextTestDate: string) { if (result === '陽性') return '陽性管理'; if (!nextTestDate) return '未定'; const remaining = daysUntil(nextTestDate); if (remaining < 0) return '期限超過'; if (remaining <= 30) return 'まもなく'; return '予定あり'; }
