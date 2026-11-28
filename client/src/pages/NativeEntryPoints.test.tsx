import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isNativeApp } from '../nativeRuntime';
import * as authClient from '../services/authClient';
import { LoginPage } from './LoginPage';
import { PaidPlanApplicationPage } from './PaidPlanApplicationPage';

vi.mock('../nativeRuntime', () => ({ isNativeApp: vi.fn(() => true) }));

beforeEach(() => {
  vi.mocked(isNativeApp).mockReturnValue(true);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('native account entry points', () => {
  it('LINE認証を開始せず、既存のメールアカウントのログインと再設定を残す', async () => {
    const finishLineLogin = vi.spyOn(authClient, 'finishLineLogin');
    const startReset = vi.spyOn(authClient, 'startPasswordReset').mockResolvedValue(undefined as never);
    const user = userEvent.setup();

    render(<MemoryRouter initialEntries={['/login?line=complete']}><LoginPage /></MemoryRouter>);

    expect(screen.getByLabelText(/メールアドレス/)).toBeInTheDocument();
    expect(screen.getByLabelText(/パスワード/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'LINEでログイン' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '無料で利用登録する' })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(finishLineLogin).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/メールアドレス/), 'review@example.com');
    await user.click(screen.getByRole('button', { name: 'パスワードを忘れた方' }));
    await user.click(screen.getByRole('button', { name: '確認コードを送信' }));

    expect(startReset).toHaveBeenCalledWith('review@example.com');
    expect(await screen.findByLabelText(/6桁の確認コード/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('有料申込URLを直接開いても決済画面を表示せずアカウント設定へ移動する', async () => {
    render(
      <MemoryRouter initialEntries={['/paid-plan?plan=pro']}>
        <Routes>
          <Route path="/paid-plan" element={<PaidPlanApplicationPage />} />
          <Route path="/settings" element={<div>アカウント設定</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('アカウント設定')).toBeInTheDocument();
    expect(screen.queryByText('有料プランのお申し込み')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /クレジットカード/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '銀行振込で申し込む' })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
