import { Capacitor, CapacitorHttp, type HttpOptions, type HttpResponse } from '@capacitor/core';

const API_ORIGIN = 'https://app.farmpro-app.jp';

/** Runtime detection keeps the existing browser/PWA build unchanged. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativeApiUrl(value: string, appUrl: string): string | null {
  try {
    const base = new URL(appUrl);
    const url = new URL(value, base);
    // Custom schemes have the opaque origin "null". Compare their actual
    // protocol/host instead of treating every opaque URL as the same origin.
    if (url.protocol !== base.protocol || url.host !== base.host || url.username || url.password) return null;
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return null;
    return `${API_ORIGIN}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

type NativeRequest = (options: HttpOptions) => Promise<HttpResponse>;

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The request was aborted.', 'AbortError');
}

function withAbort<T>(signal: AbortSignal, action: () => Promise<T>): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(abortReason(signal)); };
    signal.addEventListener('abort', abort, { once: true });
    action().then(value => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(abortReason(signal));
      else resolve(value);
    }, error => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
  });
}

async function requestNativeApi(request: Request, target: string, send: NativeRequest): Promise<Response> {
  return withAbort(request.signal, async () => {
    const headers = Object.fromEntries(request.headers.entries());
    if (request.cache === 'no-store' && !request.headers.has('cache-control')) headers['cache-control'] = 'no-store';
    if (['reload', 'no-cache'].includes(request.cache) && !request.headers.has('cache-control')) headers['cache-control'] = 'no-cache';
    let data: string | undefined;
    if (request.body !== null) {
      const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
      // All current FarmPro APIs send JSON, including base64 document uploads.
      // Fail before dispatch if a future caller adds unsupported binary data.
      if (contentType && !contentType.startsWith('text/') && contentType !== 'application/json' &&
          !contentType.endsWith('+json') && contentType !== 'application/x-www-form-urlencoded') {
        throw new TypeError('Native API requests require a JSON or text body.');
      }
      data = await request.text();
    }
    if (request.signal.aborted) throw abortReason(request.signal);
    const result = await send({
      url: target, method: request.method, headers,
      ...(data === undefined ? {} : { data }),
      disableRedirects: true, responseType: 'text',
      // iOS uses connectTimeout as its entire URLRequest timeout. Keep it long
      // enough for document AI; each caller's AbortSignal may finish sooner.
      connectTimeout: 120_000, readTimeout: 120_000,
    });
    if (request.signal.aborted) throw abortReason(request.signal);
    // No API endpoint needs a redirect. Never forward bearer tokens or replay
    // a mutation at an unexpected destination, even for fetch's default mode.
    if ([301, 302, 303, 307, 308].includes(result.status) && request.redirect !== 'manual') {
      throw new TypeError('FarmPro API redirects are not allowed.');
    }
    const responseUrl = new URL(result.url || target);
    if (responseUrl.origin !== API_ORIGIN) throw new TypeError('Unexpected FarmPro API response origin.');
    const responseHeaders = new Headers(result.headers);
    const json = /(?:^application\/json\b|\+json\b)/i.test(responseHeaders.get('content-type') ?? '');
    const noBody = request.method === 'HEAD' || [204, 205, 304].includes(result.status);
    const body = noBody ? null : json ? JSON.stringify(result.data) :
      typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
    const response = new Response(body, { status: result.status, headers: responseHeaders });
    Object.defineProperty(response, 'url', { value: responseUrl.href });
    return response;
  });
}

/**
 * Route this app's JSON APIs through native HTTP, leaving assets and external
 * requests untouched. The global CapacitorHttp fetch/XHR patch stays disabled.
 * No Origin, cookie or authorization headers are invented here. Aborting
 * rejects the caller and ignores late responses; an already-dispatched server
 * mutation may still complete, so callers retain their existing reconciliation.
 */
export function createNativeApiFetch(
  transport: typeof fetch, appUrl: string, send: NativeRequest = options => CapacitorHttp.request(options),
): typeof fetch {
  return async (input, init) => {
    const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const target = nativeApiUrl(value, appUrl);
    if (!target) return transport(input, init);
    // Normalize with the standard constructor to merge Request fields and
    // caller overrides without losing non-enumerable headers/body/settings.
    const request = new Request(input instanceof Request ? input : target, init);
    return requestNativeApi(request, target, send);
  };
}

let installed = false;

export function installNativeRuntime(): void {
  if (!isNativeApp() || installed) return;
  // The app uses fetch for APIs; no axios/XHR call sites need a URL shim.
  const transport = window.fetch.bind(window);
  window.fetch = createNativeApiFetch(transport, window.location.href);
  installed = true;
}
