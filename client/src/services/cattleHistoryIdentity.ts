type Identity = Record<string, unknown>;
const text = (value: unknown) => String(value ?? '').trim();

// Numeric cattle IDs and names cannot establish identity across devices.
// Explicit individual numbers take precedence over ear tags.
export function historyBelongsToCattle(row: Identity, cattle: Identity): boolean {
  const identifiers = [row.cattleIdentificationNumber, row.cowIdentificationNumber].map(text).filter(Boolean);
  if (identifiers.length) return Boolean(text(cattle.identificationNumber)) &&
    identifiers.every(value => value === text(cattle.identificationNumber));
  const earTag = text(cattle.earTag);
  if (!earTag) return false;
  const tags = [row.cowEarTag, row.targetNumber, row.earTag].map(text).filter(Boolean);
  if (tags.length) return tags.every(value => value === earTag || value === text(cattle.identificationNumber));
  // cowId is historically an ear tag in some records; cattleId is local only.
  return text(row.cowId) === earTag;
}

export function calfBelongsToCattle(calf: Identity, cattle: Identity): boolean {
  const earTag = text(cattle.earTag);
  return Boolean(earTag) && [calf.recipientCowId, calf.motherCowId, calf.geneticMotherCowId].map(text).includes(earTag);
}
