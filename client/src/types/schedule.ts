export type Schedule = {
  id: number;
  scheduleType: string;
  title: string;
  targetNumber: string;
  targetName: string;
  dueDate: string;
  status: string;
  note: string;
  synchronizationProgramId?: string;
  synchronizationProgramName?: string;
  synchronizationPurpose?: '発情同期化' | '排卵同期化' | '定時人工授精' | 'ET向け' | '';
  synchronizationStartDate?: string;
  synchronizationStep?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ScheduleInput = {
  scheduleType: string;
  title: string;
  targetNumber: string;
  targetName: string;
  dueDate: string;
  status: string;
  note: string;
  synchronizationProgramId?: string;
  synchronizationProgramName?: string;
  synchronizationPurpose?: '発情同期化' | '排卵同期化' | '定時人工授精' | 'ET向け' | '';
  synchronizationStartDate?: string;
  synchronizationStep?: string;
};

export type SynchronizationProgramStep = {
  dayOffset: number;
  title: string;
  scheduleType?: string;
  note?: string;
};

export type SynchronizationProgramInput = {
  programName: string;
  purpose: '発情同期化' | '排卵同期化' | '定時人工授精' | 'ET向け';
  startDate: string;
  targetNumber: string;
  targetName: string;
  steps: SynchronizationProgramStep[];
};
