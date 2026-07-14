export type BreedingAdvancedRecord = {
  id?: string;
  cowId?: string;
  cowName?: string;
  breedingType?: string;
  serviceDate?: string;
  expectedCalvingDate?: string;
  pregnancyCheckDate?: string;
  pregnancyCheckActualDate?: string;
  pregnancyResult?: string;
  status?: string;
  sireName?: string;
  sireMasterId?: number;
  semenNo?: string;
  inseminatorName?: string;
  inseminatorMasterId?: number;
  matingStartDate?: string;
  matingEndDate?: string;
  donorCowId?: string;
  donorCowName?: string;
  embryoNo?: string;
  embryoType?: string;
  embryoRank?: string;
  supplierName?: string;
  supplierMasterId?: number;
  transferOperatorName?: string;
  memo?: string;
};

const API_BASES = [
  'http://localhost:4000/api/breedings',
  'http://localhost:4000/api/breeding'
];

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let lastError = '';

  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers || {})
        },
        ...options
      });

      if (res.ok) {
        return res.json();
      }

      lastError = await res.text();
    } catch (err) {
      lastError = err instanceof Error ? err.message : '繁殖強化APIでエラーが発生しました。';
    }
  }

  throw new Error(lastError || '繁殖強化APIに接続できませんでした。');
}

export async function fetchBreedingAdvancedRecords() {
  return request<BreedingAdvancedRecord[]>('');
}

export async function fetchBreedingAdvancedRecord(id: string) {
  return request<BreedingAdvancedRecord>(`/${id}`);
}

export async function createBreedingAdvancedRecord(record: BreedingAdvancedRecord) {
  return request<BreedingAdvancedRecord>('', {
    method: 'POST',
    body: JSON.stringify(record)
  });
}

export async function updateBreedingAdvancedRecord(id: string, record: BreedingAdvancedRecord) {
  return request<BreedingAdvancedRecord>(`/${id}`, {
    method: 'PUT',
    body: JSON.stringify(record)
  });
}
