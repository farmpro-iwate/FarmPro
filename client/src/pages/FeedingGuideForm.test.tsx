import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedingGuideForm } from './FeedingGuideForm';
import * as api from '../services/feedingGuideApi';

describe('FeedingGuideForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => cleanup());

  it('日齢が未入力なら登録しない', async () => {
    const create = vi.spyOn(api, 'createFeedingGuide').mockResolvedValue({ id: 'g1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <FeedingGuideForm />
      </MemoryRouter>,
    );

    const ageDays = screen.getByLabelText(/日齢/);
    expect(ageDays).toBeRequired();

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(ageDays).toBeInvalid();
    expect(create).not.toHaveBeenCalled();
  });

  it('数値項目に文字が入っている場合は登録しない', async () => {
    const create = vi.spyOn(api, 'createFeedingGuide').mockResolvedValue({ id: 'g1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <FeedingGuideForm />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/日齢/), '300');
    await user.type(screen.getByLabelText(/ステージ名/), '育成後期');
    await user.type(screen.getByLabelText(/体重目安/), 'abc');
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(screen.getByText('体重目安は数字で入力してください。')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('日齢ごとの給与目安を正常登録できる', async () => {
    const create = vi.spyOn(api, 'createFeedingGuide').mockResolvedValue({ id: 'g1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/feeding-guide/new']}>
        <Routes>
          <Route path="/feeding-guide/new" element={<FeedingGuideForm />} />
          <Route path="/feeding-guide" element={<div>飼料給与目安一覧へ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/日齢/), '300');
    await user.type(screen.getByLabelText(/月齢/), '10');
    await user.type(screen.getByLabelText(/ステージ名/), '育成後期');
    await user.type(screen.getByLabelText(/体重目安/), '320');
    await user.type(screen.getByLabelText(/体高目安/), '120');
    await user.type(screen.getByLabelText(/胸囲目安/), '155');
    await user.type(screen.getByLabelText(/スターター給与量/), '3');
    await user.type(screen.getByLabelText(/育成配合給与量/), '3');
    await user.type(screen.getByLabelText(/粗飼料給与量/), '4.5');
    await user.type(screen.getByLabelText(/その他給与量/), '添加剤50g');
    await user.type(screen.getByLabelText(/メモ/), '農場基準');

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      ageDays: '300',
      ageMonth: '10',
      stageName: '育成後期',
      targetWeight: '320',
      targetHeight: '120',
      targetChest: '155',
      starterAmount: '3',
      growingFeedAmount: '3',
      roughageAmount: '4.5',
      otherAmount: '添加剤50g',
      memo: '農場基準',
    }));

    expect(await screen.findByText('飼料給与目安一覧へ戻った')).toBeInTheDocument();
  });
});
