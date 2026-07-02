import dayjs from 'dayjs';
export function calculateAgeDays(birthday: string) { if (!birthday) return 0; return dayjs().diff(dayjs(birthday), 'day'); }
export function calculateDg(startWeight: number, currentWeight: number, elapsedDays: number) { if (!elapsedDays || elapsedDays <= 0) return 0; return (currentWeight - startWeight) / elapsedDays; }
export function judgeDg(dg: number) { if (dg >= 0.8) return '良'; if (dg >= 0.6) return '注意'; return '要確認'; }
