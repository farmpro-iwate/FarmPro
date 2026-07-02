import dayjs from 'dayjs';
export function calculateExpectedCalvingDate(inseminationDate: string) { if (!inseminationDate) return ''; return dayjs(inseminationDate).add(285, 'day').format('YYYY-MM-DD'); }
export function daysUntil(dateText: string) { if (!dateText) return 0; return dayjs(dateText).diff(dayjs(), 'day'); }
