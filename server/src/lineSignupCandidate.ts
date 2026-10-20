import { assertLineSignupNotAlreadyLinked } from './lineSignupGuard';
import { assertVerifiedLineSignupIdentity, type LineFreeSignupProfile } from './lineFreeSignup';
import { type LineIdentityBinding } from './lineIdentityBinding';

/**
 * Pure preparation of a LINE-only Free account creation.
 *
 * This MUST NOT be used as a two-file transaction. Its result is a proposal
 * that must be committed by a future durable single-ledger transaction with
 * a unique provider subject constraint, restart recovery and idempotency.
 */
export type LineSignupCandidate = Readonly<{
  id: string;
  farmId: string;
  farmName: string;
  name: string;
  loginMethod: 'line';
  role: 'owner';
  active: true;
  plan: 'free';
}>;

export function prepareLineSignup(
  existingUsers: readonly { id: string; farmId: string }[],
  existingBindings: readonly LineIdentityBinding[],
  verifiedSubject: string,
  profile: LineFreeSignupProfile,
  userId: string,
  farmId: string,
): Readonly<{ user: LineSignupCandidate; binding: LineIdentityBinding }> {
  const subject = assertVerifiedLineSignupIdentity(verifiedSubject);
  assertLineSignupNotAlreadyLinked(existingBindings, subject);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(userId) || !/^[a-zA-Z0-9_-]{1,128}$/.test(farmId)) {
    throw new Error('LINE_SIGNUP_INVALID_IDS');
  }
  if (existingUsers.some(u => u.id === userId || u.farmId === farmId)) {
    throw new Error('LINE_SIGNUP_ID_ALREADY_USED');
  }
  if (profile.plan !== 'free' || profile.role !== 'owner' || !profile.farmName.trim() || !profile.name.trim()) {
    throw new Error('LINE_SIGNUP_INVALID_PROFILE');
  }
  return {
    user: {
      id: userId, farmId, farmName: profile.farmName, name: profile.name,
      loginMethod: 'line', role: 'owner', active: true, plan: 'free',
    },
    binding: { provider: 'line', subject, userId, linkedAt: new Date().toISOString() },
  };
}
