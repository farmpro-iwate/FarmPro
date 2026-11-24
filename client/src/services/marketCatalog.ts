/**
 * Official market catalog contract. A catalog is deliberately empty until an
 * approved source supplies verified market names and stable identifiers.
 * Do not infer official IDs from user-entered market names.
 */
export type MarketCatalogEntry = {
  id: string;
  prefecture: string;
  name: string;
  aliases: string[];
  source: 'nbafa' | 'alic' | 'market-organizer' | 'maff';
  sourceUrl: string;
  verifiedAt: string;
  active: boolean;
};

export type MarketResultPeriod = {
  marketId: string;
  periodStart: string;
  periodEnd: string;
  publishedAt: string;
  sourceUrl: string;
  sex: 'female' | 'castrated' | 'male' | 'unknown';
  breed: string;
  headCount: number | null;
  averagePriceYen: number | null;
  priceIncludesTax: boolean | null;
  status: 'preliminary' | 'final';
};

// Source: MAFF livestock market list as of July 2025, not a live calf-market status.
const MAFF_LIST_URL = 'https://www.maff.go.jp/j/syouan/tikusui/trace/attach/pdf/index-69.pdf';
function maffMarket(id: string, prefecture: string, name: string): MarketCatalogEntry {
  return { id: `maff-${id}`, prefecture, name, aliases: [], source: 'maff',
    sourceUrl: MAFF_LIST_URL, verifiedAt: '2025-07-31', active: true };
}
// 'active' means selectable, not proof of a currently operating calf market.
// Source-backed seed markets (not a nationwide complete directory).
export const verifiedMarketCatalog: readonly MarketCatalogEntry[] = Object.freeze([{
  id: 'alic-iwate-kennan',
  prefecture: '岩手県',
  name: '県南家畜市場',
  aliases: ['岩手県 県南家畜市場', '全農岩手県本部県南家畜市場'],
  source: 'alic',
  sourceUrl: 'https://www.alic.go.jp/n-jigyo/koushigeppou/koushi01kuro.pdf',
  verifiedAt: '2026-11-24',
  active: true,
},
maffMarket('iwate-hanamaki', '岩手県', '岩手花巻家畜市場'),
maffMarket('iwate-chuo', '岩手県', '全農岩手県本部中央家畜市場'),
maffMarket('miyagi-sogo', '宮城県', '全農みやぎ総合家畜市場'),
maffMarket('akita-akita', '秋田県', 'あきた総合家畜市場'),
maffMarket('aomori-chiiki', '青森県', '青森県地域家畜市場'),
maffMarket('aomori-sanbongi', '青森県', '三本木産地家畜市場'),
maffMarket('yamagata-okitama', '山形県', '置賜家畜市場'),
maffMarket('yamagata-chuo', '山形県', '山形中央家畜市場'),
maffMarket('yamagata-mogami', '山形県', '山形最上家畜市場'),
maffMarket('fukushima', '福島県', '福島県家畜市場'),
maffMarket('ibaraki-chuo', '茨城県', '茨城県中央家畜市場'),
maffMarket('tochigi-nasu', '栃木県', '那須家畜市場'),
maffMarket('tochigi-yaita', '栃木県', '矢板家畜市場'),
maffMarket('gunma-shibukawa', '群馬県', '渋川家畜市場'),
maffMarket('chiba', '千葉県', '千葉家畜市場'),
maffMarket('nagano-komoro', '長野県', '小諸家畜市場'),
maffMarket('nagano-chuo', '長野県', '長野県中央家畜市場'),
maffMarket('hyogo-awaji', '兵庫県', '淡路家畜市場'),
maffMarket('hyogo-tajima', '兵庫県', '但馬家畜市場'),
maffMarket('tottori-chuo', '鳥取県', '鳥取県中央家畜市場')
]);

/**
 * Conservative resolution: never silently map a free-text selection to
 * another official market. Only an exact, unique verified match qualifies.
 */
export function findVerifiedMarket(
  catalog: readonly MarketCatalogEntry[],
  prefecture: string,
  selectedName: string
): MarketCatalogEntry | null {
  const name = selectedName.trim().normalize('NFKC');
  if (!name) return null;
  const matches = catalog.filter(m =>
    m.active && m.prefecture === prefecture &&
    [m.name, ...m.aliases].some(alias => alias.trim().normalize('NFKC') === name)
  );
  return matches.length === 1 ? matches[0] : null;
}
