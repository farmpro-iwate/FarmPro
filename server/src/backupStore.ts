import { readJson, writeJson } from './jsonStore';
import { Cattle } from './dataStore';
import { Calf } from './calfStore';
import { Breeding } from './breedingStore';
import { Vaccine } from './vaccineStore';
import { BlvTest } from './blvStore';
import { Schedule } from './scheduleStore';
import { Treatment } from './treatmentStore';

export type BackupFarm = {
  id: string;
  name: string