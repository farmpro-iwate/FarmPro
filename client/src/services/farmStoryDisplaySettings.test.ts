import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FARM_STORY_CATEGORIES, FARM_STORY_CATEGORIES, farmStoryPreferenceKey,
  readFarmStoryCategories, saveFarmStoryCategories, type FarmStoryPreferenceScope,
} from './farmStoryDisplaySettings';

const scope: FarmStoryPreferenceScope = { farmId: 'farm-one', userId: 'user-one' };
const initial = ['cattle', 'calf', 'breeding', 'calving', 'treatment', 'vaccine', 'sale'];

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('farm story categories saved for the current user and farm', () => {
  it('starts with the existing seven categories and keeps additional categories optional', () => {
    expect(FARM_STORY_CATEGORIES).toHaveLength(17);
    expect(DEFAULT_FARM_STORY_CATEGORIES).toEqual(initial);
    expect(readFarmStoryCategories(scope)).toEqual(initial);
    const edited = readFarmStoryCategories(scope);
    edited.splice(0);
    expect(readFarmStoryCategories(scope)).toEqual(initial);
    expect(localStorage.length).toBe(0);
  });

  it('lets the user select farm work and individual records independently', () => {
    saveFarmStoryCategories(scope, ['farmWork']);
    expect(readFarmStoryCategories(scope)).toEqual(['farmWork']);
    saveFarmStoryCategories(scope, ['animalRecord', 'farmWork']);
    expect(readFarmStoryCategories(scope)).toEqual(['farmWork', 'animalRecord']);
  });

  it('restores an intentional all-off selection instead of falling back to the defaults', () => {
    saveFarmStoryCategories(scope, ['treatment', 'blv']);
    saveFarmStoryCategories(scope, []);
    expect(readFarmStoryCategories(scope)).toEqual([]);
    expect(readFarmStoryCategories({ ...scope, userId: 'new-user' })).toEqual(initial);
  });

  it('does not share preferences between users or farms and leaves other stored records unchanged', () => {
    const otherUser = { ...scope, userId: 'user-two' };
    const otherFarm = { ...scope, farmId: 'farm-two' };
    localStorage.setItem('farmpro.business-fixture', '{"memo":"unchanged"}');
    saveFarmStoryCategories(scope, ['medicineInventory']);
    saveFarmStoryCategories(otherUser, ['blv', 'treatment']);
    saveFarmStoryCategories(otherFarm, []);

    expect(readFarmStoryCategories(scope)).toEqual(['medicineInventory']);
    expect(readFarmStoryCategories(otherUser)).toEqual(['treatment', 'blv']);
    expect(readFarmStoryCategories(otherFarm)).toEqual([]);
    expect(readFarmStoryCategories({ farmId: 'farm-two', userId: 'user-two' })).toEqual(initial);
    expect(localStorage.getItem('farmpro.business-fixture')).toBe('{"memo":"unchanged"}');
  });

  it('keeps delimiter-like and Japanese identities distinct', () => {
    const left = { farmId: '岩手:農場', userId: '利用者' };
    const right = { farmId: '岩手', userId: '農場:利用者' };
    expect(farmStoryPreferenceKey(left)).not.toBe(farmStoryPreferenceKey(right));
    saveFarmStoryCategories(left, ['calving']);
    saveFarmStoryCategories(right, ['feeding']);
    expect(readFarmStoryCategories(left)).toEqual(['calving']);
    expect(readFarmStoryCategories(right)).toEqual(['feeding']);
  });

  it('deduplicates selections and reads supported IDs in category order', () => {
    saveFarmStoryCategories(scope, ['expense', 'cattle', 'expense', 'feeding']);
    expect(readFarmStoryCategories(scope)).toEqual(['cattle', 'feeding', 'expense']);
    localStorage.setItem(farmStoryPreferenceKey(scope)!, JSON.stringify({
      version: 1, categories: ['newer-category', 'blv', 'treatment', null, 123, 'blv', {}],
    }));
    expect(readFarmStoryCategories(scope)).toEqual(['treatment', 'blv']);
  });

  it.each([
    '{broken', 'null', '[]', '{"version":2,"categories":[]}',
    '{"version":1,"categories":"treatment"}', '{"categories":["blv"]}',
  ])('uses defaults for invalid saved preferences without overwriting them: %s', raw => {
    localStorage.setItem(farmStoryPreferenceKey(scope)!, raw);
    expect(readFarmStoryCategories(scope)).toEqual(initial);
    expect(localStorage.getItem(farmStoryPreferenceKey(scope)!)).toBe(raw);
  });

  it.each([
    undefined, null, { farmId: '', userId: scope.userId },
    { farmId: scope.farmId, userId: '   ' }, { farmId: '\ud800', userId: scope.userId },
  ])('never reads or writes a shared fallback key when the scope is missing or invalid: %j', invalidScope => {
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(farmStoryPreferenceKey(invalidScope)).toBeNull();
    expect(readFarmStoryCategories(invalidScope)).toEqual(initial);
    expect(() => saveFarmStoryCategories(invalidScope, [])).toThrow('保存できません');
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});

describe('farm story preference storage failures', () => {
  it('keeps reads usable when storage access is denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(readFarmStoryCategories(scope)).toEqual(initial);
    expect(() => saveFarmStoryCategories(scope, ['blv'])).toThrow('表示設定を保存できませんでした');
  });

  it('reports quota failures and retains the previously saved selection', () => {
    saveFarmStoryCategories(scope, ['treatment']);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => saveFarmStoryCategories(scope, ['blv'])).toThrow('表示設定を保存できませんでした');
    expect(readFarmStoryCategories(scope)).toEqual(['treatment']);
  });

  it('does not report success if a browser silently fails to persist the selection', () => {
    saveFarmStoryCategories(scope, ['treatment']);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);
    expect(() => saveFarmStoryCategories(scope, [])).toThrow('表示設定を保存できませんでした');
    expect(readFarmStoryCategories(scope)).toEqual(['treatment']);
  });
});
