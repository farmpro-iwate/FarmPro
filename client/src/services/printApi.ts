import { getCattleList } from './api';
import { getCalfList } from './calfApi';
import { getBreedingList } from './breedingApi';
import { getVaccineList } from './vaccineApi';
import { getBlvTestList } from './blvApi';
import { getScheduleList } from './scheduleApi';
import { getTreatmentList } from './treatmentApi';

export type PrintKind = 'cattle' | 'calves' | 'breedings' | 'vaccines' | 'blv' | 'schedules' | 'treatments';

export type PrintColumn = {
  key: string;
  label: string;
};

export type PrintConfig = {
  title: string;
  columns: PrintColumn[];
};

export const printConfigs: Record<PrintKind, PrintConfig> = {
  cattle: {
    title: '牛台帳一覧',
    columns: [
      { key: 'earTag', label: '耳標番号' },
      { key: 'name', label: '名号' },
      { key: 'birthday', label: '生年月日' },
      { key: 'sire', label: '父牛' },
      { key: 'dam', label: '母牛' },
      { key: 'blvStatus', label: 'BLV' }
    ]
  },
  calves: {
    title: '子牛一覧',
    columns: [
      { key: 'calfNumber', label: '子牛番号' },
      { key: 'name', label: '名号' },
      { key: 'birthday', label: '生年月日' },
      { key: 'sex', label: '性別' },
      { key: 'motherName', label: '母牛' },
      { key: 'currentWeight', label: '現在体重' }
    ]
  },
  breedings: {
    title: '繁殖記録一覧',
    columns: [
      { key: 'cowEarTag', label: '耳標番号' },
      { key: 'cowName', label: '牛名' },
      { key: 'inseminationDate', label: '授精日' },
      { key: 'bullName', label: '種雄牛' },
      { key: 'pregnancyResult', label: '妊娠結果' },
      { key: 'expectedCalvingDate', label: '分娩予定日' }
    ]
  },
  vaccines: {
    title: 'ワクチン記録一覧',
    columns: [
      { key: 'targetNumber', label: '対象番号' },
      { key: 'targetName', label: '対象名' },
      { key: 'vaccineName', label: 'ワクチン名' },
      { key: 'vaccinationDate', label: '接種日' },
      { key: 'nextDueDate', label: '次回予定日' },
      { key: 'status', label: '状態' }
    ]
  },
  blv: {
    title: 'BLV検査記録一覧',
    columns: [
      { key: 'cowEarTag', label: '耳標番号' },
      { key: 'cowName', label: '牛名' },
      { key: 'testDate', label: '検査日' },
      { key: 'result', label: '結果' },
      { key: 'nextTestDate', label: '次回検査日' },
      { key: 'isolationMemo', label: '隔離メモ' }
    ]
  },
  schedules: {
    title: '予定一覧',
    columns: [
      { key: 'scheduleType', label: '予定区分' },
      { key: 'title', label: 'タイトル' },
      { key: 'targetNumber', label: '対象番号' },
      { key: 'targetName', label: '対象名' },
      { key: 'dueDate', label: '予定日' },
      { key: 'status', label: '状態' }
    ]
  },
  treatments: {
    title: '治療記録一覧',
    columns: [
      { key: 'targetNumber', label: '対象番号' },
      { key: 'targetName', label: '対象名' },
      { key: 'symptom', label: '症状' },
      { key: 'treatmentDate', label: '治療日' },
      { key: 'medicine', label: '使用薬剤' },
      { key: 'progress', label: '経過' },
      { key: 'withdrawalEndDate', label: '休薬終了日' }
    ]
  }
};

export async function getPrintData(kind: PrintKind) {
  if (kind === 'cattle') return getCattleList();
  if (kind === 'calves') return getCalfList();
  if (kind === 'breedings') return getBreedingList();
  if (kind === 'vaccines') return getVaccineList();
  if (kind === 'blv') return getBlvTestList();
  if (kind === 'schedules') return getScheduleList();
  return getTreatmentList();
}
