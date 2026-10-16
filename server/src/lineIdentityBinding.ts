/**
 * LINE identity binding invariants. No routes or database mutations here.
 * This is a fail-closed foundation for the future global identity store.
 */
export type LineIdentityBinding = Readonly<{
  provider: 'line';
  subject: string;
  userId: string;
  linkedAt: string;
}>;

export function normalizeLineSubject(subject: string): string {
  // LINE subject is opaque: never coerce it to email or a FarmPro user ID.
  if (typeof subject !== 'string' || !/^[a-zA-Z0-9_-]{1,255}$/.test(subject)) {
    throw new Error('INVALID_LINE_SUBJECT');
  }
  return subject;
}

export function findLineIdentityBinding(
  bindings: readonly LineIdentityBinding[],
  subject: string,
): LineIdentityBinding | null {
  const normalized = normalizeLineSubject(subject);
  const matches = bindings.filter(item => item.provider === 'line' && item.subject === normalized);
  if (matches.length > 1) throw new Error('DUPLICATE_LINE_IDENTITY');
  return matches[0] || null;
}

export function assertLineBindingCanBeAdded(
  bindings: readonly LineIdentityBinding[],
  subject: string,
  userId: string,
): void {
  const normalized = normalizeLineSubject(subject);
  if (!userId || !userId.trim()) throw new Error('INVALID_FARMPRO_USER');
  if (findLineIdentityBinding(bindings, normalized)) throw new Error('LINE_IDENTITY_ALREADY_LINKED');
  if (bindings.some(item => item.provider === 'line' && item.userId === userId)) {
    throw new Error('FARMPRO_USER_ALREADY_LINKED');
  }
}

export function makeLineIdentityBinding(
  bindings: readonly LineIdentityBinding[],
  subject: string,
  userId: string,
  now: Date = new Date(),
): LineIdentityBinding {
  assertLineBindingCanBeAdded(bindings, subject, userId);
  if (Number.isNaN(now.getTime())) throw new Error('INVALID_LINK_DATE');
  return { provider: 'line', subject: normalizeLineSubject(subject), userId, linkedAt: now.toISOString() };
}
