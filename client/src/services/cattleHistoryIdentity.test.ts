import { expect, it } from 'vitest';
import { historyBelongsToCattle, calfBelongsToCattle } from './cattleHistoryIdentity';
const cow = { id: 13, earTag: '5754', identificationNumber: '1391057543', name: 'same-name' };
it.each([
  { cattleId: '13', cowEarTag: '9999', cowName: 'same-name' },
  { cattleId: '13', targetNumber: '9999', targetName: 'same-name' },
  { cattleId: '13' },
  { cowName: 'same-name' },
  { cowIdentificationNumber: 'OTHER', cowEarTag: '5754' },
])('does not attach a conflicting or unverified history: %j', row => {
  expect(historyBelongsToCattle(row, cow)).toBe(false);
});
it.each([{ cattleId: '999', cowEarTag: '5754' }, { cowIdentificationNumber: '1391057543' }, { cowId: '5754' }])(
  'stable identity works despite different local cattle IDs: %j', row => expect(historyBelongsToCattle(row, cow)).toBe(true));
it('mother name cannot override a conflicting parent identity', () => {
  expect(calfBelongsToCattle({ motherCowId: '9999', motherName: 'same-name' }, cow)).toBe(false);
  expect(calfBelongsToCattle({ motherName: 'same-name' }, cow)).toBe(false);
  expect(calfBelongsToCattle({ motherCowId: '5754' }, cow)).toBe(true);
});
