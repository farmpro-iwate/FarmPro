import { describe, expect, it } from 'vitest';
import { resolveIosApiUrl } from './iosApiRouting';

describe('iOS API routing', () => {
  it('uses the HTTPS FarmPro API for bundled iOS requests', () => {
    expect(resolveIosApiUrl('/api/auth/login', 'capacitor:')).toBe('https://app.farmpro-app.jp/api/auth/login');
    expect(resolveIosApiUrl('/api/cattle', 'capacitor:')).toBe('https://app.farmpro-app.jp/api/cattle');
    expect(resolveIosApiUrl('/api/cattle?status=active', 'capacitor:')).toBe('https://app.farmpro-app.jp/api/cattle?status=active');
  });
  it('does not affect normal web requests', () => {
    for (const protocol of ['https:', 'http:']) {
      expect(resolveIosApiUrl('/api/auth/login', protocol)).toBe('/api/auth/login');
    }
  });
  it('leaves third-party URLs and static resources unchanged', () => {
    expect(resolveIosApiUrl('https://example.org/abc', 'capacitor:')).toBe('https://example.org/abc');
    expect(resolveIosApiUrl('/farmpro-icon.svg', 'capacitor:')).toBe('/farmpro-icon.svg');
  });
  it('preserves Request parameters', () => {
    const original = new Request('https://example.org/api/auth/login', { method: 'POST', headers: { 'X-FarmPro-Test': '1' } });
    expect(resolveIosApiUrl(original, 'capacitor:')).toBe(original);
  });
});
