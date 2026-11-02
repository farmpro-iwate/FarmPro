import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TreatmentList } from './TreatmentList';
import { BreedingList } from './BreedingList';
import type { Treatment } from '../types/treatment';
import type { Breeding } from '../types/breeding';

const fixture = vi.hoisted(() => ({
  context: { farmId: 'list-farm', userId: 'list-user', token: 'list-token', planId: 'standard', cloudEnabled: true },
  status: { pending: false, warning: undefined as string | undefined },
  treatments: vi.fn<() => Promise<Treatment[]>>(), breedings: vi.fn<() => Promise<Breeding[]>>(),
  deleteTreatment: vi.fn<() => Promise<void>>(), deleteBreeding: vi.fn<() => Promise<void>>(),
  deleteExpense: vi.fn<() => Promise<void>>(),
}));
vi.mock('../services/treatmentApi', () => ({
  getTreatmentList: fixture.treatments, deleteTreatment: fixture.deleteTreatment,
  getTreatmentSyncContext: () => ({ ...fixture.context }),
  assertTreatmentSyncContext: (expected: typeof fixture.context) => {
    if (JSON.stringify(expected) !== JSON.stringify(fixture.context)) throw new Error('Fixture treatment context changed');
  },
  getTreatmentSyncStatus: () => fixture.status, TREATMENT_SYNC_STATUS_EVENT: 'fixture-treatment-status',
}));
vi.mock('../services/breedingApi', () => ({
  getBreedingList: fixture.breedings, deleteBreeding: fixture.deleteBreeding,
  getBreedingSyncContext: () => ({ ...fixture.context }),
  assertBreedingSyncContext: (expected: typeof fixture.context) => {
    if (JSON.stringify(expected) !== JSON.stringify(fixture.context)) throw new Error('Fixture breeding context changed');
  },
  getBreedingSyncStatus: () => fixture.status, BREEDING_SYNC_STATUS_EVENT: 'fixture-breeding-status',
}));
vi.mock('../services/authClient', () => ({
  getStoredAuthUser: () => ({ id: fixture.context.userId, farmId: fixture.context.farmId }),
  getAuthToken: () => fixture.context.token,
}));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => fixture.context.planId }));
vi.mock('../services/expensesApi', () => ({ deleteExpenseBySource: fixture.deleteExpense }));
vi.mock('../storage/repository', () => ({ getAllRecords: async () => [] }));

const treatment: Treatment = {
  id: 123, targetName: '治療の試験牛', targetNumber: 'COW-123', treatmentDate: '2026-11-01',
  recordType: '治療', symptom: '検証用の症状', diagnosis: '', treatmentProcedure: '', medicine: '', dosage: '',
  withdrawalEndDate: '', veterinarian: '', progress: '経過観察', note: '',
};
const breeding = {
  id: 'breeding-123', cowName: '繁殖の試験牛', cowEarTag: 'COW-123', breedingMethod: '種付',
  breedingStatus: '種付実施', heatDate: '2026-10-31', inseminationDate: '2026-11-01', bullName: '',
  inseminatorName: '', nextHeatExpectedDate: '', pregnancyCheckExpectedDate: '', pregnancyCheckDate: '',
  pregnancyResult: '未鑑定', expectedCalvingDate: '', note: '',
} as Breeding;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const cases = [
  { name: 'treatment', Component: TreatmentList, list: fixture.treatments, remove: fixture.deleteTreatment,
    event: 'fixture-treatment-status', pending: '未送信の治療記録が1件あります。この端末に保存されています。',
    row: treatment, withName: (name: string) => ({ ...treatment, targetName: name }) },
  { name: 'breeding', Component: BreedingList, list: fixture.breedings, remove: fixture.deleteBreeding,
    event: 'fixture-breeding-status', pending: '未送信の繁殖記録が1件あります。この端末に保存されています。',
    row: breeding, withName: (name: string) => ({ ...breeding, cowName: name }) },
] as const;

