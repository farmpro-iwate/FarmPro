type CalfLink = { identificationNumber?: string; calfNumber?: string; name?: string; birthday?: string; managementStatus?: string };
type CattleLink = { id: number; identificationNumber?: string; earTag?: string; name?: string; birthday?: string };
const norm = (v: unknown) => String(v ?? '').trim();

export function resolvePromotedCattle(calf: CalfLink, cattle: CattleLink[]): CattleLink | null {
  const identification = norm(calf.identificationNumber);
  const ear = norm(calf.calfNumber);
  if (!identification && (!ear || ear.startsWith('TEMP-'))) return null;
  const matches = cattle.filter(cow => {
    if (identification) return norm(cow.identificationNumber) === identification;
    return norm(cow.earTag) === ear && !!norm(calf.birthday) && norm(cow.birthday) === norm(calf.birthday) &&
      !!norm(calf.name) && norm(cow.name) === norm(calf.name);
  });
  if (matches.length !== 1) return null;
  const cow = matches[0];
  // If both records contain an official ID, disagreement is never safe.
  if (identification && norm(cow.identificationNumber) !== identification) return null;
  if (ear && !ear.startsWith('TEMP-') && norm(cow.earTag) && norm(cow.earTag) !== ear) return null;
  return cow;
}

export function displayedCalfStatus(calf: CalfLink, cattle: CattleLink[]): string {
  const stored = norm(calf.managementStatus) || '育成中';
  if (stored === '販売済み' || stored === '死亡・その他') return stored;
  return resolvePromotedCattle(calf, cattle) ? '牛台帳へ移行済み' : stored;
}
