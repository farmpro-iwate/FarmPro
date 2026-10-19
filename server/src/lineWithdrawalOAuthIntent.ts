import crypto from 'node:crypto';
import { atomicWrite, lifecycleLock, strictRead } from './accountLifecycle';
import { createLineLoginChallenge } from './lineLoginOAuth';

// Dedicated withdrawal OAuth challenge store. NOT mounted in any HTTP route.
// Records are separate from login challenges, preventing login/withdrawal confusion.
const FILE = 'line-withdrawal-oauth-intents.json';
const TTL = 5 * 60_000;
type Intent = { stateHash: string; browserHash: string; nonce: string; userId: string; farmId: string; expiresAt: number };
const digest = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const valid = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const id = (s: unknown) => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(s);
function parse(value: unknown): Intent[] {
  if (value === undefined) return [];
  const v = value as {version?:unknown; intents?:unknown};
  if (!v || v.version !== 1 || !Array.isArray(v.intents) || v.intents.length > 1000) throw new Error('LINE_WITHDRAWAL_OAUTH_STORE_INVALID');
  const seen = new Set<string>();
  for (const x of v.intents) {
    if (!x || !valid(x.stateHash) || !valid(x.browserHash) || !valid(x.nonce) || !id(x.userId) || !id(x.farmId) || !Number.isFinite(x.expiresAt) || seen.has(x.stateHash)) throw new Error('LINE_WITHDRAWAL_OAUTH_STORE_INVALID');
    seen.add(x.stateHash);
  }
  return v.intents;
}
export async function issueLineWithdrawalOAuthIntent(actor: {id:string;farmId:string}, browserSecret: string, now=Date.now()) {
  if (!id(actor?.id) || !id(actor?.farmId) || !valid(browserSecret)) throw new Error('LINE_WITHDRAWAL_OAUTH_INVALID');
  return lifecycleLock(async root => {
    const existing=parse(await strictRead(root,FILE,true)).filter(x=>x.expiresAt>now && x.userId!==actor.id);
    if (existing.length>=1000) throw new Error('LINE_WITHDRAWAL_OAUTH_FULL');
    const challenge=createLineLoginChallenge();
    existing.push({stateHash:digest(challenge.state),browserHash:digest(browserSecret),nonce:challenge.nonce,userId:actor.id,farmId:actor.farmId,expiresAt:now+TTL});
    await atomicWrite(root,FILE,{version:1,intents:existing});
    return challenge;
  });
}
/** Callback form: the actor comes ONLY from the authenticated start's stored intent. */
export async function consumeLineWithdrawalOAuthCallback(state:string,browserSecret:string,now=Date.now()) {
  if (!valid(state) || !valid(browserSecret)) throw new Error('LINE_WITHDRAWAL_OAUTH_INVALID');
  return lifecycleLock(async root => {
    const all=parse(await strictRead(root,FILE,true));
    const stateHash=digest(state);
    const entry=all.find(x=>x.stateHash===stateHash);
    await atomicWrite(root,FILE,{version:1,intents:all.filter(x=>x.stateHash!==stateHash && x.expiresAt>now)});
    if (!entry || entry.expiresAt<=now || entry.browserHash!==digest(browserSecret)) throw new Error('LINE_WITHDRAWAL_OAUTH_MISMATCH');
    return { nonce:entry.nonce, actor:{id:entry.userId,farmId:entry.farmId} };
  });
}
export async function consumeLineWithdrawalOAuthIntent(state:string,browserSecret:string,actor:{id:string;farmId:string},now=Date.now()) {
  if (!valid(state) || !valid(browserSecret) || !id(actor?.id) || !id(actor?.farmId)) throw new Error('LINE_WITHDRAWAL_OAUTH_INVALID');
  return lifecycleLock(async root => {
    const all=parse(await strictRead(root,FILE,true));
    const entry=all.find(x=>x.stateHash===digest(state));
    await atomicWrite(root,FILE,{version:1,intents:all.filter(x=>x.stateHash!==digest(state) && x.expiresAt>now)});
    if (!entry || entry.expiresAt<=now || entry.browserHash!==digest(browserSecret) || entry.userId!==actor.id || entry.farmId!==actor.farmId) throw new Error('LINE_WITHDRAWAL_OAUTH_MISMATCH');
    return entry.nonce;
  });
}
