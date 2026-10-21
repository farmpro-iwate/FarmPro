/**
 * Pure draft builder for livestock-market settlement slips.
 * This module NEVER persists records. The operator must review and save in the
 * existing Sales, Expenses and Vaccines screens after animal/date verification.
 */
export type VaccineDraft = {
  vaccineName: string;
  vaccinationDate: string | null;
  verified: boolean;
};

export type SettlementVaccineDraft = {
  injectionCostYen: number;
  expenseCategory: '医薬品費';
  expenseDescription: string;
  vaccines: VaccineDraft[];
  readyForVaccineSave: boolean;
  warnings: string[];
};

/** User-confirmed vaccine names are inputs, not inferred from "注射代". */
export function buildSettlementVaccineDraft(input: {
  injectionCostYen: number;
  confirmedVaccineNames: readonly string[];
  verifiedVaccinationDate?: string | null;
  animalVerified: boolean;
}): SettlementVaccineDraft {
  const names = [...new Set(input.confirmedVaccineNames.map((v) => v.trim()).filter(Boolean))];
  const date = input.verifiedVaccinationDate?.trim() || null;
  const validDate = !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  const costValid = Number.isSafeInteger(input.injectionCostYen) && input.injectionCostYen >= 0;
  const warnings: string[] = [];
  if (!costValid) warnings.push('注射代の金額を確認してください');
  if (!input.animalVerified) warnings.push('対象牛の照合が必要です');
  if (!validDate) warnings.push('接種日が未確認です。接種済み履歴は保存しないでください');
  if (names.length === 0) warnings.push('ワクチン名が未確認です');

  return {
    injectionCostYen: input.injectionCostYen,
    expenseCategory: '医薬品費',
    expenseDescription: names.length ? names.join('・') + ' ワクチン（精算書注射代）' : 'ワクチン（精算書注射代）',
    vaccines: names.map((vaccineName) => ({
      vaccineName,
      vaccinationDate: validDate ? date : null,
      verified: input.animalVerified && validDate,
    })),
    readyForVaccineSave: input.animalVerified && validDate && names.length > 0 && costValid,
    warnings,
  };
}
// Financial rule: injectionCostYen is ONE expense/settlement deduction.
// Never split it into multiple vaccine expenses or add it twice to totals.
