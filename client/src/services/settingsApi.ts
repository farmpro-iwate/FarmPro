import { FarmSettings } from '../types/settings';

const API_BASE = '/api';

export async function getFarmSettings(): Promise<FarmSettings> {
  const res = await fetch(`${API_BASE}/settings/farm`);
  if (!res.ok) throw new Error('農場設定の取得に失敗しました');
  return res.json();
}

export async function updateFarmSettings(input: FarmSettings): Promise<FarmSettings> {
  const res = await fetch(`${API_BASE}/settings/farm`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!res.ok) throw new Error('農場設定の保存に失敗しました');
  return res.json();
}

