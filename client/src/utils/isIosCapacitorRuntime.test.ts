import { describe, expect, it } from 'vitest';
import { isIosCapacitorRuntime } from './isIosCapacitorRuntime';

describe('iOS native app checkout guard', () => {
  it('recognizes Capacitor iOS bundled pages', () => {
    expect(isIosCapacitorRuntime('capacitor:')).toBe(true);
  });
  it('keeps the web checkout available on regular web origins', () => {
    for (const protocol of ['https:', 'http:', 'file:']) {
      expect(isIosCapacitorRuntime(protocol)).toBe(false);
    }
  });
});
