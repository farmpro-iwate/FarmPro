import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Chip, Divider, Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { CalfDetail } from './CalfDetail';
import { CattleIdSearchButton } from '../components/CattleIdSearchButton';
import { getAllRecords, getRecordById } from '../storage/repository';
import { getSalesList, type SaleRecord } from '../services/salesApi';
import type { Calf } from '../types/calf';
import type { StoredRecord } from '../storage/types';
import { formatSex } from '../utils/sex';

 type FeedingAlertAction = StoredRecord & {
  id: string;
  actionDate?: string;
  calfId?: string | number;
  calfName?: string;
  actionType?: string;
  status?: string;
  nextCheckDate?: string;
  memo?: string;
};

function value(v: unknown) {
  return v === undefined || v === null || v === '' ? '-' : String(v);
}

function saleForCalf(calf: Calf, sales: SaleRecord[]) {
  const numbers = [calf.calfNumber, calf.identificationNumber].filter(Boolean).map(String);
  return [...sales]
    .filter((sale) => sale.targetType === '子牛' && sale.status !== '取消' && numbers.includes(String(sale.targetNumber || '')))
    .sort((a, b) => `${b.updatedAt || b.createdAt || ''}`.localeCompare(`${a.updatedAt || a.createdAt || ''}`))[0];
}

function isCompletedSale(sale?: SaleRecord) {
  return sale?.status === '出荷済み' || sale?.status === '販売済み';
}

function calfNameOf(calf: Calf) {
  return String(calf.name || calf.calfNumber || '');
}

