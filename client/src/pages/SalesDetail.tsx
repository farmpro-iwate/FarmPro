import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Chip, Grid, Stack, Typography } from '@mui/material';
import { getSale, type SaleRecord } from '../services/salesApi';

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function yen(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : `${n.toLocaleString('ja-JP')}円`;
}

function kg(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : `${n.toLocaleString('ja-JP')}kg`;
}

function statusColor(status?: string) {
  if (status === '販売済み') return 'success';
  if (status === '出荷済み') return 'info';
  if (status === '取消') return 'default';
  return 'warning';
}

export function SalesDetail() {
  const { id } = useParams();
  const [record, setRecord] = useState<SaleRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setError('表示する出荷・販売記録IDがありません。');
      setLoading(false);
      return;
    }
    getSale(id)
      .then((row) => {
        setRecord(row);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : '出荷・販売記録を取得できませんでした。'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>出荷・販売 詳細</Typography>
        <Button component={RouterLink} to="/sales" variant="outlined">一覧へ戻る</Button>
        {record && <Button component={RouterLink} to={`/sales/${record.id}/edit`} variant="outlined">修正</Button>}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {record && <>
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Typography variant="h6" fontWeight={800}>{value(record.targetName)}</Typography>
                <Chip label={value(record.status)} color={statusColor(record.status) as any} />
              </Stack>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}><Typography color="text.secondary">区分</Typography><Typography fontWeight={700}>{value(record.targetType)}</Typography></Grid>
                <Grid item xs={12} sm={4}><Typography color="text.secondary">対象番号</Typography><Typography fontWeight={700}>{value(record.targetNumber)}</Typography></Grid>
                <Grid item xs={12} sm={4}><Typography color="text.secondary">性別</Typography><Typography fontWeight={700}>{value(record.sex)}</Typography></Grid>
                <Grid item xs={12} sm={4}><Typography color="text.secondary">生年月日</Typography><Typography fontWeight={700}>{value(record.birthday)}</Typography></Grid>
                <Grid item xs={12} sm={4}><Typography color="text.secondary">母牛</Typography><Typography fontWeight={700}>{value(record.motherName)}</Typography></Grid>
              </Grid>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6" fontWeight={800}>出荷・販売内容</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}><Typography color="text.secondary">出荷予定日</Typography><Typography fontWeight={700}>{value(record.shippingPlanDate)}</Typography></Grid>
                <Grid item xs={12} sm={4}><Typography color="text.secondary">出荷日</Typography><Typography fontWeight={700}>{value(record.shippingDate)}</Typography></Grid>
                <Grid item xs={12} sm={4}><Typography color="text.secondary">販売日</Typography><Typography fontWeight={700}>{value(record.saleDate)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography color="text.secondary">販売先・購買者</Typography><Typography fontWeight={700}>{value(record.buyer)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography color="text.secondary">市場名</Typography><Typography fontWeight={700}>{value(record.marketName)}</Typography></Grid>
                <Grid item xs={12} sm={4}><Typography color="text.secondary">販売体重</Typography><Typography fontWeight={700}>{kg(record.saleWeight)}</Typography></Grid>
                <Grid item xs={12} sm={4}><Typography color="text.secondary">販売金額</Typography><Typography fontWeight={700}>{yen(record.salePrice)}</Typography></Grid>
                <Grid item xs={12} sm={4}><Typography color="text.secondary">販売理由</Typography><Typography fontWeight={700}>{value(record.reason)}</Typography></Grid>
                <Grid item xs={12}><Typography color="text.secondary">メモ</Typography><Typography fontWeight={700}>{value(record.memo)}</Typography></Grid>
              </Grid>
            </Stack>
          </CardContent>
        </Card>
      </>}
    </Stack>
  );
}

export default SalesDetail;
