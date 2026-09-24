export type FarmProAiRegistrationKind = 'heat' | 'insemination' | 'transfer' | 'pregnancy-check' | 'calving' | 'treatment' | 'vaccine' | 'feed-use';

export type FarmProAiFeedTargetType = 'farm' | 'calfGroup' | 'growingCattleGroup' | 'breedingCattleGroup' | 'individual';

export type FarmProAiRegistrationIntent = {
  kind: FarmProAiRegistrationKind;
  earTag?: string;
  feedName?: string;
  feedQuantity?: string;
  feedUnit?: 'kg' | '袋' | 'ロール' | '束' | '個';
  feedTargetType?: FarmProAiFeedTargetType;
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

  const feedTargetMap: Array<{ label: string; value: FarmProAiFeedTargetType }> = [
    { label: '農場全体', value: 'farm' },
    { label: '子牛群', value: 'calfGroup' },
    { label: '育成牛群', value: 'growingCattleGroup' },
    { label: '繁殖牛群', value: 'breedingCattleGroup' },
  ];
  const feedTarget = feedTargetMap.find((item) => text.includes(item.label));
  const feedQuantityMatch = text.match(/(\d+(?:\.\d+)?)\s*(kg|KG|ｋｇ|キロ|袋|ロール|束|個)/);
  const usesFeed = /使った|使用|給与|出庫/.test(text);

  const individualFeedMatch =
    text.match(/(\d{3,12})番?に(.+?)を(\d+(?:\.\d+)?)\s*(kg|KG|ｋｇ|キロ|袋|ロール|束|個)(?:使った|使用|給与|出庫)/) ||
    text.match(/(.+?)を(\d{3,12})番?に(\d+(?:\.\d+)?)\s*(kg|KG|ｋｇ|キロ|袋|ロール|束|個)(?:使った|使用|給与|出庫)/);

  if (options.recordMode && individualFeedMatch && usesFeed) {
    const firstPattern = /^\d/.test(individualFeedMatch[1]);
    const individualEarTag = firstPattern ? individualFeedMatch[1] : individualFeedMatch[2];
    const feedName = (firstPattern ? individualFeedMatch[2] : individualFeedMatch[1]).trim();
    const quantity = firstPattern ? individualFeedMatch[3] : individualFeedMatch[3];
    const unitRaw = firstPattern ? individualFeedMatch[4] : individualFeedMatch[4];
    const unit =
      unitRaw === 'kg' || unitRaw === 'KG' || unitRaw === 'ｋｇ' || unitRaw === 'キロ'
        ? 'kg'
        : unitRaw as '袋' | 'ロール' | '束' | '個';

    if (feedName) {
      return {
        kind: 'feed-use',
        earTag: individualEarTag,
        feedName,
        feedQuantity: quantity,
        feedUnit: unit,
        feedTargetType: 'individual',
      };
    }
  }
  if (options.recordMode && feedTarget && feedQuantityMatch && usesFeed) {
    const unitRaw = feedQuantityMatch[2];
    const unit =
      unitRaw === 'kg' || unitRaw === 'KG' || unitRaw === 'ｋｇ' || unitRaw === 'キロ'
        ? 'kg'
        : unitRaw as '袋' | 'ロール' | '束' | '個';
    const targetIndex = text.indexOf(feedTarget.label);
    const beforeTarget = targetIndex >= 0 ? text.slice(0, targetIndex) : text;
    const feedName = beforeTarget
      .replace(/[、。\s　]+$/g, '')
      .replace(/を$/g, '')
      .trim();

    if (feedName) {
      return {
        kind: 'feed-use',
        feedName,
        feedQuantity: feedQuantityMatch[1],
        feedUnit: unit,
        feedTargetType: feedTarget.value,
      };
    }
  }

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
