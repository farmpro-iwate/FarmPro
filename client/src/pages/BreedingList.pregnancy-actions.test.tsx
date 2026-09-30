import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBreedingList } from '../services/breedingApi';
import type { Breeding } from '../types/breeding';
import { BreedingList } from './BreedingList';

vi.mock('../services/breedingApi', () => ({
  getBreedingList: vi.fn(),
  deleteBreeding: vi.fn(),
}));

function breeding(overrides: Partial<Breeding>): Breeding {
  return {
    id: '1',
    cowEarTag: '1001',
    cowName: 'テスト牛',
    heatDate: '2026-08-01',
    breedingMethod: '種付',
    breedingStatus: '種付実施',
    inseminationDate: '2026-08-02',
    bullName: '父牛',
    inseminatorName: '担当者',
    transferPlannedDate: '',
    transferDate: '',
    transferCancelReason: '',
    embryoNumber: '',
    collectionDate: '',
    embryoType: '',
    donorCowName: '',
    donorCowEarTag: '',
    embryoSireName: '',
    embryoGrade: '',
    strawNumber: '',
    supplierName: '',
    transferTechnician: '',
    nextHeatExpectedDate: '',
    pregnancyCheckExpectedDate: '2026-09-30',
    pregnancyCheckDate: '',
    pregnancyResult: '未鑑定',
    recheckExpectedDate: '',
    expectedCalvingDate: '',
    note: '',
    ...overrides,
  };
}

describe('BreedingList pregnancy check actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('妊娠鑑定待ちと再鑑定予定から既存の鑑定編集画面へ進める', async () => {
    vi.mocked(getBreedingList).mockResolvedValue([
      breeding({ id: 'wait', cowEarTag: '1001' }),
      breeding({
        id: 'recheck',
        cowEarTag: '1002',
        cowName: '再鑑定牛',
        pregnancyResult: '再鑑定予定',
        recheckExpectedDate: '2026-10-05',
      }),
    ]);

    render(
      <MemoryRouter initialEntries={['/breedings']}>
        <BreedingList />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('link', { name: '妊娠鑑定' }))
      .toHaveAttribute('href', '/pregnancy-checks/wait/edit?returnTo=%2Fbreedings');
    expect(await screen.findByRole('link', { name: '再鑑定' }))
      .toHaveAttribute('href', '/pregnancy-checks/recheck/edit?returnTo=%2Fbreedings');
  });


  it('分娩予定日があっても未鑑定なら妊娠鑑定待ちとして扱う', async () => {
    vi.mocked(getBreedingList).mockResolvedValue([
      breeding({
        id: 'unconfirmed-calving-date',
        cowEarTag: '9084',
        cowName: 'さちこ',
        expectedCalvingDate: '2027-06-29',
        pregnancyResult: '未鑑定',
        pregnancyCheckDate: '',
        pregnancyCheckExpectedDate: '2026-10-10',
      }),
    ]);

    render(
      <MemoryRouter initialEntries={['/breedings']}>
        <BreedingList />
      </MemoryRouter>,
    );

    expect(await screen.findByText('妊娠鑑定待ち')).toBeInTheDocument();
    expect(screen.getByText('次に必要な対応：')).toBeInTheDocument();
    expect(screen.getByText('妊娠鑑定')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '妊娠鑑定' }))
      .toHaveAttribute('href', '/pregnancy-checks/unconfirmed-calving-date/edit?returnTo=%2Fbreedings');
    expect(screen.queryByRole('link', { name: '分娩登録' })).not.toBeInTheDocument();
  });

  it('受胎済みには妊娠鑑定ボタンを出さない', async () => {
    vi.mocked(getBreedingList).mockResolvedValue([
      breeding({
        id: 'pregnant',
        pregnancyResult: '受胎',
        pregnancyCheckDate: '2026-09-20',
        expectedCalvingDate: '2027-06-29',
      }),
    ]);

    render(
      <MemoryRouter initialEntries={['/breedings']}>
        <BreedingList />
      </MemoryRouter>,
    );

    await screen.findByText('耳標：1001');
    expect(screen.queryByRole('link', { name: '妊娠鑑定' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '再鑑定' })).not.toBeInTheDocument();
  });
});
