import type { LineSignupLedger } from './lineSignupLedgerPlan';
import type { LineIdentityBinding } from './lineIdentityBinding';

/**
 * Read-only preflight against the existing FarmPro stores.
 * This must not be mistaken for an atomic transaction or used to enable signup.
 */
export function assertLineSignupLedgerCompatible(
  ledger: LineSignupLedger,
  users: readonly { id: string; farmId: string }[],
  bindings: readonly LineIdentityBinding[],
): void {
  if (ledger.version !== 1 || !Array.isArray(ledger.entries) ||
      !Array.isArray(users) || !Array.isArray(bindings)) {
    throw new Error('LINE_SIGNUP_COMPATIBILITY_INVALID');
  }
  const ids = new Set<string>();
  const farms = new Set<string>();
  const subjects = new Set<string>();
  for (const user of users) {
    if (typeof user?.id !== 'string' || typeof user?.farmId !== 'string' ||
        ids.has(user.id)) throw new Error('LINE_SIGNUP_EXISTING_USERS_INVALID');
    ids.add(user.id);
    farms.add(user.farmId);
  }
  for (const binding of bindings) {
    if (binding?.provider !== 'line' || typeof binding.subject !== 'string' ||
        subjects.has(binding.subject)) throw new Error('LINE_SIGNUP_EXISTING_BINDINGS_INVALID');
    subjects.add(binding.subject);
  }
  const ledgerIds = new Set<string>();
  const ledgerFarms = new Set<string>();
  const ledgerSubjects = new Set<string>();
  for (const entry of ledger.entries) {
    if (!entry?.user || typeof entry.subject !== 'string' ||
        ids.has(entry.user.id) || farms.has(entry.user.farmId) || subjects.has(entry.subject) ||
        ledgerIds.has(entry.user.id) || ledgerFarms.has(entry.user.farmId) ||
        ledgerSubjects.has(entry.subject)) throw new Error('LINE_SIGNUP_STORE_COLLISION');
    ledgerIds.add(entry.user.id);
    ledgerFarms.add(entry.user.farmId);
    ledgerSubjects.add(entry.subject);
  }
}
