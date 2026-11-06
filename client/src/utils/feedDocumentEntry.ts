import type { FeedInventoryInput, FeedInventoryRecord } from '../services/feedInventoryApi';

function nameKey(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function stockQuantity(record: FeedInventoryInput) {
  const quantity = Number(record.quantity);
  if (!record.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0) return null;
  if (record.unit !== '袋') return { unit: record.unit, quantity };
  const weight = Number(record.bagWeightKg);
  const total = Number(record.totalWeightKg);
  const quantityKg = weight > 0 ? quantity * weight : total;
  return Number.isFinite(quantityKg) && quantityKg > 0 ? { unit: 'kg', quantity: quantityKg } : null;
}

/** Advisory only: a delivery note and its invoice can describe the same stock. */
export function findPotentialFeedDocumentDuplicates(input: FeedInventoryInput, records: FeedInventoryRecord[]) {
  const incoming = stockQuantity(input);
  if (!incoming) return [];
  return records.filter((record) => {
    if ((record as FeedInventoryRecord & { deletedAt?: string }).deletedAt ||
        record.transactionType !== '入庫' || record.sourceType === 'homegrown' ||
        record.transactionDate !== input.transactionDate || nameKey(record.feedName || '') !== nameKey(input.feedName)) return false;
    if (record.supplier?.trim() && input.supplier.trim() && nameKey(record.supplier) !== nameKey(input.supplier)) return false;
    const existing = stockQuantity(record);
    return Boolean(existing && existing.unit === incoming.unit && Math.abs(existing.quantity - incoming.quantity) < 0.000001);
  });
}

export function feedDocumentInputKey(input: FeedInventoryInput): string {
  return JSON.stringify([input.transactionDate, input.feedName, input.transactionType, input.sourceType,
    input.quantity, input.unit, input.bagWeightKg, input.totalWeightKg, input.supplier,
    input.unitPrice, input.totalPrice, input.taxRate, input.taxExcludedPrice, input.taxAmount, input.memo]);
}
