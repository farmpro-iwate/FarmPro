import { useRef, useState } from 'react';
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { clearAuthSession, getAuthToken, getStoredAuthUser } from '../services/authClient';
import { deleteWithdrawnFarmDatabase } from '../storage/db';

type Target = { id: string; farmId: string; farmName: string; name: string; email: string };
type Preview = { user: Target; eligible: boolean; reason: string; token: string | null };
type Result = { operationId: string; userId: string; farmId: string; status: 'processing' | 'completed'; accountClosed: true; serverDataDeleted: boolean; billingChanged: false };
async function request(url: string, token: string | null, body?: unknown) {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value?.message === 'string' ? value.message : '退会結果を確認できません。');
  return value;
}
export function AccountWithdrawalAction({ target, onCompleted }: { target?: Target; onCompleted?: () => void }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [backedUp, setBackedUp] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [deviceCleared, setDeviceCleared] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const actor = useRef<{ id: string; farmId: string; token: string } | null>(null);
  const running = useRef(false);
  const isSelf = !target;
  const sameSession = () => { const now = getStoredAuthUser(); return now?.id === actor.current?.id && now?.farmId === actor.current?.farmId && getAuthToken() === actor.current?.token; };
  const clearDevice = async (receipt: Result) => {
    try {
      await deleteWithdrawnFarmDatabase(receipt.userId, receipt.farmId);
      setDeviceCleared(true);
    } catch (err) { setError(err instanceof Error ? err.message : '端末データ削除は未確認です。'); }
    finally {
      if (getStoredAuthUser()?.id === receipt.userId && getStoredAuthUser()?.farmId === receipt.farmId) {
        clearAuthSession(); window.localStorage.removeItem('farmpro.plan');
      }
    }
  };
  const accept = async (value: unknown) => {
    const data = value as Partial<Result>;
    const expected = preview?.user;
    if (!expected || data.userId !== expected.id || data.farmId !== expected.farmId || typeof data.operationId !== 'string' ||
      !['processing','completed'].includes(data.status || '') || data.accountClosed !== true || data.billingChanged !== false ||
      data.serverDataDeleted !== (data.status === 'completed')) throw new Error('退会結果を確認できません。処理結果を再確認してください。');
    setResult(data as Result); setUncertain(false); setPassword('');
    if (isSelf) {
      const current = getStoredAuthUser();
      if (current && !sameSession()) { setError('ログイン情報が変わったため、この端末のデータは削除していません。'); return; }
      await clearDevice(data as Result);
    } else onCompleted?.();
  };
  const show = async () => {
    if (running.current) return;
    const user = getStoredAuthUser(); const token = getAuthToken();
    setOpen(true); setPreview(null); setResult(null); setError(''); setEmail(''); setPassword(''); setConfirmed(false); setBackedUp(false); setConsent(false); setUncertain(false); setDeviceCleared(false);
    if (!user || !token) { setError('ログインが必要です。'); return; }
    actor.current = { id: user.id, farmId: user.farmId, token }; running.current = true; setBusy(true);
    try {
      const value = await request(target ? `/api/account-withdrawals/operator/${encodeURIComponent(target.id)}/preview` : '/api/account-withdrawals/me/preview', token);
      const expected = target || user;
      if (!sameSession() || value?.user?.id !== expected.id || value?.user?.farmId !== expected.farmId || typeof value.eligible !== 'boolean' ||
        typeof value.reason !== 'string' || typeof value.user.email !== 'string' || typeof value.user.farmName !== 'string' || typeof value.user.name !== 'string' ||
        (value.eligible && typeof value.token !== 'string')) throw new Error('対象の確認結果が一致しません。開き直してください。');
      setPreview(value);
    } catch (err) { setError(err instanceof Error ? err.message : '対象を確認できません。'); }
    finally { running.current = false; setBusy(false); }
  };
  const execute = async () => {
    if (running.current || !preview?.token || !confirmed || !backedUp || (!isSelf && !consent) || !password || email.trim().toLowerCase() !== preview.user.email.trim().toLowerCase()) return;
    if (!sameSession()) { setError('ログイン情報が変わりました。開き直してください。'); return; }
    if (!window.confirm(`${preview.user.farmName}\n${preview.user.name}\n${preview.user.email}\n\n退会を確定し、対象農場のサーバーデータ${isSelf ? 'とこの端末のデータ' : ''}を削除します。元に戻せません。実行しますか？`)) return;
    running.current = true; setBusy(true); setError('');
    try {
      await accept(await request('/api/account-withdrawals/execute', actor.current!.token, { token: preview.token, email, password, confirmed: true, backupConfirmed: true, consentConfirmed: consent }));
    } catch (err) { setUncertain(true); setError((err instanceof Error ? err.message : '応答を確認できません。') + ' 処理結果を再確認してください。'); }
    finally { setPassword(''); running.current = false; setBusy(false); }
  };
  const checkResult = async () => {
    if (running.current || !preview?.token) return;
    running.current = true; setBusy(true); setError('');
    try {
      const value = await request('/api/account-withdrawals/result', null, { token: preview.token });
      if (value?.status === 'not_started' && value.accountClosed === false && value.serverDataDeleted === false) {
        setUncertain(false); setError('退会確定の記録はありません。対象の確認からやり直してください。');
      } else await accept(value);
    } catch (err) { setError(err instanceof Error ? err.message : '結果を確認できません。'); }
    finally { running.current = false; setBusy(false); }
  };
  return <>
    <Button type="button" color="error" variant="outlined" size="small" onClick={() => void show()}>{target ? '退会手続きへ' : '実際の退会手続きへ'}</Button>
    <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} fullWidth maxWidth="sm">
      <DialogTitle>退会の最終確認</DialogTitle>
      <DialogContent dividers><Stack spacing={1.5} sx={{ overflowWrap: 'anywhere' }}>
        {busy && <Typography role="status">確認・処理中です。画面を閉じずにお待ちください。</Typography>}
        {error && <Alert severity="error">{error}</Alert>}
        {preview && <Typography>対象：{preview.user.farmName} ／ {preview.user.name} ／ {preview.user.email}</Typography>}
        {result ? <>
          <Alert severity={result.serverDataDeleted ? 'success' : 'warning'}>{result.serverDataDeleted ? '退会と対象農場のサーバーデータ削除が完了しました。' : '退会は確定し、ログインを停止しました。サーバーデータ削除はまだ完了していません。運営者が再処理できます。'}</Alert>
          <Typography variant="body2">受付番号：{result.operationId}</Typography>
          {isSelf && <Alert severity={deviceCleared ? 'success' : 'warning'}>{deviceCleared ? 'この端末の対象農場データも削除しました。' : 'この端末の対象農場データ削除は未確認です。別のFarmPro画面を閉じて再確認してください。'}</Alert>}
          {isSelf && !deviceCleared && <Button disabled={busy} onClick={() => void clearDevice(result)}>端末データ削除を再確認</Button>}
          {!isSelf && <Typography variant="body2">利用者の別端末内データは、この操作では消去していません。</Typography>}
          {!result.serverDataDeleted && <Button disabled={busy} onClick={() => void checkResult()}>処理結果を再確認</Button>}
          {isSelf && <Button component="a" href="/login">ログイン画面へ</Button>}
        </> : preview && <>
          <Alert severity="warning">退会確定後は全端末からログインできません。対象農場のサーバー上の牛の記録・写真・予定・保存バックアップを削除します。元に戻せません。</Alert>
          <Typography variant="body2">{isSelf ? 'この端末の対象農場データも削除します。' : '運営者側から、利用者の端末内データは消去できません。'} 別端末の記録、ご自身で保存したファイル・バックアップは残ります。受付・契約・支払の履歴と退会処理記録は運営記録として残ります。</Typography>
          <Typography variant="body2">カード解約や課金停止は、この操作では実行しません。契約中・入金待ち・契約終了が未確認の場合は確定できません。</Typography>
          {!preview.eligible ? <Alert severity="info">{preview.reason}</Alert> : <>
            <FormControlLabel control={<Checkbox checked={backedUp} disabled={busy} onChange={e => setBackedUp(e.target.checked)} />} label="必要な記録をバックアップ済み、または保存不要であることを確認しました" />
            {!isSelf && <FormControlLabel control={<Checkbox checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />} label="本人の退会意思と削除範囲を確認済み、または自分が管理する試用アカウントです" />}
            <TextField label="対象の登録メールアドレスを入力" value={email} disabled={busy} autoComplete="off" onChange={e => setEmail(e.target.value)} fullWidth />
            <TextField label={isSelf ? '現在のパスワード' : '運営者の現在のパスワード'} type="password" value={password} disabled={busy} autoComplete="off" onChange={e => setPassword(e.target.value)} fullWidth />
            <FormControlLabel control={<Checkbox checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />} label="ログイン停止と対象データ削除を理解し、退会を確定します" />
            <Button type="button" color="error" variant="contained" disabled={busy || uncertain || !confirmed || !backedUp || (!isSelf && !consent) || !password || email.trim().toLowerCase() !== preview.user.email.trim().toLowerCase()} onClick={() => void execute()}>退会を確定して対象データを削除</Button>
          </>}
        </>}
        {uncertain && <Button disabled={busy} onClick={() => void checkResult()}>処理結果を再確認</Button>}
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => setOpen(false)}>{result ? '閉じる' : '実行せず閉じる'}</Button></DialogActions>
    </Dialog>
  </>;
}

