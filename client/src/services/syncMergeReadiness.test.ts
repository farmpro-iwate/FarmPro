import { describe, expect, it } from 'vitest';
import type { FarmProBackup } from '../storage/backup';
import { inspectSyncMergeReadiness } from './syncMergeReadiness';

const snapshot = (stores: Partial<FarmProBackup['stores']>, farmId = 'farm-1') => ({
  format: 'farmpro-backup', schemaVersion: 4, appVersion: '1.7.0',
  exportedAt: '2026-10-29T00:00:00Z', farm: { id: farmId, name: '試験農場' },
  stores: { cattle: [], calves: [], expenses: [], supplyInventory: [], ...stores },
} as FarmProBackup);

describe('read-only sync merge assessment', () => {
  it('detects both sides unique records and changed ID without changing inputs', () => {
    const pc = snapshot({ cattle: [{ id: 1, earTag: '123' }, { id: 2, earTag: '456' }], supplyInventory: [{ id: 'stock-a' }] });
    const cloud = snapshot({ cattle: [{ id: 1, earTag: '999' }, { id: 3, earTag: '789' }] });
    const before = JSON.stringify([pc, cloud]);
    const report = inspectSyncMergeReadiness(pc, cloud);
    expect(report).toMatchObject({ safeToAutoMerge: false, missingFromCloud: 2, missingFromDevice: 1, sameIdDifferentContent: 1, farmMismatch: false });
    expect(report.identityRiskStores).toContain('cattle');
    expect(JSON.stringify([pc, cloud])).toBe(before);
  });
  it('blocks trust in cross-farm snapshots', () => {
    expect(inspectSyncMergeReadiness(snapshot({}), snapshot({}, 'other-farm')).farmMismatch).toBe(true);
  });
});