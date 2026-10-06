import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import { readJson, writeJson } from './jsonStore';
import { updateUserPlanById, type FarmProPlanId, type FarmProUser } from './authStore';
import { getActiveBankTransferSummary } from './bankTransferApplicationStore';
import { accountEmailDigest, assertFarmNotRetired, readAccountRetirements, withAccountDataLock } from './accountDeletionGuard';

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
const LEGACY_FARM_ID = 'farm-demo';

const OFFERS = new Map<number, { plan: PaidPlanId; billing: BillingPeriod }>([
  [2750, { plan: 'standard', billing: 'monthly' }],
  [5500, { plan: 'pro', billing: 'monthly' }],
]);

function runtimeDataDir() {
  const configuredDir = process.env.FARMPRO_DATA_DIR?.trim();
  return configuredDir
    ? path.resolve(configuredDir)
    : path.resolve(process.cwd(), 'data');
}

async function readLegacyFarmFile<T>(fileName: string): Promise<T[]> {
  const legacyPath = path.resolve(runtimeDataDir(), 'farms', LEGACY_FARM_ID, fileName);
  try {
    const raw = await fs.readFile(legacyPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('STRIPE_LEDGER_INVALID');
    return parsed as T[];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return [];
    throw error;
  }
}

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
  // A missing legacy reference and a supplied but invalid ID are different.
  // Never fall back to email when the explicit account reference is malformed.
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('INVALID_STRIPE_USER_REFERENCE');
  }
  return value;
}

function checkoutEmail(object: Record<string, unknown>) {
  if (typeof object.customer_email === 'string' && object.customer_email.trim()) {
    return object.customer_email.trim();
  }
  const customerDetails = object.customer_details;
  if (customerDetails && typeof customerDetails === 'object') {
    const email = (customerDetails as Record<string, unknown>).email;
    if (typeof email === 'string' && email.trim()) return email.trim();
  }
  return null;
}

function checkoutOffer(object: Record<string, unknown>) {
  const currency = typeof object.currency === 'string' ? object.currency.toLowerCase() : '';
  const amountTotal = typeof object.amount_total === 'number' ? object.amount_total : NaN;
  if (currency !== 'jpy' || !Number.isFinite(amountTotal)) return null;
  return OFFERS.get(amountTotal) || null;
}

function processedEventIds() {
  return withAccountDataLock(async () => {
    const globalEvents = await readJson<ProcessedStripeEvent[]>(EVENTS_FILE, []);
    const legacyEvents = await readLegacyFarmFile<ProcessedStripeEvent>(EVENTS_FILE);
    if (legacyEvents.length === 0) return globalEvents;

    const byId = new Map<string, ProcessedStripeEvent>();
    for (const item of [...globalEvents, ...legacyEvents]) {
      const current = byId.get(item.id);
      if (!current || item.processedAt > current.processedAt) byId.set(item.id, item);
    }
    const merged = [...byId.values()]
      .sort((a, b) => a.processedAt.localeCompare(b.processedAt))
      .slice(-MAX_EVENT_HISTORY);
    await writeJson(EVENTS_FILE, merged);
    return merged;
  });
}

async function markEventProcessed(event: StripeEvent) {
  const events = await processedEventIds();
  const next = [
    ...events.filter((item) => item.id !== event.id),
    { id: event.id, type: event.type, processedAt: new Date().toISOString() },
  ].slice(-MAX_EVENT_HISTORY);
  await writeJson(EVENTS_FILE, next);
}

