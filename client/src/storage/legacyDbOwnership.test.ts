import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  claimLegacyDbForFarm,
  clearInvalidLegacyDbClaim,
  isLegacyDbClaimValidForFarm,
  LEGACY_DB_CLAIM_VERSION,
  LEGACY_DB_CLAIM_VERSION_KEY,
  LEGACY_DB_OWNER_KEY,
} from './legacyDbOwnership';

describe('legacy DB explicit ownership claim', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('does not accept an old owner value without the current claim version', () => {
    window.localStorage.setItem(LEGACY_DB_OWNER_KEY, 'wrong-farm');

    expect(isLegacyDbClaimValidForFarm('wrong-farm')).toBe(false);

    clearInvalidLegacyDbClaim();
    expect(window.localStorage.getItem(LEGACY_DB_OWNER_KEY)).toBeNull();
  });

  it('accepts only the farm that explicitly claimed the legacy DB', () => {
    claimLegacyDbForFarm('sekiguchi-farm');

    expect(window.localStorage.getItem(LEGACY_DB_OWNER_KEY)).toBe('sekiguchi-farm');
    expect(window.localStorage.getItem(LEGACY_DB_CLAIM_VERSION_KEY)).toBe(LEGACY_DB_CLAIM_VERSION);
    expect(isLegacyDbClaimValidForFarm('sekiguchi-farm')).toBe(true);
    expect(isLegacyDbClaimValidForFarm('new-farm')).toBe(false);
  });
});
