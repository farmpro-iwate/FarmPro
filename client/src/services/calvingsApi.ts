export type CalvingRecord = {
  id?: string;
  cowId?: string;
  cowName?: string;
  expectedCalvingDate?: string;
  actualCalvingDate?: string;
  calfName?: string;
  calfSex?: string;
  birthWeightKg?: number | string;
  calvingResult?: string;
  colostrumStatus?: string;
  memo?: string;
  registeredToCalfLedger?: boolean;
  calfId?: string;

  // 以前の連携準備項目。画面では使いませんが、古いJSONとの互換のため残します。
  breedingId?: string;
  breedingLinked?: boolean;
  breedingLinkedAt?: string;

  createdAt?: string;
  updatedAt?: string;
  daysFromExpected?: number | null;
};

export type RegisterCalfResponse = {
  ok: boolean;
  calf: {
    id: string;
    name?: string;
    earTag?: string;
    sex?: string;
    birthDate?: string;
    birthWeightKg?: number | string;
    motherCowId?: string;
    motherCowName?: string;
    memo?: string;
  };
  calving: CalvingRecord;
};

const API_BASE = '/api/calvings';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    },
    ...options
  });

  if (!res.ok) {
    let message = '分娩記録APIでエラーが発生しました。';

    try {
      const data = await res.json();
      message = data?.message || message;
    } catch {
      const text = await res.text();
      message = text || message;
    }

    throw new Error(message);
  }

  return res.json();
}

export async function fetchCalvings() {
  return request<CalvingRecord[]>('');
}

export async function fetchCalving(id: string) {
  return request<CalvingRecord>(`/${id}`);
}

export async function createCalving(record: CalvingRecord) {
  return request<CalvingRecord>('', {
    method: 'POST',
    body: JSON.stringify(record)
  });
}

export async function updateCalving(id: string, record: CalvingRecord) {
  return request<CalvingRecord>(`/${id}`, {
    method: 'PUT',
    body: JSON.stringify(record)
  });
}

export async function deleteCalving(id: string) {
  return request<{ ok: boolean }>(`/${id}`, {
    method: 'DELETE'
  });
}

export async function registerCalvingToCalfLedger(id: string) {
  return request<RegisterCalfResponse>(`/${id}/register-calf`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}
