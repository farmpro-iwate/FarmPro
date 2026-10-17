import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { stripeWebhookHandler } from './stripeWebhook';

test('Stripe checkout rejects email-less LINE user without plan assignment and accepts email user', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'farmpro-stripe-line-'));
  const saved={dir:process.env.FARMPRO_DATA_DIR,secret:process.env.STRIPE_WEBHOOK_TEST_SECRET,node:process.env.NODE_ENV};
  process.env.FARMPRO_DATA_DIR=root;
  process.env.STRIPE_WEBHOOK_TEST_SECRET='test-stripe-line-secret';
  const lineId='11111111-1111-4111-8111-111111111111';
  const emailId='22222222-2222-4222-8222-222222222222';
  const inactiveId='33333333-3333-4333-8333-333333333333';
  const withdrawingId='55555555-5555-4555-8555-555555555555';
  await fs.writeFile(path.join(root,'users.json'),JSON.stringify([
    {id:lineId,farmId:'farm-line',farmName:'LINE',name:'LINE Owner',role:'owner',active:true,plan:'free',loginMethod:'line',lineSubject:'UlineStripeTest'},
    {id:emailId,farmId:'farm-email',farmName:'Email',name:'Email Owner',email:'payer@example.invalid',passwordSalt:'s',passwordHash:'h',role:'owner',active:true,plan:'free'},
    {id:inactiveId,farmId:'farm-inactive',farmName:'Closed',name:'Closed Owner',email:'closed@example.invalid',passwordSalt:'s',passwordHash:'h',role:'owner',active:false,plan:'free'},
    {id:withdrawingId,farmId:'farm-withdrawing',farmName:'Withdrawing',name:'Withdrawing Owner',email:'withdrawing@example.invalid',passwordSalt:'s',passwordHash:'h',role:'owner',active:true,plan:'free'}
  ]));
  const app=express();
  app.post('/webhook',express.raw({type:'application/json'}),stripeWebhookHandler);
  const server=app.listen(0,'127.0.0.1');
  try {
    await once(server,'listening');
    const addr=server.address();assert(addr&&typeof addr!=='string');
    const endpoint=`http://127.0.0.1:${addr.port}/webhook`;
    const send=async(id:string,reference:string)=> {
      const raw=JSON.stringify({id,type:'checkout.session.completed',data:{object:{client_reference_id:reference,currency:'jpy',amount_total:2750,subscription:'sub_line_guard_test'}}});
      const timestamp=Math.floor(Date.now()/1000);
      const signature=crypto.createHmac('sha256',process.env.STRIPE_WEBHOOK_TEST_SECRET!).update(`${timestamp}.${raw}`).digest('hex');
      return fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':`t=${timestamp},v1=${signature}`},body:raw});
    };
    const blocked=await send('evt_line_block',lineId);
    assert.equal(blocked.status,500);
    let users=JSON.parse(await fs.readFile(path.join(root,'users.json'),'utf8'));
    assert.equal(users.find((x:{id:string})=>x.id===lineId).plan,'free');
    const inactive=await send('evt_inactive_block',inactiveId);
    assert.equal(inactive.status,500);
    const missing=await send('evt_missing_block','44444444-4444-4444-8444-444444444444');
    assert.equal(missing.status,500);
    users=JSON.parse(await fs.readFile(path.join(root,'users.json'),'utf8'));
    assert.equal(users.find((x:{id:string})=>x.id===inactiveId).plan,'free');
    await fs.writeFile(path.join(root,'account-withdrawals.json'),JSON.stringify({version:1,operations:[{id:'op-withdrawing',actorId:withdrawingId,userId:withdrawingId,farmId:'farm-withdrawing',startedAt:new Date().toISOString(),status:'processing'}]}));
    const withdrawing=await send('evt_withdrawing_block',withdrawingId);
    assert.equal(withdrawing.status,500);
    users=JSON.parse(await fs.readFile(path.join(root,'users.json'),'utf8'));
    assert.equal(users.find((x:{id:string})=>x.id===withdrawingId).plan,'free');
    // A late cancellation should acknowledge the webhook even after the user
    // is deleted; it must not restore a user or change another farm.
    await fs.writeFile(path.join(root,'stripeSubscriptions.json'),JSON.stringify([
      {subscriptionId:'sub_closed_test',userId:'66666666-6666-4666-8666-666666666666',plan:'standard',billing:'monthly',status:'active',updatedAt:new Date().toISOString()}
    ]));
    const cancellationRaw=JSON.stringify({id:'evt_deleted_user_cancel',type:'customer.subscription.deleted',data:{object:{id:'sub_closed_test'}}});
    const cancellationTime=Math.floor(Date.now()/1000);
    const cancellationSig=crypto.createHmac('sha256',process.env.STRIPE_WEBHOOK_TEST_SECRET!).update(`${cancellationTime}.${cancellationRaw}`).digest('hex');
    const cancellation=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':`t=${cancellationTime},v1=${cancellationSig}`},body:cancellationRaw});
    assert.equal(cancellation.status,200);
    const ledger=JSON.parse(await fs.readFile(path.join(root,'stripeSubscriptions.json'),'utf8'));
    assert.equal(ledger.find((x:{subscriptionId:string})=>x.subscriptionId==='sub_closed_test').status,'inactive');
    users=JSON.parse(await fs.readFile(path.join(root,'users.json'),'utf8'));
    assert.equal(users.length,4);
    const accepted=await send('evt_email_allow',emailId);
    assert.equal(accepted.status,200);
    users=JSON.parse(await fs.readFile(path.join(root,'users.json'),'utf8'));
    assert.equal(users.find((x:{id:string})=>x.id===emailId).plan,'standard');
    assert.equal(users.find((x:{id:string})=>x.id===lineId).plan,'free');
  }finally{
    await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    if(saved.dir===undefined)delete process.env.FARMPRO_DATA_DIR;else process.env.FARMPRO_DATA_DIR=saved.dir;
    if(saved.secret===undefined)delete process.env.STRIPE_WEBHOOK_TEST_SECRET;else process.env.STRIPE_WEBHOOK_TEST_SECRET=saved.secret;
    await fs.rm(root,{recursive:true,force:true});
  }
});
