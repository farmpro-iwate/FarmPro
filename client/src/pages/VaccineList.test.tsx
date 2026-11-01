import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VaccineList } from './VaccineList';
import * as vaccineApi from '../services/vaccineApi';
import type { Vaccine } from '../types/vaccine';

const vaccine: Vaccine = {
  id: 123, targetType: '成牛', targetNumber: 'FIXTURE-COW', targetName: '試験牛',
  vaccineName: '試験ワクチン', vaccineCost: '1200', vaccinationDate: '2026-11-01',
  nextDueDate: '2027-11-01', status: '接種済み', note: '',
};

beforeEach(() => {
  vi.spyOn(vaccineApi, 'getVaccineList').mockResolvedValue([vaccine]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('vaccine list deletion', () => {
  it('shows a failed deletion without removing the visible vaccine or reloading it as a success', async () => {
    vi.spyOn(vaccineApi, 'deleteVaccine').mockRejectedValue(new TypeError('fixture: offline'));
    const user = userEvent.setup();
    render(<MemoryRouter><VaccineList /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: '削除' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ワクチン記録の削除を確認できませんでした');
    expect(screen.getByText('表示：1件 / 全1件')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '削除' })).toBeEnabled();
    expect(vaccineApi.getVaccineList).toHaveBeenCalledOnce();
  });

  it('removes the deleted vaccine and explicitly shows that only the expense remains', async () => {
    vi.spyOn(vaccineApi, 'deleteVaccine').mockRejectedValue(new vaccineApi.VaccineExpenseCleanupError());
    const user = userEvent.setup();
    render(<MemoryRouter><VaccineList /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: '削除' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ワクチン記録の削除は完了しましたが、関連経費の削除を完了できませんでした');
    expect(screen.getByText('表示：0件 / 全0件')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
    expect(vaccineApi.getVaccineList).toHaveBeenCalledOnce();
  });

  it('disables repeated deletion and editing until the operation has finished', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>(done => { resolve = done; });
    vi.spyOn(vaccineApi, 'deleteVaccine').mockReturnValue(pending);
    const user = userEvent.setup();
    render(<MemoryRouter><VaccineList /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: '削除' }));
    const deleting = screen.getByRole('button', { name: '削除中...' });
    expect(deleting).toBeDisabled();
    expect(vaccineApi.deleteVaccine).toHaveBeenCalledExactlyOnceWith(vaccine.id);
    vi.mocked(vaccineApi.getVaccineList).mockResolvedValue([]);
    await act(async () => { resolve(); await pending; });
    expect(screen.getByText('表示：0件 / 全0件')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not call the API when deletion is cancelled', async () => {
    const deletion = vi.spyOn(vaccineApi, 'deleteVaccine').mockResolvedValue();
    vi.mocked(window.confirm).mockReturnValue(false);
    const user = userEvent.setup();
    render(<MemoryRouter><VaccineList /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: '削除' }));
    expect(deletion).not.toHaveBeenCalled();
    expect(screen.getByText('表示：1件 / 全1件')).toBeInTheDocument();
  });
});
