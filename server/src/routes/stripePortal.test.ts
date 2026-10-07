import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import express from 'express';
import { createStripePortal, isStripePortalUrl } from '../stripePortalStore';
import { stripePortalRouter } from './stripePortal';
import { requireAuth } from '../authMiddleware';
const actor={id:'portal-owner',farmId:'farm-portal',role:'owner' as const};
const keys=['FARMPRO_DATA_DIR','STRIPE_SECRET_KEY','FARMPRO_STRIPE_SECRET_KEY','FARMPRO_STRIPE_PORTAL_CONFIGURATION_ID','NODE_ENV','FARMPRO_ALLOWED_ORIGIN','RENDER_EXTERNAL_URL'];
const realFetch=globalThis.fetch;let previous:Record<string,string|undefined>;let root:string;let calls:Array<{url:string;method:string;body:string}>;let config:any;let own:any;let remote:any;let reply:any;
async function put(name:string,value:unknown){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),JSON.stringify(value));}
beforeEach(async()=>{
  previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));for(const k of keys)delete process.env[k];
  root=await fs.mkdtemp(path.join(os.tmpdir(),'farmpro-portal-'));process.env.FARMPRO_DATA_DIR=root;process.env.STRIPE_SECRET_KEY='sk_test_fixture';process.env.NODE_ENV='test';
  await put('stripeSubscriptions.json',[{userId:actor.id,subscriptionId:'sub_fixture',status:'active'},{userId:'other',subscriptionId:'sub_other',status:'active'}]);
  await put('users.json',[{id:actor.id,farmId:actor.farmId,plan:'pro'}]);
  own={id:'sub_fixture',customer:'cus_fixture',livemode:false,status:'active'};remote={data:[own],has_more:false};
  config={id:'bpc_fixture',active:true,is_default:true,livemode:false,features:{subscription_cancel:{enabled:true,mode:'at_period_end'},subscription_update:{enabled:false},customer_update:{enabled:false},payment_method_update:{enabled:false},invoice_history:{enabled:true}}};
  reply={customer:'cus_fixture',configuration:'bpc_fixture',livemode:false,url:'https://billing.stripe.com/p/session/fixture'};calls=[];
  globalThis.fetch=async(input,init)=>{
    const url=String(input),method=init?.method || 'GET';calls.push({url,method,body:String(init?.body || '')});assert.equal((init?.headers as any).Authorization,'Bearer sk_test_fixture');
    if(url.includes('/subscriptions/sub_fixture'))return {ok:true,json:async()=>own} as Response;
    if(url.includes('/subscriptions?'))return {ok:true,json:async()=>remote} as Response;
    if(url.includes('/billing_portal/configurations/'))return {ok:true,json:async()=>config} as Response;
    if(url.includes('/billing_portal/configurations?'))return {ok:true,json:async()=>({data:[config],has_more:false})} as Response;
    if(url.endsWith('/billing_portal/sessions'))return {ok:true,json:async()=>reply} as Response;
    throw new Error('Unexpected Stripe request');
  };
});
afterEach(async()=>{globalThis.fetch=realFetch;await fs.rm(root,{recursive:true,force:true});for(const k of keys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}});
test('portal opens only recorded own customer using period-end configuration; no contract/account/config mutation',async()=>{
  const before=await fs.readFile(path.join(root,'stripeSubscriptions.json'),'utf8');const users=await fs.readFile(path.join(root,'users.json'),'utf8');
  const result=await createStripePortal(actor);assert.equal(result.url,reply.url);assert.equal(result.subscriptionChanged,false);
  assert(calls.every(x=>x.method==='GET' || (x.method==='POST' && x.url.endsWith('/billing_portal/sessions'))));
  const form=new URLSearchParams(calls.find(x=>x.method==='POST')!.body);assert.equal(form.get('customer'),'cus_fixture');assert.equal(form.get('configuration'),'bpc_fixture');assert.equal(form.get('return_url'),'https://app.farmpro-app.jp/settings');assert.equal(form.get('locale'),'ja');
  assert.equal(await fs.readFile(path.join(root,'stripeSubscriptions.json'),'utf8'),before);assert.equal(await fs.readFile(path.join(root,'users.json'),'utf8'),users);
});
test('missing key, production test key, member and no mapped contract never create a portal',async()=>{
  delete process.env.STRIPE_SECRET_KEY;await assert.rejects(createStripePortal(actor),/SETUP_REQUIRED/);process.env.STRIPE_SECRET_KEY='sk_test_fixture';process.env.NODE_ENV='production';await assert.rejects(createStripePortal(actor),/SETUP_REQUIRED/);process.env.NODE_ENV='test';
  await assert.rejects(createStripePortal({...actor,role:'member'}),/OWNER_REQUIRED/);await assert.rejects(createStripePortal({...actor,id:'unmapped'}),/NO_CONTRACT/);assert.equal(calls.length,0);
});
test('unknown or shared subscription customers and unbounded pages cannot expose another contract',async()=>{
  for(const data of [[{...own,id:'sub_other'}],[{...own,customer:'cus_other'}]]){remote={data,has_more:false};await assert.rejects(createStripePortal(actor),/ACCOUNT_REVIEW/);}
  remote={data:[own],has_more:true};await assert.rejects(createStripePortal(actor),/ACCOUNT_REVIEW/);
  remote={data:[own],has_more:false};await put('stripeSubscriptions.json',[{userId:actor.id,subscriptionId:'sub_fixture',status:'active'},{userId:'other',subscriptionId:'sub_fixture',status:'active'}]);await assert.rejects(createStripePortal(actor),/ACCOUNT_REVIEW/);
  assert(calls.every(x=>x.method==='GET'));
});
test('mismatched subscription identity or mode fails without a session',async()=>{
  own={...own,livemode:true};await assert.rejects(createStripePortal(actor),/ACCOUNT_REVIEW/);
  own={...own,livemode:false,id:'sub_wrong'};await assert.rejects(createStripePortal(actor),/ACCOUNT_REVIEW/);assert(calls.every(x=>x.method==='GET'));
});
test('immediate cancellation, disabled cancellation, plan edits and unsafe configuration fail closed',async()=>{
  for(const change of [()=>{config.features.subscription_cancel.mode='immediately';},()=>{config.features.subscription_cancel.enabled=false;},()=>{config.features.subscription_update.enabled=true;},()=>{config.livemode=true;}]){
    const before=structuredClone(config);change();await assert.rejects(createStripePortal(actor),/SETUP_REQUIRED/);config=before;
  }
  assert(calls.every(x=>x.method==='GET'));
});
test('explicit configuration is validated and return URL comes only from trusted server settings',async()=>{
  process.env.FARMPRO_STRIPE_PORTAL_CONFIGURATION_ID='bpc_fixture';process.env.FARMPRO_ALLOWED_ORIGIN='https://farm.example.invalid';
  await createStripePortal(actor);assert(calls.some(x=>x.url.endsWith('/billing_portal/configurations/bpc_fixture')));assert.equal(new URLSearchParams(calls.find(x=>x.method==='POST')!.body).get('return_url'),'https://farm.example.invalid/settings');
  process.env.FARMPRO_ALLOWED_ORIGIN='https://farm.example.invalid/untrusted';await assert.rejects(createStripePortal(actor),/SETUP_REQUIRED/);
});
test('foreign host, plaintext, userinfo and mismatched session identity are rejected',async()=>{
  for(const value of ['https://billing.stripe.com.evil.invalid/p/session/a','http://billing.stripe.com/p/session/a','https://evil@billing.stripe.com/p/session/a','https://billing.stripe.com:444/p/session/a'])assert.equal(isStripePortalUrl(value),false);
  reply={...reply,customer:'cus_other'};await assert.rejects(createStripePortal(actor),/UNAVAILABLE/);
  reply={...reply,customer:'cus_fixture',url:'https://evil.invalid/p/session/a'};await assert.rejects(createStripePortal(actor),/UNAVAILABLE/);
});
test('malformed ledger fails rather than falling back to email/customer guessing',async()=>{
  await put('stripeSubscriptions.json',{bad:true});await assert.rejects(createStripePortal(actor),/ACCOUNT_REVIEW/);assert.equal(calls.length,0);
});
test('HTTP authentication and caller-supplied targets are rejected before Stripe',async()=>{
  const app=express();app.use(express.json());app.use('/protected',requireAuth,stripePortalRouter);app.use('/fixture',(_req,res,next)=>{res.locals.authUser={...actor,name:'fixture',email:'owner@example.invalid',farmName:'fixture',active:true,plan:'free'};next();},stripePortalRouter);
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert(address&&typeof address!=='string');
  try{
    const call=(route:string,body:unknown)=>realFetch(`http://127.0.0.1:${address.port}${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await call('/protected/portal',{})).status,401);assert.equal((await call('/fixture/portal',{customer:'cus_other',return_url:'https://evil.invalid'})).status,400);assert.equal(calls.length,0);
    const response=await call('/fixture/portal',{});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
