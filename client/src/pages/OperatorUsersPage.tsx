import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { getAuthToken, getStoredAuthUser } from '../services/authClient';

type OperatorUser = {
  id: string;
  farmId: string;
  farmName: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  active: boolean;
  plan: 'free' | 'standard' | 'pro';
  paymentSource: 'stripe' | 'bank' | 'free' | 'other';
  paymentIssue?: string;
};

function planLabel(plan: OperatorUser['plan']) {
  if (plan === 'standard') return 'Standard';
  if (plan === 'pro') return 'Pro';
  return 'Free';
}

function paymentLabel(source: OperatorUser['paymentSource']) {
  if (source === 'stripe') return 'Stripe';
  if (source === 'bank') return '銀行振込';
  if (source === 'free') return 'Free';
  return '確認要';
}

export function OperatorUsersPage() {
  const [users, setUsers] = useState<OperatorUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [processingId, setProcessingId] = useState('');
  const currentUserId = getStoredAuthUser()?.id || '';

  const loadUsers = async () => {
    const token = getAuthToken();
    if (!token) throw new Error('ログインが必要です');

    const response = await fetch(`/api/operator/users?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.message || '利用者一覧を取得できませんでした');
    }
    const data = await response.json();
    setUsers(data.users || []);
  };

  useEffect(() => {
    loadUsers()
      .catch((err) => setError(err instanceof Error ? err.message : '利用者一覧を取得できませんでした'))
      .finally(() => setLoading(false));
  }, []);

  const updateUserFromResponse = (userId: string, data: { user?: Partial<OperatorUser> }, forceFree = false) => {
    if (!data.user) return false;
    setUsers((current) => current.map((item) =>
      item.id === userId
        ? {
            ...item,
            ...data.user,
            ...(forceFree ? { plan: 'free' as const, paymentSource: 'free' as const, paymentIssue: '' } : {}),
          }
        : item
    ));
    return true;
  };

  const setUserActive = async (user: OperatorUser, active: boolean) => {
    const actionLabel = active ? '利用を再開' : '利用を停止';
    const detail = active
      ? '再びログイン・API利用が可能になります。プランや保存データは変更しません。'
      : 'ログイン中の端末を含めてアクセスできなくなります。プランや保存データは削除しません。';
    if (!window.confirm(`${user.farmName} の${actionLabel}を実行しますか？\n${detail}`)) return;

    const token = getAuthToken();
    if (!token) {
      setError('ログインが必要です');
      return;
    }

    setProcessingId(user.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/operator/users/${user.id}/active`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ active }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message || '利用状態を変更できませんでした');
      }
      const data = await response.json();
      if (!updateUserFromResponse(user.id, data)) await loadUsers();
      setMessage(`${user.farmName} の${actionLabel}が完了しました。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '利用状態を変更できませんでした');
    } finally {
      setProcessingId('');
    }
  };

  const resetUnpaidToFree = async (user: OperatorUser) => {
    if (!window.confirm(`${user.farmName} をFreeへ戻しますか？\n有効なStripe・銀行振込契約がないことを再確認して処理します。`)) return;

    const token = getAuthToken();
    if (!token) {
      setError('ログインが必要です');
      return;
    }

    setProcessingId(user.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/operator/users/${user.id}/reset-unpaid-to-free`, {
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message || 'Freeへ変更できませんでした');
      }
      const data = await response.json();
      if (!updateUserFromResponse(user.id, data, true)) await loadUsers();
      setMessage(`${user.farmName} をFreeへ変更しました。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Freeへ変更できませんでした');
    } finally {
      setProcessingId('');
    }
  };

  const endBankTransfer = async (user: OperatorUser) => {
    if (!window.confirm(`${user.farmName} の銀行振込契約を終了し、Freeへ変更しますか？`)) return;

    const token = getAuthToken();
    if (!token) {
      setError('ログインが必要です');
      return;
    }

    setProcessingId(user.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/operator/users/${user.id}/end-bank-transfer`, {
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message || '銀行振込契約を終了できませんでした');
      }
      const data = await response.json();
      if (!updateUserFromResponse(user.id, data, true)) await loadUsers();
      setMessage(`${user.farmName} をFreeへ変更しました。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '銀行振込契約を終了できませんでした');
    } finally {
      setProcessingId('');
    }
  };

  const actionButtonSx = {
    maxWidth: '100%',
    whiteSpace: 'normal',
    lineHeight: 1.25,
    textAlign: 'center',
  } as const;

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h4" fontWeight={900}>運営者管理</Typography>
        <Typography color="text.secondary">FarmPro利用者と現在のプラン・支払方法・利用状態を確認します。</Typography>
      </Stack>

      {loading && (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={22} />
          <Typography>読み込み中...</Typography>
        </Stack>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}

      {!loading && !error && (
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="h6" fontWeight={800}>利用者一覧</Typography>
              {users.length === 0 ? (
                <Alert severity="info">現在、登録利用者はいません。</Alert>
              ) : (
                <TableContainer sx={{ width: '100%', overflowX: 'hidden' }}>
                  <Table size="small" sx={{ width: '100%', tableLayout: 'fixed' }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: '35%' }}>利用者</TableCell>
                        <TableCell sx={{ width: '15%' }}>契約</TableCell>
                        <TableCell sx={{ width: '18%' }}>確認</TableCell>
                        <TableCell sx={{ width: '10%', whiteSpace: 'nowrap' }}>状態</TableCell>
                        <TableCell sx={{ width: '22%' }}>操作</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {users.map((user) => {
                        const canResetUnpaid = user.paymentSource === 'other' &&
                          user.paymentIssue === '有料プランですが、有効な決済記録がありません';
                        const isCurrentUser = user.id === currentUserId;
                        return (
                          <TableRow key={user.id}>
                            <TableCell>
                              <Stack spacing={0.25}>
                                <Typography fontWeight={800}>{user.farmName}</Typography>
                                <Typography variant="body2">{user.name}</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                                  {user.email}
                                </Typography>
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Stack spacing={0.25}>
                                <Typography fontWeight={700}>{planLabel(user.plan)}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {paymentLabel(user.paymentSource)}
                                </Typography>
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color={user.paymentIssue ? 'text.primary' : 'text.secondary'} sx={{ overflowWrap: 'anywhere' }}>
                                {user.paymentIssue || '-'}
                              </Typography>
                            </TableCell>
                            <TableCell>{user.active ? '利用中' : '停止'}</TableCell>
                            <TableCell>
                              <Stack spacing={0.75} alignItems="stretch">
                                {user.paymentSource === 'bank' && (
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    sx={actionButtonSx}
                                    disabled={processingId === user.id}
                                    onClick={() => endBankTransfer(user)}
                                  >
                                    {processingId === user.id ? '処理中...' : '銀行振込を終了してFreeへ'}
                                  </Button>
                                )}
                                {canResetUnpaid && (
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    sx={actionButtonSx}
                                    disabled={processingId === user.id}
                                    onClick={() => resetUnpaidToFree(user)}
                                  >
                                    {processingId === user.id ? '処理中...' : '決済記録なし → Freeへ'}
                                  </Button>
                                )}
                                {!isCurrentUser ? (
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    sx={actionButtonSx}
                                    disabled={processingId === user.id}
                                    onClick={() => setUserActive(user, !user.active)}
                                  >
                                    {processingId === user.id ? '処理中...' : user.active ? '利用停止' : '利用再開'}
                                  </Button>
                                ) : user.paymentSource !== 'bank' && !canResetUnpaid ? (
                                  <Typography variant="body2" color="text.secondary">-</Typography>
                                ) : null}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

export default OperatorUsersPage;
