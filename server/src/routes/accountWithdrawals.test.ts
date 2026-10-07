import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { authenticate, createPasswordHash, createToken, verifyToken, type FarmProUser, type AuthUser } from '../authStore';
import { accountWithdrawalResult, executeAccountWithdrawal, previewAccountWithdrawal, resumeAccountWithdrawals } from '../accountWithdrawalStore';
import { withdrawalCompletions } from '../accountLifecycle';
import { readJson, writeJson } from '../jsonStore';
import { runWithFarm } from '../farmContext';
import { withFarmRequest } from '../farmRequestGate';
import { listWithdrawalRequests } from '../withdrawalRequestStore';
import { accountWithdrawalsRouter } from './accountWithdrawals';

let root: string; let users: FarmProUser[]; let previous: Record<string,string|undefined>; let servers: Server[];
const env = ['FARMPRO_DATA_DIR','FARMPRO_AUTH_SECRET','FARMPRO_OPERATOR_EMAILS','NODE_ENV','STRIPE_SECRET_KEY','FARMPRO_STRIPE_SECRET_KEY'] as const;
const realFetch = globalThis.fetch;
const password = 'fixture-withdrawal-password';
const safe = (user: FarmProUser): AuthUser => { const { passwordSalt, passwordHash, ...value } = user; return { ...value, plan: user.plan || 'free' }; };
async function put(file: string, value: unknown) { await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true}); await fs.writeFile(path.join(root,file),JSON.stringify(value)); }
async function raw(file: string) { return fs.readFile(path.join(root,file),'utf8'); }
async function data(file: string) { return JSON.parse(await raw(file)); }
async function prepare(actor = 1, target = 1) {
  const preview = await previewAccountWithdrawal(safe(users[actor]),users[target].id); assert(preview.eligible);
  return { token: preview.token, email: users[target].email, password, confirmed: true, backupConfirmed: true, consentConfirmed: actor !== target };
}
beforeEach(async () => {
  previous = Object.fromEntries(env.map(k=>[k,process.env[k]])); root = await fs.mkdtemp(path.join(os.tmpdir(),'farmpro-real-withdrawal-')); servers=[];
  process.env.FARMPRO_DATA_DIR=root; process.env.FARMPRO_AUTH_SECRET='fixture-real-withdrawal-secret'; process.env.FARMPRO_OPERATOR_EMAILS='operator@example.invalid'; process.env.NODE_ENV='test';
  delete process.env.STRIPE_SECRET_KEY; delete process.env.FARMPRO_STRIPE_SECRET_KEY;
  const credentials=createPasswordHash(password);
  users=['operator','owner','other'].map(label=>({id:`user-${label}`,farmId:`farm-${label}`,farmName:`${label} Farm`,name:`${label} Fixture`,email:`${label}@example.invalid`,role:'owner',active:true,plan:'free',...credentials}));
  await put('users.json',users); await put('bank-transfer-applications.json',[]); await put('stripeSubscriptions.json',[]);
  await put('farms/farm-owner/cattle.json',[{id:'owner-cow'}]); await put('farms/farm-owner/cloudSnapshot.json',{fixture:'owner backup'});
  await put('farms/farm-other/cattle.json',[{id:'other-cow'}]);
  await put('push-subscriptions.json',{subscriptions:[{userId:users[1].id,farmId:users[1].farmId,endpoint:'fixture-owner'},{userId:users[2].id,farmId:users[2].farmId,endpoint:'fixture-other'}]});
  await put('withdrawal-requests.json',{version:1,requests:[{id:'11111111-1111-4111-8111-111111111111',userId:users[1].id,farmId:users[1].farmId,farmName:users[1].farmName,name:users[1].name,email:users[1].email,planAtRequest:'free',timing:'consult_first',status:'pending',requestedAt:new Date().toISOString()}]});
  globalThis.fetch = async () => { throw new Error('Unexpected external request'); };
});
afterEach(async () => {
  globalThis.fetch=realFetch;
  for(const server of servers){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  assert(root.startsWith(path.join(os.tmpdir(),'farmpro-real-withdrawal-')));await fs.rm(root,{force:true,recursive:true});
  for(const key of env){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
});
test('preview and status are read-only; a signed receipt cannot start deletion',async()=>{
  const before=await raw('users.json');const body=await prepare();
  assert.deepEqual(await accountWithdrawalResult(body.token),{status:'not_started',accountClosed:false,serverDataDeleted:false});
  await assert.rejects(fs.stat(path.join(root,'account-withdrawals.json')),{code:'ENOENT'});assert.equal(await raw('users.json'),before);
});
test('owner completes actual withdrawal, revokes every token, removes only own dedicated data and retains billing history',async()=>{
  const token=createToken(safe(users[1]));const body=await prepare();const bank=await raw('bank-transfer-applications.json');const stripe=await raw('stripeSubscriptions.json');
  const result=await executeAccountWithdrawal(safe(users[1]),body);assert.equal(result.status,'completed');assert.equal(result.serverDataDeleted,true);
  assert.equal(await verifyToken(token),null);assert.equal(await authenticate(users[1].email,password),null);
  await assert.rejects(fs.stat(path.join(root,'farms/farm-owner')),{code:'ENOENT'});
  assert.deepEqual(await data('farms/farm-other/cattle.json'),[{id:'other-cow'}]);assert.deepEqual((await data('users.json')).map((x:any)=>x.id),[users[0].id,users[2].id]);
  assert.equal(await raw('bank-transfer-applications.json'),bank);assert.equal(await raw('stripeSubscriptions.json'),stripe);
  assert.deepEqual((await data('push-subscriptions.json')).subscriptions.map((x:any)=>x.endpoint),['fixture-other']);
  const inbox=await listWithdrawalRequests(safe(users[0]));assert.equal(inbox.pendingCount,0);assert.equal(inbox.requests[0].status,'completed');
  assert.deepEqual(await accountWithdrawalResult(body.token),result);
  const audit=(await withdrawalCompletions())[0];assert.equal(Object.keys(audit).some(k=>/email|password|name/i.test(k)),false);
});
test('operator needs own password and explicit owner consent even for a stopped trial account',async()=>{
  users[1].active=false;await put('users.json',users);const body=await prepare(0,1);
  await assert.rejects(executeAccountWithdrawal(safe(users[0]),{...body,consentConfirmed:false}),/CONFIRMATION_INVALID/);
  await assert.rejects(executeAccountWithdrawal(safe(users[0]),{...body,password:'wrong'}),/PASSWORD_INVALID/);
  assert.equal((await executeAccountWithdrawal(safe(users[0]),body)).status,'completed');assert(await verifyToken(createToken(safe(users[0]))));
});
test('another owner cannot preview or execute someone else and cannot override signed target',async()=>{
  await assert.rejects(previewAccountWithdrawal(safe(users[2]),users[1].id),/TARGET_NOT_FOUND/);
  const body=await prepare();await assert.rejects(executeAccountWithdrawal(safe(users[2]),body),/CONFIRMATION_INVALID/);
  await assert.rejects(executeAccountWithdrawal(safe(users[1]),{...body,targetId:users[2].id}),/CONFIRMATION_INVALID/);
  assert.equal((await withdrawalCompletions()).length,0);
});
test('operator account, legacy demo farm, shared farms and paid labels are blocked rather than deleted',async()=>{
  assert.equal((await previewAccountWithdrawal(safe(users[0]),users[0].id)).eligible,false);
  for(const patch of [{farmId:'farm-demo'},{plan:'standard' as const},{role:'member' as const}]){
    const original={...users[1]};Object.assign(users[1],patch);await put('users.json',users);
    assert.equal((await previewAccountWithdrawal(safe(users[0]),users[1].id)).eligible,false);users[1]=original;
  }
  users[2].farmId=users[1].farmId;await put('users.json',users);assert.equal((await previewAccountWithdrawal(safe(users[0]),users[1].id)).eligible,false);
  assert.deepEqual(await data('farms/farm-owner/cattle.json'),[{id:'owner-cow'}]);
});
test('active, pending and uncertain ended bank contracts block even a Free label; ended past periods allow withdrawal',async()=>{
  for(const record of [{status:'active'},{status:'pending_payment'},{status:'ended'},{status:'ended',contractEndsAt:'2099-01-01T00:00:00Z'},{status:'expired',activatedAt:'2020-01-01T00:00:00Z'}]){
    await put('bank-transfer-applications.json',[{...record,userId:users[1].id}]);assert.equal((await previewAccountWithdrawal(safe(users[1]),users[1].id)).eligible,false);
  }
  await put('bank-transfer-applications.json',[{userId:users[1].id,status:'ended',contractEndsAt:'2020-01-01T00:00:00Z'}]);assert.equal((await previewAccountWithdrawal(safe(users[1]),users[1].id)).eligible,true);
});
test('card history requires live terminal state, no other subscription and settled invoices; only GET requests are used',async()=>{
  await put('stripeSubscriptions.json',[{userId:users[1].id,subscriptionId:'sub_fixture',status:'inactive'}]);
  assert.equal((await previewAccountWithdrawal(safe(users[1]),users[1].id)).eligible,false);
  process.env.STRIPE_SECRET_KEY='fixture-key';let status='unpaid';let invoices:any[]=[];let subscriptions:any[]=[];let paginated=false;
  globalThis.fetch=async (input,init)=>{assert.equal(init?.method || 'GET','GET');assert(String(input).startsWith('https://api.stripe.com/v1/'));
    return {ok:true,json:async()=>String(input).includes('/subscriptions/sub_')?{id:'sub_fixture',status,customer:'cus_fixture'}:String(input).includes('/invoices?')?{data:invoices,has_more:paginated}:{data:subscriptions,has_more:false}} as Response;
  };
  assert.equal((await previewAccountWithdrawal(safe(users[1]),users[1].id)).eligible,false);
  status='canceled';subscriptions=[{status:'active'}];assert.equal((await previewAccountWithdrawal(safe(users[1]),users[1].id)).eligible,false);
  subscriptions=[];invoices=[{status:'open'}];assert.equal((await previewAccountWithdrawal(safe(users[1]),users[1].id)).eligible,false);
  invoices=[{status:'paid'}];paginated=true;assert.equal((await previewAccountWithdrawal(safe(users[1]),users[1].id)).eligible,false);
  paginated=false;assert.equal((await previewAccountWithdrawal(safe(users[1]),users[1].id)).eligible,true);
});
test('changed email, password or billing after preview invalidates final confirmation without writing a tombstone',async()=>{
  const body=await prepare();users[1].email='changed@example.invalid';await put('users.json',users);
  await assert.rejects(executeAccountWithdrawal(safe(users[1]),body),/STATE_CHANGED/);assert.equal((await withdrawalCompletions()).length,0);
});
test('backup and irreversible confirmation are required and malformed proof is rejected',async()=>{
  const body=await prepare();
  for(const patch of [{confirmed:false},{backupConfirmed:false},{email:'other@example.invalid'},{token:body.token+'x'}]) await assert.rejects(executeAccountWithdrawal(safe(users[1]),{...body,...patch}));
  assert.equal((await withdrawalCompletions()).length,0);
});
test('stale account saves cannot revive the deleted user or recreate the withdrawn farm',async()=>{
  await executeAccountWithdrawal(safe(users[1]),await prepare());await assert.rejects(writeJson('users.json',users),/USER_WITHDRAWN/);
  assert.equal((await readJson<FarmProUser[]>('users.json',[])).some(x=>x.id===users[1].id),false);
  await assert.rejects(runWithFarm(users[1].farmId,()=>writeJson('cattle.json',[{id:'resurrect'}])),/FARM_WITHDRAWN/);
  await assert.rejects(runWithFarm(users[1].farmId,()=>readJson('cattle.json',[])),/FARM_WITHDRAWN/);
});
test('tombstone write failure leaves accounts and records unchanged',async(t)=>{
  const body=await prepare();const before=await raw('users.json');const rename=fs.rename.bind(fs);
  t.mock.method(fs,'rename',async(from: Parameters<typeof fs.rename>[0],to: Parameters<typeof fs.rename>[1])=>{if(String(to).endsWith('account-withdrawals.json'))throw new Error('fixture-disk');return rename(from,to);});
  await assert.rejects(executeAccountWithdrawal(safe(users[1]),body));assert.equal(await raw('users.json'),before);assert.equal((await withdrawalCompletions()).length,0);
  assert.deepEqual(await data('farms/farm-owner/cattle.json'),[{id:'owner-cow'}]);
});
test('cleanup failure revokes login but is never complete, and confirmed processing resumes safely',async(t)=>{
  const body=await prepare();const token=createToken(safe(users[1]));const mock=t.mock.method(fs,'rm',async()=>{throw new Error('fixture-cleanup');});
  const result=await executeAccountWithdrawal(safe(users[1]),body);assert.equal(result.status,'processing');assert.equal(result.serverDataDeleted,false);assert.equal(await verifyToken(token),null);
  assert.equal((await accountWithdrawalResult(body.token)).status,'processing');mock.mock.restore();await resumeAccountWithdrawals();
  assert.equal((await accountWithdrawalResult(body.token)).status,'completed');assert.deepEqual(await data('farms/farm-other/cattle.json'),[{id:'other-cow'}]);
});
test('failure after user removal still resumes from durable minimal IDs without resurrecting credentials',async(t)=>{
  const body=await prepare();const rename=fs.rename.bind(fs);let writes=0;
  const mock=t.mock.method(fs,'rename',async(from: Parameters<typeof fs.rename>[0],to: Parameters<typeof fs.rename>[1])=>{if(String(to).endsWith('account-withdrawals.json') && ++writes===2)throw new Error('fixture-last-write');return rename(from,to);});
  assert.equal((await executeAccountWithdrawal(safe(users[1]),body)).status,'processing');assert.equal((await data('users.json')).some((x:any)=>x.id===users[1].id),false);
  mock.mock.restore();await resumeAccountWithdrawals();assert.equal((await accountWithdrawalResult(body.token)).status,'completed');
});
test('symlink to another farm is refused before acceptance and never deletes another tree',async()=>{
  await fs.rm(path.join(root,'farms/farm-owner'),{recursive:true});await fs.symlink(path.join(root,'farms/farm-other'),path.join(root,'farms/farm-owner'));
  await assert.rejects(executeAccountWithdrawal(safe(users[1]),await prepare()),/STORAGE_UNAVAILABLE/);
  assert.equal((await withdrawalCompletions()).length,0);assert.deepEqual(await data('farms/farm-other/cattle.json'),[{id:'other-cow'}]);
});
test('corrupt billing and lifecycle storage fail closed rather than being interpreted as no contract',async()=>{
  await put('stripeSubscriptions.json',null);await assert.rejects(previewAccountWithdrawal(safe(users[1]),users[1].id),/STORAGE_UNAVAILABLE/);
  await put('stripeSubscriptions.json',[]);await put('account-withdrawals.json',{version:1,operations:[{bad:true}]});
  await assert.rejects(previewAccountWithdrawal(safe(users[1]),users[1].id),/STORAGE_UNAVAILABLE/);assert.deepEqual(await data('farms/farm-owner/cattle.json'),[{id:'owner-cow'}]);
});
test('withdrawal waits for an in-flight farm writer and excludes its later stale requests',async()=>{
  const body=await prepare();let release!:()=>void;let started!:()=>void;const ready=new Promise<void>(r=>{started=r;});
  const old=withFarmRequest(users[1].farmId,async()=>{started();await new Promise<void>(r=>{release=r;});await put('farms/farm-owner/cattle.json',[{id:'last-write'}]);});
  await ready;let finished=false;const closing=executeAccountWithdrawal(safe(users[1]),body).then(x=>{finished=true;return x;});
  await new Promise<void>(r=>setTimeout(r,20));assert.equal(finished,false);release();await old;assert.equal((await closing).status,'completed');
  await assert.rejects(fs.stat(path.join(root,'farms/farm-owner')),{code:'ENOENT'});
});
test('HTTP route requires login and repeated password failures are limited; receipt lookup works after token revocation',async()=>{
  const app=express();app.use(express.json());app.use('/api/account-withdrawals',accountWithdrawalsRouter);
  const server=app.listen(0,'127.0.0.1');servers.push(server);await once(server,'listening');const address=server.address();assert(address&&typeof address!=='string');
  const call=(route:string,body?:unknown,token=createToken(safe(users[1])))=>realFetch(`http://127.0.0.1:${address.port}/api/account-withdrawals${route}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await call('/me/preview',undefined,'')).status,401);
  const body=await prepare();for(let i=0;i<5;i++)assert.equal((await call('/execute',{...body,password:'wrong'})).status,409);
  assert.equal((await call('/execute',body)).status,429);
  // Use operator to avoid the deliberate owner cooldown.
  const operatorBody=await prepare(0,1);assert.equal((await call('/execute',operatorBody,createToken(safe(users[0])))).status,200);
  assert.equal((await call('/me/preview')).status,401);
  assert.equal((await (await call('/result',{token:operatorBody.token},'')).json()).status,'completed');
});
test('operator recovery can only resume a previously accepted operation and leaves other processing farms untouched',async(t)=>{
  const ownerBody=await prepare(0,1);const otherBody=await prepare(0,2);
  const mock=t.mock.method(fs,'rm',async()=>{throw new Error('fixture-cleanup');});
  const first=await executeAccountWithdrawal(safe(users[0]),ownerBody);
  const second=await executeAccountWithdrawal(safe(users[0]),otherBody);mock.mock.restore();
  const app=express();app.use(express.json());app.use('/api/account-withdrawals',accountWithdrawalsRouter);
  const server=app.listen(0,'127.0.0.1');servers.push(server);await once(server,'listening');const address=server.address();assert(address&&typeof address!=='string');
  const call=(route:string,body?:unknown,token=createToken(safe(users[0])))=>realFetch(`http://127.0.0.1:${address.port}/api/account-withdrawals${route}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await call('/operator/processing',undefined,'')).status,401);
  assert.equal((await (await call('/operator/processing')).json()).operations.length,2);
  assert.equal((await call('/operator/retry-cleanup',{operationId:'never-accepted'})).status,409);
  assert.equal((await (await call('/operator/retry-cleanup',{operationId:first.operationId})).json()).status,'completed');
  assert.equal((await accountWithdrawalResult(otherBody.token)).status,'processing');
  assert.deepEqual(await data('farms/farm-other/cattle.json'),[{id:'other-cow'}]);
  assert.equal((await (await call('/operator/processing')).json()).operations.length,1);
});
test('expired preview cannot execute deletion but its read-only result remains available for one day',async(t)=>{
  const body=await prepare();const original=Date.now;const now=original();
  t.mock.method(Date,'now',()=>now+6*60000);
  await assert.rejects(executeAccountWithdrawal(safe(users[1]),body),/CONFIRMATION_EXPIRED/);
  assert.equal((await accountWithdrawalResult(body.token)).status,'not_started');
  assert.equal((await withdrawalCompletions()).length,0);
});
