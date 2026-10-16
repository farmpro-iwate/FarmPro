import crypto from 'node:crypto';
import { normalizeLineSubject } from './lineIdentityBinding';

const TTL = 5 * 60_000;
function secret(): string {
  const value = process.env.FARMPRO_AUTH_SECRET?.trim();
  if (!value) throw new Error('LINE_SIGNUP_SECRET_UNAVAILABLE');
  return value;
}
function mac(value: string): string {
  return crypto.createHmac('sha256', secret()).update('line-signup-v1:' + value).digest('hex');
}
/** Issued only after server verification of the LINE OAuth ID token. */
export function issueLineSignupTicket(subject: string): string {
  const payload = Buffer.from(JSON.stringify({
    subject: normalizeLineSubject(subject), expiresAt: Date.now() + TTL,
    nonce: crypto.randomBytes(16).toString('hex'),
  })).toString('base64url');
  return payload + '.' + mac(payload);
}
export function verifyLineSignupTicket(ticket: string): string {
  const parts = ticket.split('.');
  if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1]) ||
      !/^[A-Za-z0-9_-]{20,1000}$/.test(parts[0])) throw new Error('LINE_SIGNUP_TICKET_INVALID');
  if (!crypto.timingSafeEqual(Buffer.from(mac(parts[0]),'hex'),Buffer.from(parts[1],'hex'))) {
    throw new Error('LINE_SIGNUP_TICKET_INVALID');
  }
  const value: unknown = JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
  if (!value || typeof value !== 'object') throw new Error('LINE_SIGNUP_TICKET_INVALID');
  const item = value as {subject?:unknown;expiresAt?:unknown;nonce?:unknown};
  if (typeof item.expiresAt !== 'number' || item.expiresAt <= Date.now() ||
      item.expiresAt > Date.now()+TTL || typeof item.nonce !== 'string' ||
      !/^[a-f0-9]{32}$/.test(item.nonce)) throw new Error('LINE_SIGNUP_TICKET_EXPIRED');
  return normalizeLineSubject(item.subject as string);
}
