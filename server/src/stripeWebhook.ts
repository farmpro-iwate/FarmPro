import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { readJson, writeJson } from './jsonStore';
import { updateUserPlanById, type FarmProPlanId } from './authStore';

type BillingPeriod = 'monthly' | 'yearly';
type PaidPlanId = Exclude<FarmProPlanId, 'free'>;

type StripeSubscriptionRecord = {
  subscriptionId: string;
  userId: string;
  plan: PaidPlanId;
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
  data?: { object?: Record<string, unknown> };
};

const SUBSCRIPTIONS_FILE = 'stripeSubscriptions.json';
const EVENTS_FILE = 'stripeWebhookEvents.json';
const SIGNATURE_TOLERANCE_SECONDS = 300;
const MAX_EVENT_HISTORY = 500;

const OFFERS = new Map<number, { plan: PaidPlanId; billing: BillingPeriod }>([
  [1650, { plan: 'standard', billing: 'monthly' }],
  [18150, { plan: 'standard', billing: 'yearly' }],
  [3300, { plan: 'pro', billing: 'monthly' }],
  [36300, { plan: 'pro', billing: 'yearly' }],
]);

function webhookSecrets() {
  return [
    process.env.STRIPE_WEBHOOK_SECRET?.trim(),
    process.env.STRIPE_WEBHOOK_TEST_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));
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
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestampPart || signatures.length === 0) return false;

  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const payload = `${timestamp}.${rawBody.toString('utf-8')}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return signatures.some((signature) => safeCompareHex(signature, expected));
}

function parseUserId(value: unknown) {
  if (typeof value !== 'string') return null;
  return /^[0-9a-fA-F-]{36}$/.test(value) ? value : null;
}

function checkoutOffer(object: Record<string, unknown>) {
  const currency = typeof object.currency === 'string' ? object.currency.toLowerCase() : '';
  const amountTotal = typeof object.amount_total === 'number' ? object.amount_total : NaN;
  if (currency !== 'jpy' || !Number.isFinite(amountTotal)) return null;
  return OFFERS.get(amountTotal) || null;
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
  const next = [...records];
  next[index] = { ...current, status: 'inactive', updatedAt: new Date().toISOString() };
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
  const userId = parseUserId(object.client_reference_id);
  if (!userId) throw new Error('INVALID_CLIENT_REFERENCE_ID');

  const offer = checkoutOffer(object);
  if (!offer) throw new Error('UNKNOWN_STRIPE_OFFER');

  const subscriptionId = typeof object.subscription === 'string' ? object.subscription : '';
  if (!subscriptionId) throw new Error('SUBSCRIPTION_ID_REQUIRED');

  await updateUserPlanById(userId, offer.plan);
  await saveSubscription({
    subscriptionId,
    userId,
    plan: offer.plan,
    billing: offer.billing,
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
  const secrets = webhookSecrets();
  if (secrets.length === 0) {
    res.status(503).json({ message: 'Stripe Webhook is not configured' });
    return;
  }

  const signature = req.header('stripe-signature') || '';
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const signatureValid = signature && rawBody.length > 0 && secrets.some((secret) => verifyStripeSignature(rawBody, signature, secret));
  if (!signatureValid) {
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
