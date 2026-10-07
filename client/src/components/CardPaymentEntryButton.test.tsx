// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { AuthUser } from '../services/authClient';
import { navigateToCardPayment, requestCardPaymentEntry, type CardEntryInput } from '../services/cardPaymentEntryClient';
import { CardPaymentEntryButton } from './CardPaymentEntryButton';
import { PaidPlanApplicationPage } from '../pages/PaidPlanApplicationPage';

// Use the real client validation, but never navigate to or call Stripe.
vi.mock('../services/cardPaymentEntryClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/cardPaymentEntryClient')>(),
  navigateToCardPayment: vi.fn(),
}));
const fixtureUser: AuthUser = { id: 'target', farmId: 'farm-target', email: 'target@example.invalid',
  farmName: 'Fixture Farm', name: 'Fixture Owner', role: 'owner', active: true, plan: 'free' };
const input: CardEntryInput = { plan: 'standard', amountTaxIncluded: 2750, termsConfirmed: true,
  priceConfirmed: true, user: fixtureUser };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
function entryBody(plan: 'standard' | 'pro' = 'standard') {
  const path = plan === 'standard' ? '/4gM7sL51R5qM8pH5nheME04' : '/5kQ7sL1LPFbPafS99DxeME05';
  const url = new URL(`https://buy.stripe.com${path}`);
  url.searchParams.set('client_reference_id', fixtureUser.id);
  url.searchParams.set('locked_prefilled_email', fixtureUser.email);
  return { url: url.toString(), userId: fixtureUser.id, farmId: fixtureUser.farmId, plan,
    billing: 'monthly', amountTaxIncluded: plan === 'standard' ? 2750 : 5500, stripeAdmissionControlled: false };
}
let fetchMock: ReturnType<typeof vi.fn>;
let respond: (init?: RequestInit) => Promise<Response>;
function cardCalls() { return fetchMock.mock.calls.filter(([url]) => url === '/api/card-payment-entry'); }
function deferResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  respond = () => promise;
  return resolve;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('farmpro.authToken', 'fixture-token');
  localStorage.setItem('farmpro.authUser', JSON.stringify(fixtureUser));
  localStorage.setItem('fixture-farm-data', 'keep');
  respond = async () => json(entryBody());
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/subscription') return json({ plan: 'free', subscription: null });
    if (url === '/api/card-payment-entry') return respond(init);
    throw new Error('Unexpected external request in fixture');
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('card entry client', () => {
  it('posts confirmed pricing without caller identity and returns the validated URL without changing local data', async () => {
    expect(await requestCardPaymentEntry(input)).toBe(entryBody().url);
    const [url, init] = cardCalls()[0];
    expect(url).toBe('/api/card-payment-entry');
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');
    expect(init.redirect).toBe('error');
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(init.body)).toEqual({ plan: 'standard', billing: 'monthly', amountTaxIncluded: 2750,
      termsConfirmed: true, priceConfirmed: true });
    expect(localStorage.getItem('fixture-farm-data')).toBe('keep');
    expect(localStorage.getItem('farmpro.authToken')).toBe('fixture-token');
    expect(navigateToCardPayment).not.toHaveBeenCalled();
  });

  it('validates the existing Pro offer separately', async () => {
    respond = async () => json(entryBody('pro'));
    expect(await requestCardPaymentEntry({ ...input, plan: 'pro', amountTaxIncluded: 5500 })).toBe(entryBody('pro').url);
  });

  it.each([401, 409, 503])('does not fall back to a stored URL on HTTP %s', async (status) => {
    respond = async () => json({ message: '確認のため受付を停止しています。', url: entryBody().url }, status);
    await expect(requestCardPaymentEntry(input)).rejects.toThrow('確認のため受付を停止しています。');
    expect(navigateToCardPayment).not.toHaveBeenCalled();
  });

  it('rejects network failure without changing credentials or farm data', async () => {
    respond = async () => { throw new TypeError('network unavailable'); };
    await expect(requestCardPaymentEntry(input)).rejects.toThrow('カード申込の確認ができませんでした');
    expect(localStorage.getItem('fixture-farm-data')).toBe('keep');
    expect(localStorage.getItem('farmpro.authToken')).toBe('fixture-token');
  });

  it.each([
    { userId: 'other' }, { farmId: 'farm-other' }, { plan: 'pro' },
    { billing: 'yearly' }, { amountTaxIncluded: 1 }, { url: 'https://example.invalid/' },
    { url: 'javascript:alert(1)' }, { url: entryBody().url.replace('https:', 'http:') },
    { url: entryBody().url.replace('buy.stripe.com', 'buy.stripe.com.example.invalid') },
    { url: entryBody().url + '&client_reference_id=other' }, { url: entryBody().url + '#fragment' },
    { url: entryBody('pro').url }, { url: entryBody().url.replace('target%40', 'other%40') },
  ])('rejects a mismatched or unsafe response: %j', async (change) => {
    respond = async () => json({ ...entryBody(), ...change });
    await expect(requestCardPaymentEntry(input)).rejects.toThrow();
    expect(navigateToCardPayment).not.toHaveBeenCalled();
  });

  it('rejects HTML and malformed JSON even with a success status', async () => {
    respond = async () => new Response('<html>not an API</html>', { headers: { 'Content-Type': 'text/html' } });
    await expect(requestCardPaymentEntry(input)).rejects.toThrow();
    respond = async () => new Response('{', { headers: { 'Content-Type': 'application/json' } });
    await expect(requestCardPaymentEntry(input)).rejects.toThrow();
  });

  it('requires current login and both confirmations before starting a request', async () => {
    await expect(requestCardPaymentEntry({ ...input, termsConfirmed: false })).rejects.toThrow();
    await expect(requestCardPaymentEntry({ ...input, priceConfirmed: false })).rejects.toThrow();
    localStorage.removeItem('farmpro.authToken');
    await expect(requestCardPaymentEntry(input)).rejects.toThrow();
    expect(cardCalls()).toHaveLength(0);
  });

  it('rejects a token or identity change while the response is pending', async () => {
    for (const change of ['token', 'user']) {
      localStorage.setItem('farmpro.authToken', 'fixture-token');
      localStorage.setItem('farmpro.authUser', JSON.stringify(fixtureUser));
      const resolve = deferResponse();
      const result = requestCardPaymentEntry(input);
      const assertion = expect(result).rejects.toThrow('ログイン情報が変わりました');
      if (change === 'token') localStorage.setItem('farmpro.authToken', 'new-token');
      else localStorage.setItem('farmpro.authUser', JSON.stringify({ ...fixtureUser, id: 'other' }));
      resolve(json(entryBody()));
      await assertion;
    }
  });

  it('aborts a timed-out fetch instead of using a direct link', async () => {
    vi.useFakeTimers();
    respond = (init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    const assertion = expect(requestCardPaymentEntry(input)).rejects.toThrow('カード申込の確認ができませんでした');
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
    expect(navigateToCardPayment).not.toHaveBeenCalled();
  });
});

