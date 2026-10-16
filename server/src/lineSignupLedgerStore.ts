import { atomicWrite, lifecycleLock, strictRead } from './accountLifecycle';
import { planLineSignupLedgerCommit, type LineSignupLedger, type LineSignupLedgerEntry } from './lineSignupLedgerPlan';
import type { LineSignupCandidate } from './lineSignupCandidate';

// Standalone durable ledger only. No public signup route is mounted.
// This is safe only for one Node process. Multi-instance deployments require
// a shared transactional store with a unique provider-subject constraint.
const FILE = 'line-signup-ledger.json';
const EMPTY: LineSignupLedger = { version: 1, entries: [] };

function validateLedger(value: unknown): LineSignupLedger {
  if (!value || typeof value !== 'object') throw new Error('LINE_SIGNUP_LEDGER_INVALID');
  const candidate = value as Partial<LineSignupLedger>;
  if (candidate.version !== 1 || !Array.isArray(candidate.entries)) {
    throw new Error('LINE_SIGNUP_LEDGER_INVALID');
  }
  // Validate the entire persisted snapshot, not only the new entry.
  let checked: LineSignupLedger = EMPTY;
  for (const item of candidate.entries) {
    if (!item || typeof item !== 'object' || !item.user ||
        !Number.isFinite(Date.parse(item.committedAt))) {
      throw new Error('LINE_SIGNUP_LEDGER_CORRUPT');
    }
    checked = planLineSignupLedgerCommit(
      checked, item.requestId, item.subject, item.user, new Date(item.committedAt),
    );
  }
  return checked;
}

export async function readLineSignupLedger(): Promise<LineSignupLedger> {
  return lifecycleLock(async root => {
    const value = await strictRead(root, FILE, true);
    return value === undefined ? EMPTY : validateLedger(value);
  });
}

/** Atomic one-file commit with in-process serialization, never users.json mutation. */
export async function persistLineSignupLedgerEntry(
  requestId: string,
  subject: string,
  user: LineSignupCandidate,
): Promise<LineSignupLedgerEntry> {
  return lifecycleLock(async root => {
    const raw = await strictRead(root, FILE, true);
    const current = raw === undefined ? EMPTY : validateLedger(raw);
    const next = planLineSignupLedgerCommit(current, requestId, subject, user);
    await atomicWrite(root, FILE, next);
    return next.entries[next.entries.length - 1];
  });
}
