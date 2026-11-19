#!/usr/bin/env node
/**
 * Verify that Android TWA image URLs are actually served by the intended
 * production origin. GET only. No credentials, farm data, or local writes.
 *
 * Do NOT use a branch-only PNG file as an icon URL: Bubblewrap downloads
 * its icon from the live HTTPS site.
 */
const origin = 'https://app.farmpro-app.jp';
const manifestUrl = origin + '/manifest.webmanifest';
const expectations = [
  ['/farmpro-icon-192.png', 192],
  ['/farmpro-icon-512.png', 512],
  ['/farmpro-icon-maskable-512.png', 512],
];
async function get(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
    headers: { Accept: '*/*' }
  });
  if (!res.ok || new URL(res.url).origin !== origin) throw new Error('HTTP/redirect mismatch: ' + url + ' -> ' + res.status + ' ' + res.url);
  return { data: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') ?? '' };
}
try {
  const m = await get(manifestUrl);
  const manifest = JSON.parse(m.data.toString('utf8'));
  if (manifest.start_url !== '/' || manifest.scope !== '/' || manifest.display !== 'standalone') {
    throw new Error('Production manifest root/scope/display mismatch');
  }
  for (const [path, size] of expectations) {
    const target = manifest.icons?.find(i => i.src?.split('?')[0] === path &&
      i.type === 'image/png' && i.sizes?.split(/\s+/).includes(size+'x'+size));
    if (!target) throw new Error('Production manifest missing ' + path);
    const png = await get(new URL(target.src, origin).href);
    if (png.data.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' ||
        png.data.toString('ascii',12,16) !== 'IHDR' ||
        png.data.readUInt32BE(16) !== size || png.data.readUInt32BE(20) !== size) {
      throw new Error('Invalid PNG dimensions or signature: ' + path);
    }
    if (path.includes('maskable') && !target.purpose?.split(/\s+/).includes('maskable')) {
      throw new Error('Maskable icon purpose not declared');
    }
    console.log('PASS publicly served image', path, size + 'x' + size);
  }
  console.log('PASS production image URLs are ready for Bubblewrap icon download');
} catch (error) {
  console.error('BLOCKED: production PNG hosting/manifest not ready:', error.message);
  process.exitCode = 1;
}