describe('card entry button and paid-plan page', () => {
  it('never renders a direct payment anchor and navigates only after the check', async () => {
    const resolve = deferResponse();
    render(<CardPaymentEntryButton {...input} />);
    const button = screen.getByRole('button', { name: 'Stripeでカード払いへ進む' });
    expect(button).not.toHaveAttribute('href');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(cardCalls()).toHaveLength(1);
    expect(screen.getByRole('button', { name: '申込前の確認中…' })).toBeDisabled();
    expect(navigateToCardPayment).not.toHaveBeenCalled();
    await act(async () => { resolve(json(entryBody())); });
    expect(navigateToCardPayment).toHaveBeenCalledExactlyOnceWith(entryBody().url);
  });

  it('shows a hold reason without navigation and rechecks on retry', async () => {
    respond = async () => json({ message: '削除の確認依頼中です。' }, 409);
    render(<CardPaymentEntryButton {...input} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stripeでカード払いへ進む' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('削除の確認依頼中です。');
    expect(navigateToCardPayment).not.toHaveBeenCalled();
    respond = async () => json(entryBody());
    fireEvent.click(screen.getByRole('button', { name: 'Stripeでカード払いへ進む' }));
    await waitFor(() => expect(navigateToCardPayment).toHaveBeenCalledTimes(1));
    expect(cardCalls()).toHaveLength(2);
  });

  it('does not navigate when the selected plan changes before the response returns', async () => {
    const resolve = deferResponse();
    const view = render(<CardPaymentEntryButton {...input} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stripeでカード払いへ進む' }));
    view.rerender(<CardPaymentEntryButton {...input} plan="pro" amountTaxIncluded={5500} priceConfirmed={false} />);
    await act(async () => { resolve(json(entryBody())); });
    expect(navigateToCardPayment).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Stripeでカード払いへ進む' })).toBeDisabled();
  });

  it('does not navigate after leaving the page', async () => {
    const resolve = deferResponse();
    const view = render(<CardPaymentEntryButton {...input} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stripeでカード払いへ進む' }));
    view.unmount();
    await act(async () => { resolve(json(entryBody())); });
    expect(navigateToCardPayment).not.toHaveBeenCalled();
  });

  it('connects the real paid-plan page confirmations to the checked server route', async () => {
    render(<MemoryRouter initialEntries={['/paid-plan?plan=pro']}><PaidPlanApplicationPage /></MemoryRouter>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/auth/subscription', expect.anything()));
    const button = screen.getByRole('button', { name: 'Stripeでカード払いへ進む' });
    expect(button).toBeDisabled();
    expect(cardCalls()).toHaveLength(0);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(button).toBeDisabled();
    fireEvent.click(checkboxes[1]);
    expect(button).not.toBeDisabled();
    respond = async () => json(entryBody('pro'));
    fireEvent.click(button);
    await waitFor(() => expect(navigateToCardPayment).toHaveBeenCalledWith(entryBody('pro').url));
    expect(JSON.parse(cardCalls()[0][1].body)).toMatchObject({ plan: 'pro', amountTaxIncluded: 5500, billing: 'monthly' });
  });

  it('preserves the bank application choice without obtaining a card link', async () => {
    render(<MemoryRouter><PaidPlanApplicationPage /></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '支払方法' }));
    fireEvent.click(await screen.findByRole('option', { name: '銀行振込' }));
    expect(screen.getByRole('button', { name: '銀行振込で申し込む' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Stripeでカード払いへ進む' })).not.toBeInTheDocument();
    expect(cardCalls()).toHaveLength(0);
  });
});
