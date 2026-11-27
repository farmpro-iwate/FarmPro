import { isIosCapacitorRuntime } from './isIosCapacitorRuntime';

// The production browser app retains its existing same-origin API behavior.
// The bundled iOS app has a different (capacitor://localhost) origin.
const IOS_API_ORIGIN = 'https://app.farmpro-app.jp';

type NativeHttpResponse = { status: number; data: unknown; headers?: Record<string, string> };
type NativeHttp = {
  get(options: { url: string; headers?: Record<string, string> }): Promise<NativeHttpResponse>;
};

function nativeHttpFor(win: Window): NativeHttp | null {
  const host = win as Window & { Capacitor?: { Plugins?: { CapacitorHttp?: NativeHttp } } };
  return host.Capacitor?.Plugins?.CapacitorHttp ?? null;
}

export function resolveIosApiUrl(input: RequestInfo | URL, protocol: string): RequestInfo | URL {
  if (!isIosCapacitorRuntime(protocol)) return input;

  const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!value.startsWith('/api/')) return input;

  const url = IOS_API_ORIGIN + value;
  if (typeof input === 'string') return url;
  if (input instanceof URL) return new URL(url);
  return new Request(url, input);
}

function apiPath(input: RequestInfo | URL): string | null {
  const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (value.startsWith('/api/')) return value;
  if (value.startsWith(IOS_API_ORIGIN + '/api/')) return value.slice(IOS_API_ORIGIN.length);
  return null;
}

function fetchMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
}

function nativeJsonResponse(result: NativeHttpResponse): Response {
  const headers = new Headers(result.headers ?? {});
  // CapacitorHttp may parse JSON automatically; fetch callers must still receive
  // a standard Response so existing .json(), .ok and status checks keep working.
  const body = typeof result.data === 'string' ? result.data :
    result.data == null ? '' : JSON.stringify(result.data);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Response(result.status === 204 || result.status === 205 ? null : body, {
    status: result.status,
    headers,
  });
}

export function installIosApiRouting(win: Window = window): void {
  if (!isIosCapacitorRuntime(win.location.protocol)) return;
  const existingFetch = win.fetch.bind(win);
  win.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const path = apiPath(input);
    const nativeHttp = nativeHttpFor(win);
    // Read-only migration first. Do not silently reroute mutations, uploads or
    // requests from other origins until they have been tested separately.
    if (path && fetchMethod(input, init) === 'GET' && nativeHttp) {
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
      const requestHeaders: Record<string, string> = {};
      headers.forEach((v, k) => { requestHeaders[k] = v; });
      return nativeHttp.get({ url: IOS_API_ORIGIN + path, headers: requestHeaders })
        .then(nativeJsonResponse);
    }
    return existingFetch(resolveIosApiUrl(input, win.location.protocol), init);
  }) as typeof fetch;
}
