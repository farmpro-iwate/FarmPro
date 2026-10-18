// Read-only first gate for LINE-only billing contact enrollment.
// Do not enable checkout based on this predicate: verified contact and
// purpose-bound fresh LINE reauthentication must be proved separately.
export type LineBillingEmailActor = {
  id?: string;
  farmId?: string;
  role?: string;
  active?: boolean;
  loginMethod?: string;
  lineSubject?: string;
  email?: string;
};

const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);

export function canStartLineBillingEmailEnrollment(actor: LineBillingEmailActor | null): boolean {
  return Boolean(actor &&
    validId(actor.id) &&
    validId(actor.farmId) &&
    actor.active === true &&
    actor.role === 'owner' &&
    actor.loginMethod === 'line' &&
    typeof actor.lineSubject === 'string' &&
    /^[a-zA-Z0-9_-]{1,255}$/.test(actor.lineSubject) &&
    !actor.email);
}
