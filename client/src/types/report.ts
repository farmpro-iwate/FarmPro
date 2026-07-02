export type ReportSummary = {
  counts: {
    cattle: number;
    calves: number;
    breedings: number;
    vaccines: number;
    blvPositive: number;
    openSchedules: number;
    activeTreatments: number;
    withdrawal: number;
  };
  nearSchedules: {
    id: number;
    scheduleType: string;
    title: string;
    targetName: string;
    dueDate: string;
    daysUntil: number | null;
  }[];
  withdrawalTreatments: {
    id: number;
    targetName: string;
    medicine: string;
    withdrawalEndDate: string;
    daysUntil: number | null;
  }[];
};
