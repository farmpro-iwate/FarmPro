import { describe, expect, it } from 'vitest';
import { canEditLegacyTreatmentWithoutSource, canEditLegacyTransferWithoutSource } from './legacyInventoryCompatibility';

describe('existing records before inventory support', () => {
  it('allows note edits without making up treatment stock source', () => {
    const record = { medicine: '抗生剤', medicineSource: undefined, medicineInventoryMovementId: undefined };
    expect(canEditLegacyTreatmentWithoutSource(record, '抗生剤')).toBe(true);
    expect(canEditLegacyTreatmentWithoutSource(record, '別の薬剤')).toBe(false);
    expect(canEditLegacyTreatmentWithoutSource(null, '抗生剤')).toBe(false);
  });
  it('allows unchanged legacy transfer and requires source for a newly selected embryo', () => {
    const record = { embryoNumber: 'ET-A', transferDate: '2026-10-01', embryoSource: undefined, embryoInventoryMovementId: undefined };
    expect(canEditLegacyTransferWithoutSource(record, 'ET-A', '2026-10-01')).toBe(true);
    expect(canEditLegacyTransferWithoutSource(record, 'ET-B', '2026-10-01')).toBe(false);
    expect(canEditLegacyTransferWithoutSource(record, 'ET-A', '2026-10-02')).toBe(false);
  });
});