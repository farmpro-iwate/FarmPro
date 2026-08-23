export type SynchronizationPurpose = '発情同期化' | '排卵同期化' | '定時人工授精' | 'ET向け';

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
  synchronizationPurpose?: SynchronizationPurpose | '';
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
  synchronizationPurpose?: SynchronizationPurpose | '';
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
  purpose: SynchronizationPurpose;
  startDate: string;
  targetNumber: string;
  targetName: string;
  steps: SynchronizationProgramStep[];
};

export type SynchronizationProgramTemplate = {
  id: string;
  recordType: 'synchronization-program-template';
  templateName: string;
  purpose: SynchronizationPurpose;
  steps: SynchronizationProgramStep[];
  note?: string;
  createdAt?: string;
  updatedAt?: string;
};
