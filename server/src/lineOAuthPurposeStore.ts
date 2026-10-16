import crypto from 'node:crypto';
import { atomicWrite, lifecycleLock, strictRead } from './accountLifecycle';
import { assertLineOAuthPurpose, type LineOAuthPurpose } from './lineOAuthPurpose';

// Purpose registry is only a foundation; not mounted to live OAuth routes.
// Single-process serialization only; shared transactional storage required for multi-host.
const FILE = 'line-oauth-purpose-registry.json';
const TTL = 10 * 60_000;
type Entry = { stateDigest: string; purpose: LineOAuthPurpose; expiresAt: number };
type Store = { version: 1; entries: Entry[] };
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const validState = (s: string) => /^[a-f0-9]{64}$/.test(s);
function parse(raw: unknown): Store {
  if (raw === undefined) return { version: 1, entries: [] };
  const store = raw as Store;
  if (!store || store.version !== 1 || !Array.isArray(store.entries) || store.entries.length > 1000) {
    throw new Error('LINE_OAUTH_PURPOSE_STORE_INVALID');
  }
  const seen = new Set<string>();
  for (const entry of store.entries) {
    if (!entry || !validState(entry.stateDigest) || seen.has(entry.stateDigest) ||
        !Number.isFinite(entry.expiresAt)) throw new Error('LINE_OAUTH_PURPOSE_STORE_INVALID');
    try { assertLineOAuthPurpose(entry.purpose, entry.purpose); }
    catch { throw new Error('LINE_OAUTH_PURPOSE_STORE_INVALID'); }
    seen.add(entry.stateDigest);
  }
  return store;
}
export async function saveLineOAuthPurpose(state: string, purpose: LineOAuthPurpose) {
  if (!validState(state)) throw new Error('LINE_OAUTH_STATE_INVALID');
  assertLineOAuthPurpose(purpose, purpose);
  await lifecycleLock(async root => {
    const store = parse(await strictRead(root, FILE, true));
    const now = Date.now();
    const entries = store.entries.filter(e => e.expiresAt > now);
    if (entries.some(e => e.stateDigest === hash(state)) || entries.length >= 1000) throw new Error('LINE_OAUTH_PURPOSE_ALREADY_STORED');
    await atomicWrite(root, FILE, { version: 1, entries: [...entries, { stateDigest: hash(state), purpose, expiresAt: now + TTL }] });
  });
}
export async function consumeLineOAuthPurpose(state: string, expected: LineOAuthPurpose) {
  if (!validState(state)) throw new Error('LINE_OAUTH_STATE_INVALID');
  await lifecycleLock(async root => {
    const store = parse(await strictRead(root, FILE, true));
    const now = Date.now();
    const digest = hash(state);
    const found = store.entries.find(e => e.stateDigest === digest);
    await atomicWrite(root, FILE, { version: 1, entries: store.entries.filter(e => e.stateDigest !== digest && e.expiresAt > now) });
    if (!found || found.expiresAt <= now) throw new Error('LINE_OAUTH_PURPOSE_EXPIRED');
    assertLineOAuthPurpose(found.purpose, expected);
  });
}
