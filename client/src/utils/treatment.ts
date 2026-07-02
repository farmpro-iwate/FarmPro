import dayjs from 'dayjs';

export function daysUntil(dateText: string) {
  if (!dateText) return 0;
  return dayjs(dateText).diff(dayjs(), 'day');
}

export function judgeWithdrawal(withdrawalEndDate: string) {
  if (!withdrawalEndDate) return '未設定';
  const remaining = daysUntil(withdrawalEndDate);
  if (remaining >= 0) return '休薬中';
  return '休薬終了';
}
