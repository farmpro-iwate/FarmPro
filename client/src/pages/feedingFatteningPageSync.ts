import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

type PageSyncContext = {
  farmId: string | null;
  userId: string | null;
  token: string | null;
  cloudEnabled: boolean;
  planId: string;
};
type FormAttempt<C> = { context: C; active: boolean; busy: boolean; localId: string | null };

// These guards are shared only by the feeding-alert and fattening pages. A
// committed UUID belongs to the editor that created it, including late errors.
export function useFeedingFatteningFormAttempt<C extends PageSyncContext>(
  getContext: () => C,
  assertContext: (context: C) => void,
) {
  const location = useLocation();
  const routeKey = `${location.key}:${location.pathname}${location.search}`;
  const attemptRef = useRef<FormAttempt<C> | null>(null);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');

  const isCurrentAttempt = useCallback((attempt: FormAttempt<C>) =>
    attempt.active && attemptRef.current === attempt, []);
  const assertAttempt = useCallback((attempt: FormAttempt<C>) => {
    if (!isCurrentAttempt(attempt)) throw new Error('画面が変わったため、処理を中止しました。');
    assertContext(attempt.context);
  }, [assertContext, isCurrentAttempt]);
  const showFailure = (attempt: FormAttempt<C>, cause: unknown, fallback: string, savedLocally = false) => {
    if (!isCurrentAttempt(attempt)) return;
    try { assertAttempt(attempt); }
    catch {
      setLocked(true);
      setError('ログインまたは農場の情報が変わりました。画面を開き直して内容を確認してください。');
      return;
    }
    const detail = cause instanceof Error && !(cause instanceof TypeError) ? cause.message : fallback;
    setError(savedLocally ? `記録はこの端末に保存されています。同じ記録で保存を再試行できます。${detail}` : detail);
  };

  useEffect(() => {
    const attempt: FormAttempt<C> = { context: getContext(), active: true, busy: false, localId: null };
    attemptRef.current = attempt;
    setSaving(false);
    setLocked(false);
    setError('');
    return () => { attempt.active = false; };
  }, [routeKey, getContext]);

  const beginSaving = () => {
    const attempt = attemptRef.current;
    if (!attempt || !isCurrentAttempt(attempt) || attempt.busy || locked) return null;
    attempt.busy = true;
    setSaving(true);
    setError('');
    return attempt;
  };
  const finishSaving = (attempt: FormAttempt<C>) => {
    attempt.busy = false;
    if (isCurrentAttempt(attempt)) setSaving(false);
  };

  return { routeKey, attemptRef, saving, locked, error, setError, assertAttempt, isCurrentAttempt,
    showFailure, beginSaving, finishSaving };
}

type ListScope<C> = {
  context: C;
  active: boolean;
  busy: boolean;
  mutationVersion: number;
  requestedAgain: boolean;
  running?: Promise<void>;
};

export function useFeedingFatteningListSync<T extends { id: string }, C extends PageSyncContext>(options: {
  getContext: () => C;
  assertContext: (context: C) => void;
  getList: () => Promise<T[]>;
  deleteRecord: (id: string) => Promise<void>;
  statusEvent: string;
  loadFailure: string;
  deleteFailure: string;
  confirmDelete: (record: T) => string;
}) {
  const { getContext, assertContext, getList, deleteRecord, statusEvent, loadFailure, deleteFailure, confirmDelete } = options;
  const context = getContext();
  const location = useLocation();
  const scopeRef = useRef<ListScope<C> | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);
  const [records, setRecords] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [loadError, setLoadError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [, refreshContext] = useState(0);

  const currentView = useCallback((scope: ListScope<C>) => {
    if (!scope.active || scopeRef.current !== scope) return false;
    try { assertContext(scope.context); return true; }
    catch { refreshContext(value => value + 1); return false; }
  }, [assertContext]);

  useEffect(() => {
    const scope: ListScope<C> = { context, active: true, busy: false, mutationVersion: 0, requestedAgain: false };
    scopeRef.current = scope;
    setRecords([]);
    setLoading(true);
    setDeletingId('');
    setLoadError('');
    setDeleteError('');
    const load = (): Promise<void> => {
      if (!currentView(scope) || scope.busy) return Promise.resolve();
      if (scope.running) { scope.requestedAgain = true; return scope.running; }
      const read = async () => {
        do {
          scope.requestedAgain = false;
          const version = scope.mutationVersion;
          if (!currentView(scope)) return;
          try {
            const rows = await getList();
            if (!currentView(scope)) return;
            if (!scope.busy && version === scope.mutationVersion) {
              setRecords(rows);
              setLoadError('');
            }
          } catch (cause) {
            if (currentView(scope) && !scope.busy && version === scope.mutationVersion) {
              setLoadError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : loadFailure);
            }
          }
        } while (currentView(scope) && scope.requestedAgain && !scope.busy);
      };
      scope.running = read().finally(() => {
        scope.running = undefined;
        if (currentView(scope) && !scope.busy) setLoading(false);
      });
      return scope.running;
    };
    loadRef.current = load;
    const onResume = () => {
      if (!scope.busy && document.visibilityState !== 'hidden' && navigator.onLine !== false) void load();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') onResume(); };
    window.addEventListener(statusEvent, onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onVisible);
    void load();
    return () => {
      scope.active = false;
      if (loadRef.current === load) loadRef.current = async () => undefined;
      window.removeEventListener(statusEvent, onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [context.farmId, context.userId, context.token, context.planId, context.cloudEnabled,
    location.key, location.pathname, currentView, getList, statusEvent, loadFailure]);

  const handleDelete = async (record: T) => {
    const scope = scopeRef.current;
    if (!scope || scope.busy || !currentView(scope) || !window.confirm(confirmDelete(record))) return;
    if (!currentView(scope)) return;
    scope.busy = true;
    scope.mutationVersion += 1;
    scope.requestedAgain = false;
    setDeletingId(record.id);
    setDeleteError('');
    try {
      await deleteRecord(record.id);
      if (currentView(scope)) setRecords(current => current.filter(item => item.id !== record.id));
    } catch (cause) {
      if (currentView(scope)) setDeleteError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : deleteFailure);
    } finally {
      if (currentView(scope)) {
        scope.busy = false;
        setDeletingId('');
        await loadRef.current();
      }
    }
  };

  return { records, loading, deletingId, error: deleteError || loadError, handleDelete,
    reload: () => loadRef.current() };
}
