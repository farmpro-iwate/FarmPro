import { describe, expect, it } from 'vitest';
import type { FarmProBackup } from '../storage/backup';
import { stageNonDestructiveCloudMerge } from './syncCloudStaging';
const backup = (schemaVersion:number, stores:Partial<FarmProBackup['stores']>):FarmProBackup => ({
 format:'farmpro-backup',schemaVersion,appVersion:'test',exportedAt:'2026-10-30T00:00:00Z',
 farm:{id:'farm-one',name:'Farm'},stores:{masters:[],cattle:[],expenses:[],metadata:[],...stores} as FarmProBackup['stores'],
});
describe('non-destructive cloud staging',()=>{
 it('stages distinct masters without overwriting existing cloud rows',()=>{
  const local=backup(4,{masters:[{id:1,syncId:'sire:a',name:'A updated'},{id:2,syncId:'sire:b',name:'B'}]});
  const remote=backup(3,{masters:[{id:1,syncId:'sire:a',name:'A old'}]});
  const original=JSON.stringify([local,remote]);
  const result=stageNonDestructiveCloudMerge(local,remote);
  expect(result.staged).toBe(1);
  expect(result.draft?.stores.masters).toEqual([{id:1,syncId:'sire:a',name:'A old'},{id:2,syncId:'sire:b',name:'B'}]);
  expect(result.canUploadAutomatically).toBe(false);
  expect(JSON.stringify([local,remote])).toBe(original);
 });
 it('blocks cattle and expenses from automatic staging',()=>{
  const result=stageNonDestructiveCloudMerge(backup(4,{cattle:[{id:12,earTag:'6220'}],expenses:[{id:3,amount:100}]}),backup(3,{}));
  expect(result.staged).toBe(0);
  expect(result.blocked).toHaveLength(2);
 });
 it('rejects another farm',()=>{
  const remote={...backup(3,{}),farm:{id:'other',name:'Other'}};
  expect(stageNonDestructiveCloudMerge(backup(4,{}),remote).draft).toBeNull();
 });
});

describe('same ID conflict reporting', () => {
 it('reports conflicting existing cloud record and keeps cloud contents', () => {
  const local=backup(4,{cattle:[{id:1,earTag:'6220'}]});
  const remote=backup(3,{cattle:[{id:1,earTag:'5754'}]});
  const result=stageNonDestructiveCloudMerge(local,remote);
  expect(result.staged).toBe(0);
  expect(result.blocked.some(x=>x.storeName==='cattle' && x.id==='1')).toBe(true);
  expect(result.draft?.stores.cattle).toEqual(remote.stores.cattle);
 });
});
