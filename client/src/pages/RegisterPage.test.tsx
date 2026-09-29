import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from './RegisterPage';
import * as authClient from '../services/authClient';
import * as settingsApi from '../services/settingsApi';

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => cleanup());

  it('登録情報を入力して確認コードを送信できる', async () => {
    const start = vi.spyOn(authClient, 'startFreeRegistration').mockResolvedValue({
      email: 'user@example.com',
    } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('農場名'), '関口農場');
    await user.type(screen.getByLabelText('お名前'), '関口');
    await user.type(screen.getByLabelText('メールアドレス'), 'user@example.com');
    await user.type(screen.getByLabelText(/パスワード/), 'password123');

    await user.click(screen.getByRole('button', { name: '確認コードをメール送信' }));

    expect(start).toHaveBeenCalledWith({
      farmName: '関口農場',
      name: '関口',
      email: 'user@example.com',
      password: 'password123',
    });
    expect(await screen.findByLabelText('6桁の確認コード')).toBeInTheDocument();
    expect(screen.getByText('確認コードをメールで送信しました。メールに届いた6桁のコードを入力してください。')).toBeInTheDocument();
  });

  it('6桁コードを確認して農場設定へ反映しホームへ進む', async () => {
    vi.spyOn(authClient, 'startFreeRegistration').mockResolvedValue({ email: 'user@example.com' } as any);
    const verify = vi.spyOn(authClient, 'verifyFreeRegistration').mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      name: '関口',
      farmName: '関口農場',
      plan: 'free',
    } as any);
    const sync = vi.spyOn(settingsApi, 'syncAccountToFarmSettings').mockResolvedValue(undefined as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<div>ホームへ進んだ</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('農場名'), '関口農場');
    await user.type(screen.getByLabelText('お名前'), '関口');
    await user.type(screen.getByLabelText('メールアドレス'), 'user@example.com');
    await user.type(screen.getByLabelText(/パスワード/), 'password123');
    await user.click(screen.getByRole('button', { name: '確認コードをメール送信' }));

    await user.type(await screen.findByLabelText('6桁の確認コード'), '123456');
    await user.click(screen.getByRole('button', { name: '確認して無料利用を始める' }));

    expect(verify).toHaveBeenCalledWith('user@example.com', '123456');
    expect(sync).toHaveBeenCalledWith(expect.objectContaining({
      email: 'user@example.com',
      farmName: '関口農場',
      plan: 'free',
    }));
    expect(await screen.findByText('ホームへ進んだ')).toBeInTheDocument();
  });

  it('確認コード再送信で新しいコード送信メッセージを表示する', async () => {
    const start = vi.spyOn(authClient, 'startFreeRegistration').mockResolvedValue({ email: 'user@example.com' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('農場名'), '関口農場');
    await user.type(screen.getByLabelText('お名前'), '関口');
    await user.type(screen.getByLabelText('メールアドレス'), 'user@example.com');
    await user.type(screen.getByLabelText(/パスワード/), 'password123');
    await user.click(screen.getByRole('button', { name: '確認コードをメール送信' }));

    await user.click(screen.getByRole('button', { name: '確認コードを再送信' }));

    expect(start).toHaveBeenCalledTimes(2);
    expect(screen.getByText('確認コードを再送信しました。新しく届いた6桁のコードを入力してください。')).toBeInTheDocument();
  });
});
