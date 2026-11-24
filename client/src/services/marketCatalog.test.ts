import { describe, expect, it } from 'vitest';
import { findVerifiedMarket, verifiedMarketCatalog } from './marketCatalog';

const market = {
  id: 'source-official-123',
  prefecture: '岩手県',
  name: '確認用市場A',
  aliases: ['確認用 A'],
  source: 'market-organizer' as const,
  sourceUrl: 'https://example.org/market/a',
  verifiedAt: '2026-11-24',
  active: true
};

describe('verified market catalog', () => {
  it('does not claim the unpopulated official catalog has markets', () => {
    expect(verifiedMarketCatalog).toEqual([]);
  });
  it('matches only one exact verified name in the same prefecture', () => {
    expect(findVerifiedMarket([market], '岩手県', '確認用市場A')?.id).toBe(market.id);
    expect(findVerifiedMarket([market], '岩手県', '確認用 A')?.id).toBe(market.id);
    expect(findVerifiedMarket([market], '宮城県', '確認用市場A')).toBeNull();
    expect(findVerifiedMarket([market], '岩手県', '確認用市場')).toBeNull();
  });
  it('refuses ambiguous aliases and inactive entries', () => {
    expect(findVerifiedMarket([market, { ...market, id: 'different' }], '岩手県', '確認用市場A')).toBeNull();
    expect(findVerifiedMarket([{ ...market, active: false }], '岩手県', '確認用市場A')).toBeNull();
  });
});
