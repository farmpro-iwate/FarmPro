import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalfForm } from './CalfForm';
import * as calfApi from '../services/calfApi';
import * as cattleApi from '../services/api';
import * as breedingApi from '../services/breedingApi';

vi.mock('../components/BirthdayField', () => ({
  BirthdayField: ({ value, onChange, required }: any) => (
    <input aria-label="生年月日" type="date" value={value} onChange={(event) => onChange(event.target.value)} required={required} />
  ),
}));

describe('CalfForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([] as any);
    vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([] as any);
  });

  afterEach(() => cleanup());

  it('生年月日がない場合は保存しない', async () => {
    const createCalf = vi.spyOn(calfApi, 'createCalf').mockResolvedValue({ id: 'c1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <CalfForm mode="create" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getAllByText('生年月日は必須です。').length).toBeGreaterThan(0);
    expect(createCalf).not.toHaveBeenCalled();
  });

  it('個体識別番号が10桁でない場合は保存しない', async () => {
    const createCalf = vi.spyOn(calfApi, 'createCalf').mockResolvedValue({ id: 'c1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <CalfForm mode="create" />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/個体識別番号/), '12345');
    await user.type(screen.getByLabelText('生年月日'), '2026-09-01');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getAllByText('個体識別番号は10桁の数字で入力してください。').length).toBeGreaterThan(0);
    expect(createCalf).not.toHaveBeenCalled();
  });

  it('耳標未装着・名号未定でも生年月日があれば登録できる', async () => {
    const createCalf = vi.spyOn(calfApi, 'createCalf').mockResolvedValue({
      id: 'c1',
      calfNumber: 'TEMP-MANUAL-1',
      name: '耳標未装着',
    } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <CalfForm mode="create" />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('生年月日'), '2026-09-01');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(createCalf).toHaveBeenCalledWith(expect.objectContaining({
      calfNumber: '',
      name: '',
      birthday: '2026-09-01',
      sex: '雌',
      managementStatus: '育成中',
    }));
    expect((await screen.findAllByText('登録しました。')).length).toBeGreaterThan(0);
  });

  it('雄の子牛は繁殖候補として留保できない', async () => {
    const createCalf = vi.spyOn(calfApi, 'createCalf').mockResolvedValue({ id: 'c1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <CalfForm mode="create" />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('生年月日'), '2026-09-01');

    await user.click(screen.getByRole('combobox', { name: /性別/ }));
    await user.click(screen.getByRole('option', { name: '♂' }));

    await user.click(screen.getByRole('combobox', { name: /飼養区分/ }));
    await user.click(screen.getByRole('option', { name: '繁殖候補として留保' }));

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getAllByText('繁殖候補として留保できるのは雌の子牛です。').length).toBeGreaterThan(0);
    expect(createCalf).not.toHaveBeenCalled();
  });

  it('既存子牛を読み込み、耳標番号と名号を編集して保存できる', async () => {
    vi.spyOn(calfApi, 'getCalf').mockResolvedValue({
      id: 'c1',
      calfNumber: 'TEMP-1',
      temporaryCalfNumber: 'TEMP-1',
      identificationNumber: '',
      name: '耳標未装着',
      birthday: '2026-09-01',
      sex: '雌',
      motherName: '母A',
      motherCowId: '100',
      motherCowName: '母A',
      breedingMethod: '人工授精',
      breedingId: 'b1',
      recipientCowId: '',
      recipientCowName: '',
      geneticMotherCowId: '',
      geneticMotherCowName: '',
      sireName: '父A',
      startWeight: 35,
      currentWeight: 50,
      elapsedDays: 30,
      milkAmount: 0,
      starterAmount: 0,
      feedingMethod: '人工哺育',
      weaningPlannedDate: '',
      weaningDate: '',
      weaningStatus: '離乳前',
      weaningWeight: 0,
      weaningStarterAmount: 0,
      milkEndDate: '',
      managementStatus: '育成中',
      note: '',
      calvingId: 'cv1',
    } as any);
    const updateCalf = vi.spyOn(calfApi, 'updateCalf').mockResolvedValue({ id: 'c1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/calves/c1/edit']}>
        <Routes>
          <Route path="/calves/:id/edit" element={<CalfForm mode="edit" />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '子牛を編集' });

    await user.type(screen.getByLabelText(/耳標番号/), '9131');
    const name = screen.getByLabelText(/名号/);
    await user.clear(name);
    await user.type(name, 'さくら');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(updateCalf).toHaveBeenCalledWith('c1', expect.objectContaining({
      calfNumber: '9131',
      name: 'さくら',
      birthday: '2026-09-01',
      motherCowId: '100',
      motherCowName: '母A',
      breedingId: 'b1',
      sireName: '父A',
    }));
  });
});