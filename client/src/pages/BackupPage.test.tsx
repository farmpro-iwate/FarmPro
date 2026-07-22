import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFarmProBackupFile } from '../storage/backup-import';
import { restoreFarmProBackup } from '../storage/backup-restore';
import { FARM_PRO_DB_VERSION, FARM_PRO_STORE_NAMES } from '../storage/db';
import type { FarmProBackup } from '../storage/backup';
import { BackupPage } from './BackupPage';

vi.mock('../storage/backup-import', () => ({
  readFarmProBackupFile: vi.fn(),
}));

vi.mock('../storage/backup-restore', () => ({
  restoreFarmProBackup: vi.fn(),
}));

function createValidBackup(): FarmProBackup {
  const stores = Object.fromEntries(
    FARM_PRO_STORE_NAMES.map((storeName) => [storeName, []]),
  ) as unknown as FarmProBackup['stores'];

  return {
    format: 'farmpro-backup',
    schemaVersion: FARM_PRO_DB_VERSION,
    appVersion: '1.0.0',
    exportedAt: '2026-07-19T08:00:00.000Z',
    stores,
  };
}

async function prepareRestoreConfirmation() {
  const user = userEvent.setup();
  const backup = createValidBackup();
  const backupFile = new File(
    [JSON.stringify(backup)],
    'farmpro-backup.json',
    { type: 'application/json' },
  );

  vi.mocked(readFarmProBackupFile).mockResolvedValue(backup);

  render(<BackupPage />);

  const fileInput = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;

  await user.upload(fileInput, backupFile);

  const restoreButton = await screen.findByRole('button', {
    name: 'この内容で復元する',
  });

  return { user, backup, restoreButton };
}

describe('BackupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('復元確認でキャンセルした場合は復元しない', async () => {
    const { user, restoreButton } = await prepareRestoreConfirmation();

    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await user.click(restoreButton);

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(restoreFarmProBackup).not.toHaveBeenCalled();
  });

  it('復元確認でOKした場合は復元する', async () => {
    const { user, backup, restoreButton } = await prepareRestoreConfirmation();

    vi.mocked(restoreFarmProBackup).mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await user.click(restoreButton);

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(restoreFarmProBackup).toHaveBeenCalledWith(backup);
  });
});
