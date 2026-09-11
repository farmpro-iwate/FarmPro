export type FarmTaxRate = '10' | '8' | '0';
export type FarmExpenseAllocation = 'none' | 'equal';

export type FarmSettings = {
  farmName: string;
  ownerName: string;
  staffName: string;
  phone: string;
  address: string;
  estrousCycleDays: number;
  defaultTaxRate: FarmTaxRate;
  farmExpenseAllocation: FarmExpenseAllocation;
  bullMasters: string[];
  supplierMasters: string[];
  memo: string;
};
