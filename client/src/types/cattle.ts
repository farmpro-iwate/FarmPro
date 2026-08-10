export type CattleStage = '育成牛' | '繁殖牛';
export type CattleSex = '雌' | '雄' | '去勢';

export type ImportedOffspringHistory = {
  parity: string;
  name: string;
  birthday: string;
  sire: string;
};

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
  registrationNumber?: string;
  sourceReferenceNumber?: string;
  maternalSire?: string;
  maternalGrandSire?: string;
  importedOffspringHistory?: ImportedOffspringHistory[];
  importSourceFileName?: string;
  importSourceType?: 'ai-document';
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
  registrationNumber?: string;
  sourceReferenceNumber?: string;
  maternalSire?: string;
  maternalGrandSire?: string;
  importedOffspringHistory?: ImportedOffspringHistory[];
  importSourceFileName?: string;
  importSourceType?: 'ai-document';
};