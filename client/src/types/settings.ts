export type FarmTaxRate = '10' | '8' | '0';

export type FarmSettings = {
  farmName: string;
  ownerName: string;
  staffName: string;
  phone: string;
  address: string;
  estrousCycleDays: number;
  defaultTaxRate: FarmTaxRate;
  bullMasters: string[];
  supplierMasters: string[];
  memo: string;
};
