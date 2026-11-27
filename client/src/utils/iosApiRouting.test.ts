import { describe, expect, it, vi } from 'vitest';
import { installIosApiRouting, resolveIosApiUrl } from './iosApiRouting';

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

describe('bundled iOS native API GET adapter', () => {
  it('returns a standard fetch Response for an API GET through CapacitorHttp', async () => {
    const get = vi.fn().mockResolvedValue({ status: 200, data: { costs: [] } });
    const fallback = vi.fn();
    const fakeWindow = {
      location: { protocol: 'capacitor:' },
      Capacitor: { Plugins: { CapacitorHttp: { get } } },
      fetch: fallback,
    } as unknown as Window;
    installIosApiRouting(fakeWindow);
    const response = await fakeWindow.fetch('/api/sales/expenses');
    expect(get).toHaveBeenCalledWith({
      url: 'https://app.farmpro-app.jp/api/sales/expenses',
      headers: {},
    });
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({ costs: [] });
    expect(fallback).not.toHaveBeenCalled();
  });

  it('does not send POST requests through read-only native bridge', async () => {
    const get = vi.fn();
    const fallback = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const fakeWindow = {
      location: { protocol: 'capacitor:' },
      Capacitor: { Plugins: { CapacitorHttp: { get } } },
      fetch: fallback,
    } as unknown as Window;
    installIosApiRouting(fakeWindow);
    await fakeWindow.fetch('/api/records', { method: 'POST', body: '{}' });
    expect(get).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledWith('https://app.farmpro-app.jp/api/records', { method: 'POST', body: '{}' });
  });
});
