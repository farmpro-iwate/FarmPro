export type Calf = {
  id: number;
  calfNumber: string;
  name: string;
  birthday: string;
  sex: string;
  motherName: string;
  startWeight: number;
  currentWeight: number;
  elapsedDays: number;
  milkAmount: number;
  starterAmount: number;
  note: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CalfInput = {
  calfNumber: string;
  name: string;
  birthday: string;
  sex: string;
  motherName: string;
  startWeight: number;
  currentWeight: number;
  elapsedDays: number;
  milkAmount: number;
  starterAmount: number;
  note: string;
};
