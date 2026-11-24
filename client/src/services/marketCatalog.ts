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
  source: 'nbafa' | 'alic' | 'market-organizer';
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

// Source-backed seed market (not a nationwide complete catalog).
export const verifiedMarketCatalog: readonly MarketCatalogEntry[] = Object.freeze([{
  id: 'alic-iwate-kennan',
  prefecture: '岩手県',
  name: '県南家畜市場',
  aliases: ['岩手県 県南家畜市場'],
  source: 'alic',
  sourceUrl: 'https://www.alic.go.jp/n-jigyo/koushigeppou/koushi01kuro.pdf',
  verifiedAt: '2026-11-24',
  active: true,
}]);

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
