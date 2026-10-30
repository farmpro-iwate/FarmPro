import { describe, expect, it } from 'vitest';
import type { FarmProBackup } from '../storage/backup';
import { buildSyncRecoveryDraft } from './syncRecoveryDraft';
const backup = (schemaVersion: number, stores: Partial<FarmProBackup['stores']>): FarmProBackup =>
  ({format:'farmpro-backup',schemaVersion,appVersion:'test',exportedAt:'2026-10-30T00:00:00Z',
    farm:{id:'farm-1',name:'test'},stores:{cattle:[],calves:[],expenses:[],...stores} as FarmProBackup['stores']});
describe('v3/v4 recovery draft', () => {
  it('separates a cow with a different internal ID, and never writes', () => {
    const local=backup(4,{cattle:[{id:12,identificationNumber:'1377662204'}]});
    const cloud=backup(3,{cattle:[{id:1,identificationNumber:'1377662204'}]});
    const previous=JSON.stringify([local,cloud]);
    const draft=buildSyncRecoveryDraft(local,cloud);
    expect(draft.rows.find(r=>r.store==='cattle')?.status).toBe('same-identity-different-id');
    expect(draft.reviewAdditions.cattle).toBeUndefined();
    expect(draft.canApplyAutomatically).toBe(false);
    expect(JSON.stringify([local,cloud])).toBe(previous);
  });
  it('detects an ID collision and separately identifies candidate-only records', () => {
    const local=backup(4,{calves:[{id:1,identificationNumber:'111'}],expenses:[]});
    const cloud=backup(3,{calves:[{id:1,identificationNumber:'222'}],expenses:[{id:'expense-x',amount:5}]});
    const result=buildSyncRecoveryDraft(local,cloud);
    expect(result.rows.find(r=>r.store==='calves')?.status).toBe('changed');
    expect(result.rows.find(r=>r.store==='expenses')?.status).toBe('cloud-only');
    expect(result.reviewAdditions.expenses).toHaveLength(1);
  });
  it('refuses different farms', () => {
    const local=backup(4,{});
    const cloud={...backup(3,{}),farm:{id:'another',name:'another'}};
    expect(()=>buildSyncRecoveryDraft(local,cloud)).toThrow('農場ID');
  });
});
