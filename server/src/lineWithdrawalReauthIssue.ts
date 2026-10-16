import { completeLineWithdrawalReauthGuard } from './lineWithdrawalReauthComplete';
import { issueLineWithdrawalProof } from './lineWithdrawalProofStore';
import type { LineIdentityBinding } from './lineIdentityBinding';

/**
 * INTERNAL ONLY. A verified LINE subject must come from server-side token
 * verification after a purpose-bound OAuth callback; never from browser input.
 * Do not expose as a route until callback/session and one-use proof handoff
 * are integrated and withdrawal storage accepts LINE-only accounts.
 */
export async function completeLineWithdrawalAndIssueProof(input: {
  state: string;
  browserSecret: string;
  verifiedSubject: string;
  currentUser: { id: string; farmId: string; active: boolean } | null;
  bindings: readonly LineIdentityBinding[];
}): Promise<string> {
  const identity = await completeLineWithdrawalReauthGuard(input);
  return issueLineWithdrawalProof(identity.userId, identity.farmId);
}
