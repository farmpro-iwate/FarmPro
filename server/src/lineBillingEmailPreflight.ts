import { lifecycleLock, strictRead, withdrawalCompletions } from './accountLifecycle';
import { canStartLineBillingEmailEnrollment, type LineBillingEmailActor } from './lineBillingEmailEligibility';

// Non-mutating preflight under the same lifecycle lock as account changes.
// No code consumption, checkout approval, account update or billing change.
export async function inspectLineBillingEmailTarget(
  identity: { userId: string; farmId: string; lineSubject: string },
  emailInput: string,
): Promise<{ eligible: true; userId: string; farmId: string }> {
  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('BILLING_EMAIL_INVALID');
  }
  return lifecycleLock(async root => {
    const users = await strictRead(root, 'users.json');
    if (!Array.isArray(users)) throw new Error('BILLING_USERS_UNAVAILABLE');
    const matches = users.filter((item: LineBillingEmailActor) => item?.id === identity.userId);
    if (matches.length !== 1) throw new Error('BILLING_ACTOR_UNAVAILABLE');
    const actor = matches[0] as LineBillingEmailActor;
    if (!canStartLineBillingEmailEnrollment(actor) ||
        actor.farmId !== identity.farmId || actor.lineSubject !== identity.lineSubject) {
      throw new Error('BILLING_ACTOR_UNAVAILABLE');
    }
    if ((await withdrawalCompletions(root)).some(row => row.userId === identity.userId || row.farmId === identity.farmId)) {
      throw new Error('BILLING_ACTOR_UNAVAILABLE');
    }
    if (users.some((item: {id?: string; email?: string}) =>
      item.id !== identity.userId && typeof item.email === 'string' &&
      item.email.trim().toLowerCase() === email)) throw new Error('BILLING_EMAIL_UNAVAILABLE');
    return { eligible: true as const, userId: identity.userId, farmId: identity.farmId };
  });
}
