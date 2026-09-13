import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { Calf } from '../types/calf';
import { getAllRecords, getRecordById } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import { promoteCalf, registerCalfEarTag, registerCalfName } from '../services/calfApi';
import { getAnimalFeedCostTotal } from '../services/feedInventoryApi';
import { getAnimalExpenseTotals, type AnimalExpenseTotals } from '../services/expensesApi';
import { getCalfYearlyFarmExpenseAllocation } from '../services/farmExpenseAllocation';
import { getAllFarmExpenseAllocation } from '../services/allFarmExpenseAllocation';
import {
  getBreedingCattleAcquisitionAllocationForCalf,
  type BreedingCattleAcquisitionAllocationResult,
} from '../services/breedingCattleAcquisitionAllocation';
import { getSalesList, type SaleProductionCostBreakdownSnapshot, type SaleRecord } from '../services/salesApi';
import { formatSex } from '../utils/sex';
import { formatTemporaryCalfNumber } from '../utils/temporaryCalfNumber';

type FeedingAlertAction = StoredRecord & {
  id: string;
  actionDate?: string;
  calfId?: string | number;
  calfName?: string;
  ageDays?: string | number;
  alertType?: string;
  actionType?: string;
  status?: string;
  nextCheckDate?: string;
  memo?: string;
};

type FeedingGuide = StoredRecord & {
  id: string | number;
  ageDays?: string | number;
  stageName?: string;
  starterKg?: string | number;
  growingFeedKg?: string | number;
  roughageKg?: string | number;
  memo?: string;
};

