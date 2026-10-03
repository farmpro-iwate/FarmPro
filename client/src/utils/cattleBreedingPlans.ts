import {
  breedingPlanDate, breedingPlanDaysUntil, projectBreedingPlans, projectPostCalvingHeat,
  type BreedingPlan, type BreedingPlanRecord,
} from './breedingPlans';

export type PlanRow = Readonly<Record<string, any>>;
export type PlanAnimal = Readonly<{ id?: string | number; earTag?: string; name?: string }>;
export type CattlePlanSnapshot = Readonly<{
  breedings: readonly PlanRow[];
  calvings: readonly PlanRow[];
  sales: readonly PlanRow[];
  cycleDays: number;
  postCalvingHeatDays?: number;
  unavailable: readonly string[];
}>;
export type CattlePlanSummary = {
  plans: BreedingPlan[];
  issues: string[];
  latestCalvingDate: string;
  currentRecord?: BreedingPlanRecord;
  isSold: boolean;
};

const text = (value: unknown) => String(value ?? '').trim();
const explicitIdentityFields = ['cattleId', 'targetCattleId', 'cowEarTag', 'targetNumber', 'earTag', 'cowId'] as const;
const hasExplicitIdentity = (row: PlanRow) => explicitIdentityFields.some((key) => Boolean(text(row[key])));
const identityDetails = (row: PlanRow) => {
  const parts = [
    ['記録ID', row.id],
    ['cattleId', row.cattleId],
    ['targetCattleId', row.targetCattleId],
    ['cowId', row.cowId],
    ['cowEarTag', row.cowEarTag],
    ['targetNumber', row.targetNumber],
    ['earTag', row.earTag],
  ].filter(([, value]) => Boolean(text(value)))
    .map(([label, value]) => `${label}=${text(value)}`);
  return parts.join(' / ');
};

const rowReferenceDate = (row: PlanRow): string => {
  const candidates = [
    row.actualCalvingDate, row.calvingDate,
    row.heatDate, row.inseminationDate, row.serviceDate, row.transferDate, row.actualTransferDate,
    row.transferPlannedDate, row.pregnancyCheckDate, row.pregnancyDiagnosisDate,
    row.saleDate, row.shippingDate, row.date,
  ].map((value) => breedingPlanDate(value)).filter((value): value is string => Boolean(value));
  return candidates.sort().pop() || '';
};

export function localCattlePlanToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Match only explicit identifiers. A name is never sufficient, and a matching
 * identifier must not override another identifier that contradicts it. */
export function planAnimalMatch(row: PlanRow, animal: PlanAnimal): 'match' | 'other' | 'uncertain' {
  const ids = [row.cattleId, row.targetCattleId].map(text).filter(Boolean);
  const tags = [row.cowEarTag, row.targetNumber, row.earTag].map(text).filter(Boolean);
  // Legacy/current calving forms have used cowId for the mother ear tag, while
  // older records may use it as an internal cattle id. Treat it as an explicit
  // identifier that may match either field, but never as a name.
  const legacyCowId = text(row.cowId);
  const id = text(animal.id);
  const tag = text(animal.earTag);
  const sameId = Boolean(id && ids.includes(id));
  const sameTag = Boolean(tag && tags.includes(tag));
  const sameLegacyCowId = Boolean(legacyCowId && (legacyCowId === id || legacyCowId === tag));
  if (sameId || sameTag || sameLegacyCowId) {
    if ((id && ids.some((value) => value !== id)) || (tag && tags.some((value) => value !== tag))) return 'uncertain';
    return 'match';
  }
  if (ids.length || tags.length || legacyCowId) return 'other';
  const names = [row.cowName, row.targetName].map(text).filter(Boolean);
  return text(animal.name) && names.includes(text(animal.name)) ? 'uncertain' : 'other';
}

