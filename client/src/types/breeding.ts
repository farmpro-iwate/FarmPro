export type Breeding = {
  id: number;
  cowEarTag: string;
  cowName: string;
  heatDate: string;
  breedingMethod: string;
  breedingStatus: string;
  inseminationDate: string;
  bullName: string;
  transferPlannedDate: string;
  transferDate: string;
  transferCancelReason: string;
  nextHeatExpectedDate: string;
  pregnancyCheckExpectedDate: string;
  pregnancyCheckDate: string;
  pregnancyResult: string;
  recheckExpectedDate: string;
  expectedCalvingDate: string;
  note: string;
  createdAt?: string;
  updatedAt?: string;
};

export type BreedingInput = Omit<Breeding, 'id' | 'createdAt' | 'updatedAt'>;