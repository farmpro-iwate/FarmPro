import 'fake-indexeddb/auto';

Object.defineProperty(globalThis, 'window', {
  value: globalThis,
  writable: true,
});

import { beforeEach, describe, expect, it } from 'vitest';
import { clearStore } from './repository';
import { initializeFarmProStorage } from './initialize';

describe('initializeFarmProStorage', () => {
  beforeEach(async () => {
    await clearStore('metadata');
  });

  it('初回実行時にメタデータを作成する', async () => {
    const metadata = await initializeFarmProStorage('1.6.0');

    expect(metadata.id).toBe('database');
    expect(metadata.schemaVersion).toBe(1);
    expect(metadata.appVersion).toBe('1.6.0');
    expect(metadata.initializedAt).toBeTruthy();
  });

  it('2回目以降は既存メタデータを返す', async () => {
    const first = await initializeFarmProStorage('1.6.0');
    const second = await initializeFarmProStorage('2.0.0');

    expect(second).toEqual(first);
    expect(second.appVersion).toBe('1.6.0');
  });
});
