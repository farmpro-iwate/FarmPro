const API_BASE = 'http://localhost:4000/api/sales';

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

export type SaleInput = Omit<SaleRecord, 'id' | 'createdAt' | 'updatedAt'>;

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
  memo: ''
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
    memo: record.memo || ''
  };
}

export async function getSalesList(): Promise<SaleRecord[]> {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error('出荷・販売記録を取得できませんでした。');
  return res.json();
}

export async function getSale(id: string): Promise<SaleRecord> {
  const res = await fetch(`${API_BASE}/${id}`);
  if (!res.ok) throw new Error('出荷・販売記録を取得できませんでした。');
  return res.json();
}

export async function createSale(input: SaleInput): Promise<SaleRecord> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!res.ok) throw new Error('出荷・販売記録を登録できませんでした。');
  return res.json();
}

export async function updateSale(id: string, input: SaleInput): Promise<SaleRecord> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!res.ok) throw new Error('出荷・販売記録を更新できませんでした。');
  return res.json();
}