const emptyExpenseTotals: AnimalExpenseTotals = { medical: 0, breeding: 0, other: 0, nonFeedTotal: 0 };
const emptyAcquisitionAllocation: BreedingCattleAcquisitionAllocationResult = { amount: 0, allocationParity: 7 };

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function ageDaysFromBirthday(birthday?: string) {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  return Math.floor((today.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
}

function calfNameOf(calf: Calf | null) {
  if (!calf) return '';
  return String(calf.name || calf.calfNumber || '');
}

function statusColor(status: string) {
  if (status.includes('済み')) return 'success';
  if (status.includes('対応中')) return 'warning';
  if (status.includes('様子見')) return 'info';
  if (status.includes('再確認')) return 'error';
  return 'default';
}

function alertColor(alertType: string) {
  if (alertType.includes('不足')) return 'warning';
  if (alertType.includes('多め')) return 'error';
  if (alertType.includes('実績なし')) return 'info';
  return 'default';
}

function nearestGuide(ageDays: number | null, guides: FeedingGuide[]) {
  if (ageDays === null || guides.length === 0) return null;
  return [...guides].sort((a, b) => {
    const da = Math.abs(Number(a.ageDays || 0) - ageDays);
    const db = Math.abs(Number(b.ageDays || 0) - ageDays);
    return da - db;
  })[0];
}

function newActionLink(calf: Calf | null, ageDays: number | null) {
  const params = new URLSearchParams();
  params.set('calfId', String(calf?.id || ''));
  params.set('calfName', calfNameOf(calf));
  params.set('ageDays', ageDays === null ? '' : String(ageDays));
  params.set('alertType', 'その他');
  params.set('memo', '子牛情報から登録');
  return `/feeding-alert-actions/new?${params.toString()}`;
}

function saleRegistrationLink(calf: Calf | null) {
  const params = new URLSearchParams();
  const calfNumber = String(calf?.calfNumber || '');
  params.set('source', 'calf');
  params.set('targetType', '子牛');
  params.set('targetNumber', calfNumber.startsWith('TEMP-') ? '' : calfNumber);
  params.set('targetName', String(calf?.name || ''));
  params.set('sex', String(calf?.sex || ''));
  params.set('birthday', String(calf?.birthday || ''));
  params.set('motherName', String(calf?.motherName || ''));
  params.set('returnTo', `/calves/${calf?.id || ''}`);
  return `/sales/new?${params.toString()}`;
}

function matchesCalfSale(record: SaleRecord, calf: Calf) {
  if (record.targetType !== '子牛' || record.status !== '販売済み') return false;
  if (record.calfId && String(record.calfId) === String(calf.id)) return true;

  const calfNumber = String(calf.calfNumber || '').trim();
  const targetNumber = String(record.targetNumber || '').trim();
  const calfName = String(calf.name || '').trim();
  const targetName = String(record.targetName || '').trim();
  const calfBirthday = String(calf.birthday || '').slice(0, 10);
  const saleBirthday = String(record.birthday || '').slice(0, 10);

  if (calfNumber && !calfNumber.startsWith('TEMP-') && targetNumber === calfNumber) return true;
  return Boolean(calfName && targetName === calfName && calfBirthday && saleBirthday === calfBirthday);
}

function SoldCalfCostChart({ sale }: { sale: SaleRecord }) {
  const breakdown = sale.productionCostBreakdownSnapshot as (SaleProductionCostBreakdownSnapshot & { farmCommon?: number; adjustment?: number }) | undefined;
  const salePrice = Number(sale.salePrice || 0);
  const productionCost = Number(sale.productionCostSnapshot || 0);
  const profit = Number(sale.profitSnapshot || 0);

  if (!breakdown) {
    return <Alert severity="info">販売時の生産費内訳がまだありません。販売記録を一度更新すると内訳を固定保存できます。</Alert>;
  }

  const baseCost =
    Number(breakdown.acquisition || 0) +
    Number(breakdown.feed || 0) +
    Number(breakdown.medical || 0) +
    Number(breakdown.breeding || 0) +
    Number(breakdown.other || 0) +
    Number(breakdown.farmCommon || 0);
  const adjustment = breakdown.adjustment === undefined
    ? Math.round(productionCost - baseCost)
    : Number(breakdown.adjustment || 0);

  const items = [
    { key: 'acquisition', label: '母牛取得原価配賦', amount: Number(breakdown.acquisition || 0), color: '#1565c0' },
    { key: 'feed', label: '飼料費', amount: Number(breakdown.feed || 0), color: '#2e7d32' },
    { key: 'medical', label: '診療・医薬品費', amount: Number(breakdown.medical || 0), color: '#8e24aa' },
    { key: 'breeding', label: '繁殖費', amount: Number(breakdown.breeding || 0), color: '#ef6c00' },
    { key: 'other', label: 'その他経費', amount: Number(breakdown.other || 0), color: '#546e7a' },
    { key: 'farmCommon', label: '農場共通経費', amount: Number(breakdown.farmCommon || 0), color: '#00838f' },
    { key: 'adjustment', label: '販売時調整額', amount: adjustment, color: '#6d4c41' },
    { key: 'profit', label: profit >= 0 ? '利益' : '損失', amount: Math.max(0, profit), color: '#f9a825' },
  ];
  const positiveItems = items.filter((item) => item.amount > 0);
  const chartTotal = positiveItems.reduce((sum, item) => sum + item.amount, 0);
  let cursor = 0;
  const gradientParts = positiveItems.map((item) => {
    const start = chartTotal > 0 ? (cursor / chartTotal) * 360 : 0;
    cursor += item.amount;
    const end = chartTotal > 0 ? (cursor / chartTotal) * 360 : 0;
    return `${item.color} ${start}deg ${end}deg`;
  });

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
        <Stack spacing={1}>
          <Stack spacing={0.2}>
            <Typography fontWeight={900}>販売額の内訳</Typography>
            <Typography variant="body2" color="text.secondary">販売時に固定した生産費の内訳と利益です。</Typography>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} alignItems="center">
            <Box
              aria-label="販売額の内訳円グラフ"
              sx={{
                width: { xs: 210, sm: 240 },
                height: { xs: 210, sm: 240 },
                borderRadius: '50%',
                background: gradientParts.length > 0 ? `conic-gradient(${gradientParts.join(', ')})` : '#e0e0e0',
                position: 'relative',
                flexShrink: 0,
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  inset: '25%',
                  borderRadius: '50%',
                  backgroundColor: 'background.paper',
                },
              }}
            >
              <Stack alignItems="center" justifyContent="center" sx={{ position: 'absolute', inset: 0, zIndex: 1, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">販売額</Typography>
                <Typography variant="h6" fontWeight={900}>{Math.round(salePrice).toLocaleString('ja-JP')}円</Typography>
              </Stack>
            </Box>
            <Stack spacing={0.75} sx={{ width: '100%', maxWidth: 600 }}>
              {items.map((item) => (
                <Stack key={item.key} direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                  <Stack direction="row" spacing={0.8} alignItems="center">
                    <Box sx={{ width: 14, height: 14, borderRadius: 0.5, backgroundColor: item.color, flexShrink: 0 }} />
                    <Typography>{item.label}</Typography>
                  </Stack>
                  <Typography fontWeight={800}>{Math.round(item.key === 'profit' ? profit : item.amount).toLocaleString('ja-JP')}円</Typography>
                </Stack>
              ))}
              <Divider />
              <Stack direction="row" justifyContent="space-between">
                <Typography fontWeight={900}>生産費合計</Typography>
                <Typography fontWeight={900}>{Math.round(productionCost).toLocaleString('ja-JP')}円</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography fontWeight={900}>利益</Typography>
                <Typography fontWeight={900}>{Math.round(profit).toLocaleString('ja-JP')}円</Typography>
              </Stack>
            </Stack>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function CalfDetail() {
  const params = useParams();
  const calfId = String(params.id || '');
  const [calf, setCalf] = useState<Calf | null>(null);
  const [actions, setActions] = useState<FeedingAlertAction[]>([]);
  const [guides, setGuides] = useState<FeedingGuide[]>([]);
  const [soldSale, setSoldSale] = useState<SaleRecord | null>(null);
  const [feedCostTotal, setFeedCostTotal] = useState(0);
  const [expenseTotals, setExpenseTotals] = useState<AnimalExpenseTotals>(emptyExpenseTotals);
  const [farmExpenseAllocation, setFarmExpenseAllocation] = useState(0);
  const [acquisitionAllocation, setAcquisitionAllocation] = useState<BreedingCattleAcquisitionAllocationResult>(emptyAcquisitionAllocation);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [earTagInput, setEarTagInput] = useState('');
  const [earTagSaving, setEarTagSaving] = useState(false);
  const [earTagMessage, setEarTagMessage] = useState('');
  const [earTagError, setEarTagError] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMessage, setNameMessage] = useState('');
  const [nameError, setNameError] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [promotionMessage, setPromotionMessage] = useState('');
  const [promotionError, setPromotionError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const numericId = Number(calfId);
      const recordId = Number.isFinite(numericId) ? numericId : calfId;
      const [calfData, actionsData, guidesData, salesData] = await Promise.all([
        getRecordById<Calf>('calves', recordId),
        getAllRecords<FeedingAlertAction>('feedingAlertActions'),
        getAllRecords<FeedingGuide>('feedingGuide'),
        getSalesList().catch(() => []),
      ]);
      if (!calfData) throw new Error('子牛台帳に該当する子牛が見つかりませんでした。');

      const calfEarTag = String(calfData.calfNumber || '');
      const [feedCost, animalExpenses, allocatedFarmExpense, allocatedAcquisitionCost] = await Promise.all([
        getAnimalFeedCostTotal('calf', calfId).catch(() => 0),
        getAnimalExpenseTotals('calf', calfId, calfEarTag).catch(() => emptyExpenseTotals),
        Promise.all([
          getCalfYearlyFarmExpenseAllocation(calfId).catch(() => 0),
          getAllFarmExpenseAllocation('calf', calfId).catch(() => 0),
        ]).then(([calfOnly, all]) => calfOnly + all),
        getBreedingCattleAcquisitionAllocationForCalf(calfData).catch(() => emptyAcquisitionAllocation),
      ]);

      setFeedCostTotal(feedCost);
      setExpenseTotals(animalExpenses);
      setFarmExpenseAllocation(allocatedFarmExpense);
      setAcquisitionAllocation(allocatedAcquisitionCost);
      setCalf(calfData);
      setActions(actionsData);
      setGuides(guidesData);
      setSoldSale((salesData as SaleRecord[]).find((record) => matchesCalfSale(record, calfData)) || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '子牛情報を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [calfId]);

  async function handleRegisterEarTag() {
    setEarTagMessage(''); setEarTagError('');
    try {
      setEarTagSaving(true);
      const updated = await registerCalfEarTag(calfId, earTagInput);
      setCalf(updated); setEarTagInput('');
      setEarTagMessage(`耳標番号 ${updated.calfNumber} を登録しました。`);
    } catch (err) {
      setEarTagError(err instanceof Error ? err.message : '耳標番号を登録できませんでした。');
    } finally { setEarTagSaving(false); }
  }

  async function handleRegisterName() {
    setNameMessage(''); setNameError('');
    try {
      setNameSaving(true);
      const updated = await registerCalfName(calfId, nameInput);
      setCalf(updated); setNameInput('');
      setNameMessage(`名号 ${updated.name} を登録しました。`);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : '名号を登録できませんでした。');
    } finally { setNameSaving(false); }
  }

  const calfName = calfNameOf(calf);
  const isTemporaryCalfNumber = calf?.calfNumber?.startsWith('TEMP-') ?? false;
  const displayedEarTag = isTemporaryCalfNumber ? '未装着' : value(calf?.calfNumber);
  const displayedTemporaryNumber = isTemporaryCalfNumber ? formatTemporaryCalfNumber(calf?.calfNumber, calf?.birthday) : '';
  const nameMissing = !calf?.name || calf.name === '耳標未装着' || calf.name.startsWith('TEMP-');
  const displayedName = nameMissing ? '未登録' : calf?.name;
  const ageDays = ageDaysFromBirthday(calf?.birthday);
  const guide = nearestGuide(ageDays, guides);
  const productionCostTotal = feedCostTotal + expenseTotals.nonFeedTotal + farmExpenseAllocation + acquisitionAllocation.amount;
  const promotedCattleId = calf?.promotedCattleId;
  const canPromote = Boolean(calf && !promotedCattleId && !isTemporaryCalfNumber);
  const isSold = Boolean(soldSale);

  async function handlePromoteCalf() {
    if (!calf || calf.promotedCattleId) return;
    if (!window.confirm(`${displayedName}を牛台帳へ移行しますか？\n現在の生産費を自家留保の取得原価として引き継ぎます。`)) return;

    setPromotionMessage('');
    setPromotionError('');
    try {
      setPromoting(true);
      const cattle = await promoteCalf(calfId);
      setPromotionMessage(`牛台帳へ移行しました。取得原価 ${Math.round(productionCostTotal).toLocaleString('ja-JP')}円を引き継ぎました。`);
      setCalf((current) => current ? { ...current, promotedCattleId: cattle.id, managementStatus: '牛台帳へ移行済み' } : current);
    } catch (err) {
      setPromotionError(err instanceof Error ? err.message : '牛台帳へ移行できませんでした。');
    } finally {
      setPromoting(false);
    }
  }

  const calfActions = useMemo(() => actions
    .filter((item) => {
      const itemCalfId = String(item.calfId || '');
      const itemCalfName = String(item.calfName || '');
      return (calfId && itemCalfId === calfId) || (calfName && itemCalfName === calfName);
    })
    .sort((a, b) => String(b.actionDate || '').localeCompare(String(a.actionDate || ''))), [actions, calfId, calfName]);

  return (
    <Stack spacing={1.25}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={800}>子牛情報</Typography>
          {isSold && <Chip label="販売済み" size="small" />}
        </Stack>
        <Button component={RouterLink} to="/calves" variant="outlined">子牛台帳へ戻る</Button>
      </Stack>

      {!loading && !error && !isSold && (
        <Card variant="outlined">
          <CardContent sx={{ py: 1, px: { xs: 1.25, sm: 1.5 }, '&:last-child': { pb: 1 } }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
              <Stack spacing={0.1} sx={{ flexGrow: 1 }}>
                <Typography fontWeight={900}>次の操作</Typography>
                <Typography variant="body2" color="text.secondary">
                  販売するか、繁殖・育成用として牛台帳へ移すかをここから選べます。
                </Typography>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.75}>
                <Button component={RouterLink} to={saleRegistrationLink(calf)} variant="contained" disabled={!calf || Boolean(promotedCattleId)}>
                  出荷・販売
                </Button>
                {promotedCattleId ? (
                  <Button component={RouterLink} to={`/cattle/${promotedCattleId}`} variant="contained" color="success">
                    牛台帳を見る
                  </Button>
                ) : (
                  <Button variant="outlined" onClick={handlePromoteCalf} disabled={!canPromote || promoting}>
                    {promoting ? '移行中...' : '牛台帳へ移行'}
                  </Button>
                )}
                <Button component={RouterLink} to="/feeding-alert-actions" variant="outlined">対応記録</Button>
              </Stack>
            </Stack>
            {isTemporaryCalfNumber && !promotedCattleId && (
              <Alert severity="info" sx={{ mt: 1 }}>
                牛台帳へ移行するには、先に正式な耳標番号を登録してください。
              </Alert>
            )}
            {promotionMessage && <Alert severity="success" sx={{ mt: 1 }}>{promotionMessage}</Alert>}
            {promotionError && <Alert severity="error" sx={{ mt: 1 }}>{promotionError}</Alert>}
          </CardContent>
        </Card>
      )}

      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="warning">{error}</Alert>}
      {!loading && !error && (
        <>
          {soldSale && (
            <Card variant="outlined">
              <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Stack spacing={0.8}>
                  <Typography fontWeight={900}>販売結果</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.75, sm: 4 }} useFlexGap flexWrap="wrap">
                    <Stack spacing={0.05} sx={{ minWidth: 130 }}>
                      <Typography variant="body2" color="text.secondary">販売日</Typography>
                      <Typography fontWeight={800}>{value(soldSale.saleDate)}</Typography>
                    </Stack>
                    <Stack spacing={0.05} sx={{ minWidth: 150 }}>
                      <Typography variant="body2" color="text.secondary">販売額</Typography>
                      <Typography variant="h6" fontWeight={900}>{Math.round(Number(soldSale.salePrice || 0)).toLocaleString('ja-JP')}円</Typography>
                    </Stack>
                    <Stack spacing={0.05} sx={{ minWidth: 150 }}>
                      <Typography variant="body2" color="text.secondary">販売時生産費</Typography>
                      <Typography variant="h6" fontWeight={900}>{Math.round(Number(soldSale.productionCostSnapshot || 0)).toLocaleString('ja-JP')}円</Typography>
                    </Stack>
                    <Stack spacing={0.05} sx={{ minWidth: 150 }}>
                      <Typography variant="body2" color="text.secondary">利益</Typography>
                      <Typography variant="h6" fontWeight={900}>{Math.round(Number(soldSale.profitSnapshot || 0)).toLocaleString('ja-JP')}円</Typography>
                    </Stack>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">販売時に確定した生産費・利益を表示しています。</Typography>
                </Stack>
              </CardContent>
            </Card>
          )}

          {soldSale && <SoldCalfCostChart sale={soldSale} />}

          <Grid container spacing={1.25} alignItems="flex-start">
            <Grid item xs={12} md={isSold ? 12 : 8}>
              <Card>
                <CardContent sx={{ py: 1.1, px: { xs: 1.25, sm: 1.5 }, '&:last-child': { pb: 1.1 } }}>
                  <Stack spacing={0.75}>
                    <Typography variant="h6" fontWeight={800}>基本情報</Typography>
                    <Grid container spacing={0.75}>
                      <Grid item xs={6} md={3}><Typography variant="body2" color="text.secondary">耳標番号</Typography><Typography fontWeight={800}>{displayedEarTag}</Typography></Grid>
                      {displayedTemporaryNumber && <Grid item xs={6} md={3}><Typography variant="body2" color="text.secondary">仮管理番号</Typography><Typography fontWeight={800}>{displayedTemporaryNumber}</Typography></Grid>}
                      <Grid item xs={6} md={3}><Typography variant="body2" color="text.secondary">名号</Typography><Typography fontWeight={800}>{displayedName}</Typography></Grid>
                      <Grid item xs={6} md={3}><Typography variant="body2" color="text.secondary">生年月日</Typography><Typography fontWeight={800}>{value(calf?.birthday)}</Typography></Grid>
                      <Grid item xs={6} md={3}><Typography variant="body2" color="text.secondary">日齢</Typography><Typography fontWeight={800}>{ageDays === null ? '-' : `${ageDays}日`}</Typography></Grid>
                      <Grid item xs={6} md={3}><Typography variant="body2" color="text.secondary">性別</Typography><Typography fontWeight={800}>{formatSex(calf?.sex)}</Typography></Grid>
                      <Grid item xs={6} md={3}><Typography variant="body2" color="text.secondary">母牛</Typography><Typography fontWeight={800}>{value(calf?.motherName)}</Typography></Grid>
                      <Grid item xs={6} md={3}><Typography variant="body2" color="text.secondary">状態</Typography><Typography fontWeight={800}>{isSold ? '販売済み' : value(calf?.managementStatus)}</Typography></Grid>
                    </Grid>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            {!isSold && (
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent sx={{ py: 1.1, px: { xs: 1.25, sm: 1.5 }, '&:last-child': { pb: 1.1 } }}>
                    <Stack spacing={0.6}>
                      <Typography variant="h6" fontWeight={800}>生産費</Typography>
                      <Grid container spacing={0.6}>
                        <Grid item xs={6}>
                          <Typography variant="body2" color="text.secondary">飼料費</Typography>
                          <Typography fontWeight={800}>{Math.round(feedCostTotal).toLocaleString('ja-JP')}円</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="body2" color="text.secondary">診療・医薬品費</Typography>
                          <Typography fontWeight={800}>{Math.round(expenseTotals.medical).toLocaleString('ja-JP')}円</Typography>
                        </Grid>
                        {expenseTotals.other > 0 && (
                          <Grid item xs={6}>
                            <Typography variant="body2" color="text.secondary">その他</Typography>
                            <Typography fontWeight={800}>{Math.round(expenseTotals.other).toLocaleString('ja-JP')}円</Typography>
                          </Grid>
                        )}
                        <Grid item xs={6}>
                          <Typography variant="body2" color="text.secondary">農場共通経費</Typography>
                          <Typography fontWeight={800}>{Math.round(farmExpenseAllocation).toLocaleString('ja-JP')}円</Typography>
                        </Grid>
                        {acquisitionAllocation.amount > 0 && (
                          <Grid item xs={6}>
                            <Typography variant="body2" color="text.secondary">繁殖牛取得原価配賦</Typography>
                            <Typography fontWeight={800}>{Math.round(acquisitionAllocation.amount).toLocaleString('ja-JP')}円</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {acquisitionAllocation.motherName || '母牛'}の取得原価を{acquisitionAllocation.allocationParity}産で配賦
                            </Typography>
                          </Grid>
                        )}
                        <Grid item xs={6}>
                          <Typography variant="body2" color="text.secondary">生産費合計</Typography>
                          <Typography variant="h6" fontWeight={900}>{Math.round(productionCostTotal).toLocaleString('ja-JP')}円</Typography>
                        </Grid>
                      </Grid>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>

          {!isSold && isTemporaryCalfNumber && <Card variant="outlined"><CardContent><Stack spacing={1.25}>
            <Typography fontWeight={800}>耳標を装着したらここで登録</Typography>
            <Typography color="text.secondary">この子牛の記録・母牛との親子関係をそのまま維持して、正式な耳標番号へ切り替えます。</Typography>
            {earTagMessage && <Alert severity="success">{earTagMessage}</Alert>}
            {earTagError && <Alert severity="error">{earTagError}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField label="正式な耳標番号" value={earTagInput} onChange={(e) => setEarTagInput(e.target.value)} fullWidth />
              <Button variant="contained" onClick={handleRegisterEarTag} disabled={earTagSaving || !earTagInput.trim()} sx={{ minWidth: 180 }}>{earTagSaving ? '登録中...' : '耳標番号を登録'}</Button>
            </Stack>
          </Stack></CardContent></Card>}

          {!isSold && nameMissing && <Card variant="outlined"><CardContent><Stack spacing={1.25}>
            <Typography fontWeight={800}>名号を登録</Typography>
            <Typography color="text.secondary">決まった名号を、この子牛の情報にそのまま登録します。</Typography>
            {nameMessage && <Alert severity="success">{nameMessage}</Alert>}
            {nameError && <Alert severity="error">{nameError}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField label="名号" value={nameInput} onChange={(e) => setNameInput(e.target.value)} fullWidth />
              <Button variant="contained" onClick={handleRegisterName} disabled={nameSaving || !nameInput.trim()} sx={{ minWidth: 180 }}>{nameSaving ? '登録中...' : '名号を登録'}</Button>
            </Stack>
          </Stack></CardContent></Card>}

          {!isSold && <Card><CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}><Stack spacing={1}>
            <Typography variant="h6" fontWeight={800}>給与目安</Typography>
            {ageDays === null ? <Alert severity="info">生年月日がないため、日齢から給与目安を表示できません。</Alert> : !guide ? <Alert severity="info">給与目安が登録されていません。</Alert> : <Grid container spacing={1}>
              <Grid item xs={6} md={3}><Typography variant="body2" color="text.secondary">近い日齢</Typography><Typography fontWeight={800}>{value(guide.ageDays)}日</Typography></Grid>
              <Grid item xs={6} md={3}><Typography variant="body2" color="text.secondary">ステージ</Typography><Typography fontWeight={800}>{value(guide.stageName)}</Typography></Grid>
              <Grid item xs={4} md={2}><Typography variant="body2" color="text.secondary">スターター</Typography><Typography fontWeight={800}>{value(guide.starterKg)}kg</Typography></Grid>
              <Grid item xs={4} md={2}><Typography variant="body2" color="text.secondary">育成配合</Typography><Typography fontWeight={800}>{value(guide.growingFeedKg)}kg</Typography></Grid>
              <Grid item xs={4} md={2}><Typography variant="body2" color="text.secondary">粗飼料</Typography><Typography fontWeight={800}>{value(guide.roughageKg)}kg</Typography></Grid>
            </Grid>}
          </Stack></CardContent></Card>}

          <Card><CardContent><Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" fontWeight={800} sx={{ flexGrow: 1 }}>給与アラート対応履歴</Typography>
              {!isSold && <Button component={RouterLink} to={newActionLink(calf, ageDays)} variant="contained">対応記録を追加</Button>}
            </Stack>
            <Alert severity="info">この子牛に対して登録された給与アラート対応記録を表示します。</Alert>
            {calfActions.length === 0 ? <Alert severity="success">この子牛の給与アラート対応記録はまだありません。</Alert> : <Table size="small">
              <TableHead><TableRow><TableCell>対応日</TableCell><TableCell>アラート</TableCell><TableCell>対応内容</TableCell><TableCell>状態</TableCell><TableCell>次回確認日</TableCell><TableCell>メモ</TableCell><TableCell>操作</TableCell></TableRow></TableHead>
              <TableBody>{calfActions.map((item) => <TableRow key={item.id}>
                <TableCell>{value(item.actionDate)}</TableCell><TableCell><Chip size="small" color={alertColor(String(item.alertType || '')) as any} label={value(item.alertType)} /></TableCell><TableCell>{value(item.actionType)}</TableCell><TableCell><Chip size="small" color={statusColor(String(item.status || '')) as any} label={value(item.status)} /></TableCell><TableCell>{value(item.nextCheckDate)}</TableCell><TableCell>{value(item.memo)}</TableCell><TableCell>{isSold ? '-' : <Button component={RouterLink} to={`/feeding-alert-actions/${item.id}/edit`} size="small" variant="outlined">編集</Button>}</TableCell>
              </TableRow>)}</TableBody>
            </Table>}
            <Typography color="text.secondary">子牛IDまたは名号が一致する対応記録を表示しています。</Typography>
          </Stack></CardContent></Card>
        </>
      )}
    </Stack>
  );
}

export default CalfDetail;