function subscriptionRecords() {
  // This helper can also be called by the operator list. Its legacy merge must
  // share the lock, not publish an old snapshot over a concurrent webhook.
  return withAccountDataLock(async () => {
    const globalRecords = await readJson<StripeSubscriptionRecord[]>(SUBSCRIPTIONS_FILE, []);
    const legacyRecords = await readLegacyFarmFile<StripeSubscriptionRecord>(SUBSCRIPTIONS_FILE);
    if (!Array.isArray(globalRecords)) throw new Error('STRIPE_LEDGER_INVALID');
    const bySubscriptionId = new Map<string, StripeSubscriptionRecord>();
    for (const item of [...globalRecords, ...legacyRecords]) {
      if (!item || typeof item.subscriptionId !== 'string' || !item.subscriptionId ||
          typeof item.userId !== 'string' || !item.userId) throw new Error('STRIPE_LEDGER_INVALID');
      const current = bySubscriptionId.get(item.subscriptionId);
      if (current && current.userId !== item.userId) throw new Error('BILLING_ACCOUNT_REVIEW_REQUIRED');
      if (!current || item.updatedAt > current.updatedAt) bySubscriptionId.set(item.subscriptionId, item);
    }
    if (legacyRecords.length === 0) return globalRecords;
    const merged = [...bySubscriptionId.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    await writeJson(SUBSCRIPTIONS_FILE, merged);
    return merged;
  });
}

export async function getActiveSubscriptionSummary(userId: string) {
  const records = await subscriptionRecords();
  const current = records
    .filter((item) => item.userId === userId && item.status === 'active')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!current) return null;
  return {
    plan: current.plan,
    billing: current.billing,
    status: current.status,
  };
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

  const latestActiveStripe = next
    .filter((item) => item.userId === current.userId && item.status === 'active')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const activeBank = await getActiveBankTransferSummary(current.userId);
  const nextPlan: FarmProPlanId = latestActiveStripe?.plan || activeBank?.plan || 'free';
  await updateUserPlanById(current.userId, nextPlan);
}

async function handleCheckoutCompleted(object: Record<string, unknown>) {
  const offer = checkoutOffer(object);
  if (!offer) throw new Error('UNKNOWN_STRIPE_OFFER');

  const subscriptionId = typeof object.subscription === 'string' ? object.subscription : '';
  if (!subscriptionId) throw new Error('SUBSCRIPTION_ID_REQUIRED');

  const userId = parseUserId(object.client_reference_id);
  const users = await readJson<FarmProUser[]>('users.json', []);
  let candidates: FarmProUser[];
  if (userId) {
    candidates = users.filter((user) => user.id === userId);
  } else {
    const email = (checkoutEmail(object) || '').trim().toLowerCase();
    if (!email || (await readAccountRetirements()).some((item) => item.emailDigest === accountEmailDigest(email))) {
      throw new Error('BILLING_ACCOUNT_REVIEW_REQUIRED');
    }
    candidates = users.filter((user) => user.email.trim().toLowerCase() === email);
  }
  if (candidates.length !== 1) throw new Error('BILLING_ACCOUNT_REVIEW_REQUIRED');
  const target = candidates[0];
  await assertFarmNotRetired(target.farmId);

  const existing = (await subscriptionRecords()).find((item) => item.subscriptionId === subscriptionId);
  if (existing && (existing.userId !== target.id || existing.status !== 'active' ||
      existing.plan !== offer.plan || existing.billing !== offer.billing)) {
    throw new Error('BILLING_ACCOUNT_REVIEW_REQUIRED');
  }
  // A second Checkout event for the same subscription must not overwrite a
  // newer plan selection. Only an unambiguous first association is created.
  if (existing) return;

  const updatedUser = await updateUserPlanById(target.id, offer.plan);
  await saveSubscription({
    subscriptionId,
    userId: updatedUser.id,
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

function processStripeEvent(event: StripeEvent) {
  // Keep deduplication, account selection, plan update and ledger publication
  // together with deletion. This does not verify contracts on Stripe itself.
  return withAccountDataLock(async () => {
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
  });
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
    if (!event || typeof event.id !== 'string' || !event.id || typeof event.type !== 'string' || !event.type) {
      throw new Error('INVALID_STRIPE_EVENT');
    }
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
