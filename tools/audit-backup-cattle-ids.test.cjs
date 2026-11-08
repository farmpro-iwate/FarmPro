const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const script = path.join(__dirname, 'audit-backup-cattle-ids.cjs');
function run(a, b) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmpro-audit-'));
  try {
    const f1 = path.join(dir, 'a.json'), f2 = path.join(dir, 'b.json');
    fs.writeFileSync(f1, JSON.stringify(a)); fs.writeFileSync(f2, JSON.stringify(b));
    return JSON.parse(execFileSync(process.execPath, [script, f1, f2], { encoding: 'utf8' }));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function backup(cattle, calves = [], sales = []) {
  return { format: 'farmpro-backup', farm: {id: 'farm-test'}, stores: {cattle, calves, sales} };
}
test('finds additional cattle using identification number rather than local ID', () => {
  const a = backup([{id: 1, identificationNumber:'123',name:'A'}]);
  const b = backup([{id: 2, identificationNumber:'123',name:'A'},{id: 1, identificationNumber:'456',name:'B'}]);
  const r = run(a,b);
  assert.deepEqual(r.onlyFirst,[]); assert.equal(r.onlySecond[0].name,'B');
  assert.equal(r.localIdCollisions.length,1); assert.equal(r.automaticMergeSafe,false);
});
test('detects cancelled sale whose calfId resolves to another calf', () => {
  const a = backup([], [{id: 1, name:'Other',earTag:'9999'},{id:2,name:'Target',earTag:'5754'}],[{id:'s',status:'取消',calfId:1,targetNumber:'5754',targetType:'子牛'}]);
  assert.equal(run(a,a).saleReferenceConflicts[0][0].matchingName,'Target');
});
test('does not flag sale with matching ear tag', () => {
  const a = backup([], [{id:1,name:'Target',earTag:'5754'}],[{id:'s',calfId:1,targetNumber:'5754',targetType:'子牛'}]);
  assert.equal(run(a,a).saleReferenceConflicts[0].length,0);
});
test('refuses different farm IDs', () => {
  const a=backup([]),b=backup([]);b.farm.id='other';assert.throws(()=>run(a,b));
});
