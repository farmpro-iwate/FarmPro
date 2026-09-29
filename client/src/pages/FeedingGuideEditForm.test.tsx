import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedingGuideEditForm } from './FeedingGuideEditForm';
import * as api from '../services/feedingGuideApi';

const baseRecord = {
  id: 'g1',
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
  memo: '元データ',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('FeedingGuideEditForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getFeedingGuide').mockResolvedValue(baseRecord as any);
  });

  afterEach(() => cleanup());

  it('既存の給与目安を読み込み、数値とメモを編集して保存できる', async () => {
    const update = vi.spyOn(api, 'updateFeedingGuide').mockResolvedValue({ id: 'g1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/feeding-guide/g1/edit']}>
        <Routes>
          <Route path="/feeding-guide/:id/edit" element={<FeedingGuideEditForm />} />
          <Route path="/feeding-guide" element={<div>飼料給与目安一覧へ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '飼料給与目安 編集' });

    const weight = screen.getByLabelText(/体重目安/);
    await user.clear(weight);
    await user.type(weight, '330');

    const roughage = screen.getByLabelText(/粗飼料給与量/);
    await user.clear(roughage);
    await user.type(roughage, '5');

    const memo = screen.getByLabelText('メモ');
    await user.clear(memo);
    await user.type(memo, '基準見直し');

    await user.click(screen.getByRole('button', { name: '更新' }));

    expect(update).toHaveBeenCalledWith('g1', expect.objectContaining({
      ageDays: '300',
      ageMonth: '10',
      stageName: '育成後期',
      targetWeight: '330',
      targetHeight: '120',
      targetChest: '155',
      starterAmount: '3',
      growingFeedAmount: '3',
      roughageAmount: '5',
      otherAmount: '添加剤50g',
      memo: '基準見直し',
    }));

    expect(await screen.findByText('飼料給与目安一覧へ戻った')).toBeInTheDocument();
  });

  it('数値項目に文字が入っている場合は更新しない', async () => {
    const update = vi.spyOn(api, 'updateFeedingGuide').mockResolvedValue({ id: 'g1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/feeding-guide/g1/edit']}>
        <Routes>
          <Route path="/feeding-guide/:id/edit" element={<FeedingGuideEditForm />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '飼料給与目安 編集' });

    const starter = screen.getByLabelText(/スターター給与量/);
    await user.clear(starter);
    await user.type(starter, 'abc');

    await user.click(screen.getByRole('button', { name: '更新' }));

    expect(screen.getByText('スターター給与量は数字で入力してください。')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
});
