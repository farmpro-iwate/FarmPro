export type CattleStage = '育成牛' | '繁殖牛';

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
  stage?: CattleStage;
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
  stage?: CattleStage;
  note: string;
};