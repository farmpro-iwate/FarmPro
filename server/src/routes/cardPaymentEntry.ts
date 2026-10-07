import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import type { AuthUser, FarmProUser } from '../authStore';
import { accountDataRoot, assertFarmNotRetired, validAccountIdentifier, withAccountDataLock } from '../accountDeletionGuard';
import { pendingAccountDeletionRequest, readAccountDeletionRequests } from '../accountDeletionRequestStore';

// Preserve the existing offers. Only the in-app entry is gated here; returning
// a reusable Payment Link does NOT control Stripe or previously opened tabs.
const offers = {
  standard: { amount: 2750, url: 'https://buy.stripe.com/4gM7sL51R5qM8pH5nheME04' },
  pro: { amount: 5500, url: 'https://buy.stripe.com/5kQ7sL1LPFbPafS99DxeME05' },
} as const;

export async function getCardPaymentEntry(actor: AuthUser, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('CARD_CONFIRMATION_REQUIRED');
  const body = input as Record<string, unknown>;
  const allowed = ['plan', 'billing', 'amountTaxIncluded', 'termsConfirmed', 'priceConfirmed'];
  if (Object.keys(body).some((key) => !allowed.includes(key)) ||
      (body.plan !== 'standard' && body.plan !== 'pro') || body.billing !== 'monthly' ||
      body.termsConfirmed !== true || body.priceConfirmed !== true) throw new Error('CARD_CONFIRMATION_REQUIRED');
  const plan = body.plan;
  const offer = offers[plan];
  if (body.amountTaxIncluded !== offer.amount) throw new Error('CARD_OFFER_CHANGED');
  // Capture inputs before awaiting. Never use caller-provided identity or URL.
  const actorId = actor.id;
  const farmId = actor.farmId;
  if (!validAccountIdentifier(actorId) || !validAccountIdentifier(farmId)) throw new Error('CARD_ACCOUNT_UNAVAILABLE');

  return withAccountDataLock(async () => {
    const file = path.join(accountDataRoot(), 'users.json');
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('CARD_REVIEW_UNAVAILABLE');
    const users: unknown = JSON.parse(await fs.readFile(file, 'utf-8'));
    if (!Array.isArray(users) || users.some((item) => !item || !validAccountIdentifier(item.id) ||
        !validAccountIdentifier(item.farmId) || typeof item.active !== 'boolean' ||
        typeof item.email !== 'string' || !item.email.includes('@')) ||
        new Set(users.map((item) => item.id)).size !== users.length) throw new Error('CARD_REVIEW_UNAVAILABLE');
    const user = (users as FarmProUser[]).find((item) => item.id === actorId && item.farmId === farmId);
    if (!user?.active) throw new Error('CARD_ACCOUNT_UNAVAILABLE');
    await assertFarmNotRetired(user.farmId);
    const requests = await readAccountDeletionRequests();
    if (pendingAccountDeletionRequest(requests, user.id, user.farmId)) throw new Error('ACCOUNT_DELETION_CARD_ENTRY_HOLD');
    const url = new URL(offer.url);
    url.searchParams.set('client_reference_id', user.id);
    url.searchParams.set('locked_prefilled_email', user.email.trim().toLowerCase());
    return { url: url.toString(), userId: user.id, farmId: user.farmId,
      plan, billing: 'monthly' as const, amountTaxIncluded: offer.amount,
      stripeAdmissionControlled: false as const };
  });
}

export const cardPaymentEntryRouter = Router();
// Mounted after requireAuth. POST is intentional: no link is returned merely
// by loading the application page. There is no fallback on failed checks.
cardPaymentEntryRouter.post('/', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  const actor = res.locals.authUser;
  if (!actor) { res.status(401).json({ message: 'ログインが必要です。' }); return; }
  try {
    res.json(await getCardPaymentEntry(actor, req.body));
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const errors: Record<string, [number, string]> = {
      CARD_CONFIRMATION_REQUIRED: [400, 'プラン・支払金額・月払いと、2つの確認事項を確認してください。'],
      CARD_OFFER_CHANGED: [409, '表示した金額と現在の申込内容が一致しません。画面を更新して確認してください。'],
      CARD_ACCOUNT_UNAVAILABLE: [401, '現在のアカウントを確認できません。ログイン状態を確認してください。'],
      ACCOUNT_RETIRED: [401, 'このアカウントは利用を終了しています。'],
      ACCOUNT_DELETION_CARD_ENTRY_HOLD: [409, 'アカウント削除の確認依頼中のため、この画面から新しいカード申込へは進めません。依頼の取り消しについて運営者へご確認ください。既存の契約や開始済みのカード決済を解約したわけではありません。'],
    };
    const known = errors[code];
    if (known) { res.status(known[0]).json({ code, message: known[1] }); return; }
    res.status(503).json({ code: 'CARD_REVIEW_UNAVAILABLE',
      message: '申込前のアカウント確認ができませんでした。カード決済画面には移動していません。時間をおいて再度お試しください。' });
  }
});
