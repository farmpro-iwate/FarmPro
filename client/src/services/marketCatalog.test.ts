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
  it('seeds only a source-backed verified market', () => {
    expect(verifiedMarketCatalog.some(m => m.id === 'alic-iwate-kennan' && m.name === '県南家畜市場')).toBe(true);
  });
  it('lists sourced market choices in multiple prefectures without invented prices', () => {
    expect(verifiedMarketCatalog.length).toBe(21);
    expect(findVerifiedMarket(verifiedMarketCatalog, '宮城県', '全農みやぎ総合家畜市場')?.source).toBe('maff');
    expect(findVerifiedMarket(verifiedMarketCatalog, '岩手県', '全農岩手県本部県南家畜市場')?.id).toBe('alic-iwate-kennan');
    expect(findVerifiedMarket(verifiedMarketCatalog, '宮城県', '県南家畜市場')).toBeNull();
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
