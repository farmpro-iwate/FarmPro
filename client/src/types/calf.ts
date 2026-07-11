export type CalfStatus = '販売予定' | '育成中' | '繁殖候補として留保' | '牛台帳へ移行済み' | '死亡・その他';

export type Calf = {
  id: number;
  calfNumber: string;
  identificationNumber: string;
  name: string;
  birthday: string;
  sex: string;
  motherName: string;
  startWeight: number;
  currentWeight: number;
  elapsedDays: number;
  milkAmount: number;
  starterAmount: number;
  managementStatus: CalfStatus;
  promotedCattleId?: number;
  promotedAt?: string;
  note: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CalfInput = {
  calfNumber: string;
  identificationNumber: string;
  name: string;
  birthday: string;
  sex: string;
  motherName: string;
  startWeight: number;
  currentWeight: number;
  elapsedDays: number;
  milkAmount: number;
  starterAmount: number;
  managementStatus: CalfStatus;
  note: string;
};