const activityFields = ['heatDate', 'inseminationDate', 'serviceDate', 'transferDate', 'actualTransferDate'] as const;
const state = (row: PlanRow) => text(row.breedingStatus || row.status);
const pregnant = (row: PlanRow) => ['受胎', '妊娠'].includes(text(row.pregnancyResult));
const performed = (row: PlanRow) => Boolean(row.inseminationDate || row.serviceDate || row.transferDate || row.actualTransferDate);
const meaningful = (row: PlanRow) => [...activityFields, 'transferPlannedDate', 'pregnancyCheckDate', 'pregnancyDiagnosisDate', 'nextHeatExpectedDate', 'pregnancyCheckExpectedDate', 'expectedCalvingDate', 'recheckExpectedDate']
  .some((key) => text(row[key])) || (text(row.pregnancyResult) !== '' && row.pregnancyResult !== '未鑑定') ||
  ['分娩済み', '中止', '種付実施', '移植実施', '移植予定', '発情確認'].includes(state(row));
const heatOnly = (row: PlanRow) => Boolean(row.heatDate) && !performed(row) && !row.transferPlannedDate &&
  (!row.pregnancyResult || row.pregnancyResult === '未鑑定') && !['分娩済み', '中止'].includes(state(row));

function issueText(code: string): string {
  if (code === 'missing-et-heat') return 'ETの発情日が未登録です。繁殖記録を確認してください。';
  if (code === 'missing-result') return '妊娠鑑定の結果が未登録です。繁殖記録を確認してください。';
  if (code === 'missing-date') return '予定日が未登録または不正です。繁殖記録を確認してください。';
  if (code === 'invalid-cycle-days') return '発情周期の設定を確認してください。';
  if (code === 'future-activity') return '実施日が未来になっています。繁殖記録を確認してください。';
  if (code === 'missing-activity') return '現在の繁殖周期を判定できません。発情日・実施日を確認してください。';
  return '繁殖記録に不明・不正・矛盾のある項目があります。記録を確認してください。';
}

/** Pure selection plus projection, shared by list and detail. No fetch, storage,
 * completion, inferred status updates, or name-based merging takes place here. */
