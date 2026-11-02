import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertRecordSyncRetryPage, canRetryRecordSyncOnPage, createRecordSyncRetryOrigin,
  getRecordSyncRetryOrigin, isOwnedRecordSyncRetryOrigin, RecordSyncRetryPausedError,
  type RecordSyncRetryContext,
} from './recordSyncRetry';

const context: RecordSyncRetryContext = {
  farmId: 'retry/farm', userId: 'retry-user', token: 'retry-token', planId: 'standard', cloudEnabled: true,
};

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { vi.restoreAllMocks(); });

describe('formal record retry ownership', () => {
  it('does not create an owner while inspecting old, foreign or restored records', () => {
    const copied = { version: 1, farmId: context.farmId, userId: context.userId, ownerId: 'copied-browser' };
    expect(getRecordSyncRetryOrigin('treatments', context)).toBeUndefined();
    expect(isOwnedRecordSyncRetryOrigin('treatments', copied, context)).toBe(false);
    expect(isOwnedRecordSyncRetryOrigin('breedings', undefined, context)).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it.each(['treatments', 'breedings'] as const)('binds %s permission to its source, browser, farm and user', source => {
    const origin = createRecordSyncRetryOrigin(source, context)!;
    expect(getRecordSyncRetryOrigin(source, context)).toEqual(origin);
    expect(isOwnedRecordSyncRetryOrigin(source, origin, context)).toBe(true);
    expect(isOwnedRecordSyncRetryOrigin(source === 'treatments' ? 'breedings' : 'treatments', origin, context)).toBe(false);
    expect(isOwnedRecordSyncRetryOrigin(source, origin, { ...context, farmId: 'other-farm' })).toBe(false);
    expect(isOwnedRecordSyncRetryOrigin(source, origin, { ...context, userId: 'other-user' })).toBe(false);
    const key = `farmpro.${source === 'treatments' ? 'treatment' : 'breeding'}SyncOwner.${encodeURIComponent(context.farmId!)}`;
    localStorage.setItem(key, 'replacement-owner');
    expect(isOwnedRecordSyncRetryOrigin(source, origin, context)).toBe(false);
  });

  it.each([
    { cloudEnabled: false, planId: 'free' }, { token: null }, { farmId: null }, { userId: null },
  ])('does not issue retry permission without the required paid login: %j', changes => {
    expect(createRecordSyncRetryOrigin('treatments', { ...context, ...changes })).toBeUndefined();
    expect(getRecordSyncRetryOrigin('breedings', { ...context, ...changes })).toBeUndefined();
    expect(localStorage.length).toBe(0);
  });

  it('holds records when the browser cannot read or persist an owner', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    expect(createRecordSyncRetryOrigin('treatments', context)).toBeUndefined();
    expect(getRecordSyncRetryOrigin('treatments', context)).toBeUndefined();
    expect(isOwnedRecordSyncRetryOrigin('treatments', { version: 1, farmId: context.farmId, userId: context.userId, ownerId: 'owner' }, context)).toBe(false);
  });
});

describe('record retry page boundary', () => {
  it.each(['treatments', 'breedings'] as const)('allows only home and the %s list, including its trailing slash', source => {
    for (const path of ['/', `/${source}`, `/${source}/`]) expect(canRetryRecordSyncOnPage(source, path)).toBe(true);
    for (const path of [`/${source}/new`, `/${source}/1/edit`, `/${source}-other`, '/backups', '/device-sync', '/sales/1/settlement']) {
      expect(canRetryRecordSyncOnPage(source, path)).toBe(false);
    }
    expect(canRetryRecordSyncOnPage(source, source === 'treatments' ? '/breedings' : '/treatments')).toBe(false);
  });

  it.each(['page', 'offline', 'hidden'] as const)('stops a resumed operation when %s changes', change => {
    expect(() => assertRecordSyncRetryPage('treatments')).not.toThrow();
    if (change === 'page') window.history.replaceState(null, '', '/backups');
    if (change === 'offline') vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    if (change === 'hidden') vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    expect(() => assertRecordSyncRetryPage('treatments')).toThrow(RecordSyncRetryPausedError);
  });
});
