import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupplyMovement } from '../services/supplyInventoryApi';
import { SupplyInventoryPage } from './SupplyInventoryPage';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  change: vi.fn(),
  status: { state: 'idle', message: '' } as {
    state: 'idle' | 'synced' | 'pending' | 'conflict'; message: string;
  },
}));

vi.mock('../services/supplyInventoryApi', () => ({
  getSupplyMovements: mocks.read,
  changeManualSupplyMovement: mocks.change,
  getSupplyBatches: (rows: SupplyMovement[], kind: string) => rows
    .filter(row => row.kind === kind)
    .map(row => ({
      key: row.id, itemName: row.itemName, lotNumber: row.lotNumber,
      storageLocation: row.storageLocation, expiryDate: row.expiryDate,
      balance: row.quantity, unit: row.unit,
    })),
}));

vi.mock('../services/supplyInventorySync', () => ({
  getSupplyInventorySyncStatus: () => mocks.status,
  SUPPLY_INVENTORY_SYNC_STATUS_EVENT: 'farmpro:supply-inventory-sync-status',
}));

const purchase: SupplyMovement = {
  id: 'fixture-embryo', kind: '受精卵', action: '購入', date: '2026-11-01',
  itemName: '試験用受精卵', lotNumber: 'FIXTURE-01', quantity: 1, unit: '個',
  expiryDate: '', supplier: '', storageLocation: '', donorCow: '', sire: '', grade: '',
  cowEarTag: '', unitPrice: 0, amount: 0, paymentMethod: '現金', note: '',
  expenseRecorded: false, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
};

function open() {
  return render(<MemoryRouter initialEntries={['/supply-inventory?kind=受精卵']}><SupplyInventoryPage /></MemoryRouter>);
}

describe('inventory page normal sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status = { state: 'idle', message: '' };
    mocks.read.mockResolvedValue([purchase]);
    mocks.change.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the saved inventory visible with an offline sync warning and retries on reconnect', async () => {
    mocks.status = { state: 'pending', message: 'この端末に保存済みです。通信回復後に同期します。' };
    open();
    expect(await screen.findByText('現在の在庫（1種類・ロット）')).toBeInTheDocument();
    expect(screen.getByText('1 個')).toBeInTheDocument();
    expect(screen.getByText(mocks.status.message)).toBeInTheDocument();

    mocks.read.mockImplementationOnce(async () => {
      mocks.status = { state: 'synced', message: '' };
      return [{ ...purchase, quantity: 2 }];
    });
    fireEvent(window, new Event('online'));
    expect(await screen.findByText('2 個')).toBeInTheDocument();
    expect(screen.queryByText('この端末に保存済みです。通信回復後に同期します。')).not.toBeInTheDocument();
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });

  it('refreshes after focus and becoming visible and removes listeners on unmount', async () => {
    const view = open();
    await screen.findByText('1 個');
    mocks.read.mockResolvedValue([{ ...purchase, quantity: 3 }]);
    fireEvent(window, new Event('focus'));
    await screen.findByText('3 個');

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    expect(mocks.read).toHaveBeenCalledTimes(2);

    visibility.mockReturnValue('visible');
    mocks.read.mockResolvedValue([{ ...purchase, quantity: 4 }]);
    fireEvent(document, new Event('visibilitychange'));
    await screen.findByText('4 個');
    expect(mocks.read).toHaveBeenCalledTimes(3);

    view.unmount();
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    fireEvent(document, new Event('visibilitychange'));
    expect(mocks.read).toHaveBeenCalledTimes(3);
  });

  it('shows a conflict event without dropping inventory or triggering a reload loop', async () => {
    open();
    await screen.findByText('1 個');
    mocks.status = { state: 'conflict', message: '別の端末にも変更があります。在庫の同期は保留しています。' };
    fireEvent(window, new Event('farmpro:supply-inventory-sync-status'));
    expect(screen.getByText(mocks.status.message)).toBeInTheDocument();
    expect(screen.getByText('現在の在庫（1種類・ロット）')).toBeInTheDocument();
    expect(screen.getByText('1 個')).toBeInTheDocument();
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });

  it('serializes refreshes while a request is running and reads the latest inventory afterwards', async () => {
    let finish!: (rows: SupplyMovement[]) => void;
    mocks.read.mockImplementationOnce(() => new Promise<SupplyMovement[]>(resolve => { finish = resolve; }));
    open();
    await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1));
    mocks.read.mockResolvedValue([{ ...purchase, quantity: 5 }]);
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    expect(mocks.read).toHaveBeenCalledTimes(1);
    await act(async () => { finish([purchase]); });
    expect(await screen.findByText('5 個')).toBeInTheDocument();
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
});
