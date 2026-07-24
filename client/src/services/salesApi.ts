import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';

export type SaleStatus = '出荷予定' | '出荷済み' | '販売済み' | '取消';
export type TargetType = '子牛' | '成牛' | 'その他';

export type SaleRecord = {
  id: string;
  targetType: TargetType;
  targetNumber: string;
  targetName: string;
  sex: string;
  birthday: string;
  motherName: string;
  shippingPlanDate: string;
  shippingDate: string;
  saleDate: string;
  buyer: string;
  marketName: string;
  saleWeight: string;
  salePrice: string;
  status: SaleStatus;
  reason: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

export type SaleInput = Omit<
  SaleRecord,
  'id' | 'createdAt' | 'updatedAt'
>;

export const emptySaleInput: SaleInput = {
  targetType: '子牛',
  targetNumber: '',
  targetName: '',
  sex: '',
  birthday: '',
  motherName: '',
  shippingPlanDate: '',
  shippingDate: '',
  saleDate: '',
  buyer: '',
  marketName: '',
  saleWeight: '',
  salePrice: '',
  status: '出荷予定',
  reason: '',
  memo: '',
};

export function recordToInput(record: SaleRecord): SaleInput {
  return {
    targetType: record.targetType || '子牛',
    targetNumber: record.targetNumber || '',
    targetName: record.targetName || '',
    sex: record.sex || '',
    birthday: record.birthday || '',
    motherName: record.motherName || '',
    shippingPlanDate: record.shippingPlanDate || '',
    shippingDate: record.shippingDate || '',
    saleDate: record.saleDate || '',
    buyer: record.buyer || '',
    marketName: record.marketName || '',
    saleWeight: record.saleWeight || '',
    salePrice: record.salePrice || '',
    status: record.status || '出荷予定',
    reason: record.reason || '',
    memo: record.memo || '',
  };
}

export async function getSalesList(): Promise<SaleRecord[]> {
  return getAllRecords<SaleRecord>('sales');
}

export async function getSale(id: string): Promise<SaleRecord> {
  const record = await getRecordById<SaleRecord>('sales', id);

  if (!record) {
    throw new Error('出荷・販売記録を取得できませんでした。');
  }

  return record;
}

export async function createSale(
  input: SaleInput,
): Promise<SaleRecord> {
  const now = new Date().toISOString();

  const record: SaleRecord = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  return saveRecord('sales', record);
}

export async function updateSale(
  id: string,
  input: SaleInput,
): Promise<SaleRecord> {
  const existing = await getRecordById<SaleRecord>('sales', id);

  if (!existing) {
    throw new Error('出荷・販売記録を更新できませんでした。');
  }

  return saveRecord('sales', {
    ...existing,
    ...input,
    id,
  });
}

export async function deleteSale(id: string): Promise<void> {
  await deleteRecord('sales', id);
}
