import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord
} from '../storage/repository';
import { openFarmProDatabase } from '../storage/db';

export type CalvingRecord = {
  id?: string;
  cowId?: string;
  cowName?: string;
  expectedCalvingDate?: string;
  actualCalvingDate?: string;
  calfName?: string;
  calfSex?: string;
  birthWeightKg?: number | string;
  calvingResult?: