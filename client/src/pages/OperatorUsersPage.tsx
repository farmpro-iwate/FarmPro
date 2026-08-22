import { useEffect, useState } from 'react';
import {
  Alert,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { getAuthToken } from '../services/authClient';

type OperatorUser = {
  id: string;
  farmId: string;
  farmName: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  active: boolean;
  plan: 'free' | 'standard' | 'pro';
};

function planLabel(plan: OperatorUser['plan']) {
  if (plan === 'standard') return 'Standard';
  if (plan === 'pro') return 'Pro';
  return 'Free';
}

export function OperatorUsersPage() {
  const [users, setUsers] = useState<OperatorUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setError('ログインが必要です');
      setLoading(false);
      return;
    }

    fetch('/api/operator/users', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.message || '利用者一覧を取得できませんでした');
        }
        return response.json();
      })
      .then((data) => setUsers(data.users || []))
      .catch((err) => setError(err instanceof Error ? err.message : '利用者一覧を取得できませんでした'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h4" fontWeight={900}>運営者管理</Typography>
        <Typography color="text.secondary">FarmPro利用者と現在のプランを確認します。</Typography>
      </Stack>

      {loading && (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={22} />
          <Typography>読み込み中...</Typography>
        </Stack>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && (
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="h6" fontWeight={800}>利用者一覧</Typography>
              {users.length === 0 ? (
                <Alert severity="info">現在、登録利用者はいません。</Alert>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>農場名</TableCell>
                      <TableCell>代表者</TableCell>
                      <TableCell>メール</TableCell>
                      <TableCell>プラン</TableCell>
                      <TableCell>状態</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.farmName}</TableCell>
                        <TableCell>{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{planLabel(user.plan)}</TableCell>
                        <TableCell>{user.active ? '利用中' : '停止'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

export default OperatorUsersPage;
