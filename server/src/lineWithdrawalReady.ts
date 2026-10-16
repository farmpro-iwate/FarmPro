import { evaluateWithdrawalSafety } from './withdrawalSafetyPreflight';
import { getWithdrawalAuthPolicy } from './withdrawalAuthPolicy';
import { assertRecentLineWithdrawalProof, type RecentLineWithdrawalProof } from './lineWithdrawalProof';

/** Pure gate; no account removal, no token consumption, no network calls.
 * Must be rerun under the actual withdrawal transaction after consuming the
 * purpose-bound proof. Caller must perform authoritative Stripe checks.
 */
export function assertLineWithdrawalReady(
  account: unknown,
  userId: string,
  farmId: string,
  proof: RecentLineWithdrawalProof | null,
  safety: Parameters<typeof evaluateWithdrawalSafety>[0],
  now = Date.now(),
): void {
  const policy = getWithdrawalAuthPolicy(account);
  if (policy.kind !== 'line') throw new Error('LINE_WITHDRAWAL_ACCOUNT_REQUIRED');
  assertRecentLineWithdrawalProof(proof, userId, farmId, now);
  const result = evaluateWithdrawalSafety(safety);
  if (!result.eligible) throw new Error('LINE_WITHDRAWAL_SAFETY_BLOCKED');
}
