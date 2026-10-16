import { getWithdrawalAuthPolicy } from './withdrawalAuthPolicy';

/**
 * Read-only gate for introducing email-less accounts to account withdrawal.
 * Do not wire LINE withdrawals until purpose-bound OAuth, token consumption,
 * operator permissions and billing checks are transactionally integrated.
 */
export function classifyWithdrawalAccountReadiness(user: unknown):
  | { method: 'password'; readyForLegacyFlow: true }
  | { method: 'line'; readyForLegacyFlow: false; requiresDedicatedFlow: true } {
  const policy = getWithdrawalAuthPolicy(user);
  if (policy.kind === 'password') return { method: 'password', readyForLegacyFlow: true };
  return { method: 'line', readyForLegacyFlow: false, requiresDedicatedFlow: true };
}
