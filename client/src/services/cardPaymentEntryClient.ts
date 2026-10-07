import { getAuthToken, getStoredAuthUser, type AuthUser } from './authClient';

export type CardEntryInput = {
  plan: 'standard' | 'pro';
  amountTaxIncluded: number;
  termsConfirmed: boolean;
  priceConfirmed: boolean;
  user: AuthUser | null;
};

// These paths validate the server response only. They are never used to build
// a fallback URL when account checks fail, and returned links are not cached.
const expectedPaths = {
  standard: '/4gM7sL51R5qM8pH5nheME04',
  pro: '/5kQ7sL1LPFbPafS99DxeME05',
} as const;
const unavailable = 'カード申込の確認ができませんでした。画面を更新して再度お試しください。';
const sessionChanged = 'ログイン情報が変わりました。画面を更新してから申し込んでください。';

export async function requestCardPaymentEntry(input: CardEntryInput, signal?: AbortSignal): Promise<string> {
  const { plan, amountTaxIncluded, termsConfirmed, priceConfirmed } = input;
  const identity = input.user ? { id: input.user.id, farmId: input.user.farmId, email: input.user.email } : null;
  if (!identity || !termsConfirmed || !priceConfirmed ||
      (plan !== 'standard' && plan !== 'pro') || !Number.isSafeInteger(amountTaxIncluded) || amountTaxIncluded <= 0) {
    throw new Error('ログイン状態と、申込内容の2つの確認事項を確認してください。');
  }
  const token = getAuthToken();
  const checkSession = () => {
    const user = getStoredAuthUser();
    if (!token || getAuthToken() !== token || !user?.active || user.id !== identity.id ||
        user.farmId !== identity.farmId || user.email !== identity.email) throw new Error(sessionChanged);
  };
  checkSession();
  if (signal?.aborted) throw new Error(unavailable);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch('/api/card-payment-entry', {
      method: 'POST', cache: 'no-store', redirect: 'error', credentials: 'omit', signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, billing: 'monthly', amountTaxIncluded, termsConfirmed, priceConfirmed }),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(unavailable);
    const body = await response.json();
    if (controller.signal.aborted) throw new Error(unavailable);
    checkSession();
    if (!response.ok) {
      throw new Error(typeof body?.message === 'string' && body.message.length <= 600 ? body.message : unavailable);
    }
    if (!body || body.userId !== identity.id || body.farmId !== identity.farmId || body.plan !== plan ||
        body.billing !== 'monthly' || body.amountTaxIncluded !== amountTaxIncluded || typeof body.url !== 'string') {
      throw new Error(unavailable);
    }
    let url: URL;
    try { url = new URL(body.url); } catch { throw new Error(unavailable); }
    const params = [...url.searchParams.keys()];
    if (url.origin !== 'https://buy.stripe.com' || url.username || url.password || url.hash ||
        url.pathname !== expectedPaths[plan] || params.length !== 2 ||
        !params.includes('client_reference_id') || !params.includes('locked_prefilled_email') ||
        url.searchParams.get('client_reference_id') !== identity.id ||
        url.searchParams.get('locked_prefilled_email') !== identity.email.trim().toLowerCase()) throw new Error(unavailable);
    return url.toString();
  } catch (error) {
    if (controller.signal.aborted || error instanceof TypeError) throw new Error(unavailable);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function navigateToCardPayment(url: string) {
  // Navigate only after a successful current check. Same-tab navigation avoids
// creating an unchecked payment tab or relying on async popup permissions.
  window.location.assign(url);
}
