import { getAuthToken } from './authClient';

export type MarketSchedule = {
  id: string;
  marketName: string;
  marketDate: string;
};

export type MarketShippingPlanSettings = {
  fiscalYear: string;
  minAgeDays: number;
  maxAgeDays: number;
  schedules: MarketSchedule[];
  cloudUpdatedAt?: string;
};

async function readApiError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `市場出荷予定設定のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `市場出荷予定設定のクラウド同期に失敗しました（${response.status}）`;
  }
}

function authHeaders() {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchMarketShippingPlanSettings(): Promise<MarketShippingPlanSettings> {
  const response = await fetch('/api/market-shipping-plan', {
    headers: authHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<MarketShippingPlanSettings>;
}

export async function saveMarketShippingPlanSettingsToCloud(
  settings: MarketShippingPlanSettings,
): Promise<MarketShippingPlanSettings> {
  const response = await fetch('/api/market-shipping-plan', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(settings),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<MarketShippingPlanSettings>;
}
