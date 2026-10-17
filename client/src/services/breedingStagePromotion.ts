import type { Breeding } from '../types/breeding';
import type { Cattle } from '../types/cattle';

const normalized = (value: unknown) => String(value ?? '').trim();

export function findEligibleHeiferForPromotion(
  record: Pick<Breeding, 'cowEarTag' | 'cowName' | 'pregnancyResult' | 'pregnancyCheckDate'>,
  cattle: Cattle[],
): Cattle | null {
  // No stage change on mating, an unconfirmed diagnosis, or empty diagnosis date.
  if (normalized(record.pregnancyResult) !== '受胎' || !normalized(record.pregnancyCheckDate)) return null;
  const ear = normalized(record.cowEarTag);
  if (!ear) return null;
  const matches = cattle.filter(c => normalized(c.earTag) === ear);
  if (matches.length !== 1) return null;
  const cow = matches[0];
  if (cow.stage !== '育成牛') return null;
  // Avoid applying a diagnosis to a similarly tagged but different animal.
  if (normalized(record.cowName) && normalized(cow.name) !== normalized(record.cowName)) return null;
  return cow;
}
