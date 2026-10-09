import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import { getAuthToken, getStoredAuthUser } from '../services/authClient';

type Operation = { id: string; farmId: string; initiatedBy: 'self' | 'operator';
  status: 'processing' | 'completed'; startedAt: string; completedAt: string | null };
type History = { total: number; operations: Operation[] };
const date = (value: string) => new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
function parse(value: any): History {
  if (!value || !Number.isInteger(value.total) || value.total < 0 || !Array.isArray(value.operations) ||
      value.operations.length > 100 || value.total < value.operations.length ||
      new Set(value.operations.map((row: any) => row?.id)).size !== value.operations.length ||
      value.operations.some((row: any) => !row || typeof row.id !== 'string' || !row.id ||
        typeof row.farmId !== 'string' || !row.farmId || !['self','operator'].includes(row.initiatedBy) ||
        !['processing','completed'].includes(row.status) || typeof row.startedAt !== 'string' || !Number.isFinite(Date.parse(row.startedAt)) ||
        (row.status === 'completed' ? typeof row.completedAt !== 'string' || !Number.isFinite(Date.parse(row.completedAt)) : row.completedAt !== null)))
    throw new Error('退会履歴の確認結果が不正です。再読み込みしてください。');
  return value;
}

export function OperatorWithdrawalHistory({ revision = 0 }: { revision?: number }) {
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const owner = useRef({ id: getStoredAuthUser()?.id, farmId: getStoredAuthUser()?.farmId, token: getAuthToken() });
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const timer = setTimeout(() => controller.abort(), 15000);
    const sameSession = () => getStoredAuthUser()?.id === owner.current.id &&
      getStoredAuthUser()?.farmId === owner.current.farmId && getAuthToken() === owner.current.token;
    setHistory(null); setError(''); setBusy(true);
    void (async () => {
      try {
        if (!owner.current.id || !owner.current.token || !sameSession()) throw new Error('ログイン情報が変わりました。画面を開き直してください。');
        const response = await fetch('/api/account-withdrawals/operator/history', {
          method: 'GET', cache: 'no-store', redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${owner.current.token}` },
        });
        const value = await response.json();
        if (!sameSession()) throw new Error('ログイン情報が変わりました。画面を開き直してください。');
        if (!response.ok) throw new Error(typeof value?.message === 'string' ? value.message : '退会履歴を取得できませんでした。');
        const parsed = parse(value);
        if (active) setHistory(parsed);
      } catch (err) {
        if (active) setError(err instanceof Error && err.name !== 'AbortError' ? err.message : '退会履歴を取得できませんでした。再確認してください。');
      } finally { clearTimeout(timer); if (active) setBusy(false); }
    })();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [refresh, revision]);

  return <Card><CardContent><Stack spacing={1.5}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
      <Typography component="h2" variant="h6" fontWeight={800}>退会履歴</Typography>
      <Button type="button" variant="outlined" disabled={busy} onClick={() => setRefresh(x => x + 1)}>{busy ? '履歴を読み込み中…' : '退会履歴を更新'}</Button>
    </Stack>
    <Typography variant="body2" color="text.secondary">退会を確定した人と処理結果を、新しい順に最大100件表示します。日時は日本時間です。</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    {history && <>
      <Typography variant="body2">全{history.total}件・表示{history.operations.length}件</Typography>
      {history.operations.length === 0 && <Alert severity="info">退会履歴はありません。</Alert>}
      {history.operations.map(row => <Stack key={row.id} spacing={0.5} sx={{ overflowWrap: 'anywhere' }}>
        <Divider />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.5, sm: 2 }}>
          <Typography fontWeight={700}>農場ID：{row.farmId}</Typography>
          <Typography>退会操作：{row.initiatedBy === 'self' ? '利用者本人' : '運営者'}</Typography>
          <Typography>状態：{row.status === 'completed' ? '退会完了' : 'データ削除処理中'}</Typography>
        </Stack>
        <Typography variant="body2">開始：{date(row.startedAt)}</Typography>
        <Typography variant="body2">完了：{row.completedAt ? date(row.completedAt) : '未完了'}</Typography>
        <Typography variant="caption" color="text.secondary">受付番号：{row.id}</Typography>
      </Stack>)}
    </>}
  </Stack></CardContent></Card>;
}
