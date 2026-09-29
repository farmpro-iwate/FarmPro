import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InseminationRegistrationForm } from './InseminationRegistrationForm';
import * as breedingApi from '../services/breedingApi';
import * as settingsApi from '../services/settingsApi';

vi.mock('../components/CattlePicker', () => ({
  CattlePicker: ({ onSelect }: any) => (
    <button type="button" onClick={() => onSelect({ earTag: '9130', name: 'はな' })}>
      テスト牛を選択
    </button>
  ),
}));

vi.mock('../components/SireSearchField', () => ({
  SireSearchField: ({ value, onChange, label = '種雄牛' }: any) => (
    <input
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value, 101)}
    />
  ),
}));

vi.mock('../components/InseminatorSearchField', () => ({
  InseminatorSearchField: ({ value, onChange, label = '授精師' }: any) => (
    <input
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value, 202)}
    />
  ),
}));

describe('InseminationRegistrationForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ estrousCycleDays: 21 } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it('対象牛を選ばずに保存すると登録しない', async () => {
    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({ id: 'insemination-1' } as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/ai/new']}>
        <InseminationRegistrationForm />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '種付を保存' }));

    expect(alertSpy).toHaveBeenCalledWith('対象牛を選択してください');
    expect(createBreeding).not.toHaveBeenCalled();
  });

  it('種付・授精日が未入力なら登録しない', async () => {
    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({ id: 'insemination-1' } as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/ai/new']}>
        <InseminationRegistrationForm />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'テスト牛を選択' }));
    await user.click(screen.getByRole('button', { name: '種付を保存' }));

    expect(alertSpy).toHaveBeenCalledWith('種付・授精日を入力してください');
    expect(createBreeding).not.toHaveBeenCalled();
  });

  it('負の種付費は登録しない', async () => {
    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({ id: 'insemination-1' } as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/ai/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA']}>
        <InseminationRegistrationForm />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/種付・授精日/), '2026-09-29');
    await user.type(screen.getByLabelText('人工授精・種付費（円）'), '-1');
    await user.click(screen.getByRole('button', { name: '種付を保存' }));

    expect(alertSpy).toHaveBeenCalledWith('人工授精・種付費は0以上の数字で入力してください');
    expect(createBreeding).not.toHaveBeenCalled();
  });

  it('正常保存時に次回発情・妊娠鑑定・分娩予定日を自動設定する', async () => {
    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({ id: 'insemination-1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/ai/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA&returnTo=%2Fcattle%2F123']}>
        <Routes>
          <Route path="/breedings/ai/new" element={<InseminationRegistrationForm />} />
          <Route path="/cattle/:id" element={<div>個体カルテへ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/種付・授精日/), '2026-09-29');
    await user.type(screen.getByLabelText('種雄牛'), '美津照重');
    await user.type(screen.getByLabelText('授精師'), '担当A');
    await user.type(screen.getByLabelText('人工授精・種付費（円）'), '5000');
    await user.type(screen.getByLabelText('メモ'), '夕方に実施');

    await user.click(screen.getByRole('button', { name: '種付を保存' }));

    expect(createBreeding).toHaveBeenCalledWith(expect.objectContaining({
      cowEarTag: '9130',
      cowName: 'はな',
      breedingMethod: '種付',
      breedingStatus: '種付実施',
      inseminationDate: '2026-09-29',
      bullName: '美津照重',
      bullMasterId: 101,
      inseminatorName: '担当A',
      inseminatorMasterId: 202,
      inseminationCost: '5000',
      nextHeatExpectedDate: '2026-10-20',
      pregnancyCheckExpectedDate: '2026-11-10',
      expectedCalvingDate: '2027-07-11',
      note: '夕方に実施',
    }));

    expect(await screen.findByText('個体カルテへ戻った')).toBeInTheDocument();
  });

  it('重複など保存エラー時はエラー内容を表示して遷移しない', async () => {
    const duplicateMessage = '同じ牛・同じ種付日・同じ種雄牛の記録がすでにあります。重複登録はできません。';
    vi.spyOn(breedingApi, 'createBreeding').mockRejectedValue(new Error(duplicateMessage));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/breedings/ai/new?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA']}>
        <InseminationRegistrationForm />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/種付・授精日/), '2026-09-29');
    await user.type(screen.getByLabelText('種雄牛'), '美津照重');
    await user.click(screen.getByRole('button', { name: '種付を保存' }));

    expect(alertSpy).toHaveBeenCalledWith(duplicateMessage);
    expect(screen.getByRole('heading', { name: '種付を登録' })).toBeInTheDocument();
  });
});
