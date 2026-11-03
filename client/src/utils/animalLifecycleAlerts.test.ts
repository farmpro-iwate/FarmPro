import { describe, expect, it } from 'vitest';
import { findLifecycleAlertAnimal, isBreedingLifecycleSchedule, isLifecycleAlertSuppressed } from './animalLifecycleAlerts';

const asOf = '2026-11-03';
const death = { version: 1, death: { date: '2026-11-02', reason: '病死', note: '', recordedAt: '2026-11-02T03:00:00Z' } };
const culling = { version: 1, culling: { date: '2026-11-02', reason: '繁殖終了', note: '', route: 'fattening', recordedAt: '2026-11-02T03:00:00Z' } };
const cow = { id: 1, syncId: 'cow-a', earTag: '0123', identificationNumber: '0123456789', name: '同名', lifecycle: death };

describe('lifecycle alert eligibility', () => {
  it('ends every active alert for a confirmed deceased animal without changing source records', () => {
    const ledger = { cattle: [cow], calves: [] };
    const row = { targetNumber: '0123', targetName: '同名' };
    const before = JSON.stringify({ ledger, row });
    expect(isLifecycleAlertSuppressed(row, ledger, { asOf })).toBe(true);
    expect(isLifecycleAlertSuppressed(row, ledger, { asOf, breeding: true })).toBe(true);
    expect(JSON.stringify({ ledger, row })).toBe(before);
  });

  it.each(['fattening', 'sale'])('ends breeding only for culling route %s', route => {
    const ledger = { cattle: [{ ...cow, lifecycle: { ...culling, culling: { ...culling.culling, route } } }], calves: [] };
    expect(isLifecycleAlertSuppressed({ cowEarTag: '0123' }, ledger, { asOf, kind: 'cattle', breeding: true })).toBe(true);
    for (const row of [{ targetNumber: '0123' }, { targetType: '成牛', targetNumber: '0123' }]) {
      expect(isLifecycleAlertSuppressed(row, ledger, { asOf })).toBe(false);
    }
  });

  it('retains active state before the recorded event date and leaves ordinary notes untouched', () => {
    expect(isLifecycleAlertSuppressed({ targetNumber: '0123' }, { cattle: [cow], calves: [] }, { asOf: '2026-11-01' })).toBe(false);
    expect(isLifecycleAlertSuppressed({ targetNumber: '0123' }, { cattle: [{ ...cow, lifecycle: undefined, note: '死亡の相談' }], calves: [] }, { asOf })).toBe(false);
  });

  it('recognizes legacy calf death/other status and exact full temporary numbers', () => {
    const ledger = { cattle: [], calves: [{ id: 1, calfNumber: 'TEMP-unique-a', temporaryCalfNumber: 'TEMP-unique-a', name: '同名', managementStatus: '死亡・その他' }] };
    expect(isLifecycleAlertSuppressed({ targetNumber: 'TEMP-unique-a' }, ledger, { asOf })).toBe(true);
    expect(isLifecycleAlertSuppressed({ targetNumber: '仮-1102', targetName: '同名' }, ledger, { asOf })).toBe(false);
  });

  it('never hides another animal by name, shortened number, contradictory identity, or duplicate number', () => {
    const ledger = { cattle: [cow, { id: 2, earTag: '9999', name: '同名' }], calves: [] };
    for (const row of [
      { targetName: '同名' }, { targetNumber: '123' }, { targetNumber: '9999', targetName: '同名' },
      { cattleId: 2, targetNumber: '0123' }, { cowEarTag: '0123', targetNumber: '9999' },
      { animalSyncId: 'different-cow', targetNumber: '0123' },
      { cattleId: 1 }, { calfId: 1 }, { cowId: 1 },
    ]) expect(isLifecycleAlertSuppressed(row, ledger, { asOf })).toBe(false);
    const duplicated = { ...ledger, cattle: [...ledger.cattle, { id: 3, earTag: '0123' }] };
    expect(findLifecycleAlertAnimal({ targetNumber: '0123' }, duplicated)).toBeUndefined();
  });

  it('does not mix cattle and calf numbers without an explicit target kind', () => {
    const ledger = { cattle: [cow], calves: [{ id: 1, calfNumber: '0123', name: '子牛' }] };
    expect(isLifecycleAlertSuppressed({ targetNumber: '0123' }, ledger, { asOf })).toBe(false);
    expect(isLifecycleAlertSuppressed({ targetType: '子牛', targetNumber: '0123' }, ledger, { asOf })).toBe(false);
    expect(isLifecycleAlertSuppressed({ targetType: '成牛', targetNumber: '0123' }, ledger, { asOf })).toBe(true);
    expect(isLifecycleAlertSuppressed({ targetType: 'その他', targetNumber: '0123' }, ledger, { asOf })).toBe(false);
  });

  it('classifies stored breeding tasks and synchronization programs while keeping care and farm work', () => {
    for (const row of [{ title: '人工授精', scheduleType: 'その他' }, { scheduleType: '分娩' },
      { title: 'PG投与', synchronizationProgramId: 'program-a' }]) expect(isBreedingLifecycleSchedule(row)).toBe(true);
    for (const row of [{ title: '給餌', scheduleType: 'その他' }, { title: '治療', note: '繁殖終了' },
      { title: '削蹄' }, { title: '牛舎の清掃' }]) expect(isBreedingLifecycleSchedule(row)).toBe(false);
  });

  it('does not infer a unique target from a partially unreadable ledger', () => {
    const ledger = { cattle: [cow], calves: [], unavailable: ['calf' as const] };
    expect(isLifecycleAlertSuppressed({ targetNumber: '0123' }, ledger, { asOf })).toBe(false);
    expect(isLifecycleAlertSuppressed({ targetType: '成牛', targetNumber: '0123' }, ledger, { asOf })).toBe(true);
  });
});
