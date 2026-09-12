import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
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
import {
  getBreedingCattleAcquisitionAllocationForCalf,
  type BreedingCattleAcquisitionAllocationResult,
} from '../services/breedingCattleAcquisitionAllocation';
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

export function CalfDetail() {
  const params = useParams();
  const calfId = String(params.id || '');
  const [calf, setCalf] = useState<Calf | null>(null);
  const [actions, setActions] = useState<FeedingAlertAction[]>([]);
  const [guides, setGuides] = useState<FeedingGuide[]>([]);
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
      const [calfData, actionsData, guidesData] = await Promise.all([
        getRecordById<Calf>('calves', recordId),
        getAllRecords<FeedingAlertAction>('feedingAlertActions'),
        getAllRecords<FeedingGuide>('feedingGuide'),
      ]);
      if (!calfData) throw new Error('子牛台帳に該当する子牛が見つかりませんでした。');

      const calfEarTag = String(calfData.calfNumber || '');
      const [feedCost, animalExpenses, allocatedFarmExpense, allocatedAcquisitionCost] = await Promise.all([
        getAnimalFeedCostTotal('calf', calfId).catch(() => 0),
        getAnimalExpenseTotals('calf', calfId, calfEarTag).catch(() => emptyExpenseTotals),
        getCalfYearlyFarmExpenseAllocation(calfId).catch(() => 0),
        getBreedingCattleAcquisitionAllocationForCalf(calfData).catch(() => emptyAcquisitionAllocation),
      ]);

      setFeedCostTotal(feedCost);
      setExpenseTotals(animalExpenses);
      setFarmExpenseAllocation(allocatedFarmExpense);
      setAcquisitionAllocation(allocatedAcquisitionCost);
      setCalf(calfData);
      setActions(actionsData);
      setGuides(guidesData);
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
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>子牛情報</Typography>
        <Button component={RouterLink} to="/calves" variant="outlined">子牛台帳へ戻る</Button>
      </Stack>

      {!loading && !error && (
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
          <Grid container spacing={1.25} alignItems="flex-start">
            <Grid item xs={12} md={8}>
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
                      <Grid item xs={6} md={3}><Typography variant="body2" color="text.secondary">状態</Typography><Typography fontWeight={800}>{value(calf?.managementStatus)}</Typography></Grid>
                    </Grid>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

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
          </Grid>

          {isTemporaryCalfNumber && <Card variant="outlined"><CardContent><Stack spacing={1.25}>
            <Typography fontWeight={800}>耳標を装着したらここで登録</Typography>
            <Typography color="text.secondary">この子牛の記録・母牛との親子関係をそのまま維持して、正式な耳標番号へ切り替えます。</Typography>
            {earTagMessage && <Alert severity="success">{earTagMessage}</Alert>}
            {earTagError && <Alert severity="error">{earTagError}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField label="正式な耳標番号" value={earTagInput} onChange={(e) => setEarTagInput(e.target.value)} fullWidth />
              <Button variant="contained" onClick={handleRegisterEarTag} disabled={earTagSaving || !earTagInput.trim()} sx={{ minWidth: 180 }}>{earTagSaving ? '登録中...' : '耳標番号を登録'}</Button>
            </Stack>
          </Stack></CardContent></Card>}

          {nameMissing && <Card variant="outlined"><CardContent><Stack spacing={1.25}>
            <Typography fontWeight={800}>名号を登録</Typography>
            <Typography color="text.secondary">決まった名号を、この子牛の情報にそのまま登録します。</Typography>
            {nameMessage && <Alert severity="success">{nameMessage}</Alert>}
            {nameError && <Alert severity="error">{nameError}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField label="名号" value={nameInput} onChange={(e) => setNameInput(e.target.value)} fullWidth />
              <Button variant="contained" onClick={handleRegisterName} disabled={nameSaving || !nameInput.trim()} sx={{ minWidth: 180 }}>{nameSaving ? '登録中...' : '名号を登録'}</Button>
            </Stack>
          </Stack></CardContent></Card>}

          <Card><CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}><Stack spacing={1}>
            <Typography variant="h6" fontWeight={800}>給与目安</Typography>
            {ageDays === null ? <Alert severity="info">生年月日がないため、日齢から給与目安を表示できません。</Alert> : !guide ? <Alert severity="info">給与目安が登録されていません。</Alert> : <Grid container spacing={1}>
              <Grid item xs={6} md={3}><Typography variant="body2" color="text.secondary">近い日齢</Typography><Typography fontWeight={800}>{value(guide.ageDays)}日</Typography></Grid>
              <Grid item xs={6} md={3}><Typography variant="body2" color="text.secondary">ステージ</Typography><Typography fontWeight={800}>{value(guide.stageName)}</Typography></Grid>
              <Grid item xs={4} md={2}><Typography variant="body2" color="text.secondary">スターター</Typography><Typography fontWeight={800}>{value(guide.starterKg)}kg</Typography></Grid>
              <Grid item xs={4} md={2}><Typography variant="body2" color="text.secondary">育成配合</Typography><Typography fontWeight={800}>{value(guide.growingFeedKg)}kg</Typography></Grid>
              <Grid item xs={4} md={2}><Typography variant="body2" color="text.secondary">粗飼料</Typography><Typography fontWeight={800}>{value(guide.roughageKg)}kg</Typography></Grid>
            </Grid>}
          </Stack></CardContent></Card>

          <Card><CardContent><Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" fontWeight={800} sx={{ flexGrow: 1 }}>給与アラート対応履歴</Typography>
              <Button component={RouterLink} to={newActionLink(calf, ageDays)} variant="contained">対応記録を追加</Button>
            </Stack>
            <Alert severity="info">この子牛に対して登録された給与アラート対応記録を表示します。</Alert>
            {calfActions.length === 0 ? <Alert severity="success">この子牛の給与アラート対応記録はまだありません。</Alert> : <Table size="small">
              <TableHead><TableRow><TableCell>対応日</TableCell><TableCell>アラート</TableCell><TableCell>対応内容</TableCell><TableCell>状態</TableCell><TableCell>次回確認日</TableCell><TableCell>メモ</TableCell><TableCell>操作</TableCell></TableRow></TableHead>
              <TableBody>{calfActions.map((item) => <TableRow key={item.id}>
                <TableCell>{value(item.actionDate)}</TableCell><TableCell><Chip size="small" color={alertColor(String(item.alertType || '')) as any} label={value(item.alertType)} /></TableCell><TableCell>{value(item.actionType)}</TableCell><TableCell><Chip size="small" color={statusColor(String(item.status || '')) as any} label={value(item.status)} /></TableCell><TableCell>{value(item.nextCheckDate)}</TableCell><TableCell>{value(item.memo)}</TableCell><TableCell><Button component={RouterLink} to={`/feeding-alert-actions/${item.id}/edit`} size="small" variant="outlined">編集</Button></TableCell>
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
