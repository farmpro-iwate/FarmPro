import type { AuthUser } from './authStore';
import { runtimeRoot, safeId, strictRead } from './accountLifecycle';

type Subscription = { subscriptionId: string; userId: string; status: string };
const id = (value: unknown, prefix: string): value is string => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value);
// testStripeWebhook.ts creates these local fixtures, not Stripe subscriptions.
const localTestSubscription = (value: unknown): boolean => typeof value === 'string' && /^sub_farmpro_test_[0-9]+$/.test(value);
export function isStripePortalUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'billing.stripe.com' && !url.username && !url.password && !url.port && /^\/p\/session(?:\/|$)/.test(url.pathname); } catch { return false; }
}
async function subscriptions(): Promise<Subscription[]> {
  const root = runtimeRoot(); const rows: Subscription[] = [];
  for (const name of ['stripeSubscriptions.json', 'farms/farm-demo/stripeSubscriptions.json']) {
    const value = await strictRead(root, name, true);
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some(row => !row || !safeId(row.userId) || (!id(row.subscriptionId, 'sub') && !localTestSubscription(row.subscriptionId)) || !['active','inactive'].includes(row.status))) throw new Error('STRIPE_PORTAL_ACCOUNT_REVIEW');
    rows.push(...value.filter(row => !localTestSubscription(row.subscriptionId)));
  }
  // Never grant a portal to a subscription assigned to more than one account.
  const owners = new Map<string,string>();
  for (const row of rows) { if (owners.has(row.subscriptionId) && owners.get(row.subscriptionId) !== row.userId) throw new Error('STRIPE_PORTAL_ACCOUNT_REVIEW'); owners.set(row.subscriptionId,row.userId); }
  return [...owners].map(([subscriptionId,userId])=>({subscriptionId,userId,status:'active'}));
}
export async function createStripePortal(actor: Pick<AuthUser,'id'|'farmId'|'role'>) {
  if (actor.role !== 'owner') throw new Error('STRIPE_PORTAL_OWNER_REQUIRED');
  const key = process.env.STRIPE_SECRET_KEY?.trim() || process.env.FARMPRO_STRIPE_SECRET_KEY?.trim();
  if (!key || !/^(sk|rk)_(live|test)_/.test(key) || (process.env.NODE_ENV === 'production' && !/^(sk|rk)_live_/.test(key))) throw new Error('STRIPE_PORTAL_SETUP_REQUIRED');
  const live = /^(sk|rk)_live_/.test(key);
  const deadline = AbortSignal.timeout(20000);
  async function api(endpoint: string, body?: URLSearchParams) {
    const response = await fetch(`https://api.stripe.com/v1/${endpoint}`, { method: body ? 'POST' : 'GET', signal: deadline, redirect: 'error',
      headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type':'application/x-www-form-urlencoded' } : {}) }, ...(body ? { body:body.toString() } : {}) });
    if (!response.ok) throw new Error('STRIPE_PORTAL_UNAVAILABLE');
    return await response.json() as any;
  }
  const records = await subscriptions(); const own = records.filter(row=>row.userId===actor.id);
  if (!own.length) throw new Error('STRIPE_PORTAL_NO_CONTRACT');
  let customer = '';
  for (const row of own) {
    const value = await api(`subscriptions/${row.subscriptionId}`);
    if (value.id !== row.subscriptionId || value.livemode !== live || !id(value.customer,'cus') || (customer && customer !== value.customer)) throw new Error('STRIPE_PORTAL_ACCOUNT_REVIEW');
    customer = value.customer;
  }
  // A customer portal exposes all subscriptions for a customer. Do not expose
  // another FarmPro account or an unknown subscription through a shared customer.
  const remote = await api(`subscriptions?customer=${customer}&status=all&limit=100`);
  if (!Array.isArray(remote.data) || remote.has_more !== false || !remote.data.length || remote.data.some((row:any)=>row.customer!==customer || row.livemode!==live || !own.some(x=>x.subscriptionId===row.id))) throw new Error('STRIPE_PORTAL_ACCOUNT_REVIEW');
  const configured = process.env.FARMPRO_STRIPE_PORTAL_CONFIGURATION_ID?.trim();
  if (configured && !id(configured,'bpc')) throw new Error('STRIPE_PORTAL_SETUP_REQUIRED');
  const configurations = configured ? { data:[await api(`billing_portal/configurations/${configured}`)], has_more:false }
    : await api('billing_portal/configurations?active=true&is_default=true&limit=100');
  if (!Array.isArray(configurations.data) || configurations.has_more !== false || configurations.data.length !== 1) throw new Error('STRIPE_PORTAL_SETUP_REQUIRED');
  const config = configurations.data[0]; const features = config.features;
  if (!id(config.id,'bpc') || (configured && config.id !== configured) || config.active !== true || (!configured && config.is_default !== true) || config.livemode !== live ||
    features?.subscription_cancel?.enabled !== true || features.subscription_cancel.mode !== 'at_period_end' ||
    features?.subscription_update?.enabled !== false || features?.customer_update?.enabled !== false || features?.payment_method_update?.enabled !== false || features?.invoice_history?.enabled !== true) throw new Error('STRIPE_PORTAL_SETUP_REQUIRED');
  const origin = new URL(process.env.FARMPRO_ALLOWED_ORIGIN?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() || 'https://app.farmpro-app.jp');
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('STRIPE_PORTAL_SETUP_REQUIRED');
  const returnUrl = new URL('/settings',origin).href;
  // The only Stripe mutation here creates an access session. Cancellation is
  // confirmed by the owner on Stripe; no subscription/customer/config is changed.
  const result = await api('billing_portal/sessions', new URLSearchParams({ customer, configuration:config.id, return_url:returnUrl, locale:'ja' }));
  if (result.customer !== customer || result.configuration !== config.id || result.livemode !== live || !isStripePortalUrl(result.url)) throw new Error('STRIPE_PORTAL_UNAVAILABLE');
  return { url:result.url, cancellationMode:'at_period_end', accountChanged:false, subscriptionChanged:false };
}
