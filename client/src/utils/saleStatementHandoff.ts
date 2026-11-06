import { normalizeSaleStatementCandidate, type SaleStatementCandidate } from './saleStatementImport';

type Owner = { farmId: string; id?: string };
type Target = {
  targetType: string;
  targetNumber: string;
  targetName: string;
  calfId?: string;
  cattleId?: string;
  birthday?: string;
};
type Sale = Target & { id: string };

export function saleStatementTargetKey(target: Target): string {
  return JSON.stringify([
    target.targetType, target.targetNumber.trim(), target.targetName.trim(),
    String(target.calfId || ''), String(target.cattleId || ''), target.birthday || '',
  ]);
}

export function createSaleStatementHandoff(candidate: SaleStatementCandidate, owner: Owner, sale: Sale) {
  return {
    version: 1,
    farmId: owner.farmId,
    userId: owner.id || '',
    saleId: sale.id,
    targetKey: saleStatementTargetKey(sale),
    candidate,
  };
}

/** A history-state candidate is only an input aid, never a saved sale or expense. */
export function readSaleStatementHandoff(state: unknown, owner: Owner | null, sale: Sale): SaleStatementCandidate | null {
  if (!owner?.farmId || !state || typeof state !== 'object') return null;
  const value = (state as Record<string, unknown>).farmproSaleStatement;
  if (!value || typeof value !== 'object') return null;
  const handoff = value as Record<string, unknown>;
  if (handoff.version !== 1 || handoff.farmId !== owner.farmId ||
      handoff.userId !== (owner.id || '') || handoff.saleId !== sale.id ||
      handoff.targetKey !== saleStatementTargetKey(sale)) return null;
  try {
    return normalizeSaleStatementCandidate(handoff.candidate);
  } catch {
    return null;
  }
}
