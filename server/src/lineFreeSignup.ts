import { normalizeLineSubject } from './lineIdentityBinding';

/**
 * Validates an explicitly confirmed LINE-only Free signup request.
 * This has no storage side effects; caller must prove the LINE subject
 * with a server-issued one-time ticket, not a browser-submitted subject.
 */
export type LineFreeSignupProfile = Readonly<{
  farmName: string;
  name: string;
  plan: 'free';
  role: 'owner';
}>;

function requiredName(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(field);
  const normalized = value.trim();
  if (!normalized || normalized.length > 100 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(field);
  }
  return normalized;
}

export function validateLineFreeSignupProfile(input: unknown): LineFreeSignupProfile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('LINE_SIGNUP_INVALID_INPUT');
  }
  const candidate = input as Record<string, unknown>;
  if (candidate.confirm !== true) throw new Error('LINE_SIGNUP_CONFIRMATION_REQUIRED');
  return {
    farmName: requiredName(candidate.farmName, 'LINE_SIGNUP_INVALID_FARM_NAME'),
    name: requiredName(candidate.name, 'LINE_SIGNUP_INVALID_NAME'),
    role: 'owner',
    plan: 'free',
  };
}

/** Only accept a verified provider subject from the server-side OAuth result. */
export function assertVerifiedLineSignupIdentity(subject: unknown): string {
  if (typeof subject !== 'string') throw new Error('LINE_SIGNUP_UNVERIFIED_IDENTITY');
  return normalizeLineSubject(subject);
}
