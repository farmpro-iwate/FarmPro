import { recordToInput, type SaleInput, type SaleRecord } from '../services/salesApi';
import { isSameSaleAnimal } from './saleDuplicateGuard';

/** Read-only selection. Ambiguous matches must never cause an automatic update. */
export function findMatchingPlannedSales(rows: SaleRecord[], input: SaleInput): SaleRecord[] {
  if (input.targetType !== '子牛' || input.status !== '販売済み') return [];
  return rows.filter(row => row.status === '出荷予定' && isSameSaleAnimal(row, input));
}

/** Preserve known planning details unless the confirmed sale provides a new value. */
export function promotePlannedSaleInput(planned: SaleRecord, confirmed: SaleInput): SaleInput {
  const previous = recordToInput(planned);
  return {
    ...previous,
    ...confirmed,
    targetNumber: confirmed.targetNumber || previous.targetNumber,
    targetName: confirmed.targetName || previous.targetName,
    sex: confirmed.sex || previous.sex,
    birthday: confirmed.birthday || previous.birthday,
    motherName: confirmed.motherName || previous.motherName,
    calfId: confirmed.calfId || previous.calfId,
    cattleId: confirmed.cattleId || previous.cattleId,
    calvingId: confirmed.calvingId || previous.calvingId,
    motherCowId: confirmed.motherCowId || previous.motherCowId,
    shippingPlanDate: confirmed.shippingPlanDate || previous.shippingPlanDate,
    shippingDate: confirmed.shippingDate || previous.shippingDate,
    buyer: confirmed.buyer || previous.buyer,
    marketName: confirmed.marketName || previous.marketName,
    memo: confirmed.memo || previous.memo,
    status: '販売済み',
  };
}
