import { describe, expect, it } from 'vitest';
import type { FarmProBackup } from '../storage/backup';
import { planCloudOnlyBreedingAdditions } from './syncRecoveryBreeding';
const backup = (schemaVersion: number, breedings: Array<Record<string, unknown>>): FarmProBackup => ({
  format: 'farmpro-backup', schemaVersion, appVersion: 'test',
  exportedAt: '2026-10-30T00:00:00Z', farm: { id: 'farm-1', name: 'test' },
  stores: { cattle: [{ id: 12, earTag: '6220', identificationNumber: '1377662204' }],
    breedings, } as unknown as FarmProBackup['stores'],
});
const id = 'f534fe48-3534-4559-aaee-deb5f73570ee';
describe('reviewed breeding recovery', () => {
  it('accepts a cloud-only breeding event with verified cow and unique date', () => {
    const result = planCloudOnlyBreedingAdditions(backup(4, []),
      backup(3, [{id, cowEarTag:'6220', heatDate:'2025-09-21', inseminationDate:'2025-12-21'}]));
    expect(result.eligible).toHaveLength(1);
    expect(result.blocked).toHaveLength(0);
  });
  it('blocks duplicate event on different IDs', () => {
    const row = { cowEarTag:'6220', heatDate:'2025-09-21', inseminationDate:'2025-12-21' };
    const result = planCloudOnlyBreedingAdditions(backup(4, [{id:'new-id', ...row}]),
      backup(3, [{id, ...row}]));
    expect(result.eligible).toHaveLength(0);
    expect(result.blocked).toHaveLength(1);
  });
  it('blocks missing cow and wrong farm', () => {
    const cloud = backup(3, [{id, cowEarTag:'9999', heatDate:'2025-09-21'}]);
    expect(planCloudOnlyBreedingAdditions(backup(4, []), cloud).blocked).toHaveLength(1);
    expect(planCloudOnlyBreedingAdditions(backup(4, []),
      {...cloud, farm:{id:'another',name:'another'}}).eligible).toHaveLength(0);
  });
});