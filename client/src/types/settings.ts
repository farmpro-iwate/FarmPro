export type CalfManagementMode = 'かんたん' | '詳細';

export type FarmSettings = {
  farmName: string;
  ownerName: string;
  staffName: string;
  phone: string;
  address: string;
  estrousCycleDays: number;
  calfManagementMode?: CalfManagementMode;
  bullMasters: string[];
  supplierMasters: string[];
  memo: string;
};