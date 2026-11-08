import { describe, expect, it } from 'vitest';
import { buildMaternalAnalysis, type MaternalSnapshot } from './maternalAnalysis';
import { buildReproductiveEfficiency } from './reproductiveEfficiency';
import { buildMotherCycleReferences, referenceRate } from './motherCycleReferences';

const data = (): MaternalSnapshot => ({ cattle: [1, 2, 3].map(id => ({ id, earTag: `00${id}`, name: `見本母${id}`, sex: '雌' })), calves: [], sales: [],
  calvings: [1, 2, 3].map(id => ({ id: `c${id}`, cowId: `00${id}`, actualCalvingDate: '2026-08-01' })),
  breedings: [
    { id: 'a', cowEarTag: '001', breedingMethod: '種付', inseminationDate: '2026-10-20', heatDate: '2026-10-20', pregnancyResult: '受胎', pregnancyCheckDate: '2026-11-08' },
    { id: 'b', cowEarTag: '002', breedingMethod: '種付', inseminationDate: '2026-10-01', heatDate: '2026-10-01', pregnancyResult: '空胎', pregnancyCheckDate: '2026-11-01' },
  ] });
function references(input = data(), year = '2026') {
  const analysis = buildMaternalAnalysis(input, { today: '2026-11-08' });
  return buildMotherCycleReferences(analysis, buildReproductiveEfficiency(analysis, '2026-11-08', year), '2026-11-08', year);
}
describe('farm references in mother rows', () => {
  it('automatically includes nonpregnant and noninseminated candidates instead of a pregnancy-only denominator', () => {
    const input = data(); const before = JSON.stringify(input); const rows = references(input); const r = rows.get('1')!;
    expect(r).toMatchObject({ serviceDate: '2026-10-20', start: '2026-09-30', end: '2026-10-20', candidateCount: 3, reviewCount: 0, blockedReason: '' });
    expect(referenceRate(r, 'heatDetectionRate')).toBe('66.7%');
    expect(referenceRate(r, 'pregnancyRate')).toBe('33.3%');
    expect(rows.get('2')?.serviceDate).toBe('2026-10-01');
    expect(rows.get('3')?.blockedReason).toBe('人工授精記録なし');
    expect(JSON.stringify(input)).toBe(before);
  });
  it('keeps a pending pregnancy separate from a measurable heat detection reference', () => {
    const input = data(); input.breedings[0].pregnancyResult = '未鑑定'; input.breedings[0].pregnancyCheckDate = '';
    const r = references(input).get('1')!;
    expect(referenceRate(r, 'heatDetectionRate')).toBe('66.7%');
    expect(referenceRate(r, 'pregnancyRate')).toBe('鑑定待ち');
    input.breedings[0].heatDate = '';
    expect(referenceRate(references(input).get('1')!, 'heatDetectionRate')).toBe('記録を確認');
  });
  it('does not remove an inseminated cow with unknown eligibility to manufacture a smaller denominator', () => {
    const input = data(); input.calvings = input.calvings.filter(c => c.cowId !== '002');
    const r = references(input).get('1')!;
    expect(r.reviewCount).toBe(1);
    expect(referenceRate(r, 'heatDetectionRate')).toContain('見本母2（耳標 002）／分娩日の記録がありません');
    expect(referenceRate(r, 'pregnancyRate')).not.toContain('%');
  });
  it('reports unconfirmed nonserviced cows outside the reference denominator', () => {
    const input = data(); input.calvings = input.calvings.filter(c => c.cowId !== '003');
    const r = references(input).get('1')!;
    expect(r).toMatchObject({ reviewCount: 1, candidateCount: 2 });
    expect(referenceRate(r, 'heatDetectionRate')).toBe('100%');
  });
  it('uses the latest AI in the selected year, not a preferred successful insemination or ET', () => {
    const input = data(); input.breedings[0].pregnancyResult = '空胎'; input.breedings[0].pregnancyCheckDate = '2026-10-25';
    input.breedings.push({ ...input.breedings[0], id: 'new', inseminationDate: '2026-11-01', heatDate: '2026-11-01', pregnancyResult: '未鑑定', pregnancyCheckDate: '' });
    expect(references(input).get('1')?.serviceDate).toBe('2026-11-01');
    expect(references(input, '2025').get('1')?.blockedReason).toBe('人工授精記録なし');
    input.breedings.push({ ...input.breedings[0], id: 'et', breedingMethod: '受精卵移植', transferDate: '2026-11-05' });
    expect(references(input).get('1')?.serviceDate).toBe('2026-11-01');
  });
  it('does not fall back to an older valid record when the latest service is duplicated', () => {
    const input = data(); input.breedings.push(
      { ...input.breedings[0], id: 'd1', inseminationDate: '2026-10-30' },
      { ...input.breedings[0], id: 'd2', inseminationDate: '2026-10-30' },
    );
    expect(referenceRate(references(input).get('1')!, 'heatDetectionRate')).toBe('授精記録を確認');
  });
  it('keeps an already pregnant cow outside the candidate pool of later windows', () => {
    const input = data(); input.breedings[1].inseminationDate = '2026-11-01'; input.breedings[1].heatDate = '2026-11-01'; input.breedings[1].pregnancyCheckDate = '2026-11-08';
    // 10/20 is inside this window, so the conceived cow still belongs in its original cohort.
    expect(references(input).get('2')?.candidateCount).toBe(3);
    input.breedings[0].inseminationDate = '2026-10-01'; input.breedings[0].heatDate = '2026-10-01';
    expect(references(input).get('2')?.candidateCount).toBe(2);
  });
});
