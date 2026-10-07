import { useEffect, useState } from 'react';

// Display preferences only. Never write authentication, account or farm records.
export function operatorVisibilityKey(operatorId: string) {
  return `farmpro.operatorListVisibility.v1.${encodeURIComponent(operatorId)}`;
}

export function canHideOperatorListUser(
  user: { id: string; plan: string; paymentSource: string; paymentIssue?: string },
  operatorId: string,
) {
  return Boolean(operatorId) && user.id !== operatorId && user.plan === 'free' &&
    user.paymentSource === 'free' && !user.paymentIssue;
}

type VisibilityState = { operatorId: string; ids: string[]; warning: string };
function readPreferences(operatorId: string): VisibilityState {
  const empty = { operatorId, ids: [], warning: '' };
  if (!operatorId) return empty;
  try {
    const raw = window.localStorage.getItem(operatorVisibilityKey(operatorId));
    if (!raw) return empty;
    if (raw.length > 200000) throw new Error('INVALID_LIST_PREFERENCE');
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.hiddenUserIds) ||
        value.hiddenUserIds.some((id: unknown) => typeof id !== 'string' || !id)) {
      throw new Error('INVALID_LIST_PREFERENCE');
    }
    return { operatorId, ids: [...new Set<string>(value.hiddenUserIds)], warning: '' };
  } catch {
    // A broken browser preference must not make accounts disappear.
    return { ...empty, warning: 'このブラウザーの表示設定を読み込めないため、全員を表示しています。アカウントや農場データは変更していません。' };
  }
}

export function useOperatorListVisibility(operatorId: string) {
  const [state, setState] = useState<VisibilityState>(() => readPreferences(operatorId));

  useEffect(() => {
    setState(readPreferences(operatorId));
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === operatorVisibilityKey(operatorId)) {
        setState(readPreferences(operatorId));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [operatorId]);

  const current = state.operatorId === operatorId ? state : { operatorId, ids: [], warning: '' };
  const hiddenIds = new Set(current.ids);

  function setHidden(userId: string, hidden: boolean) {
    if (!operatorId || !userId || userId === operatorId) return false;
    // Read current preferences so changes from another tab are not needlessly
    // overwritten. This is not a shared server setting or an access restriction.
    const latest = readPreferences(operatorId);
    const ids = new Set(latest.ids);
    if (hidden) ids.add(userId); else ids.delete(userId);
    try {
      window.localStorage.setItem(operatorVisibilityKey(operatorId), JSON.stringify({
        version: 1, hiddenUserIds: [...ids],
      }));
      setState({ operatorId, ids: [...ids], warning: '' });
      return true;
    } catch {
      setState({ ...latest, warning: '表示設定を保存できませんでした。今回の表示変更は反映していません。アカウントや農場データは変更していません。' });
      return false;
    }
  }

  return { hiddenIds, warning: current.warning, setHidden };
}
