import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PastDataEntryPage } from './PastDataEntryPage';

describe('PastDataEntryPage', () => {
  it('既存の登録画面への安全な入口だけを表示する', () => {
    render(
      <MemoryRouter>
        <PastDataEntryPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '過去データ入力' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '販売記録を入力' })).toHaveAttribute('href', '/sales/new');
    expect(screen.getByRole('link', { name: '経費を入力' })).toHaveAttribute('href', '/expenses/new');
    expect(screen.getByRole('link', { name: '分娩記録を入力' })).toHaveAttribute('href', '/calvings/new');
    expect(screen.getByRole('link', { name: '繁殖管理を開く' })).toHaveAttribute('href', '/breedings');
    expect(screen.getByText(/妊娠鑑定は単独で新規作成せず/)).toBeInTheDocument();
  });
});
