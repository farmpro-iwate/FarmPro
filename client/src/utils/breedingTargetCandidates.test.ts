import { describe, expect, it } from 'vitest';
import { buildMaternalAnalysis, type MaternalSnapshot } from './maternalAnalysis';
import { buildReproductiveEfficiency } from './reproductiveEfficiency';
import { buildBreedingTargetCandidates } from './breedingTargetCandidates';

const fixture = (): MaternalSnapshot => ({ cattle: [{ id: 1, earTag: '001', name: '見本母', sex: '雌' }], calves: [], sales: [], breedings: [],
  calvings: [{ id: 'c', cowId: '001', actualCalvingDate: '2026-09-09' }] });
const ai = (date = '2026-10-20', extra = {}) => ({ id: 'a', cowEarTag: '001', breedingMethod: '種付', inseminationDate: date, heatDate: date,
  pregnancyResult: '未鑑定', pregnancyCheckDate: '', ...extra });
function plan(data = fixture(), days = 40, start = '2026-10-19') {
  const analysis = buildMaternalAnalysis(data, { today: '2026-11-08' });
  return buildBreedingTargetCandidates(analysis, buildReproductiveEfficiency(analysis, '2026-11-08'), start, days, '2026-11-08');
}
describe('provisional insemination target candidates', () => {
  it('includes the exact postpartum boundary using the selected start, with reasons, without mutating records', () => {
    const data = fixture(); const original = JSON.stringify(data);
    expect(plan(data).candidateKeys).toEqual(['1']);
    expect(plan(data).rows[0]).toMatchObject({ daysSinceCalving: 40, reason: '開始時点で産後40日・受胎確認の記録なし' });
    expect(plan(data, 41).rows[0].status).toBe('excluded');
    expect(plan(data, 35).candidateKeys).toEqual(['1']);
    expect(JSON.stringify(data)).toBe(original);
  });
  it.each([0, -1, 1.5, 366, NaN])('does not invent candidates with invalid waiting days %s', days => {
    expect(plan(fixture(), days)).toMatchObject({ valid: false, candidateKeys: [] });
  });
  it('rejects unfinished or malformed periods and handles leap-year boundaries', () => {
    expect(plan(fixture(), 40, '2026-10-20').valid).toBe(false);
    expect(plan(fixture(), 40, '2026-02-30').valid).toBe(false);
    const data = fixture(); data.calvings[0].actualCalvingDate = '2024-01-20';
    expect(plan(data, 40, '2024-02-29').rows[0].daysSinceCalving).toBe(40);
  });
  it('does not remove successful or pending inseminations performed inside the period', () => {
    const data = fixture(); data.breedings = [ai('2026-10-19', { heatDate: '2026-10-18', pregnancyResult: '受胎', pregnancyCheckDate: '2026-11-08' })];
    expect(plan(data).candidateKeys).toEqual(['1']);
    data.breedings = [ai()]; expect(plan(data).candidateKeys).toEqual(['1']);
  });
  it('excludes a conception before the start even when diagnosed later, and resets after a later calving', () => {
    const data = fixture(); data.calvings[0].actualCalvingDate = '2025-09-01';
    data.breedings = [ai('2025-10-01', { pregnancyResult: '受胎', pregnancyCheckDate: '2025-11-08' })];
    expect(plan(data).rows[0].status).toBe('excluded');
    data.calvings.push({ id: 'c2', cowId: '001', actualCalvingDate: '2026-09-01' });
    expect(plan(data).candidateKeys).toEqual(['1']);
    data.breedings = [ai('2026-10-18', { pregnancyResult: '受胎', pregnancyCheckDate: '2026-11-08' })];
    expect(plan(data).rows[0].status).toBe('excluded');
  });
  it('requires review of earlier pending, conflicting, undated or ambiguous records', () => {
    const data = fixture(); data.breedings = [ai('2026-10-01')];
    expect(plan(data).rows[0].status).toBe('review');
    data.breedings = [ai('2026-10-01', { pregnancyResult: '空胎', pregnancyCheckDate: '2026-10-22' })];
    expect(plan(data).rows[0].status).toBe('review');
    data.breedings = [ai('', { pregnancyResult: '受胎' })];
    expect(plan(data).rows[0].status).toBe('review');
    data.breedings = [{ ...ai('2026-10-01'), cowEarTag: '', cowName: '見本母' }];
    expect(plan(data).rows[0].status).toBe('review');
  });
  it('separates active ET from old failed or cancelled ET', () => {
    const data = fixture(); data.breedings = [ai('', { breedingMethod: '受精卵移植', transferPlannedDate: '2026-10-23', heatDate: '2026-10-16' })];
    expect(plan(data).rows[0].status).toBe('excluded');
    data.breedings = [ai('', { breedingMethod: '受精卵移植', transferDate: '2026-09-20', heatDate: '2026-09-13', pregnancyResult: '空胎', pregnancyCheckDate: '2026-10-18' })];
    expect(plan(data).candidateKeys).toEqual(['1']);
    data.breedings = [ai('', { breedingMethod: '受精卵移植', transferDate: '2026-10-23', breedingStatus: '取消' })];
    expect(plan(data).candidateKeys).toEqual(['1']);
  });
  it.each(['death', 'culling'])('uses the recorded %s date instead of today’s state', key => {
    const data = fixture(); data.cattle[0].lifecycle = { version: 1, [key]: { date: '2026-10-18' } };
    expect(plan(data).rows[0].status).toBe('excluded');
    data.cattle[0].lifecycle = { version: 1, [key]: { date: '2026-10-20' } };
    expect(plan(data).candidateKeys).toEqual(['1']);
    data.cattle[0].lifecycle = { version: 1, [key]: { date: '' } };
    expect(plan(data).rows[0].status).toBe('review');
  });
  it('uses completed adult shipment dates, excluding plans, child sales and future shipments', () => {
    const data = fixture(); data.sales = [{ id: 's', targetType: '成牛', targetNumber: '001', status: '販売済み', saleDate: '2026-10-18' }];
    expect(plan(data).rows[0].status).toBe('excluded');
    data.sales[0].saleDate = '2026-10-20'; expect(plan(data).candidateKeys).toEqual(['1']);
    data.sales[0].saleDate = ''; expect(plan(data).rows[0].status).toBe('review');
    data.sales[0].status = '販売予定'; expect(plan(data).candidateKeys).toEqual(['1']);
    data.sales[0].status = '販売済み'; data.sales[0].targetType = '子牛'; expect(plan(data).candidateKeys).toEqual(['1']);
  });
  it('keeps heifers and missing calving records for review instead of guessing eligibility', () => {
    const data = fixture(); data.calvings = []; data.cattle[0].stage = '育成牛';
    expect(plan(data).rows[0].status).toBe('review');
    data.cattle[0].stage = '繁殖牛'; expect(plan(data).candidateKeys).toEqual([]);
    data.calvings = fixture().calvings; data.cattle[0].managementStatus = '死亡・その他';
    expect(plan(data).rows[0].status).toBe('review');
    delete data.cattle[0].managementStatus; data.cattle[0].acquisitionDate = '2026-10-20';
    expect(plan(data).rows[0].status).toBe('excluded');
  });
});
