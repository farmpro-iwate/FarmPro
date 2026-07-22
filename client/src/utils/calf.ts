import dayjs from 'dayjs';

export function calculateAgeDays(birthday: string) {
  if (!birthday) return 0;
  return dayjs().diff(dayjs(birthday), 'day');
}

export function calculateAgeMonthsAndDays(birthday: string) {
  if (!birthday) return { months: 0, days: 0, label: '-' };

  const birth = dayjs(birthday);
  const today = dayjs();
  if (!birth.isValid() || birth.isAfter(today, 'day')) {
    return { months: 0, days: 0, label: '-' };
  }

  const months = today.diff(birth, 'month');
  const monthDate = birth.add(months, 'month');
  const days = today.diff(monthDate, 'day');
  return {
    months,
    days,
    label: `${months}か月${days > 0 ? `${days}日` : ''}`,
  };
}

export function calculateDg(startWeight: number, currentWeight: number, elapsedDays: number) {
  if (!elapsedDays || elapsedDays <= 0) return 0;
  return (currentWeight - startWeight) / elapsedDays;
}

export function judgeDg(dg: number) {
  if (dg >= 0.8) return '良';
  if (dg >= 0.6) return '注意';
  return '要確認';
}
