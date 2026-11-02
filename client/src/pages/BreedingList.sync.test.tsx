import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BreedingList } from './BreedingList';
import * as breedingApi from '../services/breedingApi';
import type { Breeding } from '../types/breeding';

const breeding = { id: 'fixture-breeding', cowEarTag: 'FIXTURE-COW', cowName: '試験牛',
  breedingMethod: '種付', breedingStatus: '種付実施', heatDate: '2026-11-01', inseminationDate: '2026-11-02',
  bullName: '', inseminatorName: '', nextHeatExpectedDate: '', pregnancyCheckExpectedDate: '',
  pregnancyCheckDate: '', pregnancyResult: '未鑑定', expectedCalvingDate: '', note: '元のメモ' } as Breeding;

beforeEach(() => {
  vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([breeding]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('shows a deletion conflict and the retained latest record, then allows a deliberate retry', async () => {
  let rejectDeletion!: (error: Error) => void;
  const remove = vi.spyOn(breedingApi, 'deleteBreeding').mockReturnValue(new Promise((_resolve, reject) => { rejectDeletion = reject; }));
  const user = userEvent.setup();
  render(<MemoryRouter><BreedingList /></MemoryRouter>);
  await user.dblClick(await screen.findByRole('button', { name: '削除' }));
  expect(remove).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: '削除' })).toBeDisabled();
  vi.mocked(breedingApi.getBreedingList).mockResolvedValue([{ ...breeding, note: '別タブの新しい内容' }]);
  await act(async () => { rejectDeletion(new Error('繁殖記録が変更されたため、削除を中止しました。')); });
  expect(await screen.findByText('繁殖記録が変更されたため、削除を中止しました。')).toBeInTheDocument();
  expect(await screen.findByText('別タブの新しい内容', { exact: false })).toBeInTheDocument();
  expect(screen.getByText('表示：1件 / 全1件')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: '削除' })).toBeEnabled());
  remove.mockResolvedValue();
  vi.mocked(breedingApi.getBreedingList).mockResolvedValue([]);
  await user.click(screen.getByRole('button', { name: '削除' }));
  expect(await screen.findByText('表示：0件 / 全0件')).toBeInTheDocument();
  expect(screen.queryByText('繁殖記録が変更されたため、削除を中止しました。')).not.toBeInTheDocument();
});

it('retains the visible record when both deletion and its following refresh fail', async () => {
  vi.spyOn(breedingApi, 'deleteBreeding').mockRejectedValue(new TypeError('fixture: offline'));
  const user = userEvent.setup();
  render(<MemoryRouter><BreedingList /></MemoryRouter>);
  await screen.findByRole('button', { name: '削除' });
  vi.mocked(breedingApi.getBreedingList).mockRejectedValue(new TypeError('fixture: refresh unavailable'));
  await user.click(screen.getByRole('button', { name: '削除' }));
  expect(await screen.findByText('繁殖記録の削除を確認できませんでした。通信状態を確認して、もう一度お試しください。')).toBeInTheDocument();
  expect(screen.getByText('表示：1件 / 全1件')).toBeInTheDocument();
  expect(screen.getByText('元のメモ', { exact: false })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '削除' })).toBeEnabled();
});
