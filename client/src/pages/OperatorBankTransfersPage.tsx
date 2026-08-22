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

type BankTransferApplication = {
  id: string;
  farmName: string;
  name: string;
  email: string;
  plan: 'standard' | 'pro';
  amountTaxIncluded: number;
  status: 'pending_payment';
  createdAt: string;
};

function planLabel(plan: BankTransferApplication['plan']) {
  return plan === 'pro' ? 'Pro' : 'Standard';
}

function yen(value: number) {
  return `${value.toLocaleString('ja-JP')}円`;
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP');
}

export function OperatorBankTransfersPage() {
  const [applications, setApplications] = useState<BankTransferApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setError('ログインが必要です');
      setLoading(false);
      return;
    }

    fetch('/api/bank-transfer-applications', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.message || '銀行振込申込一覧を取得できませんでした');
        }
        return response.json();
      })
      .then((data) => setApplications(data.applications || []))
      .catch((err) => setError(err instanceof Error ? err.message : '銀行振込申込一覧を取得できませんでした'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h4" fontWeight={900}>運営者管理</Typography>
        <Typography color="text.secondary">銀行振込のお申し込み状況を確認します。</Typography>
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
              <Typography variant="h6" fontWeight={800}>銀行振込申込一覧</Typography>
              {applications.length === 0 ? (
                <Alert severity="info">現在、銀行振込のお申し込みはありません。</Alert>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>申込日時</TableCell>
                      <TableCell>農場名</TableCell>
                      <TableCell>代表者</TableCell>
                      <TableCell>メール</TableCell>
                      <TableCell>プラン</TableCell>
                      <TableCell>金額</TableCell>
                      <TableCell>状態</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {applications.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{dateTime(item.createdAt)}</TableCell>
                        <TableCell>{item.farmName}</TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.email}</TableCell>
                        <TableCell>{planLabel(item.plan)}</TableCell>
                        <TableCell>{yen(item.amountTaxIncluded)}</TableCell>
                        <TableCell>入金待ち</TableCell>
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

export default OperatorBankTransfersPage;
