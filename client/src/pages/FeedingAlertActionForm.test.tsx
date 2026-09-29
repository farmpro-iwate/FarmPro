import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeedingAlertActionForm from './FeedingAlertActionForm';
import FeedingAlertActionEditForm from './FeedingAlertActionEditForm';
import * as api from '../services/feedingAlertActionsApi';

describe('FeedingAlertActionForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => cleanup());

  it('ホームの注意子牛リストから値を引き継いで登録できる', async () => {
    const create = vi.spyOn(api, 'createFeedingAlertAction').mockResolvedValue({ id: 'a1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/feeding-alert-actions/new?calfId=c1&calfName=9131&ageDays=92&alertType=%E4%B8%8D%E8%B6%B3%E6%B0%97%E5%91%B3&memo=%E3%82%B9%E3%82%BF%E3%83%BC%E3%82%BF%E3%83%BC%E5%B0%91%E3%81%AA%E3%82%81']}>
        <Routes>
          <Route path="/feeding-alert-actions/new" element={<FeedingAlertActionForm />} />
          <Route path="/feeding-alert-actions" element={<div>給与アラート一覧へ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByDisplayValue('9131')).toBeInTheDocument();
    expect(screen.getByDisplayValue('92')).toBeInTheDocument();
    expect(screen.getByText('ホームの注意子牛リストから、子牛耳標番号・日齢・アラート種別を引き継ぎました。')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /対応内容/ }));
    await user.click(screen.getByRole('option', { name: 'スターターを調整' }));
    await user.click(screen.getByRole('combobox', { name: /状態/ }));
    await user.click(screen.getByRole('option', { name: '対応済み' }));
    await user.type(screen.getByLabelText(/次回確認日/), '2026-10-02');

    await user.click(screen.getByRole('button', { name: '登録する' }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      calfId: 'c1',
      calfName: '9131',
      ageDays: '92',
      alertType: '不足気味',
      actionType: 'スターターを調整',
      status: '対応済み',
      nextCheckDate: '2026-10-02',
      memo: 'ホーム注意子牛リストから登録：スターター少なめ',
    }));

    expect(await screen.findByText('給与アラート一覧へ戻った')).toBeInTheDocument();
  });
});

describe('FeedingAlertActionEditForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'fetchFeedingAlertAction').mockResolvedValue({
      id: 'a1',
      actionDate: '2026-09-29',
      calfId: 'c1',
      calfName: '9131',
      ageDays: '92',
      alertType: '不足気味',
      actionType: '確認のみ',
      memo: '元データ',
      nextCheckDate: '',
      status: '未対応',
    } as any);
  });

  afterEach(() => cleanup());

  it('既存の対応記録を読み込み、対応内容・状態・次回確認日を編集できる', async () => {
    const update = vi.spyOn(api, 'updateFeedingAlertAction').mockResolvedValue({ id: 'a1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/feeding-alert-actions/a1/edit']}>
        <Routes>
          <Route path="/feeding-alert-actions/:id/edit" element={<FeedingAlertActionEditForm />} />
          <Route path="/feeding-alert-actions" element={<div>給与アラート一覧へ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '給与アラート対応記録 編集' });

    await user.click(screen.getByRole('combobox', { name: /対応内容/ }));
    await user.click(screen.getByRole('option', { name: 'スターターを調整' }));

    await user.click(screen.getByRole('combobox', { name: /状態/ }));
    await user.click(screen.getByRole('option', { name: '様子見' }));

    await user.type(screen.getByLabelText(/次回確認日/), '2026-10-02');

    const memo = screen.getByLabelText('メモ');
    await user.clear(memo);
    await user.type(memo, '3日後に再確認');

    await user.click(screen.getByRole('button', { name: '保存する' }));

    expect(update).toHaveBeenCalledWith('a1', expect.objectContaining({
      actionDate: '2026-09-29',
      calfId: 'c1',
      calfName: '9131',
      ageDays: '92',
      alertType: '不足気味',
      actionType: 'スターターを調整',
      status: '様子見',
      nextCheckDate: '2026-10-02',
      memo: '3日後に再確認',
    }));

    expect(await screen.findByText('給与アラート一覧へ戻った')).toBeInTheDocument();
  });
});
