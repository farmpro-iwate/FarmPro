import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MarketResultsPage } from './MarketResultsPage';

const KEY = 'farmpro-market-watchlist-v1';

describe('子牛市場の選択', () => {
  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => cleanup());

  it('市場を追加し保存後に再表示できる', async () => {
    const user = userEvent.setup();
    const view = render(<MarketResultsPage />);
    await user.click(screen.getByRole('button', { name: '一覧にない市場を入力する' }));
    await user.type(screen.getByLabelText('一覧にない子牛市場名'), '岩手県南家畜市場');
    await user.click(screen.getByRole('button', { name: '市場を追加' }));
    expect(screen.getByText('岩手県南家畜市場')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(KEY) || '[]')).toEqual([
      { prefecture: '岩手県', name: '岩手県南家畜市場', notify: true },
    ]);
    view.unmount();
    render(<MarketResultsPage />);
    expect(screen.getByText('岩手県南家畜市場')).toBeTruthy();
  });

  it('重複登録を拒否し通知希望と削除を個別管理する', async () => {
    const user = userEvent.setup();
    render(<MarketResultsPage />);
    await user.click(screen.getByRole('button', { name: '一覧にない市場を入力する' }));
    await user.type(screen.getByLabelText('一覧にない子牛市場名'), '確認用市場');
    await user.click(screen.getByRole('button', { name: '市場を追加' }));
    await user.click(screen.getByRole('button', { name: '一覧にない市場を入力する' }));
    await user.type(screen.getByLabelText('一覧にない子牛市場名'), '確認用市場');
    await user.click(screen.getByRole('button', { name: '市場を追加' }));
    expect(screen.getByText('選択済みの市場です。')).toBeTruthy();
    const row = screen.getByText('確認用市場').closest('.MuiBox-root')?.parentElement;
    expect(row).toBeTruthy();
    await user.click(within(row!).getByRole('checkbox'));
    expect(JSON.parse(localStorage.getItem(KEY) || '[]')[0].notify).toBe(false);
    await user.click(within(row!).getByRole('button', { name: '削除' }));
    expect(JSON.parse(localStorage.getItem(KEY) || '[]')).toEqual([]);
  });

  it('確認済み市場を一覧から選び登録できる', async () => {
    const user = userEvent.setup();
    render(<MarketResultsPage />);
    await user.click(screen.getByRole('combobox', { name: '子牛市場を選択' }));
    await user.click(screen.getByRole('option', { name: '県南家畜市場' }));
    await user.click(screen.getByRole('button', { name: '市場を追加' }));
    expect(JSON.parse(localStorage.getItem(KEY) || '[]')).toEqual([
      { prefecture: '岩手県', name: '県南家畜市場', notify: true },
    ]);
  });

  it('都道府県の切り替えで選択中の市場を解除する', async () => {
    const user = userEvent.setup();
    render(<MarketResultsPage />);
    await user.click(screen.getByRole('combobox', { name: '子牛市場を選択' }));
    await user.click(screen.getByRole('option', { name: '県南家畜市場' }));
    await user.click(screen.getByRole('combobox', { name: '都道府県' }));
    await user.click(screen.getByRole('option', { name: '宮城県' }));
    await user.click(screen.getByRole('button', { name: '市場を追加' }));
    expect(screen.getByText('市場を選択するか、市場名を入力してください。')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(KEY) || '[]')).toEqual([]);
  });

  it('壊れた保存情報では空の状態から開始する', () => {
    localStorage.setItem(KEY, '{broken');
    render(<MarketResultsPage />);
    expect(screen.getByText('市場はまだ選択されていません。')).toBeTruthy();
  });
});
