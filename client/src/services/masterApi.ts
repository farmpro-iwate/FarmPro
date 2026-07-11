import { MasterCategory, MasterInput, MasterItem } from '../types/master';

const API_BASE = 'http://localhost:4000/api';

export async function getMasters(category?: MasterCategory): Promise<MasterItem[]> {
  const query = category ? `?category=${encodeURIComponent(category)}` : '';
  const res = await fetch(`${API_BASE}/masters${query}`);
  if (!res.ok) throw new Error('マスター一覧の取得に失敗しました');
  return res.json();
}

export async function createMaster(input: MasterInput): Promise<MasterItem> {
  const res = await fetch(`${API_BASE}/masters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'マスター登録に失敗しました');
  }
  return res.json();
}

export async function updateMaster(id: number, input: MasterInput): Promise<MasterItem> {
  const res = await fetch(`${API_BASE}/masters/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!res.ok) throw new Error('マスター更新に失敗しました');
  return res.json();
}
