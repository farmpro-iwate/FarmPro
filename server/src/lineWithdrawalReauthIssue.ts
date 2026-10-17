import { completeLineWithdrawalReauthGuard } from './lineWithdrawalReauthComplete';
import { issueLineWithdrawalProof } from './lineWithdrawalProofStore';
import { makeLineIdentityBinding, type LineIdentityBinding } from './lineIdentityBinding';

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
  nativeAccount?: {id: string; farmId: string; loginMethod?: string; lineSubject?: string} | null;
}): Promise<string> {
  // Native LINE-only signup stores the verified subject on the account row,
  // while linked email accounts use the separate identity-binding ledger.
  // A native subject must match the authenticated account exactly.
  const nativeAccount = input.nativeAccount;
  let bindings = input.bindings;
  if (nativeAccount) {
    if (!input.currentUser || nativeAccount.id !== input.currentUser.id ||
        nativeAccount.farmId !== input.currentUser.farmId ||
        nativeAccount.loginMethod !== 'line' ||
        !nativeAccount.lineSubject || nativeAccount.lineSubject !== input.verifiedSubject) {
      throw new Error('LINE_WITHDRAWAL_IDENTITY_MISMATCH');
    }
    bindings = [makeLineIdentityBinding([], nativeAccount.lineSubject, nativeAccount.id)];
  }
  const identity = await completeLineWithdrawalReauthGuard({ ...input, bindings });
  return issueLineWithdrawalProof(identity.userId, identity.farmId);
}
