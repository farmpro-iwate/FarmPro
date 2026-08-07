export type CattleStage = '育成牛' | '繁殖牛';
export type CattleSex = '雌' | '雄' | '去勢';

export type Cattle = {
  id: number;
  earTag: string;
  identificationNumber?: string;
  name: string;
  birthday: string;
  sex: CattleSex;
  sire: string;
  dam: string;
  parity: number;
  blvStatus: string;
  stage?: CattleStage;
  sourceCalfId?: number;
  note: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CattleInput = {
  earTag: string;
  identificationNumber: string;
  name: string;
  birthday: string;
  sex: CattleSex;
  sire: string;
  dam: string;
  parity: number;
  blvStatus: string;
  stage?: CattleStage;
  sourceCalfId?: number;
  note: string;
};