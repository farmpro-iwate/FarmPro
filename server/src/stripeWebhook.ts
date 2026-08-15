import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { readJson, writeJson } from './jsonStore';
import { updateUserPlanById, type FarmProPlanId } from './authStore';

type BillingPeriod = 'monthly' | 'yearly';

type StripeSubscriptionRecord = {
  subscriptionId: string;
  userId: string;
  plan: Exclude<FarmProPlanId, 'free'>;
  billing: BillingPeriod;
  status: 'active' | 'inactive';
  updatedAt: string;
};

type ProcessedStripeEvent = {
  id: string;
  type: string;
  processedAt: string;
};

type StripeEvent = {
  id: string;
  type: string;
  data?: {
    object?: Record<string, unknown>;
  };
};

const SUBSCRIPTIONS_FILE = 'stripeSubscriptions.json';
const EVENTS_FILE = 'stripeWebhookEvents.json';
const SIGNATURE_TOLERANCE_SECONDS = 300;
const MAX_EVENT_HISTORY = 500;

function webhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || '';
}

function safeCompareHex(left: string, right: string) {
  try {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function verifyStripeSignature(rawBody: Buffer, signatureHeader: string, secret: string) {
  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith('t='));
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));

  if (!timestampPart || signatures.length === 0) return false;

  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const payload = `${timestamp}.${rawBody.toString('utf-8')}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return signatures.some((signature) => safeCompareHex(signature, expected));
}

function parseClientReferenceId(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^([0-9a-fA-F-]{36})_(standard|pro)_(monthly|yearly)$/);
  if (!match) return null;
  return {
    userId: match[1],
    plan: match[2] as Exclude<FarmProPlanId, 'free'>,
    billing: match[3] as BillingPeriod,
  };
}

async function processedEventIds() {
  return readJson<ProcessedStripeEvent[]>(EVENTS_FILE, []);
}

async function markEventProcessed(event: StripeEvent) {
  const events = await processedEventIds();
  const next = [
    ...events.filter((item) => item.id !== event.id),
    { id: event.id, type: event.type, processedAt: new Date().toISOString() },
  ].slice(-MAX_EVENT_HISTORY);
  await writeJson(EVENTS_FILE, next);
}

async function subscriptionRecords() {
  return readJson<StripeSubscriptionRecord[]>(SUBSCRIPTIONS_FILE, []);
}

async function saveSubscription(record: StripeSubscriptionRecord) {
  const records = await subscriptionRecords();
  const next = records.filter((item) => item.subscriptionId !== record.subscriptionId);
  next.push(record);
  await writeJson(SUBSCRIPTIONS_FILE, next);
}

async function deactivateSubscription(subscriptionId: string) {
  const records = await subscriptionRecords();
  const index = records.findIndex((item) => item.subscriptionId === subscriptionId);
  if (index < 0) return;

  const current = records[index];
  const updated: StripeSubscriptionRecord = {
    ...current,
    status: 'inactive',
    updatedAt: new Date().toISOString(),
  };
  const next = [...records];
  next[index] = updated;
  await writeJson(SUBSCRIPTIONS_FILE, next);

  const activeForUser = next.filter((item) => item.userId === current.userId && item.status === 'active');
  const nextPlan: FarmProPlanId = activeForUser.some((item) => item.plan === 'pro')
    ? 'pro'
    : activeForUser.some((item) => item.plan === 'standard')
      ? 'standard'
      : 'free';
  await updateUserPlanById(current.userId, nextPlan);
}

async function handleCheckoutCompleted(object: Record<string, unknown>) {
  const reference = parseClientReferenceId(object.client_reference_id);
  if (!reference) throw new Error('INVALID_CLIENT_REFERENCE_ID');

  const subscriptionId = typeof object.subscription === 'string' ? object.subscription : '';
  if (!subscriptionId) throw new Error('SUBSCRIPTION_ID_REQUIRED');

  await updateUserPlanById(reference.userId, reference.plan);
  await saveSubscription({
    subscriptionId,
    userId: reference.userId,
    plan: reference.plan,
    billing: reference.billing,
    status: 'active',
    updatedAt: new Date().toISOString(),
  });
}

async function handleSubscriptionStatus(object: Record<string, unknown>) {
  const subscriptionId = typeof object.id === 'string' ? object.id : '';
  if (!subscriptionId) return;

  const status = typeof object.status === 'string' ? object.status : '';
  if (status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired') {
    await deactivateSubscription(subscriptionId);
  }
}

async function processStripeEvent(event: StripeEvent) {
  const events = await processedEventIds();
  if (events.some((item) => item.id === event.id)) return;

  const object = event.data?.object;
  if (!object) {
    await markEventProcessed(event);
    return;
  }

  if (event.type === 'checkout.session.completed') {
    await handleCheckoutCompleted(object);
  } else if (event.type === 'customer.subscription.deleted') {
    const subscriptionId = typeof object.id === 'string' ? object.id : '';
    if (subscriptionId) await deactivateSubscription(subscriptionId);
  } else if (event.type === 'customer.subscription.updated') {
    await handleSubscriptionStatus(object);
  }

  await markEventProcessed(event);
}

export async function stripeWebhookHandler(req: Request, res: Response) {
  const secret = webhookSecret();
  if (!secret) {
    res.status(503).json({ message: 'Stripe Webhook is not configured' });
    return;
  }

  const signature = req.header('stripe-signature') || '';
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!signature || rawBody.length === 0 || !verifyStripeSignature(rawBody, signature, secret)) {
    res.status(400).json({ message: 'Invalid Stripe signature' });
    return;
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody.toString('utf-8')) as StripeEvent;
  } catch {
    res.status(400).json({ message: 'Invalid Stripe payload' });
    return;
  }

  try {
    await processStripeEvent(event);
    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing failed', error);
    res.status(500).json({ message: 'Stripe webhook processing failed' });
  }
}
