// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorUsersPage } from './OperatorUsersPage';
import { getStoredAuthUser } from '../services/authClient';
import { canHideOperatorListUser, operatorVisibilityKey, useOperatorListVisibility } from '../hooks/useOperatorListVisibility';

vi.mock('../services/authClient', () => ({
  getAuthToken: vi.fn(() => 'fixture-token'),
  getStoredAuthUser: vi.fn(),
}));

const operator = { id: 'operator', farmId: 'farm-operator', farmName: 'Operator Fixture', name: 'Operator',
  email: 'operator@example.invalid', role: 'owner' as const, active: true, plan: 'free' as const,
  paymentSource: 'free' as const };
const trial = { ...operator, id: 'trial', farmId: 'farm-trial', farmName: 'Trial Fixture',
  name: 'Trial Owner', email: 'trial@example.invalid' };
const other = { ...trial, id: 'other', farmId: 'farm-other', farmName: 'Other Fixture',
  email: 'other@example.invalid', active: false };
const paid = { ...trial, id: 'paid', farmId: 'farm-paid', farmName: 'Paid Fixture',
  email: 'paid@example.invalid', plan: 'standard' as const, paymentSource: 'bank' as const,
  bankNonRenewal: { applicationId: 'fixture-contract', contractEndsAt: null, requestedAt: null,
    canRequest: false, reason: 'Fixture contract requires review' } };
let users: Array<typeof operator | typeof paid>;
const fetchMock = vi.fn();
const key = operatorVisibilityKey(operator.id);
const storedIds = () => JSON.parse(localStorage.getItem(key) || '{}').hiddenUserIds;

