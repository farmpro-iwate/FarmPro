export type FarmProAiRegistrationKind = 'heat';

export type FarmProAiRegistrationIntent = {
  kind: FarmProAiRegistrationKind;
  earTag: string;
};

function normalizeRegistrationText(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s　。、・「」『』（）()？?！!]/g, '')
    .replace(/発情記録/g, '発情')
    .replace(/発情登録/g, '発情');
}

export function parseRegistrationIntent(text: string): FarmProAiRegistrationIntent | null {
  const normalized = normalizeRegistrationText(text);
  if (!normalized) return null;

  const asksToRegisterHeat =
    normalized.includes('発情') &&
    (normalized.includes('登録して') ||
      normalized.includes('登録') ||
      normalized.includes('記録して') ||
      normalized.includes('記録'));

  if (!asksToRegisterHeat) return null;

  const earTagMatch = normalized.match(/(\d{3,12})/);
  if (!earTagMatch) return null;

  return {
    kind: 'heat',
    earTag: earTagMatch[1],
  };
}
