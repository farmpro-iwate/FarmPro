import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FARM_PRO_DB_VERSION, FARM_PRO_STORE_NAMES } from '../storage/db';
import { BackupPage } from './BackupPage';
import { importBackupJson } from '../services/backupApi';
vi.mock('../services/backupApi', () => ({
  downloadBackup: vi.fn(),
  importBackupJson: vi.fn(),
}));
function createValidBackup() {
  const stores = Object.fromEntries(
    FARM_PRO_STORE_NAMES.map((storeName) => [storeName, []]),
  );

  return {
    format: 'farmpro-backup',
    schemaVersion: FARM_PRO_DB_VERSION,
    appVersion: '1.0.0',
    exportedAt: '2026-07-19T08:00:00.000Z',
    stores,
    data: {
      cattle: [],
      calves: [],
      breedings: [],
      vaccines: [],
      blvTests: [],
      schedules: [],
      treatments: [],
      sales: [],
      expenses: [],
      feedings: [],
      feedInventory: [],
      feedingGuide: [],
      feedingAlertActions: [],
      settings: {},
    },
  };
}

describe('BackupPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('復元確認でキャンセルした場合は復元しない', async () => {
    const user = userEvent.setup();

    const backupFile = new File(
      [JSON.stringify(createValidBackup())],
      'farmpro-backup.json',
      { type: 'application/json' },
    );

    Object.defineProperty(backupFile, 'text', {
      value: vi.fn().mockResolvedValue(JSON.stringify(createValidBackup())),
    });

    render(<BackupPage />);

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    await user.upload(fileInput, backupFile);

const restoreButton = await screen.findByRole('button', {
  name: 'この内容で復元する',
});

vi.spyOn(window, 'confirm').mockReturnValue(false);

await user.click(restoreButton);

expect(window.confirm).toHaveBeenCalledTimes(1);
expect(importBackupJson).not.toHaveBeenCalled();
  });
  it('復元確認でOKした場合は復元する', async () => {
  const user = userEvent.setup();

  const backup = createValidBackup();
  const backupFile = new File(
    [JSON.stringify(backup)],
    'farmpro-backup.json',
    { type: 'application/json' },
  );

  Object.defineProperty(backupFile, 'text', {
    value: vi.fn().mockResolvedValue(JSON.stringify(backup)),
  });

  vi.mocked(importBackupJson).mockResolvedValue({
    counts: {
      cattle: 0,
      calves: 0,
      breedings: 0,
      vaccines: 0,
      blvTests: 0,
      schedules: 0,
      treatments: 0,
      sales: 0,
      expenses: 0,
      feedings: 0,
      feedInventory: 0,
      feedingGuide: 0,
      feedingAlertActions: 0,
    },
  });

  vi.spyOn(window, 'confirm').mockReturnValue(true);

  render(<BackupPage />);

  const fileInput = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;

  await user.upload(fileInput, backupFile);

  const restoreButton = await screen.findByRole('button', {
    name: 'この内容で復元する',
  });

  await user.click(restoreButton);

  expect(window.confirm).toHaveBeenCalledTimes(1);
  expect(importBackupJson).toHaveBeenCalledWith(backup);
});
});
