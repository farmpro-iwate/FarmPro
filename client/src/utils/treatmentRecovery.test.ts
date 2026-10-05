import { describe, expect, it } from 'vitest';
import { isTreatmentRecovered } from './treatmentRecovery';

const active = { id: 1, targetNumber: '6891', targetName: 'あいうえお', treatmentDate: '2026-10-03', progress: '治療中' };
const recovery = { ...active, id: 2, treatmentDate: '2026-10-04', progress: '回復' };

describe('treatment recovery', () => {
  it('closes older treatment without a next date and does not mutate history', () => {
    const history = [{ ...active }, { ...recovery }];
    expect(isTreatmentRecovered(history[0], history)).toBe(true);
    expect(history[0].progress).toBe('治療中');
    expect(history).toHaveLength(2);
  });

  it('does not close another animal or a different kind of treatment', () => {
    expect(isTreatmentRecovered(active, [active, { ...recovery, targetNumber: '7001' }])).toBe(false);
    expect(isTreatmentRecovered(active, [active, { ...recovery, recordType: '繁殖治療' }])).toBe(false);
  });

  it('does not reactivate old treatment after a new illness starts', () => {
    const newIllness = { ...active, id: 3, treatmentDate: '2026-10-05' };
    const rows = [active, recovery, newIllness];
    expect(isTreatmentRecovered(active, rows)).toBe(true);
    expect(isTreatmentRecovered(newIllness, rows)).toBe(false);
  });

  it('uses creation order for recovery and recurrence on the same day', () => {
    const rows = [active, { ...recovery, treatmentDate: active.treatmentDate }, { ...active, id: 3 }];
    expect(isTreatmentRecovered(rows[0], rows)).toBe(true);
    expect(isTreatmentRecovered(rows[2], rows)).toBe(false);
  });

  it('follows the original course across an ear-tag change and across local sync ids', () => {
    const old = { ...active, targetNumber: 'OLD-123' };
    const source = { ...old, id: 10, syncRecordId: 'treatment:remote-source' };
    const recovered = { ...recovery, treatmentCourseId: 'treatment:remote-source' };
    const rows = [recovered, source, old];
    expect(isTreatmentRecovered(old, rows)).toBe(true);
    expect(isTreatmentRecovered(source, rows)).toBe(true);
  });

  it('keeps separate explicit courses independent', () => {
    expect(isTreatmentRecovered({ ...active, treatmentCourseId: 'course-A' }, [
      { ...active, treatmentCourseId: 'course-A' },
      { ...recovery, treatmentCourseId: 'course-B' },
    ])).toBe(false);
  });

  it('does not guess between animals with the same name and a missing ear tag', () => {
    const unnamedNumber = { ...active, targetNumber: '' };
    expect(isTreatmentRecovered(unnamedNumber, [unnamedNumber, recovery, { ...active, id: 3, targetNumber: '7001' }])).toBe(false);
  });
});
