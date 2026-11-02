import { describe, expect, it } from 'vitest';
import { feedingFatteningConditionHeaders, feedingFatteningSyncResources, sameFeedingFatteningContent,
  toCloudFeedingFattening, validFeedingFatteningRevision, type FeedingFatteningSource } from './feedingFatteningSyncProtocol';

describe.each(['feedingAlertActions', 'fatteningTransitions'] as FeedingFatteningSource[])('%s wire protocol', source => {
  const { prefix, textFields } = feedingFatteningSyncResources[source];
  it('uses a string identity without adding a prefix and keeps null, exact date strings and all unknown business', () => {
    const record = { id: 'local', syncRecordId: 'wire:existing', [textFields[0]]: null, memo: '',
      unknownCost: '10.00', unknownDates: ['2026-11-01T00:00:00+09:00', null],
      createdAt: '2026-11-01T01:00:00+09:00', updatedAt: null, cloudUpdatedAt: '2026-11-01T00:00:00.000Z',
      cloudSyncPending: true, [`${prefix}Origin`]: {}, [`${prefix}Base`]: {}, [`${prefix}Attempt`]: {},
      [`${prefix}Warning`]: 'pending', [`${prefix}Blocked`]: true, [`${prefix}DeletePending`]: true, deletedAt: 'old' };
    const wire = toCloudFeedingFattening(source, record as never);
    expect(wire.id).toBe('wire:existing'); expect(wire[textFields[0]]).toBeNull();
    expect(wire).toMatchObject({ unknownCost: '10.00', unknownDates: record.unknownDates, createdAt: record.createdAt, updatedAt: null });
    expect(Object.keys(wire).some(key => key.startsWith(prefix) || key.startsWith('cloudSync'))).toBe(false);
    expect(wire).not.toHaveProperty('cloudUpdatedAt'); expect(wire).not.toHaveProperty('deletedAt');
    expect(toCloudFeedingFattening(source, { id: 'local' }).id).toBe('local');
  });
  it('fills only undefined fields and never treats null or changed unknown precision as the same content', () => {
    expect(sameFeedingFatteningContent(source, { id: 'a' }, { id: 'a', memo: '' })).toBe(true);
    expect(sameFeedingFatteningContent(source, { id: 'a', memo: null }, { id: 'a', memo: '' })).toBe(false);
    expect(sameFeedingFatteningContent(source, { id: 'a', unknown: null }, { id: 'a' })).toBe(false);
    expect(sameFeedingFatteningContent(source, { id: 'a', amount: '1.00' }, { id: 'a', amount: '1' })).toBe(false);
    expect(sameFeedingFatteningContent(source, { id: 'a', updatedAt: '2026-11-01T00:00:00Z' }, { id: 'a', updatedAt: '2026-11-01T00:00:00.000Z' })).toBe(false);
    expect(feedingFatteningConditionHeaders()).toEqual({ 'If-None-Match': '*' });
    expect(feedingFatteningConditionHeaders('2026-11-01T00:00:00.000Z')).toEqual({ 'If-Match': '"2026-11-01T00:00:00.000Z"' });
    expect(validFeedingFatteningRevision('unknown')).toBe(false);
  });
});
