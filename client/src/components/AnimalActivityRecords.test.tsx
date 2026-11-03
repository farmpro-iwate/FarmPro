import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimalActivityRecords } from './AnimalActivityRecords';
import { getActivityRecords } from '../services/activityRecordsApi';
import { getAllRecords } from '../storage/repository';
import { activityAnimalFields } from '../utils/activityRecordAnimal';
import type { ActivityRecord } from '../types/activityRecord';

const owner = vi.hoisted(() => ({ farmId: 'history-fixture-farm', id: 'history-fixture-user' }));
vi.mock('../services/authClient', () => ({ getStoredAuthUser: () => owner }));
vi.mock('../services/activityRecordsApi', () => ({
  getActivityRecords: vi.fn(), ACTIVITY_RECORD_SYNC_STATUS_EVENT: 'fixture:activity-record-sync-status',
}));
vi.mock('../storage/repository', () => ({ getAllRecords: vi.fn() }));
const cow = { id: 7, earTag: '0012', birthday: '2020-04-05', name: '検証牛', syncId: 'history-stable-cow' };
const note: ActivityRecord = { id: 'note-fixture', activityType: 'animal', recordDate: '2026-11-01', title: '歩き方の観察',
  note: '観察メモ', ...activityAnimalFields('cattle', cow), createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' };

beforeEach(() => {
  owner.farmId = 'history-fixture-farm';
  vi.mocked(getAllRecords).mockResolvedValue([cow]);
  vi.mocked(getActivityRecords).mockResolvedValue([note]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('individual activity history', () => {
  it('shows only the confirmed individual records and provides create/edit routes without changing stored rows', async () => {
    const records: ActivityRecord[] = [note,
      { ...note, id: 'other', animalSyncId: 'another-cow', title: '別個体の観察' },
      { ...note, id: 'farm', activityType: 'farm', title: '農場全体の記録' },
      { ...note, id: 'pending-delete', activityRecordSyncDeletePending: true, title: '削除保留の記録' }];
    const original = JSON.stringify(records);
    vi.mocked(getActivityRecords).mockResolvedValue(records);
    render(<MemoryRouter><AnimalActivityRecords kind="cattle" animal={cow} /></MemoryRouter>);
    expect(await screen.findByText('歩き方の観察')).toBeInTheDocument();
    expect(screen.queryByText('別個体の観察')).not.toBeInTheDocument();
    expect(screen.queryByText('農場全体の記録')).not.toBeInTheDocument();
    expect(screen.queryByText('削除保留の記録')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '記録を追加' })).toHaveAttribute('href', '/activities/new?type=animal&animalKind=cattle&animalId=7&returnTo=%2Fcattle%2F7');
    expect(screen.getByRole('link', { name: '確認・編集' })).toHaveAttribute('href', '/activities/note-fixture/edit?returnTo=%2Fcattle%2F7');
    expect(JSON.stringify(records)).toBe(original);
  });

  it('does not show a delayed response after the farm changes', async () => {
    let resolve!: (value: ActivityRecord[]) => void;
    const oldRead = new Promise<ActivityRecord[]>(done => { resolve = done; });
    vi.mocked(getActivityRecords).mockReturnValueOnce(oldRead).mockResolvedValue([]);
    const { rerender } = render(<MemoryRouter><AnimalActivityRecords kind="cattle" animal={cow} /></MemoryRouter>);
    await waitFor(() => expect(getActivityRecords).toHaveBeenCalledOnce());
    owner.farmId = 'new-history-farm';
    rerender(<MemoryRouter><AnimalActivityRecords kind="cattle" animal={cow} canAdd={false} /></MemoryRouter>);
    await waitFor(() => expect(getActivityRecords).toHaveBeenCalledTimes(2));
    await act(async () => { resolve([note]); });
    expect(screen.queryByText('歩き方の観察')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '記録を追加' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '記録一覧' })).toBeInTheDocument();
  });
});
