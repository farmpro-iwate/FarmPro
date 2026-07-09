export type Cattle = {
  id: number;
  earTag: string;
  identificationNumber?: string;
  name: string;
  birthday: string;
  sire: string;
  dam: string;
  parity: number;
  blvStatus: string;
  note: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CattleInput = {
  earTag: string;
  identificationNumber: string;
  name: string;
  birthday: string;
  sire: string;
  dam: string;
  parity: number;
  blvStatus: string;
  note: string;
};
