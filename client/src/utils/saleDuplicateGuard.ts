import type { SaleRecord } from '../services/salesApi';

type SaleAnimalIdentity = Pick<SaleRecord, 'targetType' | 'targetNumber' | 'birthday' | 'calfId' | 'cattleId'>;

function clean(value: unknown) {
  return String(value ?? '').trim();
}

/** A cautious comparison: never match solely on a display name. */
export function isSameSaleAnimal(a: SaleAnimalIdentity, b: SaleAnimalIdentity) {
  if (a.targetType !== b.targetType) return false;
  const idKey = a.targetType === '子牛' ? 'calfId' : a.targetType === '成牛' ? 'cattleId' : null;
  const idA = idKey ? clean(a[idKey]) : '';
  const idB = idKey ? clean(b[idKey]) : '';
  if (idA && idB) return idA === idB;

  const numberA = clean(a.targetNumber);
  const numberB = clean(b.targetNumber);
  if (!numberA || !numberB || numberA !== numberB) return false;
  const birthA = clean(a.birthday).slice(0, 10);
  const birthB = clean(b.birthday).slice(0, 10);
  return !birthA || !birthB || birthA === birthB;
}

export function findPlannedSoldPairs(rows: SaleRecord[]) {
  return rows
    .filter(row => row.status === '出荷予定')
    .flatMap(planned => rows
      .filter(sold => sold.id !== planned.id && sold.status === '販売済み' && isSameSaleAnimal(planned, sold))
      .map(sold => ({ planned, sold })));
}
