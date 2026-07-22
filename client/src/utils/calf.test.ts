import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateAgeDays, calculateAgeMonthsAndDays } from './calf';

describe('子牛の月齢計算', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('月齢と端数日を表示する', () => {
    expect(calculateAgeMonthsAndDays('2026-03-23')).toEqual({
      months: 3,
      days: 29,
      label: '3か月29日',
    });
  });

  it('ちょうど月齢の場合は日数を省略する', () => {
    expect(calculateAgeMonthsAndDays('2026-04-22').label).toBe('3か月');
  });

  it('日齢計算を残す', () => {
    expect(calculateAgeDays('2026-07-12')).toBe(10);
  });

  it('未入力または未来日は未表示にする', () => {
    expect(calculateAgeMonthsAndDays('').label).toBe('-');
    expect(calculateAgeMonthsAndDays('2026-07-23').label).toBe('-');
  });
});
