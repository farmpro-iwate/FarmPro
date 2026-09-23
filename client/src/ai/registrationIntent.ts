export type FarmProAiRegistrationKind = 'heat' | 'insemination' | 'transfer' | 'pregnancy-check' | 'calving' | 'treatment' | 'vaccine';

export type FarmProAiRegistrationIntent = {
  kind: FarmProAiRegistrationKind;
  earTag?: string;
};

function normalizeRegistrationText(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s　。、・「」『』（）()？?！!]/g, '');
}

export function parseRegistrationIntent(
  text: string,
  options: { recordMode?: boolean } = {},
): FarmProAiRegistrationIntent | null {
  const normalized = normalizeRegistrationText(text);
  if (!normalized) return null;

  const asksToRegister =
    normalized.includes('登録して') ||
    normalized.includes('登録') ||
    normalized.includes('記録して') ||
    normalized.includes('記録');

  if (!options.recordMode && !asksToRegister) return null;

  const earTagMatch = normalized.match(/(\d{3,12})/);
  const earTag = earTagMatch?.[1];

  if (!options.recordMode && !earTag) return null;

  if (normalized.includes('発情')) {
    return {
      kind: 'heat',
      ...(earTag ? { earTag } : {}),
    };
  }

  if (
    normalized.includes('授精') ||
    normalized.includes('種付') ||
    normalized.includes('aiを登録') ||
    normalized.includes('ai登録') ||
    normalized.includes('aiを記録') ||
    normalized.includes('ai記録')
  ) {
    return {
      kind: 'insemination',
      ...(earTag ? { earTag } : {}),
    };
  }

  if (normalized.includes('受精卵移植') || normalized.includes('et')) {
    return {
      kind: 'transfer',
      ...(earTag ? { earTag } : {}),
    };
  }

  if (normalized.includes('妊娠鑑定') || normalized.includes('妊鑑')) {
    return {
      kind: 'pregnancy-check',
      ...(earTag ? { earTag } : {}),
    };
  }

  if (normalized.includes('分娩')) {
    return {
      kind: 'calving',
      ...(earTag ? { earTag } : {}),
    };
  }

  if (normalized.includes('治療') || normalized.includes('投薬')) {
    return {
      kind: 'treatment',
      ...(earTag ? { earTag } : {}),
    };
  }

  if (normalized.includes('ワクチン') || normalized.includes('予防接種')) {
    return {
      kind: 'vaccine',
      ...(earTag ? { earTag } : {}),
    };
  }

  return null;
}