function CalfHistoryDetail({ calf, sale, actions }: { calf: Calf; sale?: SaleRecord; actions: FeedingAlertAction[] }) {
  const reason = calf.managementStatus === '牛台帳へ移行済み' ? '個体カルテへ移行済み' : sale?.status || '履歴';
  const calfActions = useMemo(() => actions
    .filter((item) => String(item.calfId || '') === String(calf.id) || String(item.calfName || '') === calfNameOf(calf))
    .sort((a, b) => String(b.actionDate || '').localeCompare(String(a.actionDate || ''))), [actions, calf]);

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Stack sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={800}>子牛期履歴：{value(calf.name)}</Typography>
          <Typography color="text.secondary">この画面は履歴閲覧専用です。新しい確認・対応記録は追加しません。</Typography>
        </Stack>
        <Button component={RouterLink} to="/calves" variant="outlined">子牛台帳へ戻る</Button>
        {calf.promotedCattleId && <Button component={RouterLink} to={`/cattle/${calf.promotedCattleId}`} variant="contained">個体カルテ</Button>}
        {sale && <Button component={RouterLink} to={`/sales/${sale.id}`} variant="outlined">出荷・販売詳細</Button>}
      </Stack>

      <Alert severity="info">現在の管理先：{reason}。子牛期の記録は削除せず、そのまま履歴として確認できます。</Alert>

      <Card><CardContent><Stack spacing={2}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="h6" fontWeight={800} sx={{ flexGrow: 1 }}>基本情報</Typography>
          <Chip label={reason} color={sale?.status === '販売済み' ? 'success' : 'default'} />
        </Stack>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}><Typography color="text.secondary">耳標番号</Typography><Typography fontWeight={800}>{value(calf.calfNumber)}</Typography></Grid>
          <Grid item xs={12} sm={4}><Typography color="text.secondary">個体識別番号</Typography><Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap><Typography fontWeight={800}>{value(calf.identificationNumber)}</Typography>{calf.identificationNumber && <CattleIdSearchButton />}</Stack></Grid>
          <Grid item xs={12} sm={4}><Typography color="text.secondary">名号</Typography><Typography fontWeight={800}>{value(calf.name)}</Typography></Grid>
          <Grid item xs={12} sm={4}><Typography color="text.secondary">生年月日</Typography><Typography fontWeight={800}>{value(calf.birthday)}</Typography></Grid>
          <Grid item xs={12} sm={4}><Typography color="text.secondary">性別</Typography><Typography fontWeight={800}>{formatSex(calf.sex)}</Typography></Grid>
          <Grid item xs={12} sm={4}><Typography color="text.secondary">母牛</Typography><Typography fontWeight={800}>{value(calf.motherName)}</Typography></Grid>
          <Grid item xs={12} sm={4}><Typography color="text.secondary">哺育方法</Typography><Typography fontWeight={800}>{value(calf.feedingMethod)}</Typography></Grid>
          <Grid item xs={12} sm={4}><Typography color="text.secondary">実際の離乳日</Typography><Typography fontWeight={800}>{value(calf.weaningDate)}</Typography></Grid>
          <Grid item xs={12} sm={4}><Typography color="text.secondary">離乳時体重</Typography><Typography fontWeight={800}>{calf.weaningWeight ? `${calf.weaningWeight}kg` : '-'}</Typography></Grid>
        </Grid>
      </Stack></CardContent></Card>

      {sale && <Card><CardContent><Stack spacing={1.25}>
        <Typography variant="h6" fontWeight={800}>出荷・販売履歴</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={3}><Typography color="text.secondary">状態</Typography><Typography fontWeight={800}>{value(sale.status)}</Typography></Grid>
          <Grid item xs={12} sm={3}><Typography color="text.secondary">市場</Typography><Typography fontWeight={800}>{value(sale.marketName)}</Typography></Grid>
          <Grid item xs={12} sm={3}><Typography color="text.secondary">出荷日</Typography><Typography fontWeight={800}>{value(sale.shippingDate)}</Typography></Grid>
          <Grid item xs={12} sm={3}><Typography color="text.secondary">販売日</Typography><Typography fontWeight={800}>{value(sale.saleDate)}</Typography></Grid>
        </Grid>
      </Stack></CardContent></Card>}

      <Card><CardContent><Stack spacing={1.5}>
        <Typography variant="h6" fontWeight={800}>子牛期の確認・対応履歴</Typography>
        <Divider />
        {calfActions.length === 0 ? <Alert severity="info">子牛期の確認・対応記録はありません。</Alert> : <Table size="small">
          <TableHead><TableRow><TableCell>日付</TableCell><TableCell>内容</TableCell><TableCell>状態</TableCell><TableCell>次回確認日</TableCell><TableCell>メモ</TableCell></TableRow></TableHead>
          <TableBody>{calfActions.map((item) => <TableRow key={item.id}><TableCell>{value(item.actionDate)}</TableCell><TableCell>{value(item.actionType)}</TableCell><TableCell>{value(item.status)}</TableCell><TableCell>{value(item.nextCheckDate)}</TableCell><TableCell>{value(item.memo)}</TableCell></TableRow>)}</TableBody>
        </Table>}
      </Stack></CardContent></Card>
    </Stack>
  );
}

export function CalfEntry() {
  const { id } = useParams();
  const [calf, setCalf] = useState<Calf | null>(null);
  const [sale, setSale] = useState<SaleRecord | undefined>();
  const [actions, setActions] = useState<FeedingAlertAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        const numericId = Number(id);
        const recordId = Number.isFinite(numericId) ? numericId : id;
        const [calfData, sales, actionRows] = await Promise.all([
          getRecordById<Calf>('calves', recordId),
          getSalesList(),
          getAllRecords<FeedingAlertAction>('feedingAlertActions'),
        ]);
        if (!calfData) throw new Error('子牛台帳に該当する子牛が見つかりませんでした。');
        setCalf(calfData);
        setSale(saleForCalf(calfData, sales));
        setActions(actionRows);
      } catch (err) {
        setError(err instanceof Error ? err.message : '子牛情報を読み込めませんでした。');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <Typography>読み込み中...</Typography>;
  if (error || !calf) return <Alert severity="warning">{error || '子牛情報が見つかりません。'}</Alert>;

  const historyOnly = calf.managementStatus === '牛台帳へ移行済み' || isCompletedSale(sale);
  return historyOnly ? <CalfHistoryDetail calf={calf} sale={sale} actions={actions} /> : <CalfDetail />;
}

export default CalfEntry;
