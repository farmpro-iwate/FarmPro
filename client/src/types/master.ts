export type MasterCategory = 'bull' | 'feed' | 'medicine' | 'partner';

export type MasterItem = {
  id: number;
  category: MasterCategory;
  name: string;
  code: string;
  detail: string;
  note: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type MasterInput = Omit<MasterItem, 'id' | 'createdAt' | 'updatedAt'>;
