import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { getAuthToken } from '../services/authClient';

type User = { id: string; farmId: string; farmName: string; name: string; email: string; accountDeletionPending?: boolean };
type Preview = {
  user: User & { plan: string; active: boolean };
  canDelete: boolean;
  reason: string;
  revision: string;
  resuming: boolean;
};
type Props = {
  user: User;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
  onDeleted: (userId: string, farmId: string, message: string) => void;
};

export function OperatorAccountDeletionAction({ user, disabled = false, onBusyChange, onDeleted }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const inFlight = useRef(false);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { sequence.current += 1; controller.current?.abort(); }, []);

  const close = () => {
    if (inFlight.current) return;
    sequence.current += 1;
    controller.current?.abort();
    setOpen(false);
    setPreview(null);
    setConfirmed(false);
    setEmail('');
    setError('');
    setLoading(false);
  };

  const loadPreview = async () => {
    if (inFlight.current) return;
    const serial = ++sequence.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setOpen(true);
    setLoading(true);
    setPreview(null);
    setConfirmed(false);
    setEmail('');
    setError('');
    const timeout = window.setTimeout(() => abort.abort(), 15000);
    try {
      const token = getAuthToken();
      if (!token) throw new Error('ログインが必要です。');
      const response = await fetch(`/api/operator/users/${encodeURIComponent(user.id)}/deletion-preview`, {
        cache: 'no-store', signal: abort.signal, headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || '削除対象を確認できませんでした。');
      if (body?.user?.id !== user.id || body.user.farmId !== user.farmId || typeof body.user.email !== 'string' ||
          typeof body.canDelete !== 'boolean' || typeof body.revision !== 'string' || !/^[a-f0-9]{64}$/.test(body.revision)) {
        throw new Error('対象アカウントを確認できません。一覧を更新してください。');
      }
      if (sequence.current === serial) setPreview(body);
    } catch (cause) {
      if (sequence.current === serial) setError(abort.signal.aborted
        ? '確認に時間がかかっています。内容を再確認してください。削除は実行していません。'
        : cause instanceof Error ? cause.message : '削除対象を確認できませんでした。');
    } finally {
      window.clearTimeout(timeout);
      if (sequence.current === serial) setLoading(false);
    }
  };

  const canSubmit = Boolean(preview?.canDelete && confirmed && email.trim().toLowerCase() === preview.user.email.toLowerCase());
  const submit = async () => {
    if (inFlight.current || disabled || !canSubmit || !preview) return;
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    setError('');
    try {
      const token = getAuthToken();
      if (!token) throw new Error('ログインが必要です。');
      const response = await fetch(`/api/operator/users/${encodeURIComponent(user.id)}/delete`, {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ farmId: preview.user.farmId, email: email.trim(), revision: preview.revision, confirmed: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || '削除の完了を確認できませんでした。一覧で状態を確認してください。');
      if (body.deleted !== true || body.userId !== user.id || body.farmId !== preview.user.farmId) {
        throw new Error('削除結果を確認できませんでした。完了扱いにせず、一覧で状態を確認してください。');
      }
      onDeleted(user.id, preview.user.farmId, `${preview.user.farmName}：アカウントとサーバー上の専用農場データを削除しました。別端末のデータと保存済みバックアップは遠隔消去していません。`);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '削除状態を確認できませんでした。一覧を更新してください。');
      setPreview(null);
      setConfirmed(false);
      setEmail('');
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  };

  const target = preview?.user || user;
  return <>
    <Button color="error" variant="outlined" size="small" disabled={disabled || busy || loading}
      sx={{ whiteSpace: 'normal', lineHeight: 1.4 }} onClick={loadPreview}>
      {user.accountDeletionPending ? '削除を再試行' : '削除'}
    </Button>
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby={`account-delete-${user.id}`}>
      <DialogTitle id={`account-delete-${user.id}`}>利用者の削除</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
          <Stack><Typography fontWeight={800}>{target.farmName}</Typography><Typography>{target.name}</Typography><Typography>{target.email}</Typography></Stack>
          {loading && <Stack direction="row" spacing={1}><CircularProgress size={20} /><Typography>契約と削除範囲を確認中...</Typography></Stack>}
          {preview && !preview.canDelete && <Alert severity="warning">{preview.reason}</Alert>}
          {preview?.canDelete && <>
            {preview.resuming && <Alert severity="warning">前回の削除処理が途中です。ログインは停止しています。残っている削除処理を再試行します。</Alert>}
            <Alert severity="warning">これは「利用停止」ではありません。削除したアカウントは元に戻せません。</Alert>
            <Typography>削除するもの：この利用者のサーバー上のアカウント情報と、専用の農場保存領域にある牛・繁殖・治療・販売などの記録、写真、クラウド保存データ。</Typography>
            <Typography>別端末の端末内データ、利用者が保存したバックアップ、送信済みメール、基盤側のバックアップは、この操作では消去しません。必要な記録は先にバックアップしてください。</Typography>
            <Typography variant="body2">再作成防止と確認コード無効化のため、内部ID・操作日時・照合用ハッシュの最小限の記録は残します。これはカードの解約・返金の操作ではありません。</Typography>
            <TextField label="削除対象のメールアドレスを入力" value={email} onChange={(event) => setEmail(event.target.value)}
              autoComplete="off" fullWidth disabled={busy} />
            <FormControlLabel control={<Checkbox checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />}
              label="不要な試用アカウントであること、削除範囲、必要なバックアップ、決済・入金手続き中ではないことを確認しました。" />
          </>}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1, p: 2 }}>
        <Button onClick={close} disabled={busy} autoFocus>戻る</Button>
        {!loading && !preview && <Button onClick={loadPreview} disabled={busy}>内容を再確認</Button>}
        {preview?.canDelete && <Button color="error" variant="contained" onClick={submit} disabled={disabled || busy || !canSubmit}>
          {busy ? '削除中...' : 'この利用者を削除する'}
        </Button>}
      </DialogActions>
    </Dialog>
  </>;
}
