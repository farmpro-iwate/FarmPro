import { normalizeLineSubject } from './lineIdentityBinding';
import type { LineSignupCandidate } from './lineSignupCandidate';

export type LineSignupLedgerEntry = Readonly<{
  subject: string;
  user: LineSignupCandidate;
  committedAt: string;
  requestId: string;
}>;
export type LineSignupLedger = Readonly<{ version: 1; entries: readonly LineSignupLedgerEntry[] }>;

/**
 * Build the next complete ledger snapshot, WITHOUT writing it.
 * A future storage adapter must persist this snapshot with a durable,
 * cross-process transaction/unique-subject guarantee before enabling signup.
 */
export function planLineSignupLedgerCommit(
  ledger: LineSignupLedger,
  requestId: string,
  subject: string,
  user: LineSignupCandidate,
  now: Date = new Date(),
): LineSignupLedger {
  const normalized = normalizeLineSubject(subject);
  if (ledger.version !== 1 || !Array.isArray(ledger.entries) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(requestId) || !Number.isFinite(now.getTime())) {
    throw new Error('LINE_SIGNUP_LEDGER_INVALID');
  }
  const existingSubjects = new Set<string>();
  const existingRequests = new Set<string>();
  const existingUserIds = new Set<string>();
  const existingFarmIds = new Set<string>();
  for (const entry of ledger.entries) {
    if (!entry || typeof entry.subject !== 'string' ||
        typeof entry.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(entry.requestId) ||
        typeof entry.committedAt !== 'string' || !Number.isFinite(Date.parse(entry.committedAt)) || !entry.user ||
        existingSubjects.has(entry.subject) || existingRequests.has(entry.requestId) ||
        typeof entry.user.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(entry.user.id) ||
        typeof entry.user.farmId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(entry.user.farmId) ||
        typeof entry.user.farmName !== 'string' || !entry.user.farmName.trim() ||
        typeof entry.user.name !== 'string' || !entry.user.name.trim() ||
        entry.user.loginMethod !== 'line' || entry.user.role !== 'owner' ||
        entry.user.plan !== 'free' || entry.user.active !== true ||
        'email' in entry.user || 'passwordSalt' in entry.user || 'passwordHash' in entry.user ||
        entry.user.id !== entry.user.id.trim() ||
        existingUserIds.has(entry.user.id) || existingFarmIds.has(entry.user.farmId)) {
      throw new Error('LINE_SIGNUP_LEDGER_CORRUPT');
    }
    normalizeLineSubject(entry.subject);
    existingSubjects.add(entry.subject);
    existingRequests.add(entry.requestId);
    existingUserIds.add(entry.user.id);
    existingFarmIds.add(entry.user.farmId);
  }
  // Repeat requests can only be recognized as already committed; never create anew.
  if (existingRequests.has(requestId) || existingSubjects.has(normalized)) {
    throw new Error('LINE_SIGNUP_ALREADY_COMMITTED');
  }
  if (existingUserIds.has(user.id) || existingFarmIds.has(user.farmId)) {
    throw new Error('LINE_SIGNUP_ID_ALREADY_USED');
  }
  if (user.loginMethod !== 'line' || user.role !== 'owner' ||
      user.plan !== 'free' || user.active !== true ||
      'email' in user || 'passwordHash' in user || 'passwordSalt' in user) {
    throw new Error('LINE_SIGNUP_ACCOUNT_INVALID');
  }
  return {
    version: 1,
    entries: [...ledger.entries, {
      subject: normalized, user: { ...user },
      committedAt: now.toISOString(), requestId,
    }],
  };
}
