export type Vaccine = {
  id: number;
  targetType: string;
  targetNumber: string;
  targetName: string;
  vaccineName: string;
  vaccinationDate: string;
  nextDueDate: string;
  status: string;
  note: string;
  createdAt?: string;
  updatedAt?: string;
};

export type VaccineInput = {
  targetType: string;
  targetNumber: string;
  targetName: string;
  vaccineName: string;
  vaccinationDate: string;
  nextDueDate: string;
  status: string;
  note: string;
};
