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
  status: 'pending_payment' | 'active' | 'ended' | 'expired';
  createdAt: string;
  activatedAt?: string;
  activatedBy?: string;
  endedAt?: string;
  endedBy?: string;
  expiredAt?: string;
};

function planLabel(plan: BankTransferApplication['plan']) {
  return plan === 'pro' ? 'Pro' : 'Standard';
}

function yen(value: number) {
  return `${value.toLocaleString('ja-JP')}円`;
}

function dateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP');
}

function statusLabel(status: BankTransferApplication['status']) {
  if (status === 'active') return '有効化済み';
  if (status === 'ended') return '終了';
  if (status === 'expired') return '期限切れ';
  return '入金待ち';
}

function processedAt(item: BankTransferApplication) {
  if (item.status === 'active') return item.activatedAt;
  if (item.status === 'ended') return item.endedAt;
  if (item.status === 'expired') return item.expiredAt;
  return undefined;
}

function processedBy(item: BankTransferApplication) {
  if (item.status === 'active') return item.activatedBy || '-';
  if (item.status === 'ended') return item.endedBy || '-';
  if (item.status === 'expired') return '自動';
  return '-';
}

export function OperatorBankTransfersPage() {
  const [applications, setApplications] = useState<BankTransferApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [processingId, setProcessingId] = useState('');

  const loadApplications = async () => {
    const token = getAuthToken();
    if (!token) throw new Error('ログインが必要です');
    const response = await fetch('/api/bank-transfer-applications', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.message || '銀行振込申込一覧を取得できませんでした');
    }
    const data = await response.json();
    setApplications(data.applications || []);
  };

  useEffect(() => {
    loadApplications()
      .catch((err) => setError(err instanceof Error ? err.message : '銀行振込申込一覧を取得できませんでした'))
      .finally(() => setLoading(false));
  }, []);

  const activate = async (item: BankTransferApplication) => {
    if (item.status !== 'pending_payment') return;
    if (!window.confirm(`${item.farmName} の ${planLabel(item.plan)} を入金確認済みとして有効化しますか？`)) return;

    const token = getAuthToken();
    if (!token) {
      setError('ログインが必要です');
      return;
    }

    setProcessingId(item.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/bank-transfer-applications/${item.id}/activate`, {
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message || '入金確認を反映できませんでした');
      }
      const data = await response.json();
      if (data.application) {
        setApplications((current) => current.map((application) =>
          application.id === data.application.id ? data.application : application
        ));
      } else {
        await loadApplications();
      }
      setMessage(`${item.farmName} の ${planLabel(item.plan)} を有効化しました。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '入金確認を反映できませんでした');
    } finally {
      setProcessingId('');
    }
  };

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
      {message && <Alert severity="success">{message}</Alert>}

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
                      <TableCell>処理日時</TableCell>
                      <TableCell>処理者</TableCell>
                      <TableCell>操作</TableCell>
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
                        <TableCell>{statusLabel(item.status)}</TableCell>
                        <TableCell>{dateTime(processedAt(item))}</TableCell>
                        <TableCell>{processedBy(item)}</TableCell>
                        <TableCell>
                          {item.status === 'pending_payment' ? (
                            <Button
                              variant="contained"
                              size="small"
                              disabled={processingId === item.id}
                              onClick={() => activate(item)}
                            >
                              {processingId === item.id ? '処理中...' : '入金確認して有効化'}
                            </Button>
                          ) : item.status === 'expired' ? (
                            <Typography variant="body2" color="text.secondary">自動取消済み</Typography>
                          ) : (
                            <Typography variant="body2" color="text.secondary">処理済み</Typography>
                          )}
                        </TableCell>
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
