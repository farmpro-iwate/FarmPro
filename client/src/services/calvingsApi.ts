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
  createdAt?: string;
  updatedAt?: string;
  daysFromExpected?: number | null;
};

const API_BASE = 'http://localhost:4000/api/calvings';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    },
    ...options
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || '分娩記録APIでエラーが発生しました。');
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
