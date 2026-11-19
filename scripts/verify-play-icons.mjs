#!/usr/bin/env node
// Verify actual PNG file headers and PWA manifest. No web calls or data writes.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const root='client/public';
const expected=[
  {name:'farmpro-icon-192.png',size:192,purpose:'any'},
  {name:'farmpro-icon-512.png',size:512,purpose:'any'},
  {name:'farmpro-icon-maskable-512.png',size:512,purpose:'maskable'},
];
const manifest=JSON.parse(await readFile(join(root,'manifest.webmanifest'),'utf8'));
if(manifest.start_url!=='/' || manifest.scope!=='/' || manifest.display!=='standalone'){
  throw Error('Unexpected production origin settings');
}
for(const e of expected){
  const file=await readFile(join(root,e.name));
  const signature='89504e470d0a1a0a';
  if(file.length<33 || file.subarray(0,8).toString('hex')!==signature)throw Error('Invalid PNG signature: '+e.name);
  if(file.toString('ascii',12,16)!=='IHDR')throw Error('Missing PNG IHDR: '+e.name);
  const width=file.readUInt32BE(16),height=file.readUInt32BE(20);
  if(width!==e.size || height!==e.size)throw Error('Incorrect PNG dimensions: '+e.name);
  const icon=manifest.icons.find(x=>x.src==='/'+e.name && x.type==='image/png' && (x.sizes||'').split(/\s+/).includes(e.size+'x'+e.size) && (x.purpose||'').split(/\s+/).includes(e.purpose));
  if(!icon)throw Error('Manifest missing valid icon: '+e.name);
  console.log('PASS',e.name,width+'x'+height,e.purpose);
}
console.log('PASS production-root manifest entries and PNG dimensions');
