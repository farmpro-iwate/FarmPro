import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HttpOptions, HttpResponse } from '@capacitor/core';

const platform = vi.hoisted(() => ({ native: false, request: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platform.native },
  CapacitorHttp: { request: platform.request },
}));
import { createNativeApiFetch, isNativeApp, nativeApiUrl } from './nativeRuntime';

const appUrl = 'capacitor://localhost/cattle/1';
const nativeResult = (overrides: Partial<HttpResponse> = {}): HttpResponse => ({
  status: 200, data: { saved: true }, headers: { 'Content-Type': 'application/json', 'ETag': 'revision-2' },
  url: 'https://app.farmpro-app.jp/api/test', ...overrides,
});
const setup = (result = nativeResult()) => {
  const web = vi.fn<typeof fetch>().mockResolvedValue(new Response('web asset'));
  const send = vi.fn<(options: HttpOptions) => Promise<HttpResponse>>().mockResolvedValue(result);
  return { web, send, fetchApi: createNativeApiFetch(web, appUrl, send) };
};

afterEach(() => { platform.native = false; platform.request.mockReset(); vi.unstubAllGlobals(); });

describe('native API destination', () => {
  it('rewrites the app API path and preserves escaped IDs/query strings', () => {
    expect(nativeApiUrl('/api/cattle/id%3A1?revision=two%20words', appUrl))
      .toBe('https://app.farmpro-app.jp/api/cattle/id%3A1?revision=two%20words');
    expect(nativeApiUrl('capacitor://localhost/api/auth/me', appUrl)).toBe('https://app.farmpro-app.jp/api/auth/me');
    expect(nativeApiUrl('/api', appUrl)).toBe('https://app.farmpro-app.jp/api');
  });
  it.each([
    '/assets/app.js', '/ocr/worker.min.js', '/index.html', '/apiculture', '/apiary/x',
    'https://external.example/api/auth', '//external.example/api/auth',
    'capacitor://other-host/api/auth', 'custom://localhost/api/auth',
    'data:text/plain,/api/auth', 'capacitor://someone:secret@localhost/api/auth',
  ])('does not rewrite %s', value => expect(nativeApiUrl(value, appUrl)).toBeNull());
});

describe('native API transport', () => {
  it('preserves mutation body/conditional headers and exposes status/JSON/headers', async () => {
    const { send, web, fetchApi } = setup(nativeResult({ status: 409, data: { message: 'Conflict' } }));
    const body = JSON.stringify({ id: 'test-only', amount: '500' });
    const response = await fetchApi('/api/expenses/record-sync/1', {
      method: 'PUT', body, cache: 'no-store', redirect: 'error',
      headers: { Authorization: 'Bearer test-only', 'Content-Type': 'application/json', 'If-Match': 'revision-1' },
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://app.farmpro-app.jp/api/expenses/record-sync/1', method: 'PUT', data: body,
      headers: { authorization: 'Bearer test-only', 'content-type': 'application/json', 'if-match': 'revision-1', 'cache-control': 'no-store' },
      disableRedirects: true,
    }));
    expect(web).not.toHaveBeenCalled();
    expect(response.status).toBe(409);
    expect(response.ok).toBe(false);
    expect(response.headers.get('etag')).toBe('revision-2');
    expect(await response.json()).toEqual({ message: 'Conflict' });
  });

  it('merges Request fields with caller overrides without losing its body', async () => {
    const { send, fetchApi } = setup();
    const request = new Request('capacitor://localhost/api/auth/login', {
      method: 'POST', body: '{"email":"test@example.invalid"}',
      headers: { 'Content-Type': 'application/json', 'X-Test': 'original' }, redirect: 'error',
    });
    await fetchApi(request, { headers: { 'Content-Type': 'application/json', 'X-Test': 'override' } });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST', data: '{"email":"test@example.invalid"}',
      headers: { 'content-type': 'application/json', 'x-test': 'override' },
    }));
  });

  it('leaves local assets and external URL objects on the original fetch', async () => {
    const { web, send, fetchApi } = setup();
    for (const url of [new URL('/ocr/worker.min.js', appUrl), new URL('https://external.example/api')]) {
      await fetchApi(url);
      expect(web).toHaveBeenLastCalledWith(url, undefined);
    }
    expect(send).not.toHaveBeenCalled();
    await fetchApi(new URL('/api/auth/me', appUrl));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://app.farmpro-app.jp/api/auth/me' }));
  });

  it.each(['error', 'follow'] as const)('refuses API redirects in %s mode without replaying the request', async redirect => {
    const { send, fetchApi } = setup(nativeResult({ status: 302, headers: { Location: 'https://external.example/' }, data: '' }));
    await expect(fetchApi('/api/test', { redirect })).rejects.toThrow('redirects are not allowed');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].disableRedirects).toBe(true);
  });

  it('exposes a manual redirect and handles an empty 204 response', async () => {
    const { send, fetchApi } = setup(nativeResult({ status: 302, headers: { location: '/next' }, data: '' }));
    expect((await fetchApi('/api/test', { redirect: 'manual' })).status).toBe(302);
    send.mockResolvedValueOnce(nativeResult({ status: 204, data: null }));
    const response = await fetchApi('/api/test', { method: 'POST' });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('does not dispatch an already aborted request', async () => {
    const { send, fetchApi } = setup();
    const controller = new AbortController(); controller.abort();
    await expect(fetchApi('/api/test', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects caller timeout immediately and ignores a late native response', async () => {
    const { send, fetchApi } = setup();
    let finish!: (response: HttpResponse) => void;
    send.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const result = fetchApi('/api/test', { signal: controller.signal });
    const rejection = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
    controller.abort(new DOMException('Timeout', 'TimeoutError'));
    await rejection;
    finish(nativeResult());
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported multipart bodies before any native network request', async () => {
    const { send, fetchApi } = setup();
    await expect(fetchApi('/api/test', { method: 'POST', body: new FormData() })).rejects.toThrow('JSON or text body');
    expect(send).not.toHaveBeenCalled();
  });

  it('does not patch the web/PWA runtime and installs only once on native', async () => {
    vi.resetModules();
    const web = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', web); platform.request.mockResolvedValue(nativeResult());
    const { installNativeRuntime } = await import('./nativeRuntime');
    expect(isNativeApp()).toBe(false);
    installNativeRuntime(); expect(window.fetch).toBe(web);
    platform.native = true; expect(isNativeApp()).toBe(true);
    installNativeRuntime(); const adapted = window.fetch;
    installNativeRuntime(); expect(window.fetch).toBe(adapted);
    await window.fetch('/api/auth/me');
    expect(platform.request).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://app.farmpro-app.jp/api/auth/me' }));
    expect(web).not.toHaveBeenCalled();
  });
});
