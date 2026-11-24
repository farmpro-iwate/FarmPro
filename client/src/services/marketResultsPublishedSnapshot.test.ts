import { describe, expect, it } from 'vitest';
import { verifiedMarketCatalog } from './marketCatalog';
import { publishedMarketResultSnapshot } from './marketResultsPublishedSnapshot';
import { validateMarketResult } from './marketResultsValidation';
import { getSelectedMarketResult } from './marketResultsView';

describe('published ALIC monthly snapshot', () => {
  it('validates source and retains official female/male classifications', () => {
    expect(publishedMarketResultSnapshot).toHaveLength(2);
    expect(publishedMarketResultSnapshot.every(result => validateMarketResult(result, verifiedMarketCatalog).ok)).toBe(true);
    expect(publishedMarketResultSnapshot.map(result => result.sex).sort()).toEqual(['female', 'male']);
  });
  it('shows the published monthly figures for the selected market', () => {
    const view = getSelectedMarketResult(
      { prefecture: '岩手県', name: '県南家畜市場' },
      verifiedMarketCatalog,
      publishedMarketResultSnapshot
    );
    expect(view.status).toBe('published');
    expect(view.latestBySex.map(result => result.averagePriceYen).sort()).toEqual([794794, 884829]);
    expect(view.latestBySex.every(result => result.periodEnd === '2026-10-31')).toBe(true);
  });
});
