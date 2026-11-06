import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { Calf } from '../types/calf';
import { CalfCertificateEntry } from './CalfCertificateEntry';

afterEach(cleanup);

describe('子牛登録証明書の入口', () => {
  it('登録済みの子牛は耳標・名号で選び、編集画面で読み取りを開く', async () => {
    const calf = { id: 7, calfNumber: '0456', name: '確認用子牛', birthday: '2026-08-01', identificationNumber: '0000001234' } as Calf;
    render(<MemoryRouter><CalfCertificateEntry calves={[calf]} /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '登録証明書から入力' }));
    expect(screen.getByRole('link', { name: 'この子牛の証明書を読み取る' })).toHaveAttribute('aria-disabled', 'true');
    await user.type(screen.getByRole('combobox', { name: '登録済みの子牛' }), '0456');
    await user.click(await screen.findByRole('option', { name: /耳標 0456.*確認用子牛/ }));
    expect(screen.getByRole('link', { name: 'この子牛の証明書を読み取る' }))
      .toHaveAttribute('href', '/calves/7/edit?source=calf-certificate');
  });
  it('登録済みの子牛がいなくても、新規登録から写真・PDFの読み取りへ進める', async () => {
    render(<MemoryRouter><CalfCertificateEntry calves={[]} /></MemoryRouter>);
    await userEvent.setup().click(screen.getByRole('button', { name: '登録証明書から入力' }));
    expect(screen.getByRole('link', { name: '新しい子牛を登録する' }))
      .toHaveAttribute('href', '/calves/new?source=calf-certificate');
  });
});
