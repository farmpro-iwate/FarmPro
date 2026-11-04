import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnimalLifecycle } from '../types/animalLifecycle';
import { calculateAnimalAge, formatAnimalAge } from './animalAge';

const death = (date: string): AnimalLifecycle => ({
  version: 1,
  death: { date, reason: '検証', note: '', recordedAt: `${date}T00:00:00Z` },
});

afterEach(() => vi.useRealTimers());

describe('animal calendar age', () => {
  it.each([
    ['2026-01-04', '2026-11-04', 10, 304],
    ['2026-11-04', '2026-11-04', 0, 0],
    ['2026-07-23', '2026-08-22', 0, 30],
    ['2026-01-31', '2026-02-28', 1, 28],
    ['2026-01-31', '2026-03-30', 1, 58],
    ['2024-02-29', '2025-02-28', 12, 365],
    ['2024-02-28', '2024-03-01', 0, 2],
  ])('uses completed calendar months and elapsed days from %s to %s', (birthday, today, months, days) => {
    expect(calculateAnimalAge({ birthday }, today)).toEqual({ months, days, atDeath: false });
  });

  it.each(['', 'not-a-date', '2026-02-30', '2026-13-01', '2026-2-1', '2026-11-05'])('does not display an age for an unknown, invalid or future birth date: %s', (birthday) => {
    expect(calculateAnimalAge({ birthday }, '2026-11-04')).toBeNull();
    expect(formatAnimalAge({ birthday }, '2026-11-04')).toBe('月齢・日齢：-');
  });

  it('rejects an invalid reference date instead of silently normalizing it', () => {
    expect(calculateAnimalAge({ birthday: '2026-01-04' }, '2026-02-30')).toBeNull();
  });

  it('advances at local midnight, including when Japan is on a different UTC date', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 4, 0, 5));
    expect(calculateAnimalAge({ birthday: '2026-11-03' })).toEqual({ months: 0, days: 1, atDeath: false });
    expect(calculateAnimalAge({ birthday: '2026-11-04' })).toEqual({ months: 0, days: 0, atDeath: false });
    vi.setSystemTime(new Date(2026, 10, 4, 23, 55));
    expect(calculateAnimalAge({ birthday: '2026-11-03' })).toEqual({ months: 0, days: 1, atDeath: false });
  });

  it('stops age at the death date and makes the reference point visible', () => {
    const animal = { birthday: '2026-01-04', lifecycle: death('2026-05-06') };
    expect(calculateAnimalAge(animal, '2026-11-04')).toEqual({ months: 4, days: 122, atDeath: true });
    expect(formatAnimalAge(animal, '2026-11-04')).toBe('4か月齢（122日齢・死亡時）');
  });

  it('does not invent a current age for legacy deaths with an unknown death date', () => {
    expect(calculateAnimalAge({ birthday: '2026-01-04', managementStatus: '死亡・その他' }, '2026-11-04')).toBeNull();
  });

  it('does not display negative ages for a death date before birth', () => {
    expect(calculateAnimalAge({ birthday: '2026-01-04', lifecycle: death('2026-01-03') }, '2026-11-04')).toBeNull();
  });

  it('keeps counting age for a culled animal still on the farm', () => {
    const animal = {
      birthday: '2026-01-04',
      lifecycle: { version: 1, culling: { date: '2026-05-06', reason: '検証', note: '', route: 'fattening', recordedAt: '2026-05-06T00:00:00Z' } } as const,
    };
    expect(formatAnimalAge(animal, '2026-11-04')).toBe('10か月齢（304日齢）');
  });
});
