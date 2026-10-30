import { describe, expect, it } from 'vitest';
import type { FarmProBackup } from '../storage/backup';
import { buildSafeSyncMergeCandidate, proposeLosslessSyncMerge } from './syncLosslessMerge';

function backup(stores: Partial<FarmProBackup['stores']>, farmId='farm-one'): FarmProBackup {
  return {format:'farmpro-backup',schemaVersion:4,appVersion:'test',exportedAt:'2026-10-29T00:00:00Z',
    farm:{id:farmId,name:'test'},stores:{cattle:[],expenses:[],supplyInventory:[],...stores} as FarmProBackup['stores']};
}

describe('lossless sync proposal', () => {
  it('preserves both sources and treats unique stock and cattle as unresolved', () => {
    const device=backup({cattle:[{id:1,earTag:'101'}],supplyInventory:[{id:'a',quantity:1}]});
    const cloud=backup({cattle:[{id:2,earTag:'101'}],supplyInventory:[{id:'b',quantity:2}]});
    const unchanged=JSON.stringify([device,cloud]);
    const result=proposeLosslessSyncMerge(device,cloud);
    expect(result.additionsToCloud).toBe(2);
    expect(result.additionsToDevice).toBe(2);
    expect(result.unresolved).toHaveLength(4);
    expect(result.canApplyAutomatically).toBe(false);
    expect(JSON.stringify([device,cloud])).toBe(unchanged);
  });
  it('detects identity collision and farm mismatch', () => {
    const device=backup({expenses:[{id:'x',amount:'100'}]});
    const cloud=backup({expenses:[{id:'x',amount:'200'}]},'other');
    const result=proposeLosslessSyncMerge(device,cloud);
    expect(result.unresolved.some(row=>row.reason.includes('農場ID'))).toBe(true);
    expect(result.unresolved.some(row=>row.reason.includes('同一ID'))).toBe(true);
  });
});

describe('safe sync candidate', () => {
  it('refuses conflicting cattle rather than selecting a winner', () => {
    const device = backup({ cattle: [{ id: 1, earTag: '101' }] });
    const cloud = backup({ cattle: [{ id: 2, earTag: '101' }] });
    expect(buildSafeSyncMergeCandidate(device, cloud)).toBeNull();
  });
  it('refuses different business values on the same id', () => {
    const device = backup({ expenses: [{ id: 'a', amount: '100' }] });
    const cloud = backup({ expenses: [{ id: 'a', amount: '200' }] });
    expect(buildSafeSyncMergeCandidate(device, cloud)).toBeNull();
  });
  it('accepts identical records differing only in cloud transport metadata', () => {
    const device = backup({ cattle: [{ id: 1, earTag: '101', cloudSyncPending: true }] });
    const cloud = backup({ cattle: [{ id: 1, earTag: '101', cloudUpdatedAt: '2026-10-29' }] });
    const result = buildSafeSyncMergeCandidate(device, cloud);
    expect(result?.stores.cattle).toHaveLength(1);
    expect(result?.stores.cattle[0].earTag).toBe('101');
  });
  it('rejects farm id or schema mismatches', () => {
    const device = backup({});
    expect(buildSafeSyncMergeCandidate(device, backup({}, 'other'))).toBeNull();
    expect(buildSafeSyncMergeCandidate(device, {...backup({}), schemaVersion: 3})).toBeNull();
  });
});

describe('cross-device natural identities', () => {
  it('flags a cow with the same identification number and different local id', () => {
    const device = backup({ cattle: [{ id: 12, identificationNumber: '1377662204' }] });
    const cloud = backup({ cattle: [{ id: 1, identificationNumber: '1377662204' }] });
    expect(proposeLosslessSyncMerge(device, cloud).unresolved.some(x => x.reason.includes('異なる内部ID'))).toBe(true);
    expect(buildSafeSyncMergeCandidate(device, cloud)).toBeNull();
  });
  it('flags the same calving calf under different primary keys', () => {
    const device = backup({ calves: [{ id: 9, calvingId: 'calving-1' }] });
    const cloud = backup({ calves: [{ id: 'calf-legacy', calvingId: 'calving-1' }] });
    expect(proposeLosslessSyncMerge(device, cloud).unresolved.some(x => x.reason.includes('異なる内部ID'))).toBe(true);
  });
});
