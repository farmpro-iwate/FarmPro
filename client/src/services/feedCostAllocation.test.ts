import { describe, expect, it } from 'vitest';
import { allocateByWeight } from './feedCostAllocation';

describe('allocateByWeight', () => {
  it('個体別給与量は小数3桁までに丸め、合計数量を保つ', () => {
    const result = allocateByWeight(
      [{ id: 'a', weight: 1 }, { id: 'b', weight: 1 }, { id: 'c', weight: 1 }],
      5,
      288,
    );

    expect(result.map((item) => item.allocatedQuantity)).toEqual([1.667, 1.667, 1.666]);
    expect(result.reduce((sum, item) => sum + item.allocatedQuantity, 0)).toBeCloseTo(5, 6);
  });

  it('日齢比率按分でも小数が長くならない', () => {
    const result = allocateByWeight(
      [{ id: 'a', weight: 1 }, { id: 'b', weight: 2 }, { id: 'c', weight: 3 }, { id: 'd', weight: 4 }],
      5,
      288,
    );

    expect(result.map((item) => item.allocatedQuantity)).toEqual([0.5, 1, 1.5, 2]);
    expect(result.reduce((sum, item) => sum + item.allocatedQuantity, 0)).toBeCloseTo(5, 6);
  });

});
