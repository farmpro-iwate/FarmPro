import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogoutPage } from './LogoutPage';
import * as authClient from '../services/authClient';

describe('LogoutPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logoutを実行してログイン画面へ戻る', async () => {
    const logout = vi.spyOn(authClient, 'logout').mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={['/logout']}>
        <Routes>
          <Route path="/logout" element={<LogoutPage />} />
          <Route path="/login" element={<div>ログイン画面へ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('ログイン画面へ戻った')).toBeInTheDocument();
  });
});
