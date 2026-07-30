const SEX_DISPLAY_MAP: Record<string, string> = {
  雌: '♀',
  メス: '♀',
  雄: '♂',
  オス: '♂',
  去勢: '♂去',
  不明: '－',
};

export const formatSex = (sex?: string | null): string => {
  const normalized = sex?.trim();

  if (!normalized) {
    return '－';
  }

  return SEX_DISPLAY_MAP[normalized] ?? normalized;
};
