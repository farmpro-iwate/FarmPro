// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WithdrawalRequestForm, OperatorWithdrawalInbox } from './WithdrawalRequests';
import { AccountExitGuide } from './AccountExitGuide';
import { OperatorUsersPage } from '../pages/OperatorUsersPage';
import { getAuthToken, getStoredAuthUser } from '../services/authClient';

vi.mock('../services/authClient', () => ({ getAuthToken: vi.fn(), getStoredAuthUser: vi.fn() }));
const owner = { id: 'owner', farmId: 'farm-owner', farmName: 'Intake Fixture', name: 'Fixture Owner', email: 'owner@example.invalid',
  role: 'owner' as const, active: true, plan: 'free' as const };
const operator = { ...owner, id: 'operator', farmId: 'farm-operator', farmName: 'Operator Farm', email: 'operator@example.invalid' };
function record(id = '11111111-1111-4111-8111-111111111111') {
  return { id, userId: owner.id, farmId: owner.farmId, farmName: owner.farmName, name: owner.name, email: owner.email,
    planAtRequest: 'free' as 'free' | 'standard' | 'pro', timing: 'consult_first' as 'consult_first' | 'after_paid_period',
    status: 'pending' as 'pending' | 'cancelled', requestedAt: '2026-10-07T03:00:00.000Z', cancelledAt: undefined as string | undefined };
}
let rows: Array<ReturnType<typeof record>>;
const response = (value: unknown, ok = true) => ({ ok, json: async () => value });
const fetchMock = vi.fn();
function receipt(request = rows.find((row) => row.status === 'pending') || rows.at(-1) || null) {
  const user = vi.mocked(getStoredAuthUser)();
  return { user, request, canRequest: request?.status !== 'pending', reason: '', accountChanged: false, billingChanged: false, deleted: false };
}
function writes() { return fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST'); }
async function ready() { await screen.findByRole('button', { name: '退会希望を送る' }); }
async function confirm() {
  const clicker = userEvent.setup(); await ready();
  await clicker.click(screen.getByRole('checkbox', { name: /この送信だけでは/ }));
  return clicker;
}
function deferred() {
  let resolve!: (value: ReturnType<typeof response>) => void;
  const promise = new Promise<ReturnType<typeof response>>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks(); rows = [];
  vi.mocked(getAuthToken).mockReturnValue('fixture-token');
  vi.mocked(getStoredAuthUser).mockReturnValue(owner);
  localStorage.clear(); localStorage.setItem('fixture-farm-data', 'unchanged');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  fetchMock.mockReset().mockImplementation(async (url: string, options: RequestInit = {}) => {
    if (url === '/api/withdrawal-requests/me' && options.method === 'GET') return response(receipt());
    if (url === '/api/withdrawal-requests/me' && options.method === 'POST') {
      const body = JSON.parse(String(options.body)); const row = { ...record(body.requestId), timing: body.timing };
      rows.push(row); return response(receipt(row));
    }
    if (url === '/api/withdrawal-requests/me/cancel' && options.method === 'POST') {
      const body = JSON.parse(String(options.body)); rows = rows.map((row) => row.id === body.requestId
        ? { ...row, status: 'cancelled', cancelledAt: '2026-10-07T04:00:00.000Z' } : row);
      return response(receipt());
    }
    if (url === '/api/withdrawal-requests/operator') return response({ requests: rows, pendingCount: rows.filter((row) => row.status === 'pending').length });
    if (url.startsWith('/api/operator/users/ai-unanswered?')) return response({ logs: [] });
    if (url.startsWith('/api/operator/users?')) return response({ users: [operator, owner].map((user) => ({ ...user, paymentSource: 'free' })) });
    throw new Error(`Unexpected fixture network request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('withdrawal wish intake, not account deletion', () => {
  it('opens the real guide with one status GET and closes without submitting', async () => {
    render(<AccountExitGuide />); expect(fetchMock).not.toHaveBeenCalled();
    const clicker = userEvent.setup(); await clicker.click(screen.getByRole('button', { name: '解約・退会について' }));
    await ready(); expect(fetchMock).toHaveBeenCalledTimes(1); expect(writes()).toHaveLength(0);
    await clicker.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(writes()).toHaveLength(0);
  });
  it('requires explicit confirmation and resets it after a changed wish', async () => {
    render(<WithdrawalRequestForm />); const clicker = await confirm();
    expect(screen.getByRole('button', { name: '退会希望を送る' })).toBeEnabled();
    await clicker.click(screen.getByRole('radio', { name: /有料契約がある場合/ }));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: '退会希望を送る' })).toBeDisabled(); expect(writes()).toHaveLength(0);
  });
  it.each(['free', 'standard', 'pro'] as const)('records a wish for %s without sending account identities or editing local data', async (plan) => {
    vi.mocked(getStoredAuthUser).mockReturnValue({ ...owner, plan });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(<WithdrawalRequestForm />); const clicker = await confirm();
    await clicker.click(screen.getByRole('button', { name: '退会希望を送る' }));
    expect(await screen.findByText('退会希望を受け付けています（手続き未完了）。')).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
    expect(JSON.parse(writes()[0][1].body)).toEqual({ requestId: expect.any(String), timing: 'consult_first', confirmed: true });
    expect(writes()[0][1].headers.Authorization).toBe('Bearer fixture-token');
    expect(setItem).not.toHaveBeenCalled(); expect(localStorage.getItem('fixture-farm-data')).toBe('unchanged');
    expect(screen.getByText(/退会・データ削除・課金停止は自動実行されません/)).toBeInTheDocument();
  });
  it('cancelled confirmation sends nothing and confirmed cancellation displays the recorded result', async () => {
    rows = [record()]; render(<WithdrawalRequestForm />);
    const clicker = userEvent.setup(); const button = await screen.findByRole('button', { name: 'この退会希望を取り消す' });
    vi.mocked(window.confirm).mockReturnValue(false); await clicker.click(button); expect(writes()).toHaveLength(0);
    vi.mocked(window.confirm).mockReturnValue(true); await clicker.click(button);
    expect(await screen.findByText('前回の退会希望は取り消し済みです。')).toBeInTheDocument();
    expect(JSON.parse(writes()[0][1].body)).toEqual({ requestId: record().id, confirmed: true });
    expect(writes()[0][0]).toBe('/api/withdrawal-requests/me/cancel');
    expect(localStorage.getItem('fixture-farm-data')).toBe('unchanged');
  });
  it('remount shows an existing receipt rather than creating another one', async () => {
    rows = [record()]; const first = render(<WithdrawalRequestForm />);
    await screen.findByText('退会希望を受け付けています（手続き未完了）。'); first.unmount();
    render(<WithdrawalRequestForm />); await screen.findByText('退会希望を受け付けています（手続き未完了）。');
    expect(writes()).toHaveLength(0);
  });
  it('an uncertain send reports no acceptance until a status refresh confirms the saved receipt', async () => {
    render(<WithdrawalRequestForm />); const clicker = await confirm();
    fetchMock.mockImplementationOnce(async (_url, options) => { rows = [record(JSON.parse(options.body).requestId)]; throw new Error('Fixture connection lost'); });
    await clicker.click(screen.getByRole('button', { name: '退会希望を送る' }));
    expect(await screen.findByText('Fixture connection lost')).toBeInTheDocument();
    expect(screen.queryByText('退会希望を受け付けています（手続き未完了）。')).not.toBeInTheDocument();
    await clicker.click(screen.getByRole('button', { name: '受付状況を再確認' }));
    await screen.findByText('退会希望を受け付けています（手続き未完了）。'); expect(writes()).toHaveLength(1);
  });
  it('retry after a failed send reuses the same receipt number', async () => {
    render(<WithdrawalRequestForm />); const clicker = await confirm();
    fetchMock.mockRejectedValueOnce(new Error('Fixture connection lost'));
    await clicker.click(screen.getByRole('button', { name: '退会希望を送る' })); await screen.findByText('Fixture connection lost');
    await clicker.click(screen.getByRole('button', { name: '退会希望を送る' }));
    await screen.findByText('退会希望を受け付けています（手続き未完了）。');
    expect(JSON.parse(writes()[0][1].body).requestId).toBe(JSON.parse(writes()[1][1].body).requestId);
  });
  it('a response for a different account or claiming deletion never appears as acceptance', async () => {
    render(<WithdrawalRequestForm />); const clicker = await confirm();
    fetchMock.mockResolvedValueOnce(response({ ...receipt(), user: operator, deleted: true }));
    await clicker.click(screen.getByRole('button', { name: '退会希望を送る' }));
    expect(await screen.findByText(/受付結果を確認できません/)).toBeInTheDocument();
    expect(screen.queryByText('退会希望を受け付けています（手続き未完了）。')).not.toBeInTheDocument();
  });
  it('a login switch during a request discards the old response and personal information', async () => {
    render(<WithdrawalRequestForm />); await ready(); const delayed = deferred();
    fetchMock.mockReturnValueOnce(delayed.promise);
    fireEvent.click(screen.getByRole('button', { name: '受付状況を再確認' }));
    const old = receipt(record()); vi.mocked(getStoredAuthUser).mockReturnValue(operator);
    await act(async () => { delayed.resolve(response(old)); });
    expect(await screen.findByText(/ログイン情報が変わりました/)).toBeInTheDocument();
    expect(screen.queryByText(/対象：/)).not.toBeInTheDocument();
  });
  it('two immediate clicks create only one in-flight submission', async () => {
    render(<WithdrawalRequestForm />); await confirm(); const delayed = deferred();
    fetchMock.mockReturnValueOnce(delayed.promise); const button = screen.getByRole('button', { name: '退会希望を送る' });
    fireEvent.click(button); fireEvent.click(button); expect(writes()).toHaveLength(1);
    const body = JSON.parse(writes()[0][1].body);
    await act(async () => { delayed.resolve(response(receipt(record(body.requestId)))); });
    await screen.findByText('退会希望を受け付けています（手続き未完了）。');
  });
  it('closing during I/O aborts the view and does not display a delayed acceptance on another view', async () => {
    const delayed = deferred(); fetchMock.mockReturnValueOnce(delayed.promise);
    const first = render(<WithdrawalRequestForm />); const signal = fetchMock.mock.calls[0][1].signal;
    first.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => { delayed.resolve(response(receipt(record()))); });
    render(<WithdrawalRequestForm />); await ready(); expect(writes()).toHaveLength(0);
    expect(screen.queryByText('退会希望を受け付けています（手続き未完了）。')).not.toBeInTheDocument();
  });
  it('blocked operator/member state keeps contact guidance and hides the submit action', async () => {
    fetchMock.mockResolvedValueOnce(response({ ...receipt(), canRequest: false, reason: 'お問い合わせ窓口へご相談ください。' }));
    render(<WithdrawalRequestForm />); await screen.findByText('お問い合わせ窓口へご相談ください。');
    expect(screen.queryByRole('button', { name: '退会希望を送る' })).not.toBeInTheDocument(); expect(writes()).toHaveLength(0);
  });
  it('the operator inbox shows pending and cancelled snapshots with only explicit read-only refresh', async () => {
    vi.mocked(getStoredAuthUser).mockReturnValue(operator);
    rows = [record(), { ...record('22222222-2222-4222-8222-222222222222'), farmName: 'Cancelled Fixture', status: 'cancelled', cancelledAt: '2026-10-07T04:00:00.000Z' }];
    render(<OperatorWithdrawalInbox />); await screen.findByText('退会希望の受付（1件）');
    expect(screen.getByText('Intake Fixture ／ Fixture Owner')).toBeInTheDocument();
    expect(screen.queryByText('Cancelled Fixture ／ Fixture Owner')).not.toBeInTheDocument();
    const clicker = userEvent.setup(); await clicker.click(screen.getByRole('checkbox', { name: '取消済みも表示' }));
    expect(screen.getByText('Cancelled Fixture ／ Fixture Owner')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await clicker.click(screen.getByRole('button', { name: '受付一覧を更新' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); expect(writes()).toHaveLength(0);
  });
  it('the real operator page shows wishes even when the corresponding user row is hidden', async () => {
    vi.mocked(getStoredAuthUser).mockReturnValue(operator); rows = [record()];
    localStorage.setItem('farmpro.operatorListVisibility.v1.operator', JSON.stringify({ version: 1, hiddenUserIds: ['owner'] }));
    render(<OperatorUsersPage />); await screen.findByText('退会希望の受付（1件）');
    await screen.findByRole('heading', { name: '利用者一覧' });
    expect(screen.queryByText(owner.farmName, { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('Intake Fixture ／ Fixture Owner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '非表示（1）' })).toBeInTheDocument(); expect(writes()).toHaveLength(0);
  });
  it('an unavailable inbox is not an empty successful result and does not erase the user list', async () => {
    vi.mocked(getStoredAuthUser).mockReturnValue(operator);
    const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, options) => url === '/api/withdrawal-requests/operator'
      ? Promise.resolve(response({ message: 'Fixture inbox unavailable' }, false)) : normal(url, options));
    render(<OperatorUsersPage />); await screen.findByText('Fixture inbox unavailable');
    await screen.findByRole('heading', { name: '利用者一覧' });
    expect(screen.getByText(owner.farmName, { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('表示する退会希望はありません。')).not.toBeInTheDocument();
  });
});