export function WithdrawalCleanupRecovery() {
  const [rows, setRows] = useState<Array<{ id: string; farmName: string }> | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const load = async (operationId?: string) => {
    if (running.current) return;
    const user = getStoredAuthUser(); const token = getAuthToken();
    if (!user || !token) { setMessage('ログインを確認してください。'); return; }
    if (operationId && !window.confirm('すでに退会確定済みの農場について、未完了のサーバーデータ削除を再処理しますか？')) return;
    running.current = true; setBusy(true); setMessage('');
    try {
      if (operationId) {
        const result = await request('/api/account-withdrawals/operator/retry-cleanup', token, { operationId });
        if (result.operationId !== operationId || result.accountClosed !== true || typeof result.serverDataDeleted !== 'boolean') throw new Error('再処理結果を確認できません。');
        setMessage(result.serverDataDeleted ? '未完了だったサーバーデータ削除が完了しました。受付一覧と利用者一覧を更新してください。' : '削除はまだ完了していません。時間をおいて再確認してください。');
      }
      const value = await request('/api/account-withdrawals/operator/processing', token);
      if (getStoredAuthUser()?.id !== user.id || getAuthToken() !== token || !Array.isArray(value.operations) || value.operations.some((x: any) => typeof x.id !== 'string' || typeof x.farmName !== 'string')) throw new Error('確認結果が一致しません。画面を開き直してください。');
      setRows(value.operations);
    } catch (err) { setMessage(err instanceof Error ? err.message : '未完了の処理を確認できません。'); }
    finally { running.current = false; setBusy(false); }
  };
  return <Stack spacing={1}>
    <Button type="button" size="small" disabled={busy} onClick={() => void load()}>未完了のデータ削除を確認</Button>
    {message && <Alert severity="info">{message}</Alert>}
    {rows?.length === 0 && <Typography variant="body2">未完了の退会データ削除はありません。</Typography>}
    {rows?.map(row => <Stack key={row.id} spacing={0.5}>
      <Typography variant="body2">{row.farmName}：退会確定済み・データ削除未完了</Typography>
      <Button type="button" color="error" disabled={busy} onClick={() => void load(row.id)}>この農場の未完了部分を再処理</Button>
    </Stack>)}
  </Stack>;
}