export function resolveCattleBreedingPlans(animal: PlanAnimal, snapshot: CattlePlanSnapshot, today: string): CattlePlanSummary {
  const result: CattlePlanSummary = { plans: [], issues: [], latestCalvingDate: '', isSold: false };
  const warn = (message: string) => { if (!result.issues.includes(message)) result.issues.push(message); };
  if (!breedingPlanDate(today)) { warn('今日の日付を確認できません。'); return result; }
  if (!text(animal.id) && !text(animal.earTag)) { warn('対象牛の識別情報を確認してください。'); return result; }
  if (snapshot.unavailable.length) {
    warn(`繁殖予定の確認に必要な情報を読み込めませんでした（${snapshot.unavailable.join('・')}）。画面を開き直してください。`);
    return result;
  }
  const identityWarning = '耳標番号と個体情報の対応を確認してください。牛名だけでは予定を結び付けていません。';
  const splitMatches = (rows: readonly PlanRow[], sourceLabel: string) => {
    const matched: PlanRow[] = [];
    const nameOnly: PlanRow[] = [];
    for (const row of rows) {
      const match = planAnimalMatch(row, animal);
      if (match === 'match') matched.push(row);
      else if (match === 'uncertain') {
        if (hasExplicitIdentity(row)) {
          const detail = identityDetails(row);
          warn(`${identityWarning}［${sourceLabel}${detail ? `：${detail}` : ''}］`);
        } else nameOnly.push(row);
      }
    }
    return { matched, nameOnly };
  };

  const salesSplit = splitMatches(snapshot.sales.filter((row) => !row.deletedAt && row.status === '販売済み' && row.targetType === '成牛'), '販売記録');
  if (result.issues.length) return result;
  if (salesSplit.matched.length) { result.isSold = true; return result; }
  // A name-only sold record cannot be proven stale safely enough to ignore.
  if (salesSplit.nameOnly.length) { warn(identityWarning); return result; }

  const calvingSplit = splitMatches(snapshot.calvings.filter((row) => !row.deletedAt), '分娩記録');
  const breedingSplit = splitMatches(snapshot.breedings.filter((row) => !row.deletedAt && meaningful(row)), '繁殖記録');
  if (result.issues.length) return result;

  const explicitAnchorDate = [
    ...calvingSplit.matched.map(rowReferenceDate),
    ...breedingSplit.matched.map(rowReferenceDate),
  ].filter(Boolean).sort().pop() || '';

  const hasExplicitMatchedEvidence = calvingSplit.matched.length > 0 || breedingSplit.matched.length > 0;
  const relevantNameOnly = [...calvingSplit.nameOnly, ...breedingSplit.nameOnly].filter((row) => {
    const date = rowReferenceDate(row);
    if (!date) return !hasExplicitMatchedEvidence;
    return !explicitAnchorDate || date >= explicitAnchorDate;
  });
  if (relevantNameOnly.length) {
    warn(identityWarning);
    return result;
  }

  const calvings = calvingSplit.matched;
  const rows = breedingSplit.matched;

  const calvingDates: string[] = [];
  for (const row of calvings) {
    const raw = row.actualCalvingDate || row.calvingDate;
    if (!text(raw)) continue; // A plan is not an actual calving.
    const date = breedingPlanDate(raw);
    if (!date || date > today) warn('実際の分娩日が不正または未来です。分娩記録を確認してください。');
    else calvingDates.push(date);
  }
  result.latestCalvingDate = calvingDates.sort().pop() || '';
  if (result.issues.length) return result;

  const candidates: { row: PlanRow; date: string }[] = [];
  for (const row of rows) {
    const actuals = activityFields.map((key) => breedingPlanDate(row[key])).filter((value): value is string => Boolean(value));
    const lastActual = actuals.slice().sort().pop() || '';
    // An old service remains old even when its diagnosis or updatedAt is newer.
    if (result.latestCalvingDate && lastActual && lastActual < result.latestCalvingDate) continue;
    if (result.latestCalvingDate && lastActual === result.latestCalvingDate) {
      if (state(row) === '分娩済み' || calvings.some((item) => text(item.breedingId) && text(item.breedingId) === text(row.id))) continue;
      warn('分娩日と同日の繁殖記録があります。対象の繁殖周期を確認してください。');
      continue;
    }
    if (activityFields.some((key) => text(row[key]) && !breedingPlanDate(row[key]))) {
      warn('発情日・実施日が不正です。繁殖記録を確認してください。');
      continue;
    }
    const heat = breedingPlanDate(row.heatDate);
    const service = breedingPlanDate(row.transferDate || row.actualTransferDate || row.inseminationDate || row.serviceDate);
    if (heat && service && (service < heat || (result.latestCalvingDate && heat <= result.latestCalvingDate && service > result.latestCalvingDate))) {
      warn('発情日と実施日の順序・繁殖周期を確認してください。');
      continue;
    }
    // Keep terminal records as barriers: dropping the newest closed record would
    // incorrectly resurrect an older open cycle when calvings are unavailable.
    const date = heat || service || breedingPlanDate(row.transferPlannedDate) || '';
    if (!text(row.id)) { warn('繁殖記録の識別情報を確認してください。'); continue; }
    candidates.push({ row, date });
  }
  if (result.issues.length) return result;
  if (candidates.length) {
    const undated = candidates.filter((item) => !item.date);
    if (undated.length && (candidates.length > 1 || result.latestCalvingDate)) {
      warn('現在の繁殖周期を判定できません。発情日・実施日を確認してください。');
      return result;
    }
    const latest = candidates.map((item) => item.date).sort().pop() || '';
    let latestRows = candidates.filter((item) => item.date === latest).map((item) => item.row);
    // Collapse only a separate heat-only entry with one same-heat service.
    // Two distinct services are not duplicates merely because dates coincide.
    const progressed = latestRows.filter((row) => !heatOnly(row));
    if (progressed.length === 1 && latestRows.every((row) => row === progressed[0] || (heatOnly(row) && breedingPlanDate(row.heatDate) === breedingPlanDate(progressed[0].heatDate)))) latestRows = progressed;
    const unique = new Map<string, PlanRow>();
    for (const row of latestRows) {
      const key = text(row.id);
      const prior = unique.get(key);
      if (prior && JSON.stringify(prior) !== JSON.stringify(row)) warn('同じ繁殖記録に異なる内容があります。記録を確認してください。');
      unique.set(key, row);
    }
    if (unique.size !== 1) warn('現在の繁殖周期に複数の記録があります。記録を確認してください。');
    if (candidates.some((item) => item.date < latest && pregnant(item.row) && !['分娩済み', '中止'].includes(state(item.row)))) {
      warn('受胎記録と新しい繁殖記録が重なっています。結果を確認してください。');
    }
    if (result.issues.length) return result;
    const current = Array.from(unique.values())[0] as BreedingPlanRecord;
    result.currentRecord = current;
    if ((state(current) === '種付実施' && !current.inseminationDate && !current.serviceDate) ||
        (state(current) === '移植実施' && !current.transferDate && !current.actualTransferDate) ||
        (state(current) === '発情確認' && !current.heatDate)) {
      warn('実施状態に対応する日付が未登録です。繁殖記録を確認してください。');
      return result;
    }
    const projection = projectBreedingPlans(current, { today, cycleDays: snapshot.cycleDays });
    result.plans = projection.plans;
    projection.issues.forEach((item) => warn(issueText(item.code)));
  } else {
    // All candidates have been proven to belong before the latest calving.
    // Do not let a late edit of an old diagnosis suppress postpartum guidance.
    const projection = projectPostCalvingHeat({ latestCalvingDate: result.latestCalvingDate, breedings: [], today, postCalvingHeatDays: snapshot.postCalvingHeatDays });
    result.plans = projection.plans;
    projection.issues.forEach((item) => warn(issueText(item.code)));
  }
  return result;
}

