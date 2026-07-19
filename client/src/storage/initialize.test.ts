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

  it('同じバージョンでは既存メタデータを返す', async () => {
    const first = await initializeFarmProStorage('1.6.0');
    const second = await initializeFarmProStorage('1.6.0');

    expect(second).toEqual(first);
  });

  it('アプリ版が変わったらメタデータを更新する', async () => {
    const first = await initializeFarmProStorage('1.6.0');
    const second = await initializeFarmProStorage('2.0.0');

    expect(second.appVersion).toBe('2.0.0');
    expect(second.schemaVersion).toBe(1);
    expect(second.initializedAt).toBe(first.initializedAt);
    expect(second.updatedAt).toBeTruthy();
  });
});
