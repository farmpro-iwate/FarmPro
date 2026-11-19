#!/usr/bin/env node
/**
 * Generate Google Play / PWA PNGs from the EXISTING FarmPro cow icon.
 * Only writes to client/public. No production API or data access.
 *
 * Install dependency in isolated CI: npm install --no-save --no-package-lock sharp
 * Run from repository root: node scripts/generate-play-icons.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const dir = join(process.cwd(), 'client', 'public');
const source = await readFile(join(dir, 'farmpro-icon-v2.svg'));
const formats = [
  [192, 'farmpro-icon-192.png'],
  [512, 'farmpro-icon-512.png'],
];
for (const [size, filename] of formats) {
  await sharp(source, { density: 300 }).resize(size, size).png().toFile(join(dir, filename));
  const meta = await sharp(join(dir, filename)).metadata();
  if (meta.width !== size || meta.height !== size || meta.format !== 'png') {
    throw new Error('PNG validation failed: ' + filename);
  }
  console.log(filename, size + 'x' + size);
}

// Maskable: place the existing icon at 75% size on a full opaque background.
// This retains the cow design without clipping its ears under an adaptive mask.
const size = 512;
const inner = 384;
const icon = await sharp(source, { density: 300 }).resize(inner, inner).png().toBuffer();
await sharp({ create: { width: size, height: size, channels: 4, background: '#2563eb' } })
  .composite([{ input: icon, gravity: 'centre' }])
  .png()
  .toFile(join(dir, 'farmpro-icon-maskable-512.png'));
const maskMeta = await sharp(join(dir, 'farmpro-icon-maskable-512.png')).metadata();
if (maskMeta.width !== size || maskMeta.height !== size || maskMeta.format !== 'png') {
  throw new Error('Maskable PNG validation failed');
}
console.log('farmpro-icon-maskable-512.png', '512x512');
