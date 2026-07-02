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
  };
};

export async function exportBackup(): Promise<FarmProBackup> {
  return {
    app: '繁殖Farm Pro',
    version: '1.11.0-backup',
    exportedAt: new Date().toISOString(),
    data: {
      cattle: await readJson<Cattle>('cattle.json'),
      calves: await readJson<Calf>('calves.json'),
      breedings: await readJson<Breeding>('breedings.json'),
      vaccines: await readJson<Vaccine>('vaccines.json'),
      blvTests: await readJson<BlvTest>('blvTests.json'),
      schedules: await readJson<Schedule>('schedules.json'),
      treatments: await readJson<Treatment>('treatments.json')
    }
  };
}

function isArray(value: unknown) {
  return Array.isArray(value);
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

  await writeJson('cattle.json', data.cattle);
  await writeJson('calves.json', data.calves);
  await writeJson('breedings.json', data.breedings);
  await writeJson('vaccines.json', data.vaccines);
  await writeJson('blvTests.json', data.blvTests);
  await writeJson('schedules.json', data.schedules);
  await writeJson('treatments.json', data.treatments);

  return {
    importedAt: new Date().toISOString(),
    counts: {
      cattle: data.cattle.length,
      calves: data.calves.length,
      breedings: data.breedings.length,
      vaccines: data.vaccines.length,
      blvTests: data.blvTests.length,
      schedules: data.schedules.length,
      treatments: data.treatments.length
    }
  };
}
