import { isIosCapacitorRuntime } from './isIosCapacitorRuntime';

// Only the bundled iOS app needs a remote API origin. The production browser app
// continues to use its existing same-origin /api routes, unchanged.
const IOS_API_ORIGIN = 'https://app.farmpro-app.jp';

export function resolveIosApiUrl(input: RequestInfo | URL, protocol: string): RequestInfo | URL {
  if (!isIosCapacitorRuntime(protocol)) return input;

  const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!value.startsWith('/api/')) return input;

  const url = IOS_API_ORIGIN + value;
  if (typeof input === 'string') return url;
  if (input instanceof URL) return new URL(url);
  return new Request(url, input);
}

export function installIosApiRouting(win: Window = window): void {
  if (!isIosCapacitorRuntime(win.location.protocol)) return;
  const existingFetch = win.fetch.bind(win);
  win.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    return existingFetch(resolveIosApiUrl(input, win.location.protocol), init);
  }) as typeof fetch;
}
