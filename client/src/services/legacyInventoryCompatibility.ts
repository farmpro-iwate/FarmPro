import type { Treatment } from '../types/treatment';
import type { Breeding } from '../types/breeding';

/**
 * Pre-inventory records did not track where medicine or embryos came from.
 * An edit to unrelated fields must never invent a source or deduct stock.
 */
export function canEditLegacyTreatmentWithoutSource(
  original: Pick<Treatment, 'medicine' | 'medicineSource' | 'medicineInventoryMovementId'> | null,
  currentMedicine: string,
): boolean {
  return original !== null &&
    !original.medicineSource &&
    !original.medicineInventoryMovementId &&
    (original.medicine || '').trim() === currentMedicine.trim();
}

export function canEditLegacyTransferWithoutSource(
  original: Pick<Breeding, 'embryoNumber' | 'transferDate' | 'embryoSource' | 'embryoInventoryMovementId'> | null,
  currentEmbryoNumber: string,
  currentTransferDate: string,
): boolean {
  return original !== null &&
    !original.embryoSource &&
    !original.embryoInventoryMovementId &&
    (original.embryoNumber || '').trim() === currentEmbryoNumber.trim() &&
    (original.transferDate || '') === currentTransferDate;
}
