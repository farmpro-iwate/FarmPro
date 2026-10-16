import crypto from 'node:crypto';
import { atomicWrite, lifecycleLock, strictRead } from './accountLifecycle';

const FILE = 'line-login-handoffs.json';
const TTL = 60_000;
type Ticket = { hash: string; userId: string; expiresAt: number };
type Store = { version: 1; tickets: Ticket[] };
function digest(value: string) { return crypto.createHash('sha256').update(value).digest('hex'); }
function parse(value: unknown): Store {
  if (value === undefined) return { version: 1, tickets: [] };
  const data = value as Partial<Store>;
  if (!data || data.version !== 1 || !Array.isArray(data.tickets) || data.tickets.length > 1000) throw new Error('LINE_HANDOFF_INVALID');
  const seen = new Set<string>();
  for (const t of data.tickets) {
    if (!t || typeof t.hash !== 'string' || !/^[a-f0-9]{64}$/.test(t.hash) ||
        typeof t.userId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(t.userId) ||
        !Number.isFinite(t.expiresAt) || seen.has(t.hash)) throw new Error('LINE_HANDOFF_INVALID');
    seen.add(t.hash);
  }
  return data as Store;
}
async function load(root: string) { return parse(await strictRead(root, FILE, true)); }

export async function issueLineHandoff(userId: string, now = Date.now()): Promise<string> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(userId)) throw new Error('LINE_HANDOFF_USER_INVALID');
  return lifecycleLock(async root => {
    const store = await load(root);
    const tickets = store.tickets.filter(t => t.expiresAt > now);
    if (tickets.length >= 1000) throw new Error('LINE_HANDOFF_FULL');
    const secret = crypto.randomBytes(32).toString('hex');
    tickets.push({ hash: digest(secret), userId, expiresAt: now + TTL });
    await atomicWrite(root, FILE, { version: 1, tickets });
    return secret;
  });
}
export async function consumeLineHandoff(secret: string, now = Date.now()): Promise<string> {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('LINE_HANDOFF_INVALID');
  return lifecycleLock(async root => {
    const store = await load(root);
    const hash = digest(secret);
    const ticket = store.tickets.find(t => t.hash === hash);
    await atomicWrite(root, FILE, { version: 1, tickets: store.tickets.filter(t => t.hash !== hash && t.expiresAt > now) });
    if (!ticket || ticket.expiresAt <= now) throw new Error('LINE_HANDOFF_EXPIRED');
    return ticket.userId;
  });
}
