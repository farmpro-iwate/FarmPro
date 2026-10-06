// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorAccountDeletionAction } from './OperatorAccountDeletionAction';

vi.mock('../services/authClient', () => ({ getAuthToken: vi.fn(() => 'fixture-token') }));
const user = { id: 'target', farmId: 'farm-target', farmName: '削除確認用農場', name: '確認用利用者', email: 'target@example.invalid' };
const preview = { user: { ...user, active: true, plan: 'free' }, canDelete: true, reason: '', revision: 'a'.repeat(64), resuming: false };
const result = { deleted: true, userId: user.id, farmId: user.farmId };
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
const fetchMock = vi.fn();
beforeEach(() => { vi.clearAllMocks(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup(disabled = false) {
  const onDeleted = vi.fn();
  const onBusyChange = vi.fn();
  render(<OperatorAccountDeletionAction user={user} disabled={disabled} onDeleted={onDeleted} onBusyChange={onBusyChange} />);
  return { onDeleted, onBusyChange, clicker: userEvent.setup() };
}
async function open(clicker: ReturnType<typeof userEvent.setup>) {
  await clicker.click(screen.getByRole('button', { name: '削除' }));
  await screen.findByRole('textbox', { name: '削除対象のメールアドレスを入力' });
  return within(screen.getByRole('dialog'));
}
async function confirm(clicker: ReturnType<typeof userEvent.setup>) {
  const dialog = await open(clicker);
  await clicker.type(dialog.getByRole('textbox'), user.email);
  await clicker.click(dialog.getByRole('checkbox'));
  return dialog.getByRole('button', { name: 'この利用者を削除する' });
}

describe('operator account deletion confirmation', () => {
  it('does not request anything when merely rendered', () => {
    setup();
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads a read-only preview and explains identity, scope, backups and irreversible removal', async () => {
    fetchMock.mockResolvedValueOnce(response(preview));
    const { clicker } = setup();
    const dialog = await open(clicker);
    expect(dialog.getByText(user.farmName)).toBeInTheDocument();
    expect(dialog.getByText(user.email)).toBeInTheDocument();
    expect(dialog.getByText(/元に戻せません/)).toBeInTheDocument();
    expect(dialog.getByText(/別端末の端末内データ/)).toBeInTheDocument();
    expect(dialog.getByText(/内部ID・操作日時・照合用ハッシュ/)).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'この利用者を削除する' })).toBeDisabled();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/operator/users/target/deletion-preview');
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requires both the matching email and explicit checkbox', async () => {
    fetchMock.mockResolvedValueOnce(response(preview));
    const { clicker } = setup();
    const dialog = await open(clicker);
    const button = dialog.getByRole('button', { name: 'この利用者を削除する' });
    await clicker.click(dialog.getByRole('checkbox'));
    expect(button).toBeDisabled();
    await clicker.type(dialog.getByRole('textbox'), 'wrong@example.invalid');
    expect(button).toBeDisabled();
    await clicker.clear(dialog.getByRole('textbox'));
    await clicker.type(dialog.getByRole('textbox'), user.email.toUpperCase());
    expect(button).toBeEnabled();
    await clicker.click(dialog.getByRole('checkbox'));
    expect(button).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returning cancels without a deletion and reopening clears confirmation', async () => {
    fetchMock.mockResolvedValue(response(preview));
    const { clicker, onDeleted } = setup();
    await confirm(clicker);
    await clicker.click(within(screen.getByRole('dialog')).getByRole('button', { name: '戻る' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const dialog = await open(clicker);
    expect(dialog.getByRole('textbox')).toHaveValue('');
    expect(dialog.getByRole('checkbox')).not.toBeChecked();
    expect(onDeleted).not.toHaveBeenCalled();
    for (const [, options] of fetchMock.mock.calls) expect(options.method).toBeUndefined();
  });

  it('posts only the exact confirmed identity and accepts only a matching successful result', async () => {
    fetchMock.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response(result));
    const { clicker, onDeleted, onBusyChange } = setup();
    await clicker.click(await confirm(clicker));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/operator/users/target/delete');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer fixture-token');
    expect(JSON.parse(options.body)).toEqual({ farmId: user.farmId, email: user.email, revision: preview.revision, confirmed: true });
    expect(onDeleted.mock.calls[0].slice(0, 2)).toEqual([user.id, user.farmId]);
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it('explains blocked contracts and never displays a delete confirmation button', async () => {
    fetchMock.mockResolvedValueOnce(response({ ...preview, canDelete: false, reason: '契約・請求の確認が必要です。' }));
    const { clicker } = setup();
    await clicker.click(screen.getByRole('button', { name: '削除' }));
    await screen.findByText('契約・請求の確認が必要です。');
    expect(screen.queryByRole('button', { name: 'この利用者を削除する' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects mismatched previews and does not assume deletion succeeded', async () => {
    fetchMock.mockResolvedValueOnce(response({ ...preview, user: { ...preview.user, id: 'other' } }));
    const { clicker, onDeleted } = setup();
    await clicker.click(screen.getByRole('button', { name: '削除' }));
    await screen.findByText(/対象アカウントを確認できません/);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('a rejected deletion stays open and requires a new preview instead of claiming success', async () => {
    fetchMock.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({ message: '契約が変更されています。' }, false));
    const { clicker, onDeleted } = setup();
    await clicker.click(await confirm(clicker));
    await screen.findByText('契約が変更されています。');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '内容を再確認' })).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'この利用者を削除する' })).not.toBeInTheDocument();
  });

  it('does not accept a result for another farm', async () => {
    fetchMock.mockResolvedValueOnce(response(preview)).mockResolvedValueOnce(response({ ...result, farmId: 'farm-other' }));
    const { clicker, onDeleted } = setup();
    await clicker.click(await confirm(clicker));
    await screen.findByText(/削除結果を確認できませんでした/);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('prevents duplicate in-flight submission without changing the disabled guard', async () => {
    let finish!: (value: unknown) => void;
    fetchMock.mockResolvedValueOnce(response(preview)).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { clicker, onDeleted } = setup();
    const button = await confirm(clicker);
    await clicker.dblClick(button);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: '戻る' })).toBeDisabled();
    finish(response(result));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it('does not open or issue requests while another account operation is busy', () => {
    setup(true);
    expect(screen.getByRole('button', { name: '削除' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
