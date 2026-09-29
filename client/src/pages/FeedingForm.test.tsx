import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedingForm } from './FeedingForm';
import { FeedingEditForm } from './FeedingEditForm';
import * as feedingsApi from '../services/feedingsApi';

vi.mock('../components/FeedSearchField', () => ({
  FeedSearchField: ({ value, onChange }: any) => (
    <input aria-label="飼料名" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

describe('FeedingForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => cleanup());

  it('必須項目不足では登録しない', async () => {
    const createFeeding = vi.spyOn(feedingsApi, 'createFeeding').mockResolvedValue({ id: 'f1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <FeedingForm />
      </MemoryRouter>,
    );

    const feedingDate = screen.getByLabelText(/給与日/);
    expect(feedingDate).toBeRequired();

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(feedingDate).toBeInvalid();
    expect(createFeeding).not.toHaveBeenCalled();
  });

  it('給与量と単価から金額候補を計算し入力できる', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <FeedingForm />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/給与量/), '120');
    await user.type(screen.getByLabelText('単価'), '80');

    expect(screen.getByText('計算候補：9,600円')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '計算した金額を入力する' }));

    expect(screen.getByLabelText('金額')).toHaveValue('9600');
  });

  it('計算した金額を含めて正常登録できる', async () => {
    const createFeeding = vi.spyOn(feedingsApi, 'createFeeding').mockResolvedValue({ id: 'f1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/feedings/new']}>
        <Routes>
          <Route path="/feedings/new" element={<FeedingForm />} />
          <Route path="/feedings" element={<div>飼料給与一覧へ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/給与日/), '2026-09-29');
    await user.type(screen.getByLabelText(/対象/), '母牛群');
    await user.type(screen.getByLabelText('飼料名'), '配合飼料');
    await user.type(screen.getByLabelText(/給与量/), '120');
    await user.type(screen.getByLabelText('単価'), '80');
    await user.type(screen.getByLabelText('メモ'), '朝夕合計');

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(createFeeding).toHaveBeenCalledWith(expect.objectContaining({
      feedingDate: '2026-09-29',
      target: '母牛群',
      feedName: '配合飼料',
      amount: '120',
      unit: 'kg',
      unitPrice: '80',
      totalPrice: '9600',
      purpose: '維持',
      memo: '朝夕合計',
    }));

    expect(await screen.findByText('飼料給与一覧へ戻った')).toBeInTheDocument();
  });

  it('負の給与量は登録しない', async () => {
    const createFeeding = vi.spyOn(feedingsApi, 'createFeeding').mockResolvedValue({ id: 'f1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <FeedingForm />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/給与日/), '2026-09-29');
    await user.type(screen.getByLabelText(/対象/), '母牛群');
    await user.type(screen.getByLabelText('飼料名'), '配合飼料');
    await user.type(screen.getByLabelText(/給与量/), '-1');
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(screen.getByText('給与量は数字で入力してください。例：120')).toBeInTheDocument();
    expect(createFeeding).not.toHaveBeenCalled();
  });
});

describe('FeedingEditForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(feedingsApi, 'getFeeding').mockResolvedValue({
      id: 'f1',
      feedingDate: '2026-09-01',
      target: '母牛群',
      feedName: '配合飼料',
      amount: '100',
      unit: 'kg',
      unitPrice: '80',
      totalPrice: '8000',
      purpose: '維持',
      memo: '元データ',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    } as any);
  });

  afterEach(() => cleanup());

  it('既存記録を読み込み、給与量を編集して金額を再計算し保存できる', async () => {
    const updateFeeding = vi.spyOn(feedingsApi, 'updateFeeding').mockResolvedValue({ id: 'f1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/feedings/f1/edit']}>
        <Routes>
          <Route path="/feedings/:id/edit" element={<FeedingEditForm />} />
          <Route path="/feedings" element={<div>飼料給与一覧へ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '飼料給与 編集' });

    const amount = screen.getByLabelText(/給与量/);
    await user.clear(amount);
    await user.type(amount, '110');

    const total = screen.getByLabelText('金額');
    await user.clear(total);

    await user.click(screen.getByRole('button', { name: '更新' }));

    expect(updateFeeding).toHaveBeenCalledWith('f1', expect.objectContaining({
      feedingDate: '2026-09-01',
      target: '母牛群',
      feedName: '配合飼料',
      amount: '110',
      unitPrice: '80',
      totalPrice: '8800',
    }));

    expect(await screen.findByText('飼料給与一覧へ戻った')).toBeInTheDocument();
  });
});
