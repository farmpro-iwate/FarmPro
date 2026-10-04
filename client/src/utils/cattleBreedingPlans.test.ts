import { describe, expect, it } from 'vitest';
import { cattlePlanDestination, hasCattlePlanAttention, planAnimalMatch, resolveCattleBreedingPlans, type CattlePlanSnapshot, type PlanRow } from './cattleBreedingPlans';

const cow = { id: 'cow-1', earTag: '0254', name: 'テスト母牛' };
const otherCow = { id: 'cow-2', earTag: '9999', name: cow.name };
const today = '2026-10-02';
const calving = { id: 'calving-1', cowEarTag: '0254', actualCalvingDate: '2026-08-29' };
const ai = { id: 'ai-1', cowEarTag: '0254', cowName: cow.name, heatDate: '2026-09-19', inseminationDate: '2026-09-20', breedingMethod: '種付', pregnancyResult: '未鑑定' };
const et = { id: 'et-1', cowEarTag: '0254', heatDate: '2026-09-17', transferPlannedDate: '2026-09-24', transferDate: '2026-09-24', breedingMethod: '受精卵移植', pregnancyResult: '未鑑定', nextHeatExpectedDate: '2026-10-15', pregnancyCheckExpectedDate: '2026-11-05' };
function snapshot(breedings: readonly PlanRow[] = [], extra: Partial<CattlePlanSnapshot> = {}): CattlePlanSnapshot {
  return { breedings, calvings: [calving], sales: [], cycleDays: 21, unavailable: [], ...extra };
}
const resolve = (breedings: readonly PlanRow[] = [], extra: Partial<CattlePlanSnapshot> = {}) => resolveCattleBreedingPlans(cow, snapshot(breedings, extra), today);
const kinds = (breedings: readonly PlanRow[], extra: Partial<CattlePlanSnapshot> = {}) => resolve(breedings, extra).plans.map((item) => item.kind);