beforeEach(() => {
  fixture.context = { farmId: 'list-farm', userId: 'list-user', token: 'list-token', planId: 'standard', cloudEnabled: true };
  fixture.status = { pending: false, warning: undefined };
  fixture.treatments.mockReset().mockResolvedValue([treatment]);
  fixture.breedings.mockReset().mockResolvedValue([breeding]);
  fixture.deleteTreatment.mockReset().mockResolvedValue();
  fixture.deleteBreeding.mockReset().mockResolvedValue();
  fixture.deleteExpense.mockReset().mockResolvedValue();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each(cases)('$name list synchronization', ({ name, Component, list, remove, event, pending, row, withName }) => {
  // Each page has its own typed API; the shared checks exercise the same UI
  // guarantees without mocking the page's loading/deletion implementation.
  const mockList = list as ReturnType<typeof vi.fn<() => Promise<Array<Treatment | Breeding>>>>;

  it('shows pending/warning status and clears it from a notification without any write operation', async () => {
    const warning = '別端末の変更を確認してください。端末の記録を保持しています。';
    fixture.status = { pending: true, warning };
    render(<MemoryRouter><Component /></MemoryRouter>);
    await screen.findByText(pending);
    expect(screen.getByText(warning)).toBeInTheDocument();
    expect(screen.getAllByText('同期の確認が必要').length).toBeGreaterThan(0);

    fixture.status = { pending: false, warning: undefined };
    mockList.mockResolvedValue([{ ...row }]);
    fireEvent(window, new Event(event));

    await waitFor(() => expect(screen.queryByText(pending)).toBeNull());
    expect(screen.queryByText(warning)).toBeNull();
    expect(screen.queryByText('同期の確認が必要')).toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalled();
    expect(fixture.deleteExpense).not.toHaveBeenCalled();
  });

  it('coalesces overlapping reads and keeps one follow-up for events received during the current read', async () => {
    const reading = deferred<Array<Treatment | Breeding>>();
    mockList.mockReturnValueOnce(reading.promise).mockResolvedValue([withName('更新後の表示')]);
    render(<MemoryRouter><Component /></MemoryRouter>);
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    fireEvent(document, new Event('visibilitychange'));
    fireEvent(window, new Event(event));
    expect(list).toHaveBeenCalledOnce();

    await act(async () => { reading.resolve([row]); });

    expect(await screen.findAllByText(/更新後の表示/)).not.toHaveLength(0);
    expect(list).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalled();
    expect(fixture.deleteExpense).not.toHaveBeenCalled();
  });

  it('ignores an old-farm response and rebinds the view to the current context', async () => {
    const reading = deferred<Array<Treatment | Breeding>>();
    mockList.mockReturnValueOnce(reading.promise).mockResolvedValue([withName('新しい農場の表示')]);
    render(<MemoryRouter><Component /></MemoryRouter>);
    fixture.context = { ...fixture.context, farmId: 'another-farm' };

    await act(async () => { reading.resolve([withName('旧農場の遅い応答')]); });

    expect(await screen.findAllByText(/新しい農場の表示/)).not.toHaveLength(0);
    expect(screen.queryByText(/旧農場の遅い応答/)).toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('does not follow a queued read or status events after unmount', async () => {
    const reading = deferred<Array<Treatment | Breeding>>();
    mockList.mockReturnValueOnce(reading.promise);
    const view = render(<MemoryRouter><Component /></MemoryRouter>);
    fireEvent(window, new Event(event));
    view.unmount();

    await act(async () => { reading.resolve([row]); });
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    fireEvent(document, new Event('visibilitychange'));
    fireEvent(window, new Event(event));

    expect(list).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
    expect(fixture.deleteExpense).not.toHaveBeenCalled();
  });

  it('suppresses old reads and new events during deletion and expense cleanup, then reads once after they finish', async () => {
    const reading = deferred<Array<Treatment | Breeding>>();
    const deleting = deferred<void>();
    const cleanupExpense = deferred<void>();
    remove.mockReturnValueOnce(deleting.promise);
    if (name === 'treatment') fixture.deleteExpense.mockReturnValueOnce(cleanupExpense.promise);
    render(<MemoryRouter><Component /></MemoryRouter>);
    await screen.findByText('表示：1件 / 全1件');
    mockList.mockReturnValueOnce(reading.promise).mockResolvedValue([]);
    fireEvent(window, new Event(event));
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: '削除' })[0]);
    await waitFor(() => expect(remove).toHaveBeenCalledOnce());
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    fireEvent(window, new Event(event));
    await act(async () => { reading.resolve([withName('削除前の古い応答')]); });
    expect(screen.queryByText(/削除前の古い応答/)).toBeNull();
    expect(list).toHaveBeenCalledTimes(2);

    await act(async () => { deleting.resolve(); });
    if (name === 'treatment') {
      await waitFor(() => expect(fixture.deleteExpense).toHaveBeenCalledOnce());
      fireEvent(window, new Event(event));
      fireEvent(window, new Event('focus'));
      expect(list).toHaveBeenCalledTimes(2);
      await act(async () => { cleanupExpense.resolve(); });
    }

    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    expect(screen.getByText('表示：0件 / 全0件')).toBeInTheDocument();
    expect(remove).toHaveBeenCalledOnce();
    expect(fixture.deleteExpense).toHaveBeenCalledTimes(name === 'treatment' ? 2 : 0);
  });

  it('does not read on hidden/offline events and refreshes once when visible and online', async () => {
    render(<MemoryRouter><Component /></MemoryRouter>);
    await screen.findByText('表示：1件 / 全1件');
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event(event));
    fireEvent(document, new Event('visibilitychange'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    fireEvent(window, new Event('online'));
    expect(list).toHaveBeenCalledOnce();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});
