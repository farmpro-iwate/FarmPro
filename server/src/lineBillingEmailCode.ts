import crypto from 'node:crypto';

// Pure challenge engine. Caller must persist records securely and atomically,
// bind fresh LINE reauthentication, and prevent concurrent double consumption.
// This module does not send email, update users or enable billing.
export type BillingEmailChallenge = {
  userId: string; farmId: string; lineSubject: string; email: string;
  salt: string; codeHash: string; expiresAt: number; attempts: number;
};
const TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const validId = (s: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(s);
const validSubject = (s: string) => /^[a-zA-Z0-9_-]{1,255}$/.test(s);
function digest(code: string, salt: string): Buffer {
  return crypto.scryptSync(code, salt, 32);
}
export function issueBillingEmailCode(
  identity: { userId: string; farmId: string; lineSubject: string },
  email: string, now = Date.now(),
): { challenge: BillingEmailChallenge; code: string } {
  const normalized = email.trim().toLowerCase();
  if (!validId(identity.userId) || !validId(identity.farmId) ||
      !validSubject(identity.lineSubject) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254 ||
      !Number.isSafeInteger(now) || now < 0) throw new Error('BILLING_EMAIL_INPUT_INVALID');
  const code = String(crypto.randomInt(100000, 1000000));
  const salt = crypto.randomBytes(16).toString('hex');
  return { code, challenge: {
    ...identity, email: normalized, salt, codeHash: digest(code, salt).toString('hex'),
    expiresAt: now + TTL_MS, attempts: 0,
  } };
}
export function checkBillingEmailCode(
  challenge: BillingEmailChallenge,
  identity: { userId: string; farmId: string; lineSubject: string },
  input: string, now = Date.now(),
): { accepted: boolean; locked: boolean; next: BillingEmailChallenge } {
  if (challenge.userId !== identity.userId || challenge.farmId !== identity.farmId ||
      challenge.lineSubject !== identity.lineSubject) throw new Error('BILLING_EMAIL_IDENTITY_MISMATCH');
  if (!Number.isSafeInteger(now) || now >= challenge.expiresAt ||
      !Number.isInteger(challenge.attempts) || challenge.attempts < 0 ||
      challenge.attempts >= MAX_ATTEMPTS) throw new Error('BILLING_EMAIL_CODE_EXPIRED');
  const next = { ...challenge, attempts: challenge.attempts + 1 };
  if (!/^\d{6}$/.test(input)) return { accepted: false, locked: next.attempts >= MAX_ATTEMPTS, next };
  const actual = digest(input, challenge.salt);
  const expected = Buffer.from(challenge.codeHash, 'hex');
  const accepted = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  return { accepted, locked: !accepted && next.attempts >= MAX_ATTEMPTS, next };
}
