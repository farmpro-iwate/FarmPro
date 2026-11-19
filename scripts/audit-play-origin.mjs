#!/usr/bin/env node
/**
 * Read-only preflight for Google Play Trusted Web Activity packaging.
 * Usage: node scripts/audit-play-origin.mjs https://app.farmpro-app.jp
 * No auth, storage writes, or deployment changes.
 */
const originInput = process.argv[2];
if (!originInput) {
  console.error('Usage: node scripts/audit-play-origin.mjs https://<app-origin>');
  process.exit(2);
}
let origin;
try {
  const u = new URL(originInput);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/') {
    throw new Error('Expected HTTPS origin only, ending in /');
  }
  origin = u.origin;
} catch (e) {
  console.error('Invalid origin:', e.message);
  process.exit(2);
}
const timeoutMs = 12000;
async function inspect(path) {
  const url = new URL(path, origin);
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'text/html,application/manifest+json,application/json;q=0.9,*/*;q=0.8' } });
    const type = response.headers.get('content-type') || '';
    const result = { url: url.href, status: response.status, finalUrl: response.url, contentType: type, ok: response.ok };
    if (type.includes('html') && path === '/') {
      const html = (await response.text()).slice(0, 100000);
      result.manifestHref = html.match(/<link[^>]+rel=["']manifest["'][^>]*href=["']([^"']+)/i)?.[1]
        ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']manifest/i)?.[1]
        ?? null;
      result.title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? null;
    } else if (type.includes('json') && (path.endsWith('webmanifest') || path.includes('manifest'))) {
      try {
        const data = await response.json();
        result.name = data.name ?? null;
        result.start_url = data.start_url ?? null;
        result.scope = data.scope ?? null;
        result.display = data.display ?? null;
        result.icons = (data.icons ?? []).map(i => ({src:i.src,sizes:i.sizes,type:i.type,purpose:i.purpose}));
      } catch { result.note = 'Could not parse manifest JSON'; }
    } else {
      await response.body?.cancel();
    }
    return result;
  } catch (e) { return { url: url.href, error: e.message }; }
}
const root = await inspect('/');
const manifestUrl = root.manifestHref ? new URL(root.manifestHref, origin + '/').href : null;
const checks = [root];
if (manifestUrl) {
  const path = new URL(manifestUrl);
  if (path.origin === origin) checks.push(await inspect(path.pathname + path.search));
  else checks.push({ url: manifestUrl, note: 'Manifest is on a different origin; inspect manually' });
} else {
  for (const path of ['/manifest.webmanifest','/FarmPro/manifest.webmanifest']) checks.push(await inspect(path));
}
checks.push(await inspect('/.well-known/assetlinks.json'));
console.log(JSON.stringify({ checkedAt:new Date().toISOString(), origin, checks, caution:'Read-only network preflight. Success does not prove app/data/billing compliance. Do not register TWA until domain ownership, signing fingerprint, app data migration, and billing are validated.' },null,2));
