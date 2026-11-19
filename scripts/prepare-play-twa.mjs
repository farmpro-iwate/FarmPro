#!/usr/bin/env node
/**
 * Prepare an isolated Bubblewrap TWA configuration from the current Android test
 * branch. No signing key creation, install, deployment, or network writes.
 * This file intentionally REQUIRES an explicit package ID and signing-key alias.
 *
 * Usage:
 * node scripts/prepare-play-twa.mjs jp.example.farmpro app-signing.jks farmpro
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const [packageId, signingPath, signingAlias] = process.argv.slice(2);
if (!packageId || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(packageId)) {
  console.error('Usage: node scripts/prepare-play-twa.mjs <confirmed.package.id> <local-key-path> <key-alias>');
  process.exit(2);
}
if (!signingPath || !signingAlias || /[\\/]/.test(signingAlias)) {
  console.error('Explicit signing-key path and alias required; never commit secret key material.');
  process.exit(2);
}
const manifest=JSON.parse(await fs.readFile('client/public/manifest.webmanifest','utf8'));
if (manifest.start_url !== '/' || manifest.scope !== '/' || manifest.display !== 'standalone') throw Error('Not a production-root manifest');
const findIcon=(size,purpose)=>manifest.icons.find(i=>i.type==='image/png' && i.sizes===size && (i.purpose||'').split(/\s+/).includes(purpose));
const any=findIcon('512x512','any');
const mask=findIcon('512x512','maskable');
if(!any || !mask) throw Error('Generate and validate PNG icons first');
const origin='https://app.farmpro-app.jp';
const cfg={
  packageId,
  host:'app.farmpro-app.jp',
  name:manifest.name,
  launcherName:manifest.short_name,
  display:'standalone',
  themeColor:manifest.theme_color,
  backgroundColor:manifest.background_color,
  navigationColor:'#000000',
  enableNotifications:false,
  startUrl:'/',
  iconUrl:new URL(any.src,origin).href,
  maskableIconUrl:new URL(mask.src,origin).href,
  splashScreenFadeOutDuration:300,
  signingKey:{path:signingPath,alias:signingAlias},
  appVersionCode:1,
  appVersion:'0.1.0',
  shortcuts:[],
  generatorApp:'bubblewrap-cli',
  webManifestUrl:origin+'/manifest.webmanifest',
  fallbackType:'customtabs',
  features:{},
  enableSiteSettingsShortcut:true,
  isChromeOSOnly:false,
  additionalTrustedOrigins:[]
};
const dir='play-build-local';
await fs.mkdir(dir,{recursive:true});
await fs.writeFile(path.join(dir,'twa-manifest.json'),JSON.stringify(cfg,null,2)+'\n',{flag:'wx'});
console.log('Created local-only TWA candidate: '+dir+'/twa-manifest.json');
console.log('Not signed or built. This candidate does not establish Play billing compliance or origin verification.');
