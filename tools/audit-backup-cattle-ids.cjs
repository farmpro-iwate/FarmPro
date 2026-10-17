#!/usr/bin/env node
// Read-only FarmPro backup comparison. Does not write to either input or database.
const fs = require('node:fs');
const [aPath, bPath] = process.argv.slice(2);
if (!aPath || !bPath) {
  console.error('Usage: node tools/audit-backup-cattle-ids.cjs older.json newer.json');
  process.exit(2);
}
const A = JSON.parse(fs.readFileSync(aPath, 'utf8'));
const B = JSON.parse(fs.readFileSync(bPath, 'utf8'));
for (const file of [A, B]) {
  if (file.format !== 'farmpro-backup' || !Array.isArray(file.stores?.cattle)) {
    throw Error('Invalid FarmPro backup');
  }
}
if (A.farm?.id && B.farm?.id && A.farm.id !== B.farm.id) throw Error('Different farm IDs');
const key = r => String(r.identificationNumber || '').trim();
const index = rows => new Map(rows.filter(r => key(r)).map(r => [key(r), r]));
const byA = index(A.stores.cattle);
const byB = index(B.stores.cattle);
const idsA = new Map(A.stores.cattle.map(r => [String(r.id), key(r)]));
const onlyA = [...byA].filter(([k]) => !byB.has(k)).map(([k,r]) => ({identificationNumber:k,earTag:r.earTag,name:r.name}));
const onlyB = [...byB].filter(([k]) => !byA.has(k)).map(([k,r]) => ({identificationNumber:k,earTag:r.earTag,name:r.name}));
const collisions = B.stores.cattle.filter(r => idsA.has(String(r.id)) && idsA.get(String(r.id)) !== key(r)).map(r => ({id:r.id,first:idsA.get(String(r.id)),second:key(r)}));
const duplicates = rows => {
  const seen = new Set();
  return rows.map(key).filter(k => k && (seen.has(k) || !seen.add(k)));
};
console.log(JSON.stringify({
  farmIdMatches: A.farm?.id === B.farm?.id,
  exportedAt: [A.exportedAt, B.exportedAt],
  cattleCounts: [A.stores.cattle.length, B.stores.cattle.length],
  onlyFirst: onlyA, onlySecond: onlyB, localIdCollisions: collisions,
  duplicateIdentificationNumbers: [duplicates(A.stores.cattle), duplicates(B.stores.cattle)],
  automaticMergeSafe: false
}, null, 2));
