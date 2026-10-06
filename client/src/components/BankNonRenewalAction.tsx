import { useRef, useState } from 'react';
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography } from '@mui/material';
import { getAuthToken } from '../services/authClient';

export type BankNonRenewalSummary = {
  applicationId: string;
  contractEndsAt: string | null;
  requestedAt: string | null;
  canRequest: boolean;
  reason: string;
};
type BankUser = {
  id: string;
  farmName: string;
  name: string;
  email: string;
  plan: 'free' | 'standard' | 'pro';
  bankNonRenewal?: BankNonRenewalSummary | null;
};
type Props = {
  user: BankUser;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
  onAccepted: (user: BankUser, message: string) => void;
};

export function formatBankContractEnd(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '終了日時を確認中';
  return `${new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(value))}（日本時間）`;
}

export function BankNonRenewalAction({ user, disabled = false, onBusyChange, onAccepted }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const contract = user.bankNonRenewal;
  const canRequest = Boolean(contract?.canRequest && contract.contractEndsAt);
  const accepted = Boolean(contract?.requestedAt && !contract.reason);
  const endLabel = formatBankContractEnd(contract?.contractEndsAt);
  const currentPlan = user.plan === 'pro' ? 'Pro' : user.plan === 'standard' ? 'Standard' : 'Free';

  const close = () => {
    if (inFlight.current) return;
    setOpen(false);
    setConfirmed(false);
    setError('');
  };

  const submit = async () => {
    if (inFlight.current || !confirmed || !canRequest || !contract) return;
    const token = getAuthToken();
    if (!token) { setError('ログインが必要です'); return; }
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    setError('');
    try {
      const response = await fetch(`/api/operator/users/${encodeURIComponent(user.id)}/bank-non-renewal`, {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ applicationId: contract.applicationId, contractEndsAt: contract.contractEndsAt, confirmed: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || '継続なしの受付を確認できませんでした。');
      if (body?.user?.id !== user.id || !body.user.bankNonRenewal?.requestedAt) {
        throw new Error('受付結果を確認できませんでした。画面を更新して受付状況を確認してください。');
      }
      onAccepted(body.user, `${user.farmName}：次年度を継続しない旨を受け付けました。有料利用期限は ${formatBankContractEnd(body.user.bankNonRenewal.contractEndsAt)} です。`);
      setOpen(false);
      setConfirmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '通信できませんでした。画面を更新して受付状況を確認してください。');
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <Stack spacing={0.75} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Typography variant="caption">有料利用期限：{endLabel}</Typography>
      {accepted && <Typography variant="body2" color="primary" fontWeight={700}>次年度継続なし・受付済み</Typography>}
      {contract?.reason && <Typography variant="caption" color="error">{contract.reason}</Typography>}
      <Button variant="outlined" size="small" sx={{ whiteSpace: 'normal', lineHeight: 1.4 }}
        disabled={disabled || busy || !canRequest}
        onClick={() => { setConfirmed(false); setError(''); setOpen(true); }}>
        {busy ? '受付中...' : accepted ? '受付済み（期間中は利用可）' : '次年度を継続しない'}
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="bank-non-renewal-title">
        <DialogTitle id="bank-non-renewal-title">次年度を継続しない</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Stack sx={{ overflowWrap: 'anywhere' }}>
              <Typography fontWeight={800}>{user.farmName}</Typography>
              <Typography>{user.name}</Typography>
              <Typography>{user.email}</Typography>
            </Stack>
            <Alert severity="info">銀行振込には自動更新・自動引落しはありません。今回は「次年度を継続しない」希望を記録します。</Alert>
            <Typography fontWeight={800}>有料利用期限：{endLabel}</Typography>
            <Typography>期限までは{currentPlan}を引き続き利用できます。この受付で今すぐFreeには変更しません。</Typography>
            <Typography>この操作では退会・農場データの削除・返金は行いません。利用者都合の未使用期間分の返金は原則ありません。二重請求など個別確認が必要な場合は、別途対応してください。</Typography>
            <FormControlLabel control={<Checkbox checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />}
              label="利用者の希望、対象アカウント、利用期限と上記の説明を確認しました。" />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1, p: 2 }}>
          <Button onClick={close} disabled={busy} autoFocus>戻る</Button>
          <Button variant="contained" onClick={submit} disabled={busy || !confirmed || !canRequest}>
            {busy ? '受付中...' : '次年度継続なしを受け付ける'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
