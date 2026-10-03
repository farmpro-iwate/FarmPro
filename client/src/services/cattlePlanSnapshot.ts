import { getBreedingList } from './breedingApi';
import { getSalesList } from './salesApi';
import { getFarmSettings } from './settingsApi';
import { getAllRecords } from '../storage/repository';
import { pullNewerCalvingRecordsFromCloud } from './calvingsApi';
import type { CattlePlanSnapshot, PlanRow } from '../utils/cattleBreedingPlans';

/** Both cattle screens use these same readers once per page load. Existing
 * reader/cloud policies are unchanged. Failed reads must not mean no plans. */
export async function getCattlePlanSnapshot(): Promise<CattlePlanSnapshot> {
  const unavailable: string[] = [];
  const readRows = async (label: string, read: () => Promise<unknown>): Promise<PlanRow[]> => {
    try {
      const rows = await read();
      if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Invalid record list');
      return rows;
    } catch {
      unavailable.push(label);
      return [];
    }
  };
  const readCycleDays = async (): Promise<number> => {
    try {
      const settings = await getFarmSettings();
      // An absent setting uses the existing application default; invalid
      // explicit settings remain invalid and are reported by the projection.
      return settings?.estrousCycleDays ?? 21;
    } catch {
      unavailable.push('農場設定');
      return 21;
    }
  };
  const [breedings, calvings, sales, cycleDays] = await Promise.all([
    readRows('繁殖記録', getBreedingList),
    readRows('分娩記録', async () => {
      try {
        await pullNewerCalvingRecordsFromCloud();
      } catch (error) {
        console.warn('繁殖予定用の分娩記録クラウド取り込みをスキップしました', error);
      }
      return getAllRecords<PlanRow & { id: string | number }>('calvings');
    }),
    readRows('販売記録', getSalesList),
    readCycleDays(),
  ]);
  return { breedings, calvings, sales, cycleDays, unavailable: unavailable.sort() };
}
