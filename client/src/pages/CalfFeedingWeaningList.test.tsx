import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalfFeedingWeaningList } from './CalfFeedingWeaningList';
import * as calfApi from '../services/calfApi';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('哺育・離乳一覧の切替記録', () => {
  it('母牛から分離した日と人工哺育のミルク終了日を同じ子牛の下に表示する', async () => {
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([{
      id: 101,
      name: '確認用子牛',
      calfNumber: '9131',
      birthday: '2026-07-01',
      feedingMethod: '人工哺育',
      weaningStatus: '離乳済み',
      weaningDate: '2026-11-14',
      motherSeparationDate: '2026-10-01',
      milkEndDate: '2026-11-14',
      managementStatus: '育成中',
    }] as any);
    render(<MemoryRouter><CalfFeedingWeaningList /></MemoryRouter>);
    expect(await screen.findByText('母牛から分離：2026-10-01')).toBeInTheDocument();
    expect(screen.getByText('ミルク終了：2026-11-14')).toBeInTheDocument();
    expect(screen.getByText('人工哺育（ミルク哺育）')).toBeInTheDocument();
    expect(screen.getByText('2026-11-14')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '確認・修正' })).toHaveAttribute('href', '/calf-feeding-weaning/101/edit');
  });

  it('未登録の日付を捏造せず、既存の離乳前の表示を維持する', async () => {
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([{
      id: 102,
      name: '未離乳子牛',
      calfNumber: '9132',
      birthday: '2026-07-02',
      feedingMethod: '母乳哺育',
      weaningStatus: '離乳前',
      weaningDate: '',
      managementStatus: '育成中',
    }] as any);
    render(<MemoryRouter><CalfFeedingWeaningList /></MemoryRouter>);
    expect(await screen.findByText('未離乳子牛')).toBeInTheDocument();
    expect(screen.getByText('離乳前')).toBeInTheDocument();
    expect(screen.queryByText(/母牛から分離：/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ミルク終了：/)).not.toBeInTheDocument();
  });
});
