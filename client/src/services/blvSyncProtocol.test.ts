import { describe, expect, it } from 'vitest';
import { blvConditionHeaders, sameBlvContent, toCloudBlv, validBlvRevision } from './blvSyncProtocol';

describe('BLV wire protocol', () => {
  it('maps stable IDs and excludes all local sync metadata while preserving unknown business and exact timestamps', () => {
    const wire = toCloudBlv({ id: 17, syncRecordId: 'blv:stable-uuid', cowEarTag: '0017', result: '陽性',
      customAssay: { result: '10.00', values: [null, ''] }, createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z', cloudUpdatedAt: '2026-11-02T01:00:00.000Z',
      syncWarning: 'old', cloudSyncPending: true, blvSyncOrigin: { ownerId: 'browser' },
      blvSyncBase: { version: 1 }, blvSyncAttempt: {}, blvSyncWarning: 'pending',
      blvSyncBlocked: true, blvSyncDeletePending: true, deletedAt: '2026-11-02' });
    expect(wire).toEqual({ id: 'blv:stable-uuid', cowEarTag: '0017', cowName: '', testDate: '', result: '陽性',
      nextTestDate: '', isolationMemo: '', note: '', customAssay: { result: '10.00', values: [null, ''] },
      createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z' });
    expect(toCloudBlv({ id: 17 }).id).toBe('blv:17');
    expect(toCloudBlv({ id: 'blv:server-id' }).id).toBe('blv:server-id');
  });

  it('compares known nullish text defaults but keeps unknown null, text precision and timestamps distinct', () => {
    const original = { id: 17, result: null, customAssay: '10.00', createdAt: '2026-11-01T00:00:00.000Z' };
    expect(sameBlvContent(original, { ...original, id: 'blv:17', result: '', cowName: '' })).toBe(true);
    expect(sameBlvContent(original, { ...original, customAssay: '10' })).toBe(false);
    expect(sameBlvContent({ id: 17 }, { id: 17, unknown: null })).toBe(false);
    expect(sameBlvContent(original, { ...original, createdAt: '2026-11-01T00:00:00Z' })).toBe(false);
    expect(sameBlvContent({ id: 17, nested: { b: 1, a: 2 } }, { id: 17, nested: { a: 2, b: 1 } })).toBe(true);
  });

  it('uses a quoted concrete revision or create-only condition and rejects an unknown revision', () => {
    const revision = '2026-11-02T00:00:00.000Z';
    expect(blvConditionHeaders(revision)).toEqual({ 'If-Match': JSON.stringify(revision) });
    expect(blvConditionHeaders()).toEqual({ 'If-None-Match': '*' });
    expect(validBlvRevision(revision)).toBe(true);
    for (const value of [undefined, null, '', 'unknown', 1]) expect(validBlvRevision(value)).toBe(false);
  });
});
