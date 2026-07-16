export type FeedingAlertAction = {
  id: string;
  actionDate: string;
  calfId: string;
  calfName: string;
  ageDays: string;
  alertType: string;
  actionType: string;
  memo: string;
  nextCheckDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type FeedingAlertActionInput = {
  actionDate: string;
  calfId: string;
  calfName: string;
  ageDays: string;
  alertType: string;
  actionType: string;
  memo: string;
  nextCheckDate: string;
  status: string;
};

const API_BASE = '/api/feeding-alert-actions';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = '給与アラート対応記録の通信に失敗しました。';

    try {
      const data = await res.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      // JSONでない場合は共通メッセージを使う
    }

    throw new Error(message);
  }

  return res.json();
}

export async function fetchFeedingAlertActions() {
  const res = await fetch(API_BASE);
  return handleResponse<FeedingAlertAction[]>(res);
}

export async function fetchFeedingAlertAction(id: string) {
  const res = await fetch(`${API_BASE}/${id}`);
  return handleResponse<FeedingAlertAction>(res);
}

export async function createFeedingAlertAction(input: FeedingAlertActionInput) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(input)
  });

  return handleResponse<FeedingAlertAction>(res);
}

export async function updateFeedingAlertAction(id: string, input: FeedingAlertActionInput) {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(input)
  });

  return handleResponse<FeedingAlertAction>(res);
}

export async function deleteFeedingAlertAction(id: string) {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    let message = '給与アラート対応記録の削除に失敗しました。';

    try {
      const data = await res.json();
      if (data?.message) {
        message = data.message;
      }
    } catch {
      // JSONでない場合は共通メッセージを使う
    }

    throw new Error(message);
  }
}