describe('explicit animal identity', () => {
  it('matches string and numeric IDs and preserves leading-zero ear tags', () => {
    expect(planAnimalMatch({ cattleId: 1 }, { id: '1' })).toBe('match');
    expect(planAnimalMatch({ cowEarTag: '0254' }, cow)).toBe('match');
    expect(planAnimalMatch({ cowEarTag: '254' }, cow)).toBe('other');
  });
  it('never attaches another cow by its matching name', () => {
    expect(planAnimalMatch({ cowEarTag: '9999', cowName: cow.name }, cow)).toBe('other');
    expect(resolve([{ ...ai, cowEarTag: otherCow.earTag }]).plans[0].kind).toBe('post-calving-heat');
  });
  it('reports name-only records without guessing that they belong to this animal', () => {
    const result = resolve([{ ...ai, cowEarTag: '' }]);
    expect(result.plans).toEqual([]);
    expect(result.issues.join('')).toContain('牛名だけ');
  });

  it('adds record diagnostics when explicit identifiers contradict the target cow', () => {
    const result = resolve([{
      ...ai,
      id: 'conflict-1',
      cattleId: cow.id,
      cowEarTag: '9999',
    }]);
    expect(result.plans).toEqual([]);
    expect(result.issues.join('')).toContain('繁殖記録');
    expect(result.issues.join('')).toContain('記録ID=conflict-1');
    expect(result.issues.join('')).toContain('cattleId=cow-1');
    expect(result.issues.join('')).toContain('cowEarTag=9999');
  });

  it('keeps plain name-only warnings free of identifier diagnostics', () => {
    const result = resolve([{ ...ai, id: 'name-only-1', cowEarTag: '', cattleId: '', cowId: '' }], { calvings: [] });
    expect(result.issues.join('')).toContain('牛名だけ');
    expect(result.issues.join('')).not.toContain('記録ID=');
  });

  it('ignores a provably older name-only breeding record when a newer explicit record identifies the cow', () => {
    const oldNameOnly = {
      id: 'legacy-name-only',
      cowName: cow.name,
      heatDate: '2026-05-01',
      inseminationDate: '2026-05-02',
      breedingMethod: '種付',
      pregnancyResult: '未鑑定',
      updatedAt: '2099-01-01T00:00:00.000Z',
    };
    const result = resolve([oldNameOnly, ai]);
    expect(result.issues).toEqual([]);
    expect(result.currentRecord?.id).toBe('ai-1');
    expect(result.plans.map((item) => item.kind)).toEqual(['next-heat', 'pregnancy-check']);
  });

  it('still warns when a name-only breeding record could be newer than the explicit current cycle', () => {
    const newerNameOnly = {
      id: 'newer-name-only',
      cowName: cow.name,
      heatDate: '2026-09-29',
      breedingStatus: '発情確認',
    };
    const result = resolve([ai, newerNameOnly]);
    expect(result.plans).toEqual([]);
    expect(result.issues.join('')).toContain('牛名だけ');
  });

  it('does not block an explicitly identified current cycle because of an undated name-only legacy record', () => {
    const undatedNameOnly = {
      id: 'undated-name-only',
      cowName: cow.name,
      pregnancyResult: '受胎',
      expectedCalvingDate: '2027-06-01',
    };
    const result = resolve([ai, undatedNameOnly]);
    expect(result.issues).toEqual([]);
    expect(result.currentRecord?.id).toBe('ai-1');
    expect(result.plans.map((item) => item.kind)).toEqual(['next-heat', 'pregnancy-check']);
  });

  it('still warns when name-only records are the only evidence for this cow', () => {
    const undatedNameOnly = {
      id: 'undated-name-only',
      cowName: cow.name,
      pregnancyResult: '受胎',
      expectedCalvingDate: '2027-06-01',
    };
    const result = resolve([undatedNameOnly], { calvings: [] });
    expect(result.plans).toEqual([]);
    expect(result.issues.join('')).toContain('牛名だけ');
  });
  it.each([
    { cattleId: 'cow-1', cowEarTag: '9999' },
    { cowEarTag: '0254', targetNumber: '9999' },
  ])('keeps real ear-tag contradictions uncertain: %j', (fields) => {
    expect(planAnimalMatch(fields, cow)).toBe('uncertain');
    expect(resolve([{ ...ai, ...fields }]).issues.length).toBeGreaterThan(0);
  });

  it.each([
    { cattleId: 'cow-2', cowEarTag: '0254' },
    { cattleId: 'cow-1', targetCattleId: 'cow-2', cowEarTag: '0254' },
  ])('lets a stable matching ear tag override stale internal ids: %j', (fields) => {
    expect(planAnimalMatch(fields, cow)).toBe('match');
    expect(resolve([{ ...ai, ...fields }]).issues).toEqual([]);
  });
  it('does not let another cow calving end this cow cycle', () => {
    const result = resolve([ai], { calvings: [{ ...calving, cowEarTag: '9999', cowName: cow.name, actualCalvingDate: today }] });
    expect(result.latestCalvingDate).toBe('');
    expect(result.plans.map((item) => item.kind)).toEqual(['next-heat', 'pregnancy-check']);
  });
  it('does not let calf sales or another adult sale suppress maternal plans', () => {
    expect(resolve([ai], { sales: [{ cattleId: cow.id, targetType: '子牛', status: '販売済み' }] }).isSold).toBe(false);
    expect(resolve([ai], { sales: [{ cattleId: otherCow.id, targetNumber: otherCow.earTag, targetType: '成牛', status: '販売済み', targetName: cow.name }] }).isSold).toBe(false);
  });
  it('suppresses guidance for a confirmed sold cow', () => {
    const result = resolve([ai], { sales: [{ cattleId: cow.id, targetType: '成牛', status: '販売済み' }] });
    expect(result.isSold).toBe(true);
    expect(result.plans).toEqual([]);
  });
});

