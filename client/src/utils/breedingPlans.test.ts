import { describe, expect, it } from 'vitest';
import {
  breedingPlanDate,
  breedingPlanDaysUntil,
  calendarBreedingPlans,
  projectBreedingPlans,
  projectPostCalvingHeat,
  upcomingBreedingPlans,
  type BreedingPlan,
  type BreedingPlanOptions,
  type BreedingPlanProjection,
  type BreedingPlanRecord,
} from './breedingPlans';

const options: BreedingPlanOptions = { today: '2026-10-02', cycleDays: 21 };
const ai: BreedingPlanRecord = {
  id: 'ai-1', cowEarTag: '0254', cowName: 'テスト母牛', heatDate: '2026-09-19',
  breedingMethod: '種付', breedingStatus: '種付実施', inseminationDate: '2026-09-20',
  pregnancyResult: '未鑑定', nextHeatExpectedDate: '2026-10-11',
  pregnancyCheckExpectedDate: '2026-11-01', expectedCalvingDate: '2027-07-02',
};
const et: BreedingPlanRecord = {
  id: 'et-1', cowEarTag: '0254', cowName: 'テスト母牛', heatDate: '2026-09-17',
  breedingMethod: '受精卵移植', breedingStatus: '移植実施', transferPlannedDate: '2026-09-24',
  transferDate: '2026-09-24', pregnancyResult: '未鑑定',
  // Legacy estimates based on transfer rather than heat; projection must not save over these.
  nextHeatExpectedDate: '2026-10-15', pregnancyCheckExpectedDate: '2026-11-05', expectedCalvingDate: '2027-07-06',
};
const kinds = (result: BreedingPlanProjection) => result.plans.map((item) => item.kind);
const dates = (result: BreedingPlanProjection) => result.plans.map((item) => item.date);
const postpartum = (breedings: readonly BreedingPlanRecord[] = [], extra: Partial<Parameters<typeof projectPostCalvingHeat>[0]> = {}) =>
  projectPostCalvingHeat({ latestCalvingDate: '2026-08-29', today: options.today, breedings, ...extra });

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

describe('breeding plan calendar dates', () => {
  it.each([
    ['2026-10-02', '2026-10-02'],
    [' 2026-10-02 ', '2026-10-02'],
    ['2024-02-29', '2024-02-29'],
    ['2026-10-02T00:30:00+09:00', '2026-10-02'],
    ['2026-10-02T23:30:00-08:00', '2026-10-02'],
    ['2026-10-02T00:00:00.000Z', '2026-10-02'],
  ])('preserves the calendar day in %s', (input, expected) => {
    expect(breedingPlanDate(input)).toBe(expected);
  });

  it.each([undefined, null, '', 20261002, 'invalid', '2026-02-29', '2026-09-31', '2026-13-01', '2026-00-01', '2026-10-00', '2026-1-2', '2026-10-02garbage', '2026-10-02Tinvalid', '2026-10-02T25:00:00Z'])('rejects malformed or impossible date %s', (input) => {
    expect(breedingPlanDate(input)).toBeNull();
  });

  it.each([
    ['2026-10-02', '2026-08-29', 34],
    ['2026-08-29', '2026-10-02', -34],
    ['2026-10-02', '2026-10-02', 0],
    ['2024-03-01', '2024-02-28', 2],
    ['2026-03-09', '2026-03-08', 1],
    ['2026-11-02', '2026-11-01', 1],
  ])('counts calendar days from %s and %s without timezone drift', (date, today, expected) => {
    expect(breedingPlanDaysUntil(date, today)).toBe(expected);
  });

  it('does not treat invalid dates as zero remaining days', () => {
    expect(breedingPlanDaysUntil('invalid', options.today)).toBeNull();
    expect(breedingPlanDaysUntil(options.today, 'invalid')).toBeNull();
  });
});

