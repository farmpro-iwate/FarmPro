import type { FarmProUser } from './authStore';

/** Legacy-compatible email credential lookup; LINE-only rows never enter password verification. */
export function findPasswordLoginUser<T extends Pick<FarmProUser, 'id' | 'active'> & {
  email?: string; passwordSalt?: string; passwordHash?: string; loginMethod?: string
}>(
  users: readonly T[], inputEmail: string,
): T | null {
  const normalized = inputEmail.trim().toLowerCase();
  if (!normalized) return null;
  const matches = users.filter(user =>
    user.active === true &&
    user.loginMethod !== 'line' &&
    typeof user.email === 'string' &&
    user.email.trim().toLowerCase() === normalized &&
    typeof user.passwordSalt === 'string' && user.passwordSalt.length > 0 &&
    typeof user.passwordHash === 'string' && user.passwordHash.length > 0,
  );
  // Fail closed on ambiguous legacy credential records.
  return matches.length === 1 ? matches[0] : null;
}
