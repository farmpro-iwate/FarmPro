// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BankNonRenewalAction, formatBankContractEnd } from './BankNonRenewalAction';
import { OperatorUsersPage } from '../pages/OperatorUsersPage';

vi.mock('../services/authClient', () => ({
  getAuthToken: vi.fn(() => 'fixture-token'),
  getStoredAuthUser: vi.fn(() => ({ id: 'operator' })),
}));

const end = '2027-01-01T00:00:00.000Z';
const account = {
  id: 'target', farmId: 'farm-target', farmName: '受付テスト農場', name: 'テスト利用者', email: 'target@example.invalid',
  role: 'owner' as const, active: true, plan: 'standard' as const, paymentSource: 'bank' as const,
  bankNonRenewal: { applicationId: 'contract-one', contractEndsAt: end, requestedAt: null, canRequest: true, reason: '' },
};
const acceptedAccount = { ...account, bankNonRenewal: { ...account.bankNonRenewal, requestedAt: '2026-10-06T08:00:00.000Z', canRequest: false } };
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
const fetchMock = vi.fn();

beforeEach(() => { vi.clearAllMocks(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(user = account) {
  const onAccepted = vi.fn();
  const onBusyChange = vi.fn();
  render(<BankNonRenewalAction user={user} onAccepted={onAccepted} onBusyChange={onBusyChange} />);
  return { clicker: userEvent.setup(), onAccepted, onBusyChange };
}

async function confirm(clicker: ReturnType<typeof userEvent.setup>) {
  await clicker.click(screen.getByRole('button', { name: '次年度を継続しない' }));
  const dialog = screen.getByRole('dialog');
  await clicker.click(within(dialog).getByRole('checkbox'));
  return within(dialog).getByRole('button', { name: '次年度継続なしを受け付ける' });
}

describe('bank non-renewal action', () => {
  it('formats the actual contract instant in Japan time and keeps unknown dates explicit', () => {
    expect(formatBankContractEnd(end)).toBe('2027/01/01 09:00:00（日本時間）');
    expect(formatBankContractEnd(null)).toBe('終了日時を確認中');
    expect(formatBankContractEnd('invalid')).toBe('終了日時を確認中');
  });

  it('explains the account, paid period, no immediate Free downgrade and no data deletion before confirmation', async () => {
    const { clicker } = setup();
    await clicker.click(screen.getByRole('button', { name: '次年度を継続しない' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('受付テスト農場')).toBeInTheDocument();
    expect(dialog.getByText('target@example.invalid')).toBeInTheDocument();
    expect(dialog.getByText(/有料利用期限：2027\/01\/01 09:00:00/)).toBeInTheDocument();
    expect(dialog.getByText(/今すぐFreeには変更しません/)).toBeInTheDocument();
    expect(dialog.getByText(/退会・農場データの削除・返金は行いません/)).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: '次年度継続なしを受け付ける' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancelling does not submit and reopening requires fresh confirmation', async () => {
    const { clicker, onAccepted } = setup();
    await confirm(clicker);
    await clicker.click(within(screen.getByRole('dialog')).getByRole('button', { name: '戻る' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await clicker.click(screen.getByRole('button', { name: '次年度を継続しない' }));
    expect(within(screen.getByRole('dialog')).getByRole('checkbox')).not.toBeChecked();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('submits the exact confirmed contract to the new endpoint and keeps Standard', async () => {
    fetchMock.mockResolvedValueOnce(response({ user: acceptedAccount, alreadyRequested: false }));
    const { clicker, onAccepted, onBusyChange } = setup();
    await clicker.click(await confirm(clicker));
    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/operator/users/target/bank-non-renewal');
    expect(JSON.parse(options.body)).toEqual({ applicationId: 'contract-one', contractEndsAt: end, confirmed: true });
    expect(options.headers.Authorization).toBe('Bearer fixture-token');
    expect(onAccepted.mock.calls[0][0].plan).toBe('standard');
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it('does not show success when the server rejects the request', async () => {
    fetchMock.mockResolvedValueOnce(response({ message: '契約内容を再確認してください。' }, false));
    const { clicker, onAccepted } = setup();
    await clicker.click(await confirm(clicker));
    expect(await screen.findByText('契約内容を再確認してください。')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('does not report acceptance for a mismatched response', async () => {
    fetchMock.mockResolvedValueOnce(response({ user: { ...acceptedAccount, id: 'other' } }));
    const { clicker, onAccepted } = setup();
    await clicker.click(await confirm(clicker));
    expect(await screen.findByText(/受付結果を確認できませんでした/)).toBeInTheDocument();
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('cannot submit while the deadline is unconfirmed or a receipt already exists', () => {
    const onAccepted = vi.fn();
    const { rerender } = render(<BankNonRenewalAction user={{ ...account, bankNonRenewal: { ...account.bankNonRenewal, contractEndsAt: null, canRequest: false, reason: '契約終了日時を確認中' } }} onAccepted={onAccepted} onBusyChange={vi.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText('契約終了日時を確認中')).toBeInTheDocument();
    rerender(<BankNonRenewalAction user={acceptedAccount} onAccepted={onAccepted} onBusyChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '受付済み（期間中は利用可）' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prevents duplicate in-flight submission', async () => {
    let complete!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
    const { clicker, onAccepted } = setup();
    const button = await confirm(clicker);
    await clicker.dblClick(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    complete(response({ user: acceptedAccount }));
    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
  });

  it('updates the operator list without reclassifying the customer as Free or stopped', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('ai-unanswered')) return response({ logs: [] });
      if (url.endsWith('bank-non-renewal')) return response({ user: acceptedAccount });
      return response({ users: [account] });
    });
    render(<OperatorUsersPage />);
    const clicker = userEvent.setup();
    await screen.findByRole('button', { name: '次年度を継続しない' });
    await clicker.click(await confirm(clicker));
    await screen.findByText('次年度継続なし・受付済み');
    // MUI keeps the closing dialog mounted during its exit animation.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const row = screen.getByText('target@example.invalid').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('Standard')).toBeInTheDocument();
    expect(within(row!).getByText('利用中')).toBeInTheDocument();
    expect(screen.queryByText('銀行振込を終了してFreeへ')).not.toBeInTheDocument();
  });

  it('preserves separate review lines and overrides inherited table nowrap without permitting a submission', async () => {
    const reason = [
      '銀行振込契約の農場情報が未登録です。',
      '銀行振込契約の支払周期が未登録です。',
      '契約終了日時が未登録です。支払済み期間を確認してください。',
    ].join('\n');
    const blocked = { ...account, bankNonRenewal: { ...account.bankNonRenewal, contractEndsAt: null, canRequest: false, reason } };
    const onAccepted = vi.fn();
    render(
      <table><tbody><tr><td style={{ whiteSpace: 'nowrap', width: 160 }}>
        <BankNonRenewalAction user={blocked} onAccepted={onAccepted} onBusyChange={vi.fn()} />
      </td></tr></tbody></table>,
    );
    const warning = screen.getByText(/銀行振込契約の農場情報が未登録です/);
    expect(warning.textContent).toBe(reason);
    expect(warning).toHaveStyle({ whiteSpace: 'pre-line', overflowWrap: 'anywhere' });
    expect(warning.parentElement).toHaveStyle({ whiteSpace: 'normal', maxWidth: '100%' });
    const button = screen.getByRole('button', { name: '次年度を継続しない' });
    expect(button).toBeDisabled();
    await userEvent.setup().click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('shows legacy contract review details in the operator row without changing plan or active state', async () => {
    const reason = '銀行振込契約の支払周期が未登録です。\n契約終了日時が未登録です。支払済み期間を確認してください。';
    const blocked = { ...account, bankNonRenewal: { ...account.bankNonRenewal, contractEndsAt: null, canRequest: false, reason } };
    fetchMock.mockImplementation(async (url: string) => url.includes('ai-unanswered') ? response({ logs: [] }) : response({ users: [blocked] }));
    render(<OperatorUsersPage />);
    const warning = await screen.findByText(/銀行振込契約の支払周期が未登録です/);
    expect(warning.textContent).toBe(reason);
    const row = screen.getByText('target@example.invalid').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('Standard')).toBeInTheDocument();
    expect(within(row!).getByText('利用中')).toBeInTheDocument();
    expect(within(row!).getByText('有料利用期限：終了日時を確認中')).toBeInTheDocument();
    expect(within(row!).getByRole('button', { name: '次年度を継続しない' })).toBeDisabled();
    expect(screen.queryByText('次年度継続なし・受付済み')).not.toBeInTheDocument();
    for (const [, options] of fetchMock.mock.calls) expect(options?.method ?? 'GET').toBe('GET');
  });
});
