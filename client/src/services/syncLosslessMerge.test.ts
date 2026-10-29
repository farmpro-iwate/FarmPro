import { describe, expect, it } from 'vitest';
import type { FarmProBackup } from '../storage/backup';
import { proposeLosslessSyncMerge } from './syncLosslessMerge';

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