describe('one-current-cycle breeding plan projection', () => {
  it('keeps an empty draft empty without inventing a service', () => {
    expect(projectBreedingPlans({ id: 'draft' }, options)).toEqual({ plans: [], issues: [] });
  });

  it('shows a method-confirmation task after heat, not a pregnancy or calving appointment', () => {
    const result = projectBreedingPlans({ ...ai, inseminationDate: '', breedingMethod: '未選択', breedingStatus: '発情確認' }, options);
    expect(kinds(result)).toEqual(['breeding-choice']);
    expect(dates(result)).toEqual([null]);
    expect(result.issues).toEqual([]);
  });

  it('shows next-heat and diagnosis, but not tentative calving, after AI', () => {
    const result = projectBreedingPlans(ai, options);
    expect(kinds(result)).toEqual(['next-heat', 'pregnancy-check']);
    expect(dates(result)).toEqual(['2026-10-11', '2026-11-01']);
    expect(result.plans.every((item) => item.dateSource === 'stored' && item.sourceRecordId === 'ai-1')).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('preserves explicitly stored AI schedule dates', () => {
    const result = projectBreedingPlans({ ...ai, nextHeatExpectedDate: '2026-10-13', pregnancyCheckExpectedDate: '2026-11-03' }, options);
    expect(dates(result)).toEqual(['2026-10-13', '2026-11-03']);
  });

  it('uses the existing AI calculation only when stored dates are absent', () => {
    const result = projectBreedingPlans({ ...ai, nextHeatExpectedDate: '', pregnancyCheckExpectedDate: '' }, options);
    expect(dates(result)).toEqual(['2026-10-11', '2026-11-01']);
    expect(result.plans.every((item) => item.dateSource === 'calculated')).toBe(true);
  });

  it('honors the supplied cycle setting rather than forcing 21 days', () => {
    const result = projectBreedingPlans({ ...ai, nextHeatExpectedDate: '', pregnancyCheckExpectedDate: '' }, { ...options, cycleDays: 23 });
    expect(dates(result)).toEqual(['2026-10-13', '2026-11-05']);
  });

  it('uses the legacy service date when the primary AI date is absent', () => {
    const result = projectBreedingPlans({ ...ai, inseminationDate: '', serviceDate: '2026-09-20', nextHeatExpectedDate: '', pregnancyCheckExpectedDate: '' }, options);
    expect(dates(result)).toEqual(['2026-10-11', '2026-11-01']);
  });

  it('shows only transfer execution for ET planned but not performed', () => {
    const result = projectBreedingPlans({ ...et, transferDate: '', breedingStatus: '移植予定' }, options);
    expect(kinds(result)).toEqual(['transfer']);
    expect(dates(result)).toEqual(['2026-09-24']);
    expect(result.issues).toEqual([]);
  });

  it('corrects ET display dates from heat without modifying stored estimates', () => {
    const source = freezeDeep({ ...et });
    const before = JSON.stringify(source);
    const result = projectBreedingPlans(source, options);
    expect(kinds(result)).toEqual(['next-heat', 'pregnancy-check']);
    expect(dates(result)).toEqual(['2026-10-08', '2026-10-29']);
    expect(result.plans.every((item) => item.dateSource === 'calculated')).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('recognizes legacy actualTransferDate as performed', () => {
    const result = projectBreedingPlans({ ...et, transferDate: '', actualTransferDate: '2026-09-24' }, options);
    expect(kinds(result)).toEqual(['next-heat', 'pregnancy-check']);
    expect(dates(result)).toEqual(['2026-10-08', '2026-10-29']);
  });

  it('moves all derived ET dates when the heat date is edited', () => {
    const changed = { ...et, heatDate: '2026-09-18' };
    expect(dates(projectBreedingPlans(changed, options))).toEqual(['2026-10-09', '2026-10-30']);
    expect(dates(projectBreedingPlans({ ...changed, pregnancyResult: '受胎' }, options))).toEqual(['2027-06-30']);
  });

  it('does not substitute the transfer date when ET heat is missing', () => {
    const result = projectBreedingPlans({ ...et, heatDate: '' }, options);
    expect(kinds(result)).toEqual(['next-heat', 'pregnancy-check']);
    expect(dates(result)).toEqual([null, null]);
    expect(result.issues).toContainEqual({ code: 'missing-et-heat', field: 'heatDate' });
    expect(result.issues.filter((issue) => issue.code === 'missing-et-heat')).toHaveLength(1);
  });

  it.each(['受胎', '妊娠'])('switches from heat/diagnosis to calving for %s', (pregnancyResult) => {
    const result = projectBreedingPlans({ ...et, pregnancyResult }, options);
    expect(kinds(result)).toEqual(['calving']);
    expect(dates(result)).toEqual(['2027-06-29']);
    expect(result.issues).toEqual([]);
  });

  it.each(['空胎', '不受胎'])('keeps next-heat only for %s', (pregnancyResult) => {
    const result = projectBreedingPlans({ ...ai, pregnancyResult, pregnancyCheckDate: '2026-10-01' }, options);
    expect(kinds(result)).toEqual(['next-heat']);
    expect(dates(result)).toEqual(['2026-10-11']);
  });

  it('shows only recheck after a recheck decision', () => {
    const result = projectBreedingPlans({ ...ai, pregnancyResult: '再鑑定予定', pregnancyCheckDate: '2026-10-01', recheckExpectedDate: '2026-10-15' }, options);
    expect(kinds(result)).toEqual(['recheck']);
    expect(dates(result)).toEqual(['2026-10-15']);
  });

  it('does not label a missing recheck date as no planned work', () => {
    const result = projectBreedingPlans({ ...ai, pregnancyResult: '再鑑定予定' }, options);
    expect(kinds(result)).toEqual(['recheck']);
    expect(dates(result)).toEqual([null]);
    expect(result.issues).toContainEqual({ code: 'missing-date', field: 'recheckExpectedDate' });
  });

  it('keeps an undated calving task and issue if a confirmed pregnancy has no date/base', () => {
    const result = projectBreedingPlans({ id: 'incomplete', pregnancyResult: '受胎' }, options);
    expect(kinds(result)).toEqual(['calving']);
    expect(dates(result)).toEqual([null]);
    expect(result.issues).toContainEqual({ code: 'missing-date', field: 'expectedCalvingDate' });
  });

  it('flags a diagnosis with no result instead of treating it as an unperformed check', () => {
    const result = projectBreedingPlans({ ...ai, pregnancyCheckDate: '2026-10-01' }, options);
    expect(kinds(result)).toEqual(['pregnancy-check']);
    expect(dates(result)).toEqual([null]);
    expect(result.issues).toContainEqual({ code: 'missing-result', field: 'pregnancyResult' });
  });

  it('flags an unsupported result instead of silently inventing the next stage', () => {
    const result = projectBreedingPlans({ ...ai, pregnancyResult: '流産・胎子喪失' }, options);
    expect(result.plans).toEqual([]);
    expect(result.issues).toEqual([{ code: 'unknown-result', field: 'pregnancyResult' }]);
  });

  it.each(['分娩済み', '中止'])('does not revive a closed cycle: %s', (breedingStatus) => {
    expect(projectBreedingPlans({ ...et, breedingStatus, pregnancyResult: '受胎' }, options)).toEqual({ plans: [], issues: [] });
  });

  it('honors the legacy closed status field', () => {
    expect(projectBreedingPlans({ ...ai, breedingStatus: '', status: '分娩済み' }, options).plans).toEqual([]);
  });

  it('excludes a service preceding the latest calving despite a later diagnosis edit', () => {
    const old = { ...ai, heatDate: '2025-11-14', inseminationDate: '2025-11-15', pregnancyCheckDate: '2026-10-01', pregnancyResult: '受胎' };
    expect(projectBreedingPlans(old, { ...options, latestCalvingDate: '2026-08-29' })).toEqual({ plans: [], issues: [] });
  });

  it('does not infer a post-calving cycle solely from a later diagnosis date', () => {
    const result = projectBreedingPlans({ id: 'unknown-cycle', pregnancyCheckDate: '2026-10-01', pregnancyResult: '受胎', expectedCalvingDate: '2027-07-01' }, { ...options, latestCalvingDate: '2026-08-29' });
    expect(result).toEqual({ plans: [], issues: [{ code: 'missing-activity' }] });
  });

  it('preserves a verified service after the latest calving', () => {
    expect(dates(projectBreedingPlans(ai, { ...options, latestCalvingDate: '2026-08-29' }))).toEqual(['2026-10-11', '2026-11-01']);
  });

  it('does not hide invalid stored AI dates by replacing them with calculations', () => {
    const result = projectBreedingPlans({ ...ai, nextHeatExpectedDate: '2026-02-30' }, options);
    expect(dates(result)).toEqual([null, '2026-11-01']);
    expect(result.issues).toContainEqual({ code: 'invalid-date', field: 'nextHeatExpectedDate' });
  });

  it.each([
    { inseminationDate: '2026-09-20', serviceDate: '2026-09-21' },
    { transferDate: '2026-09-24', actualTransferDate: '2026-09-25' },
    { pregnancyCheckDate: '2026-10-01', pregnancyDiagnosisDate: '2026-10-02' },
  ])('refuses to choose between conflicting primary and legacy dates: %j', (fields) => {
    const result = projectBreedingPlans({ ...ai, ...fields }, options);
    expect(result.plans).toEqual([]);
    expect(result.issues.some((issue) => issue.code === 'conflicting-dates')).toBe(true);
  });

  it('does not bypass an invalid primary date using a valid legacy date', () => {
    const result = projectBreedingPlans({ ...ai, inseminationDate: 'invalid', serviceDate: '2026-09-20' }, options);
    expect(result.plans).toEqual([]);
    expect(result.issues).toContainEqual({ code: 'invalid-date', field: 'inseminationDate' });
  });

  it.each(['heatDate', 'inseminationDate', 'transferDate', 'pregnancyCheckDate'] as const)('does not count a future %s as completed activity', (field) => {
    const result = projectBreedingPlans({ ...ai, [field]: '2026-10-03' }, options);
    expect(result.plans).toEqual([]);
    expect(result.issues).toContainEqual({ code: 'future-activity' });
  });

  it.each([0, -1, 21.5, Number.NaN, Number.POSITIVE_INFINITY])('reports an invalid cycle setting %s', (cycleDays) => {
    expect(projectBreedingPlans(ai, { ...options, cycleDays })).toEqual({ plans: [], issues: [{ code: 'invalid-cycle-days' }] });
  });

  it('reports an invalid current date', () => {
    expect(projectBreedingPlans(ai, { ...options, today: '2026-02-30' })).toEqual({ plans: [], issues: [{ code: 'invalid-today' }] });
  });

  it('keeps ambiguous orphan schedule dates as an issue, not a new service', () => {
    expect(projectBreedingPlans({ id: 'orphan', pregnancyCheckExpectedDate: '2026-10-10' }, options)).toEqual({ plans: [], issues: [{ code: 'missing-activity' }] });
  });
});

describe('post-calving guidance for already-matched cow records', () => {
  it('calculates the postpartum heat date 35 days after the actual calving date', () => {
    const result = postpartum();
    expect(kinds(result)).toEqual(['post-calving-heat']);
    expect(result.plans[0]).toEqual({ kind: 'post-calving-heat', title: '発情予定日', date: '2026-10-03', dateSource: 'calculated', relatedDate: '2026-08-29', note: '実分娩日から35日後を目安にしています。発情を確認したら登録してください。' });
    expect(result.issues).toEqual([]);
  });

  it.each([
    [30, '2026-09-28'],
    [35, '2026-10-03'],
    [40, '2026-10-08'],
  ])('uses the farm postpartum heat setting: %s days', (postCalvingHeatDays, expectedDate) => {
    const result = postpartum([], { postCalvingHeatDays });
    expect(result.plans[0].date).toBe(expectedDate);
    expect(result.plans[0].note).toContain(`実分娩日から${postCalvingHeatDays}日後`);
  });

  it.each([0, -1, 35.5, Number.NaN])('falls back to 35 days for invalid postpartum setting %s', (postCalvingHeatDays) => {
    expect(postpartum([], { postCalvingHeatDays }).plans[0].date).toBe('2026-10-03');
  });

  it('ignores records explicitly completed by calving', () => {
    const result = postpartum([{ ...ai, breedingStatus: '分娩済み', pregnancyResult: '受胎' }]);
    expect(kinds(result)).toEqual(['post-calving-heat']);
  });

  it('uses latest calving rather than a prior cycle to decide postpartum guidance', () => {
    const result = postpartum([{ ...ai, heatDate: '2025-11-14', inseminationDate: '2025-11-15', pregnancyResult: '受胎' }]);
    expect(kinds(result)).toEqual(['post-calving-heat']);
  });

  it.each(['heatDate', 'inseminationDate', 'serviceDate', 'transferDate', 'actualTransferDate', 'transferPlannedDate', 'pregnancyCheckDate', 'pregnancyDiagnosisDate'] as const)('ends the initial guidance after %s is recorded', (field) => {
    expect(postpartum([{ id: 'recorded', [field]: '2026-09-20' }]).plans).toEqual([]);
  });

  it('does not repeat initial guidance after same-day recorded activity', () => {
    expect(postpartum([{ id: 'same-day', heatDate: '2026-08-29' }]).plans).toEqual([]);
  });

  it('does not revive the initial guidance merely because a later ET plan was cancelled', () => {
    expect(postpartum([{ ...et, breedingStatus: '中止' }]).plans).toEqual([]);
  });

  it('does not infer postpartum status when there is no calving record', () => {
    expect(postpartum([], { latestCalvingDate: '' })).toEqual({ plans: [], issues: [] });
  });

  it('does not show breeding guidance for a sold cow', () => {
    expect(postpartum([], { isSold: true })).toEqual({ plans: [], issues: [] });
  });

  it.each(['invalid', '2026-02-30', '2026-10-03'])('flags invalid or future calving date %s', (latestCalvingDate) => {
    expect(postpartum([], { latestCalvingDate })).toEqual({ plans: [], issues: [{ code: 'invalid-date', field: 'latestCalvingDate' }] });
  });

  it('does not hide incomplete pregnancy evidence behind an initial heat reminder', () => {
    const result = postpartum([{ id: 'pregnant-unknown-cycle', pregnancyResult: '受胎' }]);
    expect(result).toEqual({ plans: [], issues: [{ code: 'missing-activity' }] });
  });

  it('reports unreadable activity dates without asserting no planned work', () => {
    const result = postpartum([{ id: 'invalid-activity', heatDate: 'invalid' }]);
    expect(result).toEqual({ plans: [], issues: [{ code: 'invalid-date', field: 'activity' }] });
  });

  it('keeps the caller-provided local day independent of timezone offsets', () => {
    expect(postpartum([], { today: '2026-10-02T00:30:00+09:00' }).plans[0].date).toBe('2026-10-03');
  });
});

describe('display filters do not become completion rules', () => {
  it('keeps distant dates in the projection but shows only the appropriate window at home', () => {
    const result = projectBreedingPlans(ai, options);
    expect(dates(result)).toEqual(['2026-10-11', '2026-11-01']);
    expect(upcomingBreedingPlans(result.plans, options.today)).toEqual([]);
    expect(upcomingBreedingPlans(result.plans, '2026-10-04').map((item) => item.kind)).toEqual(['next-heat']);
    expect(calendarBreedingPlans(result.plans, '2026-11').map((item) => item.kind)).toEqual(['pregnancy-check']);
  });

  it('never drops an unresolved overdue task just because seven days have elapsed', () => {
    const result = projectBreedingPlans(ai, options);
    expect(upcomingBreedingPlans(result.plans, '2026-12-01')).toEqual(result.plans);
  });

  it('uses the calculated postpartum date consistently in home and calendar filters', () => {
    const result = postpartum();
    expect(upcomingBreedingPlans(result.plans, options.today)).toEqual(result.plans);
    expect(calendarBreedingPlans(result.plans, '2026-08')).toEqual([]);
    expect(calendarBreedingPlans(result.plans, '2026-10')).toEqual(result.plans);
  });

  it.each([
    ['2026-12-02', false],
    ['2026-12-01', true],
    ['2026-11-01', true],
    ['2026-10-01', true],
  ])('treats feed review as ongoing guidance, not a calving-day appointment (%s)', (expectedCalvingDate, expected) => {
    const result = projectBreedingPlans({ ...ai, pregnancyResult: '受胎', expectedCalvingDate }, options);
    const feed = result.plans.find((item) => item.kind === 'feed-review');
    expect(Boolean(feed)).toBe(expected);
    if (feed) {
      expect(feed.date).toBeNull();
      expect(feed.relatedDate).toBe(expectedCalvingDate);
      expect(upcomingBreedingPlans([feed], options.today)).toEqual([feed]);
      expect(calendarBreedingPlans([feed], expectedCalvingDate.slice(0, 7))).toEqual([]);
    }
  });

  it('does not mutate, sort, or consume the original plans', () => {
    const result = projectBreedingPlans(ai, options);
    const plans: readonly BreedingPlan[] = freezeDeep(result.plans);
    const before = JSON.stringify(plans);
    upcomingBreedingPlans(plans, '2026-12-01');
    calendarBreedingPlans(plans, '2026-11');
    expect(JSON.stringify(plans)).toBe(before);
  });

  it('validates filter parameters without exposing all records by mistake', () => {
    const plans = projectBreedingPlans(ai, options).plans;
    expect(upcomingBreedingPlans(plans, 'invalid')).toEqual([]);
    expect(upcomingBreedingPlans(plans, options.today, -1)).toEqual([]);
    expect(calendarBreedingPlans(plans, '2026-13')).toEqual([]);
    expect(calendarBreedingPlans(plans, '2026-1')).toEqual([]);
  });
});

describe('workflow replay and immutable inputs', () => {
  it('replays calving -> heat -> ET plan -> ET done -> diagnosis -> new calving', () => {
    expect(kinds(postpartum())).toEqual(['post-calving-heat']);
    const heat: BreedingPlanRecord = { id: 'cycle', heatDate: '2026-09-17', pregnancyResult: '未鑑定' };
    expect(postpartum([heat]).plans).toEqual([]);
    expect(kinds(projectBreedingPlans(heat, options))).toEqual(['breeding-choice']);
    const planned = { ...heat, breedingMethod: '受精卵移植', breedingStatus: '移植予定', transferPlannedDate: '2026-09-24' };
    expect(kinds(projectBreedingPlans(planned, options))).toEqual(['transfer']);
    const done = { ...planned, breedingStatus: '移植実施', transferDate: '2026-09-24' };
    expect(dates(projectBreedingPlans(done, options))).toEqual(['2026-10-08', '2026-10-29']);
    const pregnant = { ...done, pregnancyResult: '受胎', pregnancyCheckDate: '2026-10-29' };
    const pregnantProjection = projectBreedingPlans(pregnant, { ...options, today: '2026-10-29' });
    expect(kinds(pregnantProjection)).toEqual(['calving']);
    expect(dates(pregnantProjection)).toEqual(['2027-06-29']);
    const calved = { ...pregnant, breedingStatus: '分娩済み' };
    expect(projectBreedingPlans(calved, { ...options, today: '2027-06-29' }).plans).toEqual([]);
    expect(kinds(postpartum([calved], { today: '2027-07-29', latestCalvingDate: '2027-06-29' }))).toEqual(['post-calving-heat']);
  });

  it('replays an explicit diagnosis cancellation without retaining the old calving/recheck view', () => {
    const checked = { ...ai, pregnancyResult: '再鑑定予定', pregnancyCheckDate: '2026-10-01', recheckExpectedDate: '2026-10-15' };
    expect(kinds(projectBreedingPlans(checked, options))).toEqual(['recheck']);
    const cancelledDiagnosis = { ...checked, pregnancyResult: '未鑑定', pregnancyCheckDate: '', recheckExpectedDate: '' };
    expect(kinds(projectBreedingPlans(cancelledDiagnosis, options))).toEqual(['next-heat', 'pregnancy-check']);
  });

  it('replays an explicit transfer cancellation/removal without mutating schedule records', () => {
    expect(projectBreedingPlans({ ...et, breedingStatus: '中止' }, options).plans).toEqual([]);
    const undoneTransfer = { ...et, transferDate: '', breedingStatus: '移植予定' };
    expect(kinds(projectBreedingPlans(undoneTransfer, options))).toEqual(['transfer']);
  });

  it('recomputes from the supplied snapshot after a record is removed, with no cached old stage', () => {
    expect(postpartum([et]).plans).toEqual([]);
    expect(kinds(postpartum([]))).toEqual(['post-calving-heat']);
    expect(postpartum([], { latestCalvingDate: '' }).plans).toEqual([]);
  });

  it('does not change an input record, nested signs, options, or their timestamps', () => {
    const record = freezeDeep({ ...et, estrusSigns: ['鳴く'], createdAt: '2026-09-17T08:00:00Z', updatedAt: '2026-09-24T08:00:00Z' });
    const suppliedOptions = freezeDeep({ ...options, latestCalvingDate: '2026-08-29' });
    const records = freezeDeep([record]);
    const before = JSON.stringify({ record, suppliedOptions, records });
    projectBreedingPlans(record, suppliedOptions);
    postpartum(records);
    expect(JSON.stringify({ record, suppliedOptions, records })).toBe(before);
  });
});
