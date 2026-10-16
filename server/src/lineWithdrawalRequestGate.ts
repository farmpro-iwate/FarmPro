import { assertWithdrawalRequestMethod } from './withdrawalRequestMethod';
import { evaluateWithdrawalSafety } from './withdrawalSafetyPreflight';

/** Read-only gate. The authoritative account, Stripe and farm data must be read
 * within the withdrawal coordinator; never accept client-supplied eligibility
 * flags as evidence. LINE proof consumption and deletion are intentionally absent.
 */
export function assessLineWithdrawalRequest(
  storedAccount: unknown,
  request: unknown,
  verifiedSafety: Parameters<typeof evaluateWithdrawalSafety>[0],
): { method: 'line'; eligible: true } {
  if (assertWithdrawalRequestMethod(storedAccount, request) !== 'line') {
    throw new Error('LINE_WITHDRAWAL_ACCOUNT_REQUIRED');
  }
  const result = evaluateWithdrawalSafety(verifiedSafety);
  if (!result.eligible) throw new Error('LINE_WITHDRAWAL_SAFETY_BLOCKED');
  return { method: 'line', eligible: true };
}