export function hasCattlePlanAttention(summary: CattlePlanSummary, today: string): boolean {
  if (summary.issues.length) return true;
  return summary.plans.some((item) => item.date === null ||
    (breedingPlanDaysUntil(item.date, today) ?? Infinity) <= (item.kind === 'calving' ? 60 : 14));
}

export function cattlePlanDestination(item: BreedingPlan, animal: PlanAnimal, returnTo: string): { to: string; label: string } {
  const context = new URLSearchParams({ targetNumber: text(animal.earTag), targetName: text(animal.name), cattleId: text(animal.id), returnTo }).toString();
  const suffix = `?returnTo=${encodeURIComponent(returnTo)}`;
  const id = item.sourceRecordId ? encodeURIComponent(item.sourceRecordId) : '';
  if (item.kind === 'post-calving-heat' || item.kind === 'next-heat') return { to: `/breedings/new?${context}`, label: '発情を登録' };
  if (item.kind === 'calving') return { to: `/calvings/new?${context}`, label: '分娩を登録' };
  if (item.kind === 'feed-review') return { to: `/cattle/${encodeURIComponent(text(animal.id))}`, label: '個体カルテを確認' };
  if (!id) return { to: '/breedings', label: '繁殖記録を確認' };
  if (item.kind === 'transfer') return { to: `/breedings/${id}/${item.date ? 'transfer' : 'edit'}${suffix}`, label: item.date ? '受精卵移植を実施' : 'ET予定を確認' };
  if (item.kind === 'pregnancy-check' || item.kind === 'recheck') return { to: `/pregnancy-checks/${id}/edit${suffix}`, label: item.kind === 'recheck' ? '再鑑定を登録' : '妊娠鑑定を登録' };
  return { to: `/breedings/${id}/edit${suffix}`, label: '繁殖記録を確認' };
}
