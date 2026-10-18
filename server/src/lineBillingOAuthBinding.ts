import crypto from 'node:crypto';

const HEX = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const TTL_MS = 5 * 60_000;

/** A signed OAuth browser binding, not an authorization credential. */
export function verifyBillingOAuthBinding(
  cookie: string, state: string, secret: string, now = Date.now(),
): { userId: string; farmId: string } {
  const fields = cookie.split('.');
  if (fields.length !== 5 || !HEX.test(state) || !secret || !Number.isSafeInteger(now)) {
    throw new Error('LINE_BILLING_BINDING_INVALID');
  }
  const [userId, farmId, savedState, issuedString, signature] = fields;
  if (!ID.test(userId) || !ID.test(farmId) || savedState !== state ||
      !HEX.test(signature) || !/^[0-9]{1,16}$/.test(issuedString)) {
    throw new Error('LINE_BILLING_BINDING_INVALID');
  }
  const issued = Number(issuedString);
  if (!Number.isSafeInteger(issued) || issued > now || now - issued >= TTL_MS) {
    throw new Error('LINE_BILLING_BINDING_EXPIRED');
  }
  const payload = [userId, farmId, savedState, issuedString].join('.');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error('LINE_BILLING_BINDING_INVALID');
  }
  return { userId, farmId };
}
