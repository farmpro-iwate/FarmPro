import { atomicWrite, lifecycleLock, strictRead, withdrawalCompletions } from './accountLifecycle';
import {
  findLineIdentityBinding,
  makeLineIdentityBinding,
  type LineIdentityBinding,
} from './lineIdentityBinding';

// Global across farms, never in the default farm folder.
const FILE = 'line-identity-bindings.json';
type Store = { version: 1; bindings: LineIdentityBinding[] };
type UserRow = { id?: string; farmId?: string; active?: boolean; loginMethod?: string; lineSubject?: string };

function parseStore(value: unknown): Store {
  if (value === undefined) return { version: 1, bindings: [] };
  if (!value || typeof value !== 'object') throw new Error('LINE_STORE_INVALID');
  const stored = value as Partial<Store>;
  if (stored.version !== 1 || !Array.isArray(stored.bindings)) throw new Error('LINE_STORE_INVALID');
  const subjects = new Set<string>();
  const users = new Set<string>();
  for (const entry of stored.bindings) {
    if (!entry || entry.provider !== 'line' ||
      typeof entry.subject !== 'string' || !/^[a-zA-Z0-9_-]{1,255}$/.test(entry.subject) ||
      typeof entry.userId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(entry.userId) ||
      typeof entry.linkedAt !== 'string' || !Number.isFinite(Date.parse(entry.linkedAt)) ||
      subjects.has(entry.subject) || users.has(entry.userId)) throw new Error('LINE_STORE_INVALID');
    subjects.add(entry.subject);
    users.add(entry.userId);
  }
  return stored as Store;
}

async function readStore(root: string): Promise<Store> {
  return parseStore(await strictRead(root, FILE, true));
}

function assertActiveUser(userId: string, users: unknown, withdrawnIds: Set<string>) {
  if (!Array.isArray(users)) throw new Error('LINE_USERS_UNAVAILABLE');
  const found = (users as UserRow[]).filter(user => user?.id === userId);
  if (found.length !== 1 || found[0].active !== true || withdrawnIds.has(userId)) {
    throw new Error('LINE_USER_UNAVAILABLE');
  }
}

export async function resolveLineLinkedUserId(subject: string): Promise<string | null> {
  return lifecycleLock(async root => {
    const binding = findLineIdentityBinding((await readStore(root)).bindings, subject);
    const withdrawnIds = new Set((await withdrawalCompletions(root)).map(item => item.userId));
    // A newly provisioned production service may not have users.json yet.
    // Only ENOENT means an empty farm; malformed or unreadable data still fails closed.
    const loadedUsers = await strictRead(root, 'users.json', true);
    const users = loadedUsers === undefined ? [] : loadedUsers;
    if (!Array.isArray(users)) throw new Error('LINE_USERS_UNAVAILABLE');
    const native = (users as UserRow[]).filter(user =>
      user?.loginMethod === 'line' && user.lineSubject === subject);
    if (native.length > 1 || (native.length === 1 && binding)) throw new Error('LINE_IDENTITY_CONFLICT');
    const userId = native[0]?.id || binding?.userId;
    if (!userId) return null;
    assertActiveUser(userId, users, withdrawnIds);
    return userId;
  });
}

// Must only be invoked after proof of recent FarmPro reauthentication AND a verified LINE ID token.
// Route-level security is intentionally not implemented in this storage-only module.
export async function persistVerifiedLineLink(subject: string, userId: string): Promise<void> {
  await lifecycleLock(async root => {
    const store = await readStore(root);
    const withdrawnIds = new Set((await withdrawalCompletions(root)).map(item => item.userId));
    const users = await strictRead(root, 'users.json');
    assertActiveUser(userId, users, withdrawnIds);
    const binding = makeLineIdentityBinding(store.bindings, subject, userId);
    await atomicWrite(root, FILE, { version: 1, bindings: [...store.bindings, binding] });
  });
}

export async function removeLineLinksForWithdrawnUser(userId: string): Promise<void> {
  await lifecycleLock(async root => {
    const withdrawn = await withdrawalCompletions(root);
    if (!withdrawn.some(item => item.userId === userId)) throw new Error('LINE_WITHDRAWAL_NOT_CONFIRMED');
    const store = await readStore(root);
    const remaining = store.bindings.filter(item => item.userId !== userId);
    if (remaining.length !== store.bindings.length) {
      await atomicWrite(root, FILE, { version: 1, bindings: remaining });
    }
  });
}

/** Read-only state for an authenticated FarmPro user; never return the LINE subject. */
export async function getLineLinkStatus(userId: string): Promise<{ linked: boolean }> {
  return lifecycleLock(async root => {
    const withdrawnIds = new Set((await withdrawalCompletions(root)).map(item => item.userId));
    const users = await strictRead(root, 'users.json');
    assertActiveUser(userId, users, withdrawnIds);
    const mappings = (await readStore(root)).bindings.filter(item => item.userId === userId);
    if (mappings.length > 1) throw new Error('LINE_STORE_INVALID');
    return { linked: mappings.length === 1 };
  });
}

/** Server-side only; do not return a LINE subject to client responses. */
export async function getNativeLineSubjectForSession(userId: string, farmId: string): Promise<string | null> {
  return lifecycleLock(async root => {
    const users = await strictRead(root,'users.json');
    if (!Array.isArray(users)) return null;
    const matches = users.filter((u: UserRow) => u?.id === userId && u.farmId === farmId && u.active === true && u.loginMethod === 'line');
    if(matches.length !== 1 || typeof matches[0].lineSubject !== 'string' ||
       !/^[a-zA-Z0-9_-]{1,255}$/.test(matches[0].lineSubject)) return null;
    return matches[0].lineSubject;
  });
}
