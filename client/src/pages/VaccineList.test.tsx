import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  window.localStorage.clear();
  vi.spyOn(vaccineApi, 'getVaccineList').mockResolvedValue([vaccine]);
  vi.spyOn(vaccineApi, 'getVaccineSyncStatus').mockReturnValue({ pending: false });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('vaccine list synchronization status', () => {
  it('shows an unsent record and clears its status after the successful retry notification', async () => {
    vi.mocked(vaccineApi.getVaccineSyncStatus).mockReturnValue({ pending: true });
    render(<MemoryRouter><VaccineList /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('未送信のワクチン記録が1件あります。この端末に保存されています。');
    expect(screen.getAllByText('未送信')).toHaveLength(2);

    vi.mocked(vaccineApi.getVaccineSyncStatus).mockReturnValue({ pending: false });
    vi.mocked(vaccineApi.getVaccineList).mockResolvedValue([{ ...vaccine }]);
    fireEvent(window, new Event(vaccineApi.VACCINE_SYNC_STATUS_EVENT));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.queryByText('未送信')).not.toBeInTheDocument();
    expect(screen.getByText('表示：1件 / 全1件')).toBeInTheDocument();
    expect(vaccineApi.getVaccineList).toHaveBeenCalledTimes(2);
  });

  it('keeps a conflicting record visible with its warning across resume reads', async () => {
    const warning = '別の端末で変更されています。この端末の記録を保持しています。';
    vi.mocked(vaccineApi.getVaccineSyncStatus).mockReturnValue({ pending: true, warning });
    render(<MemoryRouter><VaccineList /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent(warning);
    expect(screen.getAllByText('同期の確認が必要')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '削除' })).toBeEnabled();

    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(vaccineApi.getVaccineList).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('alert')).toHaveTextContent(warning);
    expect(screen.getByText('表示：1件 / 全1件')).toBeInTheDocument();
  });

  it('coalesces overlapping resume reads and refreshes once more for a status change during the read', async () => {
    let complete!: (items: Vaccine[]) => void;
    vi.mocked(vaccineApi.getVaccineList).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const view = render(<MemoryRouter><VaccineList /></MemoryRouter>);
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    fireEvent(document, new Event('visibilitychange'));
    fireEvent(window, new Event(vaccineApi.VACCINE_SYNC_STATUS_EVENT));
    expect(vaccineApi.getVaccineList).toHaveBeenCalledOnce();
    await act(async () => { complete([vaccine]); });
    await waitFor(() => expect(vaccineApi.getVaccineList).toHaveBeenCalledTimes(2));
    expect(screen.getByText('表示：1件 / 全1件')).toBeInTheDocument();
    view.unmount();
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    fireEvent(document, new Event('visibilitychange'));
    fireEvent(window, new Event(vaccineApi.VACCINE_SYNC_STATUS_EVENT));
    expect(vaccineApi.getVaccineList).toHaveBeenCalledTimes(2);
  });

  it('does not request background reads while hidden or offline and resumes when visible', async () => {
    render(<MemoryRouter><VaccineList /></MemoryRouter>);
    await screen.findByRole('button', { name: '削除' });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(window, new Event('online'));
    fireEvent(window, new Event('focus'));
    fireEvent(document, new Event('visibilitychange'));
    expect(vaccineApi.getVaccineList).toHaveBeenCalledOnce();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    fireEvent(window, new Event('focus'));
    expect(vaccineApi.getVaccineList).toHaveBeenCalledOnce();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(vaccineApi.getVaccineList).toHaveBeenCalledTimes(2));
  });

  it('does not follow a late read with queued work after leaving the page', async () => {
    let complete!: (items: Vaccine[]) => void;
    vi.mocked(vaccineApi.getVaccineList).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const view = render(<MemoryRouter><VaccineList /></MemoryRouter>);
    fireEvent(window, new Event('online'));
    view.unmount();
    await act(async () => { complete([vaccine]); });
    expect(vaccineApi.getVaccineList).toHaveBeenCalledOnce();
  });
});

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