function save(ids: string[], operatorId = operator.id) {
  localStorage.setItem(operatorVisibilityKey(operatorId), JSON.stringify({ version: 1, hiddenUserIds: ids }));
}
function row(name: string) { return within(screen.getByText(name).closest('tr')!); }
async function mount() {
  const view = render(<OperatorUsersPage />);
  await screen.findByRole('heading', { name: '利用者一覧' });
  return { ...view, clicker: userEvent.setup() };
}
function assertNoServerWrites() {
  expect(fetchMock.mock.calls).toHaveLength(2);
  for (const [url, init] of fetchMock.mock.calls) {
    expect(String(url)).toMatch(/^\/api\/operator\/users(?:\/ai-unanswered)?\?/);
    expect(init?.method || 'GET').toBe('GET');
    expect(init?.body).toBeUndefined();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('farmpro.authToken', 'unchanged-fixture-token');
  localStorage.setItem('farmpro.authUser', JSON.stringify(operator));
  localStorage.setItem('farmpro.fixtureFarmData', 'unchanged-farm-records');
  vi.mocked(getStoredAuthUser).mockReturnValue(operator);
  users = structuredClone([operator, trial, other, paid]);
  fetchMock.mockReset().mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') throw new Error('Unexpected server mutation in visibility test');
    if (url.startsWith('/api/operator/users/ai-unanswered?')) return { ok: true, json: async () => ({ logs: [] }) };
    if (url.startsWith('/api/operator/users?')) return { ok: true, json: async () => ({ users: structuredClone(users) }) };
    throw new Error('Unexpected request in visibility test');
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('operator list display preferences', () => {
  it('starts with every user and explains that browser visibility is not withdrawal or deletion', async () => {
    await mount();
    expect(screen.getByRole('button', { name: '通常表示（4）' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/別端末には反映されません/)).toBeInTheDocument();
    expect(screen.getByText(/上の件数は非表示の利用者も含みます/)).toBeInTheDocument();
    expect(row(operator.farmName).queryByRole('button', { name: '非表示にする' })).not.toBeInTheDocument();
    expect(row(paid.farmName).queryByRole('button', { name: '非表示にする' })).not.toBeInTheDocument();
    expect(row(trial.farmName).getByRole('button', { name: '非表示にする' })).toBeEnabled();
    expect(localStorage.getItem(key)).toBeNull();
    assertNoServerWrites();
  });

  it('hides only the confirmed row, keeps total counts and all records, and restores from the hidden view', async () => {
    const before = structuredClone(users);
    const auth = localStorage.getItem('farmpro.authUser');
    const { clicker } = await mount();
    await clicker.click(row(trial.farmName).getByRole('button', { name: '非表示にする' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining(trial.email));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('アカウント・ログイン・契約・牛のデータは変更しません'));
    expect(screen.queryByText(trial.farmName)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '通常表示（3）' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '非表示（1）' })).toBeInTheDocument();
    expect(screen.getByText('総利用者').parentElement).toHaveTextContent('4');
    expect(storedIds()).toEqual(['trial']);
    await clicker.click(screen.getByRole('button', { name: '非表示（1）' }));
    expect(row(trial.farmName).getByText('利用中')).toBeInTheDocument();
    await clicker.click(row(trial.farmName).getByRole('button', { name: '再表示する' }));
    expect(screen.getByText('非表示の利用者はいません。')).toBeInTheDocument();
    await clicker.click(screen.getByRole('button', { name: '通常表示（4）' }));
    expect(row(trial.farmName).getByText('利用中')).toBeInTheDocument();
    expect(storedIds()).toEqual([]);
    expect(users).toEqual(before);
    expect(localStorage.getItem('farmpro.authUser')).toBe(auth);
    expect(localStorage.getItem('farmpro.authToken')).toBe('unchanged-fixture-token');
    expect(localStorage.getItem('farmpro.fixtureFarmData')).toBe('unchanged-farm-records');
    assertNoServerWrites();
  });

  it('cancelled confirmation does not save or hide anything', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const { clicker } = await mount();
    await clicker.click(row(trial.farmName).getByRole('button', { name: '非表示にする' }));
    expect(screen.getByText(trial.farmName)).toBeInTheDocument();
    expect(localStorage.getItem(key)).toBeNull();
    assertNoServerWrites();
  });

  it('persists across remount and exposes hidden rows in the all-users view', async () => {
    const first = await mount();
    await first.clicker.click(row(trial.farmName).getByRole('button', { name: '非表示にする' }));
    first.unmount();
    const second = await mount();
    expect(screen.queryByText(trial.farmName)).not.toBeInTheDocument();
    await second.clicker.click(screen.getByRole('button', { name: 'すべて（4）' }));
    expect(row(trial.farmName).getByText('一覧で非表示')).toBeInTheDocument();
    expect(row(trial.farmName).getByRole('button', { name: '再表示する' })).toBeInTheDocument();
    expect(screen.getByText(paid.farmName)).toBeInTheDocument();
  });

  it('does not hide paid or review-needed rows even if old preferences contain their IDs', async () => {
    save(['operator', 'paid', 'other', 'trial']);
    users = users.map((user) => user.id === 'other' ? { ...user, paymentSource: 'other' as never } : user);
    await mount();
    expect(screen.getByText(operator.farmName)).toBeInTheDocument();
    expect(screen.getByText(paid.farmName)).toBeInTheDocument();
    expect(screen.getByText(other.farmName)).toBeInTheDocument();
    expect(screen.queryByText(trial.farmName)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '非表示（1）' })).toBeInTheDocument();
    expect(canHideOperatorListUser({ ...trial, paymentIssue: 'Review required' }, operator.id)).toBe(false);
  });

  it('uses account IDs rather than a shared farm display name', async () => {
    users = users.map((user) => user.id === 'other' ? { ...user, farmName: trial.farmName } : user);
    save(['trial']);
    await mount();
    expect(screen.getAllByText(trial.farmName)).toHaveLength(1);
    expect(screen.getByText(other.email)).toBeInTheDocument();
    expect(screen.queryByText(trial.email)).not.toBeInTheDocument();
  });

  it('restoring a stopped trial user does not reactivate it', async () => {
    save(['other']);
    const { clicker } = await mount();
    await clicker.click(screen.getByRole('button', { name: '非表示（1）' }));
    expect(row(other.farmName).getByText('停止')).toBeInTheDocument();
    await clicker.click(row(other.farmName).getByRole('button', { name: '再表示する' }));
    await clicker.click(screen.getByRole('button', { name: '通常表示（4）' }));
    expect(row(other.farmName).getByText('停止')).toBeInTheDocument();
    expect(row(other.farmName).getByRole('button', { name: '利用再開' })).toBeInTheDocument();
    assertNoServerWrites();
  });

  it('shows all rows with a warning for damaged preferences without rewriting them on load', async () => {
    localStorage.setItem(key, '{invalid');
    await mount();
    expect(screen.getByText(/表示設定を読み込めないため/)).toBeInTheDocument();
    expect(screen.getByText(trial.farmName)).toBeInTheDocument();
    expect(localStorage.getItem(key)).toBe('{invalid');
    assertNoServerWrites();
  });

  it('a failed preference save neither hides the row nor reports success', async () => {
    const { clicker } = await mount();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('fixture-quota-error'); });
    await clicker.click(row(trial.farmName).getByRole('button', { name: '非表示にする' }));
    expect(screen.getByText(/表示設定を保存できませんでした/)).toBeInTheDocument();
    expect(screen.getByText(trial.farmName)).toBeInTheDocument();
    expect(screen.queryByText(/を通常一覧から非表示にしました/)).not.toBeInTheDocument();
    expect(localStorage.getItem(key)).toBeNull();
    assertNoServerWrites();
  });

  it('does not save stale visibility under an operator who changed during confirmation', async () => {
    const { clicker } = await mount();
    vi.mocked(window.confirm).mockImplementation(() => {
      vi.mocked(getStoredAuthUser).mockReturnValue({ ...operator, id: 'second-operator' });
      return true;
    });
    await clicker.click(row(trial.farmName).getByRole('button', { name: '非表示にする' }));
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(operatorVisibilityKey('second-operator'))).toBeNull();
    expect(screen.getByText(trial.farmName)).toBeInTheDocument();
  });

  it('keeps one operators preferences separate from another and reflects browser storage updates', async () => {
    save(['trial']);
    save(['other'], 'second-operator');
    const view = renderHook(({ id }) => useOperatorListVisibility(id), { initialProps: { id: 'operator' } });
    expect([...view.result.current.hiddenIds]).toEqual(['trial']);
    view.rerender({ id: 'second-operator' });
    await waitFor(() => expect([...view.result.current.hiddenIds]).toEqual(['other']));
    act(() => {
      save(['trial', 'other'], 'second-operator');
      window.dispatchEvent(new StorageEvent('storage', { key: operatorVisibilityKey('second-operator') }));
    });
    expect([...view.result.current.hiddenIds]).toEqual(['trial', 'other']);
    expect(storedIds()).toEqual(['trial']);
    act(() => {
      localStorage.removeItem(operatorVisibilityKey('second-operator'));
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect([...view.result.current.hiddenIds]).toEqual([]);
  });

  it('never hides oneself or writes settings with a missing operator ID', () => {
    const view = renderHook(() => useOperatorListVisibility('operator'));
    act(() => { expect(view.result.current.setHidden('operator', true)).toBe(false); });
    expect(localStorage.getItem(key)).toBeNull();
    expect(canHideOperatorListUser(trial, '')).toBe(false);
    const empty = renderHook(() => useOperatorListVisibility(''));
    act(() => { expect(empty.result.current.setHidden('trial', true)).toBe(false); });
    expect(localStorage.getItem(operatorVisibilityKey(''))).toBeNull();
  });
});
