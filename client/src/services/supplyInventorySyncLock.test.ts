import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const context = vi.hoisted(() => ({ identity: { farmId: 'farm-a', ownerId: 'browser-a' } as { farmId: string; ownerId: string } | null }));
vi.mock('./supplyInventorySyncState', () => ({ getSupplySyncIdentity: () => context.identity }));
import { withSupplyInventorySyncLock } from './supplyInventorySyncLock';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

beforeEach(() => {
  context.identity = { farmId: 'farm-a', ownerId: 'browser-a' };
  vi.stubGlobal('navigator', { locks: undefined });
});
afterEach(() => vi.unstubAllGlobals());

describe('shared inventory synchronization and restore lock', () => {
  it('holds an explicit restore until the preceding normal sync has finished', async () => {
    const entered = gate(); const complete = gate(); const order: string[] = [];
    const sync = withSupplyInventorySyncLock(async () => {
      order.push('sync-start'); entered.release();
      await complete.promise;
      order.push('sync-complete');
    });
    await entered.promise;
    const restore = withSupplyInventorySyncLock(async () => { order.push('restore'); return 7; });
    await Promise.resolve();
    expect(order).toEqual(['sync-start']);
    complete.release();
    await sync;
    expect(await restore).toBe(7);
    expect(order).toEqual(['sync-start', 'sync-complete', 'restore']);
  });

  it('does not block an independent farm', async () => {
    const entered = gate(); const complete = gate();
    const first = withSupplyInventorySyncLock(async () => {
      entered.release(); await complete.promise;
    });
    await entered.promise;
    context.identity = { farmId: 'farm-b', ownerId: 'browser-b' };
    expect(await withSupplyInventorySyncLock(async () => 'other farm')).toBe('other farm');
    complete.release(); await first;
  });

  it('releases the queue after failure so the next operation can run', async () => {
    const entered = gate(); const complete = gate();
    const first = withSupplyInventorySyncLock(async () => {
      entered.release(); await complete.promise; throw new Error('同期失敗');
    });
    const rejected = expect(first).rejects.toThrow('同期失敗');
    await entered.promise;
    const second = withSupplyInventorySyncLock(async () => 'restored');
    complete.release();
    await rejected;
    expect(await second).toBe('restored');
  });

  it('does not run a queued restore after the farm changes while waiting', async () => {
    const entered = gate(); const complete = gate();
    const first = withSupplyInventorySyncLock(async () => {
      entered.release(); await complete.promise;
    });
    await entered.promise;
    const restore = vi.fn(async () => undefined);
    const queued = withSupplyInventorySyncLock(restore);
    const rejected = expect(queued).rejects.toThrow('待機中に農場');
    context.identity = { farmId: 'farm-b', ownerId: 'browser-b' };
    complete.release();
    await first; await rejected;
    expect(restore).not.toHaveBeenCalled();
  });

  it('uses the browser-wide Web Lock with the same farm and device key', async () => {
    const request = vi.fn(async (_name: string, action: () => Promise<unknown>) => action());
    vi.stubGlobal('navigator', { locks: { request } });
    expect(await withSupplyInventorySyncLock(async () => 'done')).toBe('done');
    expect(request).toHaveBeenCalledExactlyOnceWith('farmpro:supply-inventory:farm-a:browser-a', expect.any(Function));
  });

  it('runs normally when cloud inventory identity is not applicable', async () => {
    context.identity = null;
    const request = vi.fn();
    vi.stubGlobal('navigator', { locks: { request } });
    expect(await withSupplyInventorySyncLock(async () => 'local restore')).toBe('local restore');
    expect(request).not.toHaveBeenCalled();
  });
});
