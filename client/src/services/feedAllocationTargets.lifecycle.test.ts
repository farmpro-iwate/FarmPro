import { describe, expect, it, vi } from 'vitest';
import { buildCalfGroupTargets, buildCattleGroupTargets } from './feedAllocationTargets';
import type { Calf } from '../types/calf';
import type { Cattle } from '../types/cattle';

vi.mock('./api', () => ({ getCattleList: vi.fn() }));
vi.mock('./calfApi', () => ({ getCalfList: vi.fn() }));

describe('飼料按分の死亡・廃用対象', () => {
  const death = { version: 1 as const, death: { date: '2026-10-01', reason: '試験', note: '', recordedAt: '2026-10-01T00:00:00Z' } };
  const culling = { version: 1 as const, culling: { date: '2026-09-01', reason: '試験', note: '', route: 'fattening' as const, recordedAt: '2026-09-01T00:00:00Z' } };

  it('死亡以後の成牛飼料対象から除外し、廃用肥育牛は在籍のまま含める', () => {
    const cattle = [
      { id: 1, name: '死亡試験牛', earTag: '0001', lifecycle: death },
      { id: 2, name: '廃用試験牛', earTag: '0002', lifecycle: culling },
      { id: 3, name: '在籍試験牛', earTag: '0003' },
    ] as Cattle[];
    expect(buildCattleGroupTargets(cattle, 'breedingCattleGroup', '2026-10-02').map(row => row.animalId)).toEqual(['2', '3']);
    expect(buildCattleGroupTargets(cattle, 'breedingCattleGroup', '2026-09-30').map(row => row.animalId)).toEqual(['1', '2', '3']);
  });

  it('旧状態とstructured死亡の子牛は除外し、廃用だけなら飼料対象に残す', () => {
    const calves = [
      { id: 1, calfNumber: '0001', birthday: '2026-01-01', managementStatus: '育成中', lifecycle: death },
      { id: 2, calfNumber: '0002', birthday: '2026-01-01', managementStatus: '死亡・その他' },
      { id: 3, calfNumber: '0003', birthday: '2026-01-01', managementStatus: '育成中', lifecycle: culling },
    ] as Calf[];
    expect(buildCalfGroupTargets(calves, '2026-10-02').map(row => row.animalId)).toEqual(['3']);
  });
});
