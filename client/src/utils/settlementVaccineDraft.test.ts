import { describe, expect, it } from 'vitest';
import { buildSettlementVaccineDraft } from './settlementVaccineDraft';

const base = {
  injectionCostYen: 3640,
  confirmedVaccineNames: ['五種混合', 'ヘモフィルス'],
  animalVerified: true,
};

describe('settlement vaccine draft', () => {
  it('keeps two vaccine names but just one shared expense amount', () => {
    const result = buildSettlementVaccineDraft({ ...base, verifiedVaccinationDate: '2026-10-20' });
    expect(result.vaccines.map((v) => v.vaccineName)).toEqual(['五種混合', 'ヘモフィルス']);
    expect(result.injectionCostYen).toBe(3640);
    expect(result.expenseCategory).toBe('医薬品費');
    expect(result.readyForVaccineSave).toBe(true);
  });

  it('does not permit saving vaccination records without a verified date', () => {
    const result = buildSettlementVaccineDraft(base);
    expect(result.readyForVaccineSave).toBe(false);
    expect(result.vaccines.every((v) => v.vaccinationDate === null && !v.verified)).toBe(true);
  });

  it('does not permit saving when animal has not been identified', () => {
    const result = buildSettlementVaccineDraft({
      ...base, animalVerified: false, verifiedVaccinationDate: '2026-10-20',
    });
    expect(result.readyForVaccineSave).toBe(false);
  });

  it('rejects impossible dates and invalid amounts', () => {
    const result = buildSettlementVaccineDraft({
      ...base, verifiedVaccinationDate: '2026-02-30', injectionCostYen: -1,
    });
    expect(result.readyForVaccineSave).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('deduplicates vaccine names without inventing a cost split', () => {
    const result = buildSettlementVaccineDraft({
      ...base, confirmedVaccineNames: ['五種混合', ' 五種混合 ', 'ヘモフィルス'],
      verifiedVaccinationDate: '2026-10-20',
    });
    expect(result.vaccines).toHaveLength(2);
    expect(result.injectionCostYen).toBe(3640);
  });
});
