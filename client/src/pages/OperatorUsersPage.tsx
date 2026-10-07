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
import { BankNonRenewalAction, type BankNonRenewalSummary } from '../components/BankNonRenewalAction';
import { canHideOperatorListUser, useOperatorListVisibility } from '../hooks/useOperatorListVisibility';
import { OperatorWithdrawalInbox } from '../components/WithdrawalRequests';
import { AccountWithdrawalAction } from '../components/AccountWithdrawalAction';

type AiUnansweredLog = {
  id: string;
  question: string;
  reason: 'unsupported-question' | 'ai-error';
  detail: string;
  createdAt: string;
  farmId: string;
  farmName: string;
  plan: 'free' | 'standard' | 'pro';
};

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
  bankNonRenewal?: BankNonRenewalSummary | null;
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
  const [aiUnansweredLogs, setAiUnansweredLogs] = useState<AiUnansweredLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [processingId, setProcessingId] = useState('');
  const currentUserId = getStoredAuthUser()?.id || '';
  const [listView, setListView] = useState<'visible' | 'hidden' | 'all'>('visible');
  const visibility = useOperatorListVisibility(currentUserId);
  // Paid/review-needed accounts always return to the normal list, even when a
  // browser preference was saved while they were Free. Totals keep every user.
  const isListHidden = (user: OperatorUser) =>
    canHideOperatorListUser(user, currentUserId) && visibility.hiddenIds.has(user.id);
  const hiddenCount = users.filter(isListHidden).length;
  const displayedUsers = users.filter((user) =>
    listView === 'all' || (listView === 'hidden' ? isListHidden(user) : !isListHidden(user)));

  const changeListVisibility = (user: OperatorUser, hidden: boolean) => {
    if (processingId || !canHideOperatorListUser(user, currentUserId)) return;
    if (hidden && !window.confirm(`${user.farmName}\n${user.name}\n${user.email}\n\nこの利用者を、このブラウザーの通常一覧から非表示にしますか？\nアカウント・ログイン・契約・牛のデータは変更しません。「非表示」一覧から戻せます。`)) return;
    if (getStoredAuthUser()?.id !== currentUserId) return;
    setMessage('');
    if (visibility.setHidden(user.id, hidden)) {
      setMessage(hidden
        ? `${user.farmName} を通常一覧から非表示にしました。「非表示」一覧から戻せます。退会・利用停止・削除はしていません。`
        : `${user.farmName} を通常一覧に戻しました。アカウントや契約は変更していません。`);
    }
  };

  const loadAiUnansweredLogs = async () => {
    const token = getAuthToken();
    if (!token) throw new Error('ログインが必要です');

    const response = await fetch(`/api/operator/users/ai-unanswered?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.message || '未回答AI質問を取得できませんでした');
    }
    const data = await response.json();
    setAiUnansweredLogs(data.logs || []);
  };

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
    Promise.all([loadUsers(), loadAiUnansweredLogs()])
      .catch((err) => setError(err instanceof Error ? err.message : '運営者データを取得できませんでした'))
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

  const actionButtonSx = {
    maxWidth: '100%',
    whiteSpace: 'normal',
    lineHeight: 1.25,
    textAlign: 'center',
  } as const;

  const summaryItems = [
    { label: '総利用者', value: users.length },
    { label: 'Free', value: users.filter((user) => user.plan === 'free').length },
    { label: 'Standard', value: users.filter((user) => user.plan === 'standard').length },
    { label: 'Pro', value: users.filter((user) => user.plan === 'pro').length },
    { label: '停止中', value: users.filter((user) => !user.active).length },
  ];

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h4" fontWeight={900}>運営者管理</Typography>
        <Typography color="text.secondary">FarmPro利用者と現在のプラン・支払方法・利用状態を確認します。</Typography>
      </Stack>

      <OperatorWithdrawalInbox />

      {loading && (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={22} />
          <Typography>読み込み中...</Typography>
        </Stack>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      {message && <Alert severity="success">{message}</Alert>}

      {!loading && !error && (
        <>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                {summaryItems.map((item) => (
                  <Stack
                    key={item.label}
                    spacing={0.25}
                    sx={{
                      minWidth: 120,
                      flex: '1 1 120px',
                      px: 1.5,
                      py: 1,
                      borderRight: { sm: '1px solid' },
                      borderColor: { sm: 'divider' },
                      '&:last-of-type': { borderRight: 'none' },
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                    <Typography variant="h5" fontWeight={900}>{item.value}</Typography>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="h6" fontWeight={800}>利用者一覧</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap aria-label="利用者の表示切替">
                  {([
                    ['visible', `通常表示（${users.length - hiddenCount}）`],
                    ['hidden', `非表示（${hiddenCount}）`],
                    ['all', `すべて（${users.length}）`],
                  ] as const).map(([value, label]) => (
                    <Button key={value} size="small" variant={listView === value ? 'contained' : 'outlined'}
                      aria-pressed={listView === value} onClick={() => setListView(value)}>{label}</Button>
                  ))}
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  非表示は、このブラウザー・この運営者の一覧表示だけの設定です。別端末には反映されません。退会・利用停止・課金停止・データ削除は行いません。上の件数は非表示の利用者も含みます。
                </Typography>
                {visibility.warning && <Alert severity="warning">{visibility.warning}</Alert>}
                {displayedUsers.length === 0 ? (
                  <Alert severity="info">{users.length === 0 ? '現在、登録利用者はいません。' : listView === 'hidden' ? '非表示の利用者はいません。' : 'この表示条件に該当する利用者はいません。'}</Alert>
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
                        {displayedUsers.map((user) => {
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
                                  {isListHidden(user) && <Typography variant="caption" color="text.secondary">一覧で非表示</Typography>}
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
                                    <BankNonRenewalAction
                                      user={user}
                                      disabled={Boolean(processingId)}
                                      onBusyChange={(busy) => {
                                        setProcessingId(busy ? user.id : '');
                                        if (busy) { setError(''); setMessage(''); }
                                      }}
                                      onAccepted={(updatedUser, text) => {
                                        updateUserFromResponse(user.id, { user: updatedUser });
                                        setMessage(text);
                                      }}
                                    />
                                  )}
                                  {canResetUnpaid && (
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      sx={actionButtonSx}
                                      disabled={Boolean(processingId)}
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
                                      disabled={Boolean(processingId)}
                                      onClick={() => setUserActive(user, !user.active)}
                                    >
                                      {processingId === user.id ? '処理中...' : user.active ? '利用停止' : '利用再開'}
                                    </Button>
                                  ) : user.paymentSource !== 'bank' && !canResetUnpaid ? (
                                    <Typography variant="body2" color="text.secondary">-</Typography>
                                  ) : null}
                                    {user.id !== currentUserId && <AccountWithdrawalAction target={user} onCompleted={() => { void loadUsers(); void loadAiUnansweredLogs(); }} />}
                                  {canHideOperatorListUser(user, currentUserId) && (
                                    <Button variant="text" size="small" sx={actionButtonSx}
                                      disabled={Boolean(processingId)}
                                      onClick={() => changeListVisibility(user, !isListHidden(user))}>
                                      {isListHidden(user) ? '再表示する' : '非表示にする'}
                                    </Button>
                                  )}
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

          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Stack spacing={0.25}>
                  <Typography variant="h6" fontWeight={800}>未回答AI質問</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Standard / Proで回答できなかった質問を、新しい順に最大100件表示します。
                  </Typography>
                </Stack>

                {aiUnansweredLogs.length === 0 ? (
                  <Alert severity="info">現在、未回答AI質問はありません。</Alert>
                ) : (
                  <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
                    <Table size="small" sx={{ minWidth: 760 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ width: '20%' }}>農場</TableCell>
                          <TableCell sx={{ width: '40%' }}>質問</TableCell>
                          <TableCell sx={{ width: '18%' }}>理由</TableCell>
                          <TableCell sx={{ width: '22%' }}>日時</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {aiUnansweredLogs.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Stack spacing={0.25}>
                                <Typography fontWeight={700}>{item.farmName}</Typography>
                                <Typography variant="body2" color="text.secondary">{planLabel(item.plan)}</Typography>
                              </Stack>
                            </TableCell>
                            <TableCell sx={{ overflowWrap: 'anywhere' }}>{item.question}</TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {item.reason === 'unsupported-question' ? '未対応の質問' : 'AI/APIエラー'}
                              </Typography>
                              {item.detail && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                                  {item.detail}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              {new Date(item.createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Stack>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}

export default OperatorUsersPage;