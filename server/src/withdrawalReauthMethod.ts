import { getWithdrawalAuthPolicy } from './withdrawalAuthPolicy';

/** Authentication method selection only. Never performs a withdrawal.
 * A LINE proof must be consumed by the actual withdrawal transaction before
 * account data is tombstoned. Do not accept a client-selected method.
 */
export type WithdrawalReauthMethod =
  | { kind: 'password'; requiresEmail: true; requiresPassword: true }
  | { kind: 'line'; requiresEmail: false; requiresPassword: false; requiresPurposeBoundProof: true };

export function selectWithdrawalReauthMethod(account: unknown): WithdrawalReauthMethod {
  const policy = getWithdrawalAuthPolicy(account);
  if (policy.kind === 'password') {
    return { kind: 'password', requiresEmail: true, requiresPassword: true };
  }
  return { kind: 'line', requiresEmail: false, requiresPassword: false, requiresPurposeBoundProof: true };
}
