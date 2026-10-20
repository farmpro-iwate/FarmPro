import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import * as authClient from '../services/authClient';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('LINE APIが利用不可ならLINEボタンを表示しない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: false }) }));
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(await screen.findByText('初めての方')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'LINEでログイン' })).not.toBeInTheDocument();
  });

  it('LINE APIが利用可能な場合だけLINEログインの入口を表示する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: true }) }));
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    const link = await screen.findByRole('link', { name: 'LINEでログイン' });
    expect(link).toHaveAttribute('href', '/api/auth/line/start');
    expect(screen.getByLabelText(/メールアドレス/)).toBeInTheDocument();
  });

  it('LINE認証後にセッション引継ぎが成功するとホームへ進む', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: true }) }));
    const finish = vi.spyOn(authClient, 'finishLineLogin').mockResolvedValue({ id: 'line-owner' } as any);
    render(
      <MemoryRouter initialEntries={['/login?line=complete']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>LINEログイン完了ホーム</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('LINEログイン完了ホーム')).toBeInTheDocument();
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('メールアドレスとパスワードでログインしてホームへ進む', async () => {
    const login = vi.spyOn(authClient, 'login').mockResolvedValue({ id: 'u1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>ホームへ進んだ</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/メールアドレス/), 'user@example.com');
    await user.type(screen.getByLabelText(/パスワード/), 'password123');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(login).toHaveBeenCalledWith('user@example.com', 'password123');
    expect(await screen.findByText('ホームへ進んだ')).toBeInTheDocument();
  });

  it('パスワード再設定の確認コードを送信できる', async () => {
    const startReset = vi.spyOn(authClient, 'startPasswordReset').mockResolvedValue(undefined as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/メールアドレス/), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'パスワードを忘れた方' }));

    expect(screen.getByLabelText('登録メールアドレス')).toHaveValue('user@example.com');

    await user.click(screen.getByRole('button', { name: '確認コードを送信' }));

    expect(startReset).toHaveBeenCalledWith('user@example.com');
    expect(await screen.findByLabelText(/6桁の確認コード/)).toBeInTheDocument();
    expect(screen.getByText('登録メールアドレス宛てに確認コードを送信しました。')).toBeInTheDocument();
  });

  it('6桁コードと新しいパスワードで再設定できる', async () => {
    vi.spyOn(authClient, 'startPasswordReset').mockResolvedValue(undefined as any);
    const verifyReset = vi.spyOn(authClient, 'verifyPasswordReset').mockResolvedValue(undefined as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/メールアドレス/), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'パスワードを忘れた方' }));
    await user.click(screen.getByRole('button', { name: '確認コードを送信' }));

    await user.type(await screen.findByLabelText(/6桁の確認コード/), '123456');
    await user.type(screen.getByLabelText('新しいパスワード（8文字以上）'), 'newpass123');
    await user.type(screen.getByLabelText('新しいパスワード（確認）'), 'newpass123');

    await user.click(screen.getByRole('button', { name: '確認してパスワードを変更' }));

    expect(verifyReset).toHaveBeenCalledWith('user@example.com', '123456', 'newpass123');
    expect(await screen.findByText('パスワードを再設定しました。新しいパスワードでログインしてください。')).toBeInTheDocument();
  });

  it('確認用パスワードが一致しない場合は再設定しない', async () => {
    vi.spyOn(authClient, 'startPasswordReset').mockResolvedValue(undefined as any);
    const verifyReset = vi.spyOn(authClient, 'verifyPasswordReset').mockResolvedValue(undefined as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/メールアドレス/), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'パスワードを忘れた方' }));
    await user.click(screen.getByRole('button', { name: '確認コードを送信' }));

    await user.type(await screen.findByLabelText(/6桁の確認コード/), '123456');
    await user.type(screen.getByLabelText('新しいパスワード（8文字以上）'), 'newpass123');
    await user.type(screen.getByLabelText('新しいパスワード（確認）'), 'different1');

    await user.click(screen.getByRole('button', { name: '確認してパスワードを変更' }));

    expect(screen.getByText('新しいパスワードの確認入力が一致しません。')).toBeInTheDocument();
    expect(verifyReset).not.toHaveBeenCalled();
  });
});