export const isTemporaryCalfNumber = (calfNumber?: string | null): boolean =>
  Boolean(calfNumber?.startsWith('TEMP-'));

export const formatTemporaryCalfNumber = (
  calfNumber?: string | null,
  birthday?: string | null
): string => {
  const normalized = calfNumber?.trim() ?? '';

  if (!normalized) {
    return '－';
  }

  if (!isTemporaryCalfNumber(normalized)) {
    return normalized;
  }

  const match = birthday?.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    return '仮番号';
  }

  return `仮-${match[2]}${match[3]}`;
};
