// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { deleteWithdrawnFarmDatabase, openFarmProDatabase } from './db';
import { claimLegacyDbForFarm } from './legacyDbOwnership';
import { saveRecord, getAllRecords } from './repository';
function session(id:string,farmId:string){localStorage.setItem('farmpro.authUser',JSON.stringify({id,farmId,farmName:farmId,name:id,email:`${id}@example.invalid`,plan:'free',active:true,role:'owner'}));}
beforeEach(()=>{localStorage.clear();});
it('actual withdrawal deletes only the owned scoped database and blocks stale reopening',async()=>{
  session('owner','withdrawal-a');await saveRecord('cattle',{id:'cow-a'});
  session('other','withdrawal-b');await saveRecord('cattle',{id:'cow-b'});
  session('owner','withdrawal-a');await deleteWithdrawnFarmDatabase('owner','withdrawal-a');
  expect(()=>openFarmProDatabase()).toThrow('退会済み');
  session('other','withdrawal-b');expect((await getAllRecords('cattle')).map(x=>x.id)).toEqual(['cow-b']);
  const databases=await indexedDB.databases();expect(databases.some(x=>x.name==='farmpro-local-farm-withdrawal-a')).toBe(false);
});
it('another current account prevents any deletion or marker for the target farm',async()=>{
  session('owner','withdrawal-c');await saveRecord('cattle',{id:'cow-c'});session('other','withdrawal-d');
  await expect(deleteWithdrawnFarmDatabase('owner','withdrawal-c')).rejects.toThrow('ログイン情報が変わった');
  expect(localStorage.getItem('farmpro.withdrawnFarm.withdrawal-c')).toBeNull();
  session('owner','withdrawal-c');expect((await getAllRecords('cattle')).map(x=>x.id)).toEqual(['cow-c']);
});
it('valid legacy ownership allows deleting that owned database; unrelated legacy data is retained',async()=>{
  session('legacy-owner','withdrawal-legacy');claimLegacyDbForFarm('withdrawal-legacy');await saveRecord('cattle',{id:'legacy-cow'});
  session('other','withdrawal-scope');await saveRecord('cattle',{id:'scope-cow'});await deleteWithdrawnFarmDatabase('other','withdrawal-scope');
  session('legacy-owner','withdrawal-legacy');expect((await getAllRecords('cattle')).map(x=>x.id)).toEqual(['legacy-cow']);
  await deleteWithdrawnFarmDatabase('legacy-owner','withdrawal-legacy');expect(localStorage.getItem('farmpro.legacyDbOwnerFarmId')).toBeNull();
  expect((await indexedDB.databases()).some(x=>x.name==='farmpro-local')).toBe(false);
});