describe('current cycle and immutable projection', () => {
  it('calculates the postpartum heat date 35 days after actual calving', () => {
    const result = resolve();
    expect(result.plans[0].title).toBe('発情予定日');
    expect(result.plans[0].note).toBe('実分娩日から35日後を目安にしています。発情を確認したら登録してください。');
    expect(result.plans[0].date).toBe('2026-10-03');
  });
  it.each([
    [30, '2026-09-28'],
    [40, '2026-10-08'],
  ])('uses farm postpartum heat setting in shared cattle plans: %s days', (postCalvingHeatDays, expectedDate) => {
    const result = resolve([], { postCalvingHeatDays });
    expect(result.plans[0].date).toBe(expectedDate);
    expect(result.plans[0].note).toContain(`実分娩日から${postCalvingHeatDays}日後`);
  });
  it('uses the latest actual calving, not a planned or older calving', () => {
    const result = resolve([], { calvings: [{ ...calving, id: 'older', actualCalvingDate: '2025-08-01' }, calving, { cowEarTag: '0254', expectedCalvingDate: '2027-01-01' }] });
    expect(result.latestCalvingDate).toBe('2026-08-29');
  });
  it('matches a newer calving saved with cowId and uses it for the postpartum heat date', () => {
    const result = resolve([], {
      calvings: [
        { ...calving, id: 'older', cowEarTag: '0254', actualCalvingDate: '2026-08-29' },
        { id: 'newer', cowId: '0254', cowName: cow.name, actualCalvingDate: '2026-09-03' },
      ],
    });
    expect(result.latestCalvingDate).toBe('2026-09-03');
    expect(result.plans[0].title).toBe('発情予定日');
    expect(result.plans[0].date).toBe('2026-10-08');
  });

  it('also matches cowId when it stores the internal cattle id', () => {
    expect(planAnimalMatch({ cowId: 'cow-1' }, cow)).toBe('match');
    expect(planAnimalMatch({ cowId: '0254' }, cow)).toBe('match');
    expect(planAnimalMatch({ cowId: '9999', cowName: cow.name }, cow)).toBe('other');
  });

  it('treats an explicit matching ear tag as authoritative over a stale internal id', () => {
    expect(planAnimalMatch({
      cattleId: 'legacy-cattle-id',
      cowEarTag: '0254',
      cowName: cow.name,
    }, cow)).toBe('match');
  });

  it('still flags a record when its current internal id conflicts with another cow ear tag', () => {
    expect(planAnimalMatch({
      cattleId: 'cow-1',
      cowEarTag: '9999',
      cowName: cow.name,
    }, cow)).toBe('uncertain');
  });

  it('keeps contradictory explicit ear-tag fields uncertain', () => {
    expect(planAnimalMatch({
      cowEarTag: '0254',
      targetNumber: '9999',
      cowName: cow.name,
    }, cow)).toBe('uncertain');
  });

  it('accepts a calving when cowId matches the ear tag even if legacy cattleId is stale', () => {
    const result = resolve([], {
      calvings: [{
        id: 'TEMP-calving_1787964521131_3l2t81',
        cattleId: '9',
        cowId: '0254',
        cowName: cow.name,
        actualCalvingDate: '2026-08-29',
      }],
    });
    expect(result.issues).toEqual([]);
    expect(result.latestCalvingDate).toBe('2026-08-29');
    expect(result.plans[0].title).toBe('発情予定日');
  });

  it('still warns when a calving cowId matches but another explicit ear tag contradicts it', () => {
    const result = resolve([], {
      calvings: [{
        id: 'conflicting-calving',
        cattleId: '9',
        cowId: '0254',
        cowEarTag: '9999',
        cowName: cow.name,
        actualCalvingDate: '2026-08-29',
      }],
    });
    expect(result.plans).toEqual([]);
    expect(result.issues.join('')).toContain('分娩記録');
    expect(result.issues.join('')).toContain('cowEarTag=9999');
  });
  it('does not revive a previous pregnancy or let its later edit block postpartum guidance', () => {
    const result = resolve([{ ...ai, heatDate: '2025-11-14', inseminationDate: '2025-11-15', pregnancyResult: '受胎', pregnancyCheckDate: '2026-10-01', updatedAt: '2026-10-02T00:00:00Z' }]);
    expect(result.plans.map((item) => item.kind)).toEqual(['post-calving-heat']);
  });
  it('picks the newer cycle independently of array order and updatedAt', () => {
    const old = { ...ai, id: 'old', heatDate: '2026-09-01', inseminationDate: '2026-09-02', updatedAt: '2099-01-01' };
    const forward = resolve([old, ai]);
    expect(forward.currentRecord?.id).toBe('ai-1');
    expect(resolve([ai, old])).toEqual(forward);
  });
  it('does not resurrect a prior open cycle when the latest record is calved', () => {
    const closed = { ...ai, id: 'closed', heatDate: '2026-09-25', inseminationDate: '2026-09-26', breedingStatus: '分娩済み' };
    expect(kinds([ai, closed], { calvings: [] })).toEqual([]);
  });
  it('does not resurrect a prior plan after cancellation of the newest cycle', () => {
    const cancelled = { ...ai, id: 'cancelled', heatDate: '2026-09-25', inseminationDate: '', breedingMethod: '受精卵移植', breedingStatus: '中止', transferPlannedDate: '2026-10-02' };
    expect(kinds([ai, cancelled])).toEqual([]);
  });
  it('switches the shared cattle plan from postpartum heat guidance to breeding choice after a new heat is recorded', () => {
    const heatOnly = {
      id: 'heat-new',
      cowEarTag: cow.earTag,
      cowName: cow.name,
      heatDate: '2026-10-01',
      breedingMethod: '未選択',
      breedingStatus: '発情確認',
      pregnancyResult: '未鑑定',
    };
    const result = resolve([heatOnly]);
    expect(result.issues).toEqual([]);
    expect(result.currentRecord?.id).toBe('heat-new');
    expect(result.plans).toEqual([{
      kind: 'breeding-choice',
      title: '種付方法の確認',
      date: null,
      dateSource: 'none',
      sourceRecordId: 'heat-new',
    }]);
    const destination = cattlePlanDestination(result.plans[0], cow, '/cattle/cow-1');
    expect(destination.to).toBe('/breedings/heat-new/edit?returnTo=%2Fcattle%2Fcow-1');
    expect(destination.label).toBe('繁殖記録を確認');
  });

  it('allows a separate heat-only entry for the exact same documented service heat', () => {
    const result = resolve([{ id: 'heat', cowEarTag: cow.earTag, heatDate: ai.heatDate }, ai]);
    expect(result.issues).toEqual([]);
    expect(result.currentRecord?.id).toBe('ai-1');
  });
  it('does not collapse two distinct services or ETs into one guessed record', () => {
    expect(resolve([ai, { ...ai, id: 'second', bullName: 'another' }]).issues.join('')).toContain('複数');
  });
  it('does not silently replace an unresolved pregnancy with a newer heat', () => {
    const result = resolve([{ ...ai, pregnancyResult: '受胎' }, { id: 'heat-new', cowEarTag: cow.earTag, heatDate: '2026-09-29' }]);
    expect(result.plans).toEqual([]);
    expect(result.issues.join('')).toContain('受胎記録');
  });
  it('keeps ambiguous undated pregnancy evidence as an issue, never postpartum or no-work guidance', () => {
    const result = resolve([{ id: 'unknown', cowEarTag: cow.earTag, pregnancyResult: '受胎', expectedCalvingDate: '2027-06-29' }]);
    expect(result.plans).toEqual([]);
    expect(result.issues.length).toBeGreaterThan(0);
  });
  it('keeps ET-only planned date records as a dated action, not completed transfer', () => {
    const result = resolve([{ id: 'planned', cowEarTag: cow.earTag, breedingMethod: '受精卵移植', transferPlannedDate: '2026-10-03' }]);
    expect(result.plans[0].kind).toBe('transfer');
    expect(result.plans[0].date).toBe('2026-10-03');
  });
  it('does not hide an incomplete execution status behind postpartum guidance', () => {
    const result = resolve([{ id: 'incomplete', cowEarTag: cow.earTag, breedingStatus: '種付実施' }]);
    expect(result.plans).toEqual([]);
    expect(result.issues.length).toBeGreaterThan(0);
  });
  it('warns about same-day calving and unrelated breeding instead of guessing their order', () => {
    expect(resolve([{ ...ai, heatDate: calving.actualCalvingDate, inseminationDate: '' }]).issues.join('')).toContain('同日');
  });
  it('accepts an explicitly linked calving as completion of that same-day cycle', () => {
    const result = resolve([{ ...ai, heatDate: calving.actualCalvingDate, inseminationDate: '' }], { calvings: [{ ...calving, breedingId: ai.id }] });
    expect(result.plans[0].kind).toBe('post-calving-heat');
  });
  it.each(['invalid', '2026-02-30', '2026-10-03'])('reports invalid or future actual calving: %s', (actualCalvingDate) => {
    expect(resolve([], { calvings: [{ ...calving, actualCalvingDate }] }).issues.length).toBeGreaterThan(0);
  });
  it('does not use malformed, future, or reversed actual dates as a new valid cycle', () => {
    expect(resolve([{ ...ai, heatDate: 'invalid' }]).issues.length).toBeGreaterThan(0);
    expect(resolve([{ ...ai, inseminationDate: '2026-10-03' }]).issues.length).toBeGreaterThan(0);
    expect(resolve([{ ...ai, heatDate: '2026-09-21' }]).issues.length).toBeGreaterThan(0);
  });
  it('uses ET heat-based dates while leaving the original snapshot unchanged', () => {
    const record = Object.freeze({ ...et });
    const input = Object.freeze(snapshot(Object.freeze([record])));
    const before = JSON.stringify(input);
    const result = resolveCattleBreedingPlans(cow, input, today);
    expect(result.plans.map((item) => item.date)).toEqual(['2026-10-08', '2026-10-29']);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('replays correction, pregnancy, cancellation, record removal and calving removal', () => {
    expect(kinds([et])).toEqual(['next-heat', 'pregnancy-check']);
    expect(resolve([{ ...et, heatDate: '2026-09-18' }]).plans.map((item) => item.date)).toEqual(['2026-10-09', '2026-10-30']);
    expect(kinds([{ ...et, pregnancyResult: '受胎' }])).toEqual(['calving']);
    expect(kinds([{ ...et, pregnancyResult: '再鑑定予定', recheckExpectedDate: '2026-10-15' }])).toEqual(['recheck']);
    expect(kinds([{ ...et, pregnancyResult: '未鑑定', pregnancyCheckDate: '' }])).toEqual(['next-heat', 'pregnancy-check']);
    expect(kinds([])).toEqual(['post-calving-heat']);
    expect(kinds([], { calvings: [] })).toEqual([]);
  });
  it('reports acquisition failures instead of asserting that no plans exist', () => {
    const result = resolve([ai], { unavailable: ['繁殖記録'] });
    expect(result.plans).toEqual([]);
    expect(result.issues.join('')).toContain('読み込めません');
  });
});

describe('attention filtering and links are separate from plan existence', () => {
  it('retains distant dates while the attention filter remains off', () => {
    const result = resolve([{ ...ai, pregnancyResult: '受胎', expectedCalvingDate: '2027-07-01' }]);
    expect(result.plans).toHaveLength(1);
    expect(hasCattlePlanAttention(result, today)).toBe(false);
    expect(hasCattlePlanAttention(resolve(), today)).toBe(true);
    expect(hasCattlePlanAttention(resolve([ai], { unavailable: ['記録'] }), today)).toBe(true);
  });
  it('does not remove unresolved overdue plans after seven days', () => {
    const result = resolve([ai]);
    expect(hasCattlePlanAttention(result, '2026-12-01')).toBe(true);
    expect(result.plans).toHaveLength(2);
  });
  it('preserves existing animal-context and record-specific destinations', () => {
    const heatLink = cattlePlanDestination(resolve().plans[0], cow, '/cattle/cow-1');
    const url = new URL(heatLink.to, 'https://example.test');
    expect(url.pathname).toBe('/breedings/new');
    expect(url.searchParams.get('targetNumber')).toBe('0254');
    expect(url.searchParams.get('targetName')).toBe(cow.name);
    expect(url.searchParams.get('returnTo')).toBe('/cattle/cow-1');
    const diagnosis = resolve([ai]).plans.find((item) => item.kind === 'pregnancy-check')!;
    expect(cattlePlanDestination(diagnosis, cow, '/cattle/cow-1').to).toBe('/pregnancy-checks/ai-1/edit?returnTo=%2Fcattle%2Fcow-1');
  });
});
