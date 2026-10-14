import crypto from 'node:crypto';
import { atomicWrite, lifecycleLock, strictRead } from './accountLifecycle';
import { createLineLoginChallenge } from './lineLoginOAuth';

// Durable, single-host foundation. A shared database with cross-host transactions
// is required before enabling OAuth with more than one server host.
const FILE = 'line-oauth-challenges.json';
const TTL = 10 * 60 * 1000;
const MAX = 1000;
type Pending = { stateDigest: string; browserDigest: string; nonce: string; expiresAt: number };
type Store = { version: 1; pending: Pending[] };

const digest = (input: string) => crypto.createHash('sha256').update(input).digest('hex');
function validSecret(value: string) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function parse(value: unknown): Store {
  if (value === undefined) return { version: 1, pending: [] };
  const v = value as Partial<Store>;
  if (!v || v.version !== 1 || !Array.isArray(v.pending) || v.pending.length > MAX) throw new Error('LINE_CHALLENGE_STORE_INVALID');
  const seen = new Set<string>();
  for (const p of v.pending) {
    if (!p || !validSecret(p.stateDigest) || !validSecret(p.browserDigest) ||
        !validSecret(p.nonce) || !Number.isFinite(p.expiresAt) || seen.has(p.stateDigest)) {
      throw new Error('LINE_CHALLENGE_STORE_INVALID');
    }
    seen.add(p.stateDigest);
  }
  return v as Store;
}
async function load(root: string) { return parse(await strictRead(root, FILE, true)); }

// browserSecret must be an unpredictable secure, HttpOnly SameSite=Lax cookie
// assigned at the start of auth; its hash binds the callback to this browser.
export async function issueDurableLineChallenge(browserSecret: string, now = Date.now()) {
  if (!validSecret(browserSecret)) throw new Error('LINE_BROWSER_SECRET_INVALID');
  return lifecycleLock(async root => {
    const store = await load(root);
    const pending = store.pending.filter(p => p.expiresAt > now);
    if (pending.length >= MAX) throw new Error('LINE_CHALLENGE_CAPACITY');
    const challenge = createLineLoginChallenge();
    pending.push({
      stateDigest: digest(challenge.state),
      browserDigest: digest(browserSecret),
      nonce: challenge.nonce,
      expiresAt: now + TTL,
    });
    await atomicWrite(root, FILE, { version: 1, pending });
    return challenge;
  });
}

export async function consumeDurableLineChallenge(state: string, browserSecret: string, now = Date.now()) {
  if (!validSecret(state) || !validSecret(browserSecret)) throw new Error('LINE_STATE_INVALID');
  return lifecycleLock(async root => {
    const store = await load(root);
    const stateHash = digest(state);
    const pending = store.pending.find(p => p.stateDigest === stateHash);
    // Consume even on wrong-browser/expired callback: no replay is possible.
    await atomicWrite(root, FILE, {
      version: 1,
      pending: store.pending.filter(p => p.stateDigest !== stateHash && p.expiresAt > now),
    });
    if (!pending || pending.expiresAt <= now ||
        !crypto.timingSafeEqual(Buffer.from(pending.browserDigest, 'hex'), Buffer.from(digest(browserSecret), 'hex'))) {
      throw new Error('LINE_STATE_EXPIRED_OR_BROWSER_MISMATCH');
    }
    return pending.nonce;
  });
}
