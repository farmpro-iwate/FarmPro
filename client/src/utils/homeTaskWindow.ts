import { addDays } from './breeding';
import { breedingPlanDaysUntil, type BreedingPlan } from './breedingPlans';

export type HomeTaskStatus = '期限超過' | '発情未確認' | '確認待ち' | '今日' | '近日中' | '継続中';

/** Calendar-day display rules only. Never completes or deletes source records. */
export function homeTaskStatus(date: string, today: string, title = ''): HomeTaskStatus | null {
  const remaining = breedingPlanDaysUntil(date, today);
  if (remaining === null || remaining < -7 || remaining > 7) return null;
  if (remaining < 0) {
    if (title.includes('発情')) return '発情未確認';
    if (title === '増し飼い検討') return '確認待ち';
    return '期限超過';
  }
  return remaining === 0 ? '今日' : '近日中';
}

/** The existing feed-review start is 60 days before expected calving.
 * Give that guidance a date for the home display only; calendars and animal
 * histories keep their original projection, dates, and completion rules. */
export function homeBreedingPlansInWindow(plans: readonly BreedingPlan[], today: string): BreedingPlan[] {
  const candidates = [...plans];
  for (const calving of plans.filter((item) => item.kind === 'calving' && item.date)) {
    if (!plans.some((item) => item.kind === 'feed-review' && item.sourceRecordId === calving.sourceRecordId)) {
      candidates.push({
        kind: 'feed-review', title: '増し飼い検討', date: null, dateSource: 'none',
        sourceRecordId: calving.sourceRecordId, relatedDate: calving.date!,
        note: '分娩予定日を目安に、体況と飼料内容を確認してください。',
      });
    }
  }
  return candidates.flatMap((item) => {
    const date = item.kind === 'feed-review' && item.relatedDate
      ? addDays(item.relatedDate, -60) : item.date;
    if (date === null) return [item];
    if (!homeTaskStatus(date, today, item.title)) return [];
    return [{ ...item, date }];
  });
}
