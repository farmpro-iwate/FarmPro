import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, CardContent, Checkbox, Divider, FormControlLabel, Radio, RadioGroup, Stack, Typography } from '@mui/material';
import { getAuthToken, getStoredAuthUser } from '../services/authClient';
import { AccountWithdrawalAction, WithdrawalCleanupRecovery } from './AccountWithdrawalAction';

type Session = { id: string; farmId: string; token: string };
type RequestRecord = { id: string; userId: string; farmId: string; farmName: string; name: string; email: string;
  planAtRequest: 'free' | 'standard' | 'pro'; timing: 'after_paid_period' | 'consult_first';
  status: 'pending' | 'cancelled' | 'completed'; requestedAt: string; cancelledAt?: string; completedAt?: string };
type ReceiptState = { user: { id: string; farmId: string; farmName: string; name: string; email: string };
  request: RequestRecord | null; canRequest: boolean; reason: string; accountChanged: false; billingChanged: false; deleted: false };
type InboxState = { requests: RequestRecord[]; pendingCount: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const badResponse = () => new Error('受付結果を確認できません。受付状況を再確認してください。');
const changedSession = 'ログイン情報が変わりました。画面を開き直してください。';
function session(): Session | null {
  try {
    const user = getStoredAuthUser();
    const token = getAuthToken();
    return user?.id && user.farmId && token ? { id: user.id, farmId: user.farmId, token } : null;
  } catch { return null; }
}
function sameUser(a: Session | null, b: Session | null) { return !!a && !!b && a.id === b.id && a.farmId === b.farmId; }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function validRequest(value: unknown): value is RequestRecord {
  if (!object(value)) return false;
  return typeof value.id === 'string' && uuid.test(value.id) &&
    ['userId', 'farmId', 'farmName', 'name', 'email'].every((key) => typeof value[key] === 'string') &&
    ['free', 'standard', 'pro'].includes(String(value.planAtRequest)) &&
    ['after_paid_period', 'consult_first'].includes(String(value.timing)) &&
    ['pending', 'cancelled', 'completed'].includes(String(value.status)) && typeof value.requestedAt === 'string' && Number.isFinite(Date.parse(value.requestedAt)) &&
    (value.status !== 'cancelled' || (typeof value.cancelledAt === 'string' && Number.isFinite(Date.parse(value.cancelledAt)))) &&
    (value.status !== 'completed' || (typeof value.completedAt === 'string' && Number.isFinite(Date.parse(value.completedAt))));
}
function parseReceipt(value: unknown, actor: Session): ReceiptState {
  if (!object(value) || !object(value.user) || value.user.id !== actor.id || value.user.farmId !== actor.farmId ||
      !['farmName', 'name', 'email'].every((key) => typeof (value.user as Record<string, unknown>)[key] === 'string') ||
      typeof value.canRequest !== 'boolean' || typeof value.reason !== 'string' || value.accountChanged !== false ||
      value.billingChanged !== false || value.deleted !== false ||
      (value.request !== null && (!validRequest(value.request) || value.request.userId !== actor.id || value.request.farmId !== actor.farmId))) throw badResponse();
  return value as unknown as ReceiptState;
}
function parseInbox(value: unknown): InboxState {
  if (!object(value) || !Array.isArray(value.requests) || !value.requests.every(validRequest) ||
      new Set(value.requests.map((row) => row.id)).size !== value.requests.length ||
      value.pendingCount !== value.requests.filter((row) => row.status === 'pending').length) throw badResponse();
  return value as unknown as InboxState;
}

// GET on opening/explicit refresh only. POST needs an explicit action. Results
// from an old login or an unmounted dialog are never displayed as an acceptance.
function useIntake<T>(endpoint: string, parse: (value: unknown, actor: Session) => T) {
  const owner = useRef(session());
  const mounted = useRef(false);
  const running = useRef(false);
  const sequence = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (body?: Record<string, unknown>, suffix = '', check?: (value: T) => boolean) => {
    if (running.current) return false;
    const actor = session();
    if (!sameUser(owner.current, actor) || !actor) { setData(null); setError(changedSession); return false; }
    running.current = true;
    const turn = ++sequence.current;
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    setBusy(true); setError('');
    try {
      const response = await fetch(`${endpoint}${suffix}`, {
        method: body ? 'POST' : 'GET', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${actor.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const value: unknown = await response.json();
      const current = session();
      if (!sameUser(actor, current) || actor.token !== current?.token) throw new Error(changedSession);
      if (!response.ok) throw new Error(object(value) && typeof value.message === 'string' ? value.message.slice(0, 500) : '受付状況を取得できませんでした。');
      const parsed = parse(value, actor);
      if (check && !check(parsed)) throw badResponse();
      if (!mounted.current || turn !== sequence.current) return false;
      setData(parsed);
      return true;
    } catch (err) {
      if (mounted.current && turn === sequence.current) {
        if (!sameUser(actor, session())) setData(null);
        setError(err instanceof Error && err.name !== 'AbortError' ? err.message : '応答を確認できませんでした。受付状況を再確認してください。');
      }
      return false;
    } finally {
      clearTimeout(timer);
      if (turn === sequence.current) { running.current = false; if (mounted.current) setBusy(false); }
    }
  }, [endpoint, parse]);
  useEffect(() => {
    mounted.current = true;
    void run();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'farmpro.authUser' || event.key === 'farmpro.authToken') {
        if (!sameUser(owner.current, session())) { setData(null); setError(changedSession); }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => { mounted.current = false; sequence.current++; running.current = false; abort.current?.abort(); window.removeEventListener('storage', onStorage); };
  }, [run]);
  return { data: sameUser(owner.current, session()) ? data : null, error, busy, run };
}
function when(value: string) { return new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) + '（日本時間）'; }
function timingLabel(value: RequestRecord['timing']) {
  return value === 'after_paid_period' ? '有料契約がある場合は期間終了後に退会したい' : 'まず退会の手続きについて相談したい';
}

export function WithdrawalRequestForm() {
  const { data, error, busy, run } = useIntake('/api/withdrawal-requests/me', parseReceipt);
  const [timing, setTiming] = useState<RequestRecord['timing']>('consult_first');
  const [confirmed, setConfirmed] = useState(false);
  const attempt = useRef<{ id: string; timing: RequestRecord['timing'] } | null>(null);
  const [localError, setLocalError] = useState('');
  const submit = async () => {
    if (!confirmed || !data?.canRequest || busy) return;
    setLocalError('');
    try {
      if (!attempt.current || attempt.current.timing !== timing) attempt.current = { id: crypto.randomUUID(), timing };
      const id = attempt.current.id;
      if (await run({ requestId: id, timing, confirmed: true }, '', (value) => value.request?.id === id && value.request.status === 'pending')) {
        setConfirmed(false); attempt.current = null;
      }
    } catch { setLocalError('送信の準備ができませんでした。お問い合わせフォームをご利用ください。'); }
  };
  const cancel = async () => {
    const request = data?.request;
    if (!request || request.status !== 'pending' || busy) return;
    if (!window.confirm('この退会希望を取り消しますか？\n希望の記録だけを取り消します。別途行った解約や退会の手続きは変更しません。')) return;
    await run({ requestId: request.id, confirmed: true }, '/cancel');
  };
  return (
    <Stack spacing={1.25}>
      <Typography component="h3" fontWeight={800}>アプリから退会希望を送る</Typography>
      <Alert severity="info">送信すると運営者の受付一覧に登録されます。退会・データ削除・課金停止は自動実行されません。利用終了日などは運営者が契約内容を確認してご案内します。</Alert>
      <Typography variant="body2">農場名・氏名・登録メールアドレス・申出時のプランと希望内容を受付記録に保存します。自動メール通知はありません。更新日が近い場合は、下のお問い合わせ窓口にもご連絡ください。</Typography>
      {(error || localError) && <Alert severity="error">{error || localError}</Alert>}
      {busy && <Typography variant="body2" role="status">受付状況を確認中...</Typography>}
      {data && <>
        <Typography variant="body2">対象：{data.user.farmName} ／ {data.user.name} ／ {data.user.email}</Typography>
        {data.request?.status === 'pending' ? <>
          <Alert severity="success">退会希望を受け付けています（手続き未完了）。</Alert>
          <Typography variant="body2">受付日時：{when(data.request.requestedAt)}</Typography>
          <Typography variant="body2">{timingLabel(data.request.timing)}</Typography>
          <Button type="button" variant="outlined" disabled={busy} onClick={() => void cancel()}>この退会希望を取り消す</Button>
        </> : <>
          {data.request?.status === 'cancelled' && <Alert severity="info">前回の退会希望は取り消し済みです。</Alert>}
          {data.reason && <Alert severity="info">{data.reason}</Alert>}
          {data.canRequest && <>
            <RadioGroup aria-label="退会の希望" value={timing} onChange={(event) => { setTiming(event.target.value as RequestRecord['timing']); setConfirmed(false); }}>
              <FormControlLabel disabled={busy} value="consult_first" control={<Radio />} label={timingLabel('consult_first')} />
              <FormControlLabel disabled={busy} value="after_paid_period" control={<Radio />} label={timingLabel('after_paid_period')} />
            </RadioGroup>
            <FormControlLabel control={<Checkbox checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />}
              label="この送信だけでは、課金停止・退会・データ削除は完了しないことを確認しました" />
            <Button type="button" variant="contained" disabled={busy || !confirmed} onClick={() => void submit()}>退会希望を送る</Button>
          </>}
        </>}
      </>}
      <Button type="button" variant="text" disabled={busy} onClick={() => { setLocalError(''); void run(); }}>受付状況を再確認</Button>
    </Stack>
  );
}

export function OperatorWithdrawalInbox() {
  const { data, error, busy, run } = useIntake('/api/withdrawal-requests/operator', parseInbox);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const rows = data?.requests.filter((row) => includeCancelled || row.status === 'pending' || row.status === 'completed') || [];
  return (
    <Card variant="outlined"><CardContent><Stack spacing={1.25}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Typography variant="h6" fontWeight={800}>退会希望の受付{data ? `（${data.pendingCount}件）` : ''}</Typography>
        <Button type="button" size="small" disabled={busy} onClick={() => void run()}>受付一覧を更新</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">申出時の情報です。処理前に一覧を更新し、本人・契約内容・希望を確認してください。退会手続きは、対象と契約状態を再確認してから別の確認画面で確定します。メール通知はありません。</Typography>
      {busy && <Typography variant="body2" role="status">受付一覧を確認中...</Typography>}
      {error && <Alert severity="error">{error}</Alert>}
      <FormControlLabel control={<Checkbox checked={includeCancelled} onChange={(event) => setIncludeCancelled(event.target.checked)} />} label="取消済みも表示" />
      {data && rows.length === 0 && <Typography>表示する退会希望はありません。</Typography>}
      <WithdrawalCleanupRecovery />
      {rows.map((row) => <Stack spacing={0.5} key={row.id} sx={{ overflowWrap: 'anywhere' }}>
        <Divider />
        <Typography fontWeight={800}>{row.farmName} ／ {row.name}</Typography>
        <Typography variant="body2">{row.email}</Typography>
        <Typography variant="body2">{row.status === 'pending' ? '受付済み・手続き未完了' : row.status === 'completed' ? '退会完了' : '希望取消済み'} ／ 申出時：{row.planAtRequest === 'free' ? 'Free' : row.planAtRequest === 'standard' ? 'Standard' : 'Pro'}</Typography>
        <Typography variant="body2">{timingLabel(row.timing)}</Typography>
        {row.status === 'pending' && <AccountWithdrawalAction target={{ id: row.userId, farmId: row.farmId, farmName: row.farmName, name: row.name, email: row.email }} onCompleted={() => void run()} />}
        <Typography variant="caption">受付：{when(row.requestedAt)}{row.cancelledAt ? ` ／ 取消：${when(row.cancelledAt)}` : ''}{row.completedAt ? ` ／ 退会：${when(row.completedAt)}` : ''}</Typography>
      </Stack>)}
    </Stack></CardContent></Card>
  );
}
