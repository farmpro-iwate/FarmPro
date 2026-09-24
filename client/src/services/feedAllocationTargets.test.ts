import { describe, expect, it } from 'vitest';
import { normalizeFeedAnimalNumber } from './feedAllocationTargets';

describe('normalizeFeedAnimalNumber', () => {
  it('先頭0付きの番号を同じ個体番号として扱える形にする', () => {
    expect(normalizeFeedAnimalNumber('0908')).toBe('908');
    expect(normalizeFeedAnimalNumber('0007358')).toBe('7358');
  });

  it('0だけの番号や数字以外は壊さない', () => {
    expect(normalizeFeedAnimalNumber('0')).toBe('0');
    expect(normalizeFeedAnimalNumber('A0908')).toBe('A0908');
  });
});
