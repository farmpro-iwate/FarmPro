import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FARM_PRO_STORE_NAMES } from './db';
import type { FarmProBackup } from './backup';
import { restoreFarmProBackup } from './backup-restore';
import { getAllRecords, replaceAllRecords } from './repository';

vi.mock('./repository', () => ({
  replaceAllRecords: vi.fn(),
  getAllRecords: vi.fn(),
}));

const mockedReplaceAllRecords = vi.mocked(replaceAllRecords);

function createBackup(): FarmProBackup {
  const stores = Object.fromEntries(
    FARM_PRO_STORE_NAMES.map((storeName) => [
      storeName,
      [{ id: `${storeName}-1`, name: `${storeName} data` }],
    ]),
  ) as unknown as FarmProBackup['stores'];

  return {
    format: 'farmpro-backup',
    schemaVersion: 1,
    appVersion: '1.6.0',
    exportedAt: '2026-07-19T09:00:00.000Z',
    stores,
  };
}

describe('restoreFarmProBackup', () => {
  beforeEach(() => {
    mockedReplaceAllRecords.mockReset();
    vi.mocked(getAllRecords).mockReset();
    vi.mocked(getAllRecords).mockResolvedValue([]);
    mockedReplaceAllRecords.mockResolvedValue([]);
  });

  it('全ストアをバックアップ内容で順番に入れ替える', async () => {
    const backup = createBackup();

    await restoreFarmProBackup(backup);

    expect(mockedReplaceAllRecords).toHaveBeenCalledTimes(
      FARM_PRO_STORE_NAMES.length,
    );

    FARM_PRO_STORE_NAMES.forEach((storeName, index) => {
      expect(mockedReplaceAllRecords).toHaveBeenNthCalledWith(
        index + 1,
        storeName,
        backup.stores[storeName],
      );
    });
  });

  it('空のストアも空配列で入れ替える', async () => {
    const backup = createBackup();
    const storeName = FARM_PRO_STORE_NAMES[0];

    backup.stores[storeName] = [];

    await restoreFarmProBackup(backup);

    expect(mockedReplaceAllRecords).toHaveBeenCalledWith(storeName, []);
  });

  it('途中で復元に失敗した場合はエラーを返す', async () => {
    const backup = createBackup();
    const failedStoreName = FARM_PRO_STORE_NAMES[1];

    mockedReplaceAllRecords.mockImplementation(async (storeName) => {
      if (storeName === failedStoreName) {
        throw new Error('復元失敗');
      }

      return [];
    });

    await expect(restoreFarmProBackup(backup)).rejects.toThrow('復元失敗');
  });
  it('does not erase existing medical inventory when restoring a schema v3 backup', async () => {
    const oldBackup = createBackup();
    oldBackup.schemaVersion = 3;
    oldBackup.stores.supplyInventory = [];
    vi.mocked(getAllRecords).mockResolvedValue([{ id: 'medicine-purchase-1' }]);
    await expect(restoreFarmProBackup(oldBackup)).rejects.toThrow('在庫を消さない');
    expect(mockedReplaceAllRecords).not.toHaveBeenCalled();
  });

});
