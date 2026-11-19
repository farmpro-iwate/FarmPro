#!/usr/bin/env node
// Updates ONLY the Android experiment branch's PWA manifest after generated PNGs exist.
import { readFile, writeFile } from 'node:fs/promises';
const file = 'client/public/manifest.webmanifest';
const original = JSON.parse(await readFile(file, 'utf8'));
if (original.start_url !== '/' || original.scope !== '/') throw new Error('Not production-root manifest; refusing to edit');
const next = {
  ...original,
  icons: [
    { src: '/farmpro-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/farmpro-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/farmpro-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ...original.icons.filter(x => x.type !== 'image/png'),
  ],
};
await writeFile(file, JSON.stringify(next, null, 2) + '\n');
console.log('Manifest PNG entries updated in Android test branch only.');
