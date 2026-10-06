import type { SaleRecord } from '../services/salesApi';
import type { Calf } from '../types/calf';
import { formatTemporaryCalfNumber, isTemporaryCalfNumber } from './temporaryCalfNumber';

type SaleTarget = Partial<Pick<SaleRecord, 'targetType' | 'targetNumber' | 'targetName' | 'calfId' | 'calvingId' | 'birthday'>>;
type CalfTarget = Pick<Calf, 'id'> & Partial<Pick<Calf, 'calfNumber' | 'temporaryCalfNumber' | 'identificationNumber' | 'name' | 'birthday' | 'calvingId'>>;

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function identityConflicts(sale: SaleTarget, calf: CalfTarget): boolean {
  const birthday = text(sale.birthday).slice(0, 10);
  const calfBirthday = text(calf.birthday).slice(0, 10);
  const calvingId = text(sale.calvingId);
  const calfCalvingId = text(calf.calvingId);
  return Boolean(
    (birthday && calfBirthday && birthday !== calfBirthday) ||
    (calvingId && calfCalvingId && calvingId !== calfCalvingId),
  );
}

function findCurrentCalf(sale: SaleTarget, calves: readonly CalfTarget[]): CalfTarget | undefined {
  if (sale.targetType !== '子牛') return undefined;
  const number = text(sale.targetNumber);
  // Use full stored identifiers, never names, suffixes or abbreviated 仮-MMDD labels.
  const numbered = number ? calves.filter((calf) =>
    [calf.calfNumber, calf.identificationNumber, calf.temporaryCalfNumber]
      .map(text).filter(Boolean).includes(number),
  ) : [];
  if (numbered.length) {
    return numbered.length === 1 && !identityConflicts(sale, numbered[0]) ? numbered[0] : undefined;
  }

  // A stable, unique birth link can resolve an old temporary number after tagging.
  // Do not override an unmatched real ear-tag number or guess from local calfId.
  const calvingId = text(sale.calvingId);
  if (!calvingId || (number && !isTemporaryCalfNumber(number))) return undefined;
  const linked = calves.filter((calf) => text(calf.calvingId) === calvingId);
  // A shared calving ID (e.g. twins) is not enough to select a calf.
  return linked.length === 1 && !identityConflicts(sale, linked[0]) ? linked[0] : undefined;
}

/** Read-only display projection. Never rewrite historical sale identity or dates. */
export function resolveMarketTaskTarget(sale: SaleTarget, calves: readonly CalfTarget[]): { targetNumber: string; targetName: string } {
  const original = { targetNumber: text(sale.targetNumber), targetName: text(sale.targetName) };
  const calf = findCurrentCalf(sale, calves);
  if (!calf) return original;

  const number = text(calf.calfNumber) || text(calf.identificationNumber) || original.targetNumber;
  const name = text(calf.name);
  const placeholder = !name || name === '耳標未装着' || name === '子牛（耳標未装着）' || name.startsWith('TEMP-');
  return {
    targetNumber: formatTemporaryCalfNumber(number, calf.birthday || sale.birthday),
    targetName: placeholder
      ? (isTemporaryCalfNumber(text(calf.calfNumber)) ? '子牛（耳標未装着）' : '名号未登録')
      : name,
  };
}
