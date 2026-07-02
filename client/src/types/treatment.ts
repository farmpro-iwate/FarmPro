export type Treatment = {
  id: number;
  targetNumber: string;
  targetName: string;
  symptom: string;
  diagnosis: string;
  treatmentDate: string;
  medicine: string;
  dosage: string;
  withdrawalEndDate: string;
  veterinarian: string;
  progress: string;
  note: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TreatmentInput = {
  targetNumber: string;
  targetName: string;
  symptom: string;
  diagnosis: string;
  treatmentDate: string;
  medicine: string;
  dosage: string;
  withdrawalEndDate: string;
  veterinarian: string;
  progress: string;
  note: string;
};
