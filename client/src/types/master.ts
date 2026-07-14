export type MasterCategory = 'sire' | 'feed' | 'medicine' | 'partner' | 'veterinarian' | 'inseminator' | 'expenseCategory' | 'disease' | 'treatmentProcedure';

export type Master = {
  id: number;
  category: MasterCategory;
  name: string;
  code?: string;
  earTag?: string;
  note?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MasterInput = {
  category: MasterCategory;
  name: string;
  code?: string;
  earTag?: string;
  note?: string;
};

export const masterCategoryLabels: Record<MasterCategory, string> = {
  sire: '種雄牛',
  feed: '飼料',
  medicine: '薬品・ワクチン',
  partner: '取引先',
  veterinarian: '獣医師',
  inseminator: '授精師',
  expenseCategory: '経費科目',
  disease: '疾病',
  treatmentProcedure: '処置内容'
};
