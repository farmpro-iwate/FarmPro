export type FarmProAiRegistrationKind = 'heat' | 'insemination' | 'transfer' | 'pregnancy-check' | 'calving';

export type FarmProAiRegistrationIntent = {
  kind: FarmProAiRegistrationKind;
  earTag: string;
};

function normalizeRegistrationText(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s　。、・「」『』（）()？?！!]/g, '');
}

export function parseRegistrationIntent(text: string): FarmProAiRegistrationIntent | null {
  const normalized = normalizeRegistrationText(text);
  if (!normalized) return null;

  const asksToRegister =
    normalized.includes('登録して') ||
    normalized.includes('登録') ||
    normalized.includes('記録して') ||
    normalized.includes('記録');

  if (!asksToRegister) return null;

  const earTagMatch = normalized.match(/(\d{3,12})/);
  if (!earTagMatch) return null;

  if (normalized.includes('発情')) {
    return {
      kind: 'heat',
      earTag: earTagMatch[1],
    };
  }

  if (normalized.includes('授精') || normalized.includes('種付')) {
    return {
      kind: 'insemination',
      earTag: earTagMatch[1],
    };
  }

  if (normalized.includes('受精卵移植') || normalized.includes('et')) {
    return {
      kind: 'transfer',
      earTag: earTagMatch[1],
    };
  }

  if (normalized.includes('妊娠鑑定') || normalized.includes('妊鑑')) {
    return {
      kind: 'pregnancy-check',
      earTag: earTagMatch[1],
    };
  }

  if (normalized.includes('分娩')) {
    return {
      kind: 'calving',
      earTag: earTagMatch[1],
    };
  }

  return null;
}
