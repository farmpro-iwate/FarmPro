export type Schedule = {
  id: number;
  scheduleType: string;
  title: string;
  targetNumber: string;
  targetName: string;
  dueDate: string;
  status: string;
  note: string;
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
};
