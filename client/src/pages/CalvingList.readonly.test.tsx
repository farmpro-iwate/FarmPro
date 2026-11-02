import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalvingList } from './CalvingList';
import { ANIMAL_SYNC_STATUS_EVENT } from '../services/animalRecordSyncSafety';
import { clearStore, getAllRecords, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoreName } from '../storage/types';

const stores: StoreName[] = ['calvings', 'calves', 'cattle', 'breedings', 'schedules'];
const calving = {
  id: 'readonly-calving', cowId: 'MOTHER-1', cowName: '一覧の母牛',
  calfName: 'CALF-1', calfSex: '雌', birthWeightKg: 31,
  actualCalvingDate: '2026-11-01', expectedCalvingDate: '2026-10-31',
  calvingResult: '自然分娩', colostrumStatus: '確認済み', registeredToCalfLedger: false,
  unknownBusinessField: { note: 'keep' }, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};

async function snapshot() {
  return Object.fromEntries(await Promise.all(stores.map(async store => [store, await getAllRecords(store)])));
}

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('farmpro.plan', 'free');
  localStorage.setItem('farmpro.authUser', JSON.stringify({ id: 'readonly-user', farmId: 'calving-list-readonly', plan: 'free' }));
  for (const store of stores) await clearStore(store);
  await saveRecordPreservingTimestamps('calvings', calving);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Free must not access the cloud'))));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('CalvingList read-only refresh with real services and IndexedDB', () => {
  it('does not register cattle, calves or schedules when first opened, resumed or manually reloaded', async () => {
    const before = await snapshot();
    render(<MemoryRouter><CalvingList /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument());
    expect(screen.getAllByText('一覧の母牛').length).toBeGreaterThan(0);
    expect(await snapshot()).toEqual(before);

    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    fireEvent(document, new Event('visibilitychange'));
    fireEvent(window, new Event(ANIMAL_SYNC_STATUS_EVENT));
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    await waitFor(() => expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument());

    expect(await snapshot()).toEqual(before);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps explicit confirmed calf registration and does not register another calf on refresh', async () => {
    render(<MemoryRouter><CalvingList /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: '子牛台帳へ登録' })[0]);

    await screen.findByText('子牛台帳へ登録しました。子牛台帳で内容を確認してください。');
    await waitFor(() => expect(screen.queryAllByRole('button', { name: '子牛台帳へ登録' })).toHaveLength(0));
    const registered = await snapshot();
    expect(registered.calves).toHaveLength(1);
    expect(registered.calves[0]).toMatchObject({ calvingId: calving.id, earTag: 'CALF-1', recipientCowId: 'MOTHER-1' });
    expect(registered.calvings[0]).toMatchObject({ registeredToCalfLedger: true, calfId: String(registered.calves[0].id), unknownBusinessField: calving.unknownBusinessField });
    expect(registered.cattle).toHaveLength(0);
    expect(registered.schedules).toHaveLength(0);
    expect(window.confirm).toHaveBeenCalledOnce();

    fireEvent(window, new Event(ANIMAL_SYNC_STATUS_EVENT));
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    await waitFor(() => expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument());
    expect(await snapshot()).toEqual(registered);
    expect(fetch).not.toHaveBeenCalled();
  });
});
