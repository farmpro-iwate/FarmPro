#!/usr/bin/env node
// FarmPro Google Play preflight - GET-only, no authentication, no local data access.
// Run: node scripts/play-origin-preflight.mjs https://app.farmpro-app.jp
import { URL } from 'node:url';
const input = process.argv[2] ?? 'https://app.farmpro-app.jp';
const origin = new URL(input);
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
  throw new Error('Only a plain HTTPS origin is allowed, e.g. https://app.farmpro-app.jp');
}
const timeout = 12000;
const read = async (path) => {
  const url = new URL(path, origin);
  if (url.origin !== origin.origin) throw new Error('Cross-origin fetch refused');
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeout), headers: { Accept: 'text/html,application/manifest+json,application/json,*/*;q=0.5' } });
    const type = res.headers.get('content-type') || '';
    const body = (await res.text()).slice(0, 150000);
    return { url: url.href, finalUrl: res.url, status: res.status, contentType: type, body };
  } catch (err) {
    return { url: url.href, error: String(err.message || err) };
  }
};
const home = await read('/');
const manifestMatch = home.body?.match(/<link\b[^>]*rel=["']manifest["'][^>]*>/i) || home.body?.match(/<link\b[^>]*href=["'][^"']+["'][^>]*rel=["']manifest["'][^>]*>/i);
const href = manifestMatch?.[0].match(/\bhref=["']([^"']+)["']/i)?.[1];
const manifestUrl = href ? new URL(href, origin) : new URL('/manifest.webmanifest', origin);
const report = {
  inspectedAt: new Date().toISOString(),
  expectedOrigin: origin.origin,
  home: {status: home.status ?? null, finalUrl: home.finalUrl ?? null, error: home.error ?? null, manifestHref: href ?? null},
  manifest: {url: manifestUrl.href},
  assetLinks: {},
  checks: {},
};
if (manifestUrl.origin === origin.origin) {
  const manifest = await read(manifestUrl.pathname + manifestUrl.search);
  report.manifest.status = manifest.status ?? null;
  report.manifest.error = manifest.error ?? null;
  report.manifest.finalUrl = manifest.finalUrl ?? null;
  try {
    const parsed = JSON.parse(manifest.body);
    report.manifest.name = parsed.name ?? null;
    report.manifest.start_url = parsed.start_url ?? null;
    report.manifest.scope = parsed.scope ?? null;
    report.manifest.display = parsed.display ?? null;
    report.manifest.icons = Array.isArray(parsed.icons) ? parsed.icons.map(x=>({src:x.src,sizes:x.sizes,type:x.type,purpose:x.purpose})) : [];
    const start = new URL(parsed.start_url ?? '/', manifestUrl);
    const scope = new URL(parsed.scope ?? '/', manifestUrl);
    report.checks.manifestSameOrigin = start.origin === origin.origin && scope.origin === origin.origin;
    report.checks.rootStartUrl = start.pathname === '/';
    report.checks.rootScope = scope.pathname === '/';
    report.checks.hasPng192And512 = ['192x192','512x512'].every(sz => report.manifest.icons.some(x=>x.type==='image/png' && (x.sizes || '').split(/\s+/).includes(sz)));
  } catch {
    report.manifest.parseError = 'Manifest is absent or invalid JSON';
  }
} else {
  report.manifest.error = 'Manifest cross-origin: manual review required';
}
const asset = await read('/.well-known/assetlinks.json');
report.assetLinks = {status: asset.status ?? null, error: asset.error ?? null, note:'404 is expected before Android signing and domain ownership are configured'};
report.checks.homeRespondedOk = home.status >= 200 && home.status < 400;
console.log(JSON.stringify(report,null,2));
if (!report.checks.homeRespondedOk || !report.checks.manifestSameOrigin || !report.checks.rootStartUrl || !report.checks.rootScope) process.exitCode = 1;
