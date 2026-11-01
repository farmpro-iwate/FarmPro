import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import {
  AnimalSyncContextChangedError, changeMatchingAnimal, withAnimalSync, withAnimalSyncRequest,
} from './animalRecordSyncSafety';

const environment = vi.hoisted(() => ({
  planId: 'standard', token: 'fixture-safety-token',
  user: { id: 'fixture-safety-user', farmId: 'fixture-safety-farm', plan: 'standard' },
}));
vi.mock('./authClient', () => ({
  getAuthToken: () => environment.token,
  getStoredAuthUser: () => environment.user,
}));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => environment.planId }));
vi.mock('../plans/policy', () => ({
  getFarmProPlan: () => ({ multiDeviceSync: environment.planId !== 'free' }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const pending: StoredRecord = {
  id: 7, name: '端末で保存した牛', note: '未送信の変更', cloudSyncPending: true,
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T01:00:00.000Z',
};

beforeEach(async () => {
  environment.planId = 'standard';
  environment.token = 'fixture-safety-token';
  environment.user = { id: 'fixture-safety-user', farmId: 'fixture-safety-farm', plan: 'standard' };
  window.localStorage.clear();
  vi.stubGlobal('navigator', { locks: undefined });
  await clearStore('cattle');
  await saveRecordPreservingTimestamps('cattle', pending);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('animal synchronization timeout and queued context boundaries', () => {
  it.each(['response', 'body'] as const)(
    'releases the lock at 12 seconds and ignores a late HTTP %s without acknowledging the row',
    async delayedPart => {
      const response = deferred<Response>();
      const body = deferred<{ cloudUpdatedAt: string }>();
      const started = deferred<void>();
      const parsed = deferred<void>();
      let requestSignal: AbortSignal | undefined;
      const received = {
        json: () => {
          if (delayedPart === 'body') started.resolve();
          return body.promise;
        },
      } as Response;
      // Deliberately ignore abort: the hard timeout must still settle the caller.
      vi.stubGlobal('fetch', vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = init?.signal as AbortSignal;
        if (delayedPart === 'response') started.resolve();
        return delayedPart === 'response' ? response.promise : Promise.resolve(received);
      }));
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const acknowledge = vi.fn();
      const saving = withAnimalSync('cattle', async context => {
        const remote = await withAnimalSyncRequest(async signal => {
          const result = await fetch('/api/cattle/record-sync/fixture-safety', { method: 'PUT', signal });
          const record = await result.json() as { cloudUpdatedAt: string };
          parsed.resolve();
          return record;
        });
        acknowledge();
        return changeMatchingAnimal('cattle', context, pending.id, pending, {
          ...pending, cloudSyncPending: false, cloudUpdatedAt: remote.cloudUpdatedAt,
        });
      });
      const outcome = saving.catch(error => error);
      await started.promise;
      const nextAction = vi.fn(async () => 'next operation');
      const next = withAnimalSync('cattle', nextAction);
      await vi.advanceTimersByTimeAsync(11999);
      expect(nextAction).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(await outcome).toEqual(expect.objectContaining({ message: expect.stringContaining('時間切れ') }));
      expect(requestSignal?.aborted).toBe(true);
      expect(await next).toBe('next operation');
      expect(nextAction).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);

      response.resolve(received);
      body.resolve({ cloudUpdatedAt: '2026-11-01T02:00:00.000Z' });
      await parsed.promise;
      vi.useRealTimers();
      expect(await getRecordById('cattle', pending.id)).toEqual(pending);
      expect(acknowledge).not.toHaveBeenCalled();
    },
  );

  it.each(['farm', 'user', 'plan'] as const)(
    'does not start a queued operation after the %s changes while waiting for the lock',
    async changed => {
      const entered = deferred<void>();
      const release = deferred<void>();
      const first = withAnimalSync('calves', async () => {
        entered.resolve();
        await release.promise;
      });
      await entered.promise;
      const action = vi.fn(async () => 'must not run');
      const queued = withAnimalSync('calves', action);
      const rejected = expect(queued).rejects.toBeInstanceOf(AnimalSyncContextChangedError);
      if (changed === 'farm') environment.user = { ...environment.user, farmId: 'other-farm' };
      else if (changed === 'user') environment.user = { ...environment.user, id: 'other-user' };
      else {
        environment.planId = 'pro';
        environment.user = { ...environment.user, plan: 'pro' };
      }
      expect(action).not.toHaveBeenCalled();
      release.resolve();
      await first;
      await rejected;
      expect(action).not.toHaveBeenCalled();
      // Rejecting the old context must not poison the queue for the current one.
      expect(await withAnimalSync('calves', async context => context.planId)).toBe(environment.planId);
    },
  );
});
