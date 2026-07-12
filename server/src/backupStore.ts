import { readJson, writeJson } from './jsonStore';
import { Cattle } from './dataStore';
import { Calf } from './calfStore';
import { Breeding } from './breedingStore';
import { Vaccine } from './vaccineStore';
import { BlvTest } from './blvStore';
import { Schedule } from './scheduleStore';
import { Treatment } from './treatmentStore';

export type FarmProBackup = {
  app: string;
  version: string;
  exportedAt: string;
  data: {
    cattle: Cattle[];
    calves: Calf[];
    breedings: Breeding[];
    vaccines: Vaccine[];
    blvTests: BlvTest[];
    schedules: Schedule[];
    treatments: Treatment[];
    sales: unknown[];
    expenses: unknown[];
    feedings: unknown[];
    feedInventory: unknown[];
    feedingGuide: unknown[];
    feedingAlertActions: unknown[];
    settings: Record<string, unknown>;
  };
};

export async function exportBackup(): Promise<FarmProBackup> {
  return {
    app: '繁殖Farm Pro',
    version: '1.12.0-complete-backup',
    exportedAt: new Date().toISOString(),
    data: {
      cattle: await readJson<Cattle>('cattle.json'),
      calves: await readJson<Calf>('calves.json'),
      breedings: await readJson<Breeding>('breedings.json'),
      vaccines: await readJson<Vaccine>('vaccines.json'),
      blvTests: await readJson<BlvTest>('blvTests.json'),
      schedules: await readJson<Schedule>('schedules.json'),
      treatments: await readJson<Treatment>('treatments.json'),
      sales: await readJson<unknown[]>('sales.json', []),
      expenses: await readJson<unknown[]>('expenses.json', []),
      feedings: await readJson<unknown[]>('feedings.json', []),
      feedInventory: await readJson<unknown[]>('feedInventory.json', []),
      feedingGuide: await readJson<unknown[]>('feedingGuide.json', []),
      feedingAlertActions: await readJson<unknown[]>('feedingAlertActions.json', []),
      settings: await readJson<Record<string, unknown>>('settings.json', {})
    }
  };
}

function isArray(value: unknown) {
  return Array.isArray(value);
}

function optionalArray(value: unknown) {
  return isArray(value) ? value : [];
}

function optionalObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function importBackup(backup: FarmProBackup) {
  if (!backup || !backup.data) {
    throw new Error('INVALID_BACKUP');
  }

  const { data } = backup;

  if (
    !isArray(data.cattle) ||
    !isArray(data.calves) ||
    !isArray(data.breedings) ||
    !isArray(data.vaccines) ||
    !isArray(data.blvTests) ||
    !isArray(data.schedules) ||
    !isArray(data.treatments)
  ) {
    throw new Error('INVALID_BACKUP_DATA');
  }

  const sales = optionalArray(data.sales);
  const expenses = optionalArray(data.expenses);
  const feedings = optionalArray(data.feedings);
  const feedInventory = optionalArray(data.feedInventory);
  const feedingGuide = optionalArray(data.feedingGuide);
  const feedingAlertActions = optionalArray(data.feedingAlertActions);
  const settings = optionalObject(data.settings);

  await writeJson('cattle.json', data.cattle);
  await writeJson('calves.json', data.calves);
  await writeJson('breedings.json', data.breedings);
  await writeJson('vaccines.json', data.vaccines);
  await writeJson('blvTests.json', data.blvTests);
  await writeJson('schedules.json', data.schedules);
  await writeJson('treatments.json', data.treatments);
  await writeJson('sales.json', sales);
  await writeJson('expenses.json', expenses);
  await writeJson('feedings.json', feedings);
  await writeJson('feedInventory.json', feedInventory);
  await writeJson('feedingGuide.json', feedingGuide);
  await writeJson('feedingAlertActions.json', feedingAlertActions);
  await writeJson('settings.json', settings);

  return {
    importedAt: new Date().toISOString(),
    counts: {
      cattle: data.cattle.length,
      calves: data.calves.length,
      breedings: data.breedings.length,
      vaccines: data.vaccines.length,
      blvTests: data.blvTests.length,
      schedules: data.schedules.length,
      treatments: data.treatments.length,
      sales: sales.length,
      expenses: expenses.length,
      feedings: feedings.length,
      feedInventory: feedInventory.length,
      feedingGuide: feedingGuide.length,
      feedingAlertActions: feedingAlertActions.length,
      settings: Object.keys(settings).length > 0 ? 1 : 0
    }
  };
}
