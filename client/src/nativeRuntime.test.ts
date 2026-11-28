import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HttpOptions, HttpResponse } from '@capacitor/core';

const platform = vi.hoisted(() => ({ native: false, request: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platform.native },
  CapacitorHttp: { request: platform.request },
}));
import { createNativeApiFetch, isNativeApp, nativeApiUrl } from './nativeRuntime';
import { getAuthToken, getStoredAuthUser, login } from './services/authClient';

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

afterEach(() => {
  platform.native = false;
  platform.request.mockReset();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

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
  // Model the installed iOS HttpRequestHandler's lowercase-header case: the
  // native decoder only parses these bytes when responseType is explicitly json.
  const lowercaseJsonReply = (raw: string, status = 200) =>
    vi.fn<(options: HttpOptions) => Promise<HttpResponse>>().mockImplementation(async options => nativeResult({
      status, url: 'https://app.farmpro-app.jp/api/auth/login',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      data: options.responseType === 'json' ? JSON.parse(raw) : raw,
    }));

  it('logs in through lowercase native headers without double-encoding the user object', async () => {
    const user = {
      id: 'synthetic-user', farmId: 'synthetic-farm', farmName: 'Test Farm', name: 'Test User',
      email: 'test@example.invalid', role: 'owner', active: true, plan: 'pro',
    };
    const send = lowercaseJsonReply(JSON.stringify({ token: 'synthetic-test-token', user }));
    const web = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', createNativeApiFetch(web, appUrl, send));

    await expect(login('test@example.invalid', 'synthetic-test-password')).resolves.toEqual(user);
    expect(getAuthToken()).toBe('synthetic-test-token');
    expect(getStoredAuthUser()).toEqual(user);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ responseType: 'json' }));
    expect(web).not.toHaveBeenCalled();
  });

  it('preserves the server 401 message and does not create a login session', async () => {
    const message = 'メールアドレスまたはパスワードが違います';
    const send = lowercaseJsonReply(JSON.stringify({ message }), 401);
    vi.stubGlobal('fetch', createNativeApiFetch(vi.fn<typeof fetch>(), appUrl, send));

    await expect(login('test@example.invalid', 'synthetic-test-password')).rejects.toThrow(message);
    expect(getAuthToken()).toBeNull();
    expect(getStoredAuthUser()).toBeNull();
  });

  it.each([
    { value: '{"looks":"like JSON but is a string"}' },
    { value: '' }, { value: 42 }, { value: true }, { value: false }, { value: null },
  ])('preserves the genuine decoded JSON value $value', async ({ value }) => {
    const send = lowercaseJsonReply(JSON.stringify(value));
    const response = await createNativeApiFetch(vi.fn<typeof fetch>(), appUrl, send)('/api/test');
    expect(await response.json()).toEqual(value);
  });

  it('preserves non-JSON native error text and its status without quoting or parsing it', async () => {
    const { fetchApi } = setup(nativeResult({
      status: 503, headers: { 'content-type': 'text/plain' }, data: 'Service temporarily unavailable',
    }));
    const response = await fetchApi('/api/test');
    expect(response.status).toBe(503);
    expect(response.ok).toBe(false);
    expect(await response.text()).toBe('Service temporarily unavailable');
  });

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
