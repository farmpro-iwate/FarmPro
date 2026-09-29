import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeatRegistrationForm } from './HeatRegistrationForm';
import * as breedingApi from '../services/breedingApi';

vi.mock('../components/CattlePicker', () => ({
  CattlePicker: ({ onSelect }: any) => (
    <button type="button" onClick={() => onSelect({ earTag: '9130', name: 'はな' })}>
      テスト牛を選択
    </button>
  ),
}));

describe('HeatRegistrationForm', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('対象牛を選ばずに保存すると登録せず警告する', async () => {
    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({ id: 'heat-1' } as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/new']}>
        <HeatRegistrationForm />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '発情を保存' }));

    expect(alertSpy).toHaveBeenCalledWith('対象牛を選択してください');
    expect(createBreeding).not.toHaveBeenCalled();
  });

  it('発情日と発情区分が揃うまで登録しない', async () => {
    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({ id: 'heat-1' } as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/new']}>
        <HeatRegistrationForm />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'テスト牛を選択' }));
    await user.click(screen.getByRole('button', { name: '発情を保存' }));

    expect(alertSpy).toHaveBeenCalledWith('発情日を入力してください');
    expect(createBreeding).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/発情日/), '2026-09-29');
    await user.click(screen.getByRole('button', { name: '発情を保存' }));

    expect(alertSpy).toHaveBeenLastCalledWith('発情区分を選択してください');
    expect(createBreeding).not.toHaveBeenCalled();
  });

  it('発情を保存すると発情確認として登録し次の作業を表示する', async () => {
    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({
      id: 'heat-123',
      cowEarTag: '9130',
      cowName: 'はな',
    } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/new']}>
        <HeatRegistrationForm />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'テスト牛を選択' }));
    await user.type(screen.getByLabelText(/発情日/), '2026-09-29');

    await user.click(screen.getByRole('combobox', { name: /発情区分/ }));
    await user.click(screen.getByRole('option', { name: '自然発情' }));
    await user.click(screen.getByRole('checkbox', { name: '粘液' }));
    await user.type(screen.getByLabelText('メモ'), '夕方に確認');

    await user.click(screen.getByRole('button', { name: '発情を保存' }));

    expect(createBreeding).toHaveBeenCalledWith(expect.objectContaining({
      cowEarTag: '9130',
      cowName: 'はな',
      heatDate: '2026-09-29',
      estrusType: '自然発情',
      estrusSigns: ['粘液'],
      note: '夕方に確認',
      breedingMethod: '未選択',
      breedingStatus: '発情確認',
    }));

    expect(await screen.findByText('発情を保存しました。必要な場合だけ次の作業へ進んでください。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '種付を登録' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '受精卵移植を登録' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '発情登録だけで終了' })).toBeInTheDocument();
  });

  it('重複など保存エラー時は警告を表示し次工程へ進ませない', async () => {
    const duplicateMessage = '同じ牛・同じ発情日の記録がすでにあります。重複登録はできません。';
    vi.spyOn(breedingApi, 'createBreeding').mockRejectedValue(new Error(duplicateMessage));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA&heatDate=2026-09-29&returnTo=%2Fcattle%2F123']}>
        <HeatRegistrationForm />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('combobox', { name: /発情区分/ }));
    await user.click(screen.getByRole('option', { name: '自然発情' }));
    await user.click(screen.getByRole('button', { name: '発情を保存' }));

    expect(alertSpy).toHaveBeenCalledWith(duplicateMessage);
    expect(screen.queryByRole('button', { name: '種付を登録' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '受精卵移植を登録' })).not.toBeInTheDocument();
  });
});