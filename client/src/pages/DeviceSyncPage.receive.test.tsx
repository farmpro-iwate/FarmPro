import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FarmProBackup } from '../storage/backup';
import type { DeviceSyncPreview } from '../services/deviceSync';

const mocks = vi.hoisted(() => ({
  user: { id: 'owner-test', farmId: 'farm-test', farmName: 'Test farm', name: 'Owner', plan: 'pro' },
  preview: vi.fn(), pull: vi.fn(), push: vi.fn(), receive: vi.fn(), backup: vi.fn(), previous: vi.fn(),
}));
vi.mock('../services/authClient', () => ({ getStoredAuthUser: () => mocks.user, hasAuthToken: () => true }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => mocks.user.plan }));
vi.mock('../services/deviceSync', () => ({
  getDeviceSyncPreview: mocks.preview, isDeviceSyncInitialized: () => false,
  pullCloudToLocal: mocks.pull, pushLocalToCloud: mocks.push, markLocalChangePending: vi.fn(),
}));
vi.mock('../services/cloudReceive', () => ({ receiveConfirmedCloudBackup: mocks.receive, getBeforeCloudReceiveBackup: mocks.previous }));
vi.mock('../storage/backup', () => ({ createFarmProBackup: mocks.backup, downloadFarmProBackup: vi.fn() }));
vi.mock('../services/syncLosslessMerge', () => ({ proposeLosslessSyncMerge: () => ({ additionsToCloud: 0, additionsToDevice: 1, unresolved: [] }) }));
vi.mock('../services/syncMergeReadiness', () => ({ inspectSyncMergeReadiness: () => ({ missingFromCloud: 0, missingFromDevice: 1, sameIdDifferentContent: 1, farmMismatch: false }) }));
vi.mock('../services/syncRecoveryBreeding', () => ({ planCloudOnlyBreedingAdditions: () => ({ eligible: [], blocked: [] }), addReviewedBreedingWithoutOverwrite: vi.fn() }));

import { DeviceSyncPage } from './DeviceSyncPage';
const backup: FarmProBackup = {
  format: 'farmpro-backup', schemaVersion: 4, appVersion: '1.6.0',
  exportedAt: '2026-10-31T05:40:45Z', farm: { id: 'farm-test', name: 'Test farm' },
  stores: {
    settings: [], masters: [], cattle: [], calves: [], breedings: [], calvings: [],
    treatments: [], vaccines: [], blvTests: [], schedules: [], feedings: [],
    feedingGuide: [], feedingAlertActions: [], feedInventory: [], supplyInventory: [],
    fatteningTransitions: [], sales: [], expenses: [], photos: [], metadata: [],
  },
};
let preview: DeviceSyncPreview;
const receiveButton = () => screen.getByRole('button', { name: 'クラウドのデータをこの端末へ反映' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.plan = 'pro'; mocks.user.farmId = 'farm-test';
  window.history.replaceState(null, '', '/device-sync?receive=cloud');
  preview = {
    direction: 'conflict', localRecordCount: 180, cloudRecordCount: 185,
    localUpdatedAt: '2026-10-30T00:00:00Z', cloudUpdatedAt: '2026-10-31T05:40:45Z',
    cloudSavedAt: '2026-10-31T06:00:00Z', cloudRevision: 35, cloudBackup: structuredClone(backup), differences: [],
  };
  mocks.preview.mockImplementation(async () => structuredClone(preview));
  mocks.backup.mockResolvedValue(backup);
  mocks.previous.mockReturnValue(null);
  mocks.receive.mockReset(); mocks.receive.mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

async function open() {
  render(<StrictMode><DeviceSyncPage /></StrictMode>);
  await screen.findByRole('button', { name: 'クラウドのデータをこの端末へ反映' });
  await waitFor(() => expect(receiveButton()).not.toBeDisabled());
}

describe('existing device sync screen: reviewed receive', () => {
  it('does not upload or restore on entry, including StrictMode', async () => {
    await open();
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.pull).not.toHaveBeenCalled();
    expect(mocks.receive).not.toHaveBeenCalled();
    expect(screen.getByText(/185件（内部情報を除く）/)).toBeInTheDocument();
  });
  it('remains read-only even when local is newer', async () => {
    preview.direction = 'local-newer'; await open();
    expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.pull).not.toHaveBeenCalled();
  });
  it('does not replace an empty device without confirmation in receive mode', async () => {
    preview.localRecordCount = 0; preview.direction = 'cloud-newer'; await open();
    expect(mocks.pull).not.toHaveBeenCalled(); expect(mocks.receive).not.toHaveBeenCalled();
  });
  it('cancelling confirmation makes no writes', async () => {
    vi.mocked(window.confirm).mockReturnValue(false); await open();
    fireEvent.click(receiveButton());
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('世代35'));
    expect(mocks.receive).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
  });
  it('receives the reviewed snapshot exactly once, without uploading', async () => {
    mocks.receive.mockImplementation(async () => { preview.direction = 'same'; preview.localRecordCount = 185; });
    await open(); fireEvent.click(receiveButton());
    await screen.findByText(/受信完了：確認したクラウド185件/);
    expect(mocks.receive).toHaveBeenCalledExactlyOnceWith(backup, 35, true);
    expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.pull).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'クラウドのデータをこの端末へ反映' })).not.toBeInTheDocument();
  });
  it('shows failure without a success message or retry loop', async () => {
    mocks.receive.mockRejectedValue(new Error('退避できないため中止しました')); await open();
    fireEvent.click(receiveButton());
    await screen.findByText('退避できないため中止しました');
    expect(screen.queryByText(/受信完了：/)).not.toBeInTheDocument();
    expect(mocks.receive).toHaveBeenCalledTimes(1); expect(mocks.push).not.toHaveBeenCalled();
  });
  it('does not offer a receive to free plans', async () => {
    mocks.user.plan = 'free'; render(<DeviceSyncPage />);
    expect(screen.queryByRole('button', { name: 'クラウドのデータをこの端末へ反映' })).not.toBeInTheDocument();
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it('disables receiving another farm', async () => {
    preview.cloudBackup!.farm!.id = 'another-farm'; render(<DeviceSyncPage />);
    await screen.findByRole('button', { name: 'クラウドのデータをこの端末へ反映' });
    expect(receiveButton()).toBeDisabled(); expect(mocks.receive).not.toHaveBeenCalled();
  });
});
