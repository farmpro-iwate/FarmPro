import { atomicWrite, lifecycleLock, strictRead, withdrawalCompletions } from './accountLifecycle';
import { checkBillingEmailCode, type BillingEmailChallenge } from './lineBillingEmailCode';
import { canStartLineBillingEmailEnrollment } from './lineBillingEmailEligibility';

// Storage-only, NOT exposed as an API. Fresh LINE reauthentication is mandatory
// at the future HTTP boundary before calling this function.
type Identity = { userId: string; farmId: string; lineSubject: string };
type Store = { version: 1; challenges: BillingEmailChallenge[] };
export async function commitVerifiedLineBillingEmail(identity: Identity, code: string, now = Date.now()) {
  return lifecycleLock(async root => {
    const store = await strictRead(root, 'line-billing-email-challenges.json', true) as Store | undefined;
    if (!store || store.version !== 1 || !Array.isArray(store.challenges) ||
        store.challenges.length > 1000) throw new Error('BILLING_CODE_STORE_INVALID');
    const matching = store.challenges.filter(row => row?.userId === identity.userId);
    if (matching.length !== 1) throw new Error('BILLING_EMAIL_CODE_EXPIRED');
    const challenge = matching[0];
    const result = checkBillingEmailCode(challenge, identity, code, now);
    const others = store.challenges.filter(row => row.userId !== identity.userId);
    if (!result.accepted) {
      await atomicWrite(root, 'line-billing-email-challenges.json', {
        version: 1, challenges: result.locked ? others : [...others, result.next],
      });
      throw new Error(result.locked ? 'BILLING_EMAIL_CODE_LOCKED' : 'BILLING_EMAIL_CODE_INVALID');
    }
    const users = await strictRead(root, 'users.json');
    if (!Array.isArray(users)) throw new Error('BILLING_USERS_UNAVAILABLE');
    const matches = users.filter(row => row?.id === identity.userId);
    if (matches.length !== 1) throw new Error('BILLING_ACTOR_UNAVAILABLE');
    const actor = matches[0];
    if (!canStartLineBillingEmailEnrollment(actor) || actor.farmId !== identity.farmId ||
        actor.lineSubject !== identity.lineSubject ||
        (await withdrawalCompletions(root)).some(row =>
          row.userId === identity.userId || row.farmId === identity.farmId)) {
      throw new Error('BILLING_ACTOR_UNAVAILABLE');
    }
    if (users.some(row => row.id !== actor.id && typeof row.email === 'string' &&
          row.email.trim().toLowerCase() === challenge.email)) {
      throw new Error('BILLING_EMAIL_UNAVAILABLE');
    }
    // Persist user first. If crash occurs before clearing the challenge,
    // the now-present email makes all replays fail closed.
    const updated = users.map(row => row.id === actor.id
      ? { ...row, email: challenge.email, billingEmailVerifiedAt: new Date(now).toISOString() }
      : row);
    await atomicWrite(root, 'users.json', updated);
    await atomicWrite(root, 'line-billing-email-challenges.json', {
      version: 1, challenges: others,
    });
    // No plan change and no Stripe or bank operation.
    return { userId: actor.id, farmId: actor.farmId, email: challenge.email };
  });
}
