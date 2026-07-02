export type DashboardData = {
  counts: {
    cattle: number;
    calves: number;
    breedings: number;
    vaccines: number;
    blvPositive: number;
  };
  alerts: {
    nearCalvings: {
      id: number;
      cowName: string;
      cowEarTag: string;
      expectedCalvingDate: string;
      daysUntil: number | null;
    }[];
    vaccineDueSoon: {
      id: number;
      targetName: string;
      vaccineName: string;
      nextDueDate: string;
      daysUntil: number | null;
    }[];
    blvDueSoon: {
      id: number;
      cowName: string;
      result: string;
      nextTestDate: string;
      daysUntil: number | null;
    }[];
  };
};
