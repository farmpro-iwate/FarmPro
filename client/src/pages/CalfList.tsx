import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Chip, Collapse, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { deleteCalf, getCalfList, promoteCalf } from '../services/calfApi';
import { fetchFeedingAlertActions, type FeedingAlertAction } from '../services/feedingAlertActionsApi';
import { getTreatmentList } from '../services/treatmentApi';
import { getSalesList, type SaleRecord } from '../services/salesApi';
import type { Calf, CalfStatus } from '../types/calf';
import type { Treatment } from '../types/treatment';
import { formatSex } from '../utils/sex';
import { formatTemporaryCalfNumber } from '../utils/temporaryCalfNumber';

function calcAgeDays(birthday?: string) {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return null;
  return Math.floor((Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24));
}

function statusColor(status: CalfStatus): 'warning' | 'success' | 'info' | 'default' | 'primary' {
  if (status === '繁殖候補として留保') return 'warning';
  if (status === '牛台帳へ移行済み') return 'success';
  if (status === '販売予定') return 'info';
  if (status === '死亡・その他') return 'default';
  return 'primary';
}

function statusLabel(status: CalfStatus) {
  return status === '牛台帳へ移行済み' ? '個体カルテへ移行済み' : status;
}

function calfDisplayName(row: Calf) {
  if (!row.name || row.name === '耳標未装着' || row.name.startsWith('TEMP-')) return '子牛（耳標未装着）';
  return row.name;
}

function treatmentLink(row: Calf) {
  const params = new URLSearchParams({
    targetNumber: row.calfNumber || '',
    targetName: row.name && row.name !== '耳標未装着' ? row.name : row.calfNumber || '子牛',
    returnTo: '/calves',
  });
  return `/treatments/new?${params.toString()}`;
}

function isFemaleSex(sex?: string) {
  return sex === '雌' || sex === 'メス';
}

function matchesSexFilter(sex: string, filter: string) {
  if (filter === 'すべて') return true;
  if (filter === '雌') return isFemaleSex(sex);
  if (filter === '雄') return sex === '雄' || sex === 'オス';
  return sex === filter;
}

function latestActionByCalf(actions: FeedingAlertAction[]) {
  const latest = new Map<string, FeedingAlertAction>();
  const sorted = [...actions].sort((a, b) => {
    const ad = `${a.actionDate || ''}-${a.updatedAt || a.createdAt || ''}`;
    const bd = `${b.actionDate || ''}-${b.updatedAt || b.createdAt || ''}`;
    return bd.localeCompare(ad);
  });
  for (const action of sorted) {
    const key = String(action.calfId || '');
    if (key && !latest.has(key)) latest.set(key, action);
  }
  return latest;
}

function latestTreatmentByTarget(treatments: Treatment[]) {
  const latest = new Map<string, Treatment>();
  const sorted = [...treatments].sort((a, b) => {
    const ad = `${a.treatmentDate || ''}-${a.updatedAt || a.createdAt || ''}`;
    const bd = `${b.treatmentDate || ''}-${b.updatedAt || b.createdAt || ''}`;
    return bd.localeCompare(ad);
  });
  for (const treatment of sorted) {
    const key = String(treatment.targetNumber || '').trim();
    if (key && !latest.has(key)) latest.set(key, treatment);
  }
  return latest;
}

function saleForCalf(row: Calf, sales: SaleRecord[]) {
  const numbers = [row.calfNumber, row.identificationNumber].filter(Boolean).map((item) => String(item));
  return [...sales]
    .filter((sale) => sale.targetType === '子牛' && sale.status !== '取消' && numbers.includes(String(sale.targetNumber || '')))
    .sort((a, b) => `${b.updatedAt || b.createdAt || ''}`.localeCompare(`${a.updatedAt || a.createdAt || ''}`))[0];
}

function isCompletedSale(sale?: SaleRecord) {
  return sale?.status === '出荷済み' || sale?.status === '販売済み';
}

export function CalfList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Calf[]>([]);
  const [actions, setActions] = useState<FeedingAlertAction[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [search, setSearch] = useState('');
  const [sexFilter, setSexFilter] = useState('すべて');
  const [statusFilter, setStatusFilter] = useState('すべて');
  const [feedingFilter, setFeedingFilter] = useState('すべて');
  const [weaningFilter, setWeaningFilter] = useState('すべて');
  const [filterOpen, setFilterOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [salesHistoryOpen, setSalesHistoryOpen] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    const [calves, actionRows, treatmentRows, saleRows] = await Promise.all([
      getCalfList(),
      fetchFeedingAlertActions(),
      getTreatmentList(),
      getSalesList(),
    ]);
    setRows(calves);
    setActions(actionRows);
    setTreatments(treatmentRows);
    setSales(saleRows);
  };

  useEffect(() => { load(); }, []);

  const latestActions = useMemo(() => latestActionByCalf(actions), [actions]);
  const latestTreatments = useMemo(() => latestTreatmentByTarget(treatments), [treatments]);
  const saleByCalf = useMemo(() => {
    const result = new Map<string, SaleRecord>();
    for (const row of rows) {
      const sale = saleForCalf(row, sales);
      if (sale) result.set(String(row.id), sale);
    }
    return result;
  }, [rows, sales]);

  const activeRows = useMemo(() => rows.filter((row) =>
    row.managementStatus !== '牛台帳へ移行済み' && !isCompletedSale(saleByCalf.get(String(row.id)))
  ), [rows, saleByCalf]);
  const historyRows = useMemo(() => rows.filter((row) => row.managementStatus === '牛台帳へ移行済み'), [rows]);
  const salesHistoryRows = useMemo(() => rows.filter((row) => isCompletedSale(saleByCalf.get(String(row.id)))), [rows, saleByCalf]);

  const attentionByCalf = useMemo(() => {
    const result = new Map<string, FeedingAlertAction>();
    for (const [calfId, action] of latestActions) if (action.status === '再確認必要') result.set(calfId, action);
    return result;
  }, [latestActions]);

  const treatmentByCalf = useMemo(() => {
    const result = new Map<string, Treatment>();
    for (const row of activeRows) {
      const treatment = latestTreatments.get(String(row.calfNumber || '').trim());
      if (treatment && ['治療中', '経過観察'].includes(treatment.progress)) result.set(String(row.id), treatment);
    }
    return result;
  }, [activeRows, latestTreatments]);

  const filteredRows = useMemo(() => activeRows.filter((row) => {
    const keyword = search.trim().toLowerCase();
    const feedingMethod = row.feedingMethod || '人工哺育';
    const weaningStatus = row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前');
    const status = row.managementStatus || '育成中';
    const keywordOk = !keyword || [row.name, row.calfNumber, row.identificationNumber, row.motherName].some((v) => String(v || '').toLowerCase().includes(keyword));
    return keywordOk && matchesSexFilter(row.sex, sexFilter) && (statusFilter === 'すべて' || status === statusFilter) && (feedingFilter === 'すべて' || feedingMethod === feedingFilter) && (weaningFilter === 'すべて' || weaningStatus === weaningFilter);
  }).sort((a, b) => {
    const aPriority = treatmentByCalf.has(String(a.id)) ? 2 : attentionByCalf.has(String(a.id)) ? 1 : 0;
    const bPriority = treatmentByCalf.has(String(b.id)) ? 2 : attentionByCalf.has(String(b.id)) ? 1 : 0;
    return bPriority - aPriority;
  }), [activeRows, search, sexFilter, statusFilter, feedingFilter, weaningFilter, attentionByCalf, treatmentByCalf]);

  const summary = useMemo(() => ({
    nursing: activeRows.filter((row) => (row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前')) === '離乳前').length,
    weaned: activeRows.filter((row) => (row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前')) === '離乳済み').length,
    retained: activeRows.filter((row) => row.managementStatus === '繁殖候補として留保').length,
    shipping: activeRows.filter((row) => saleByCalf.get(String(row.id))?.status === '出荷予定').length,
    attention: activeRows.filter((row) => attentionByCalf.has(String(row.id))).length,
    underTreatment: activeRows.filter((row) => treatmentByCalf.get(String(row.id))?.progress === '治療中').length,
    observation: activeRows.filter((row) => treatmentByCalf.get(String(row.id))?.progress === '経過観察').length,
  }), [activeRows, attentionByCalf, treatmentByCalf, saleByCalf]);

  const filterActive = Boolean(search.trim() || sexFilter !== 'すべて' || statusFilter !== 'すべて' || feedingFilter !== 'すべて' || weaningFilter !== 'すべて');
  const clearFilters = () => { setSearch(''); setSexFilter('すべて'); setStatusFilter('すべて'); setFeedingFilter('すべて'); setWeaningFilter('すべて'); };

  const handleDelete = async (id: number) => {
    if (!confirm('削除しますか？')) return;
    await deleteCalf(id); await load();
  };

  const handlePromote = async (row: Calf) => {
    if (!confirm(`${calfDisplayName(row)}を個体カルテへ移行しますか？\n個体カルテでは「育成牛」として登録されます。`)) return;
    try {
      const cattle = await promoteCalf(String(row.id));
      setMessage(`${calfDisplayName(row)}を個体カルテへ移行しました。`);
      await load();
      navigate(`/cattle/${cattle.id}`);
    } catch (error: any) {
      alert(error?.response?.data?.message || error?.message || '個体カルテへの移行に失敗しました');
    }
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
        <Stack spacing={0.25}><Typography variant="h5" fontWeight={800}>子牛台帳</Typography><Typography color="text.secondary">表示：{filteredRows.length}件 / 管理中{activeRows.length}件</Typography></Stack>
        <Button component={RouterLink} to="/calves/new" variant="contained">新規登録</Button>
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {summary.underTreatment > 0 && <Chip label={`治療中 ${summary.underTreatment}頭`} color="warning" />}
        {summary.observation > 0 && <Chip label={`経過観察 ${summary.observation}頭`} color="info" />}
        {summary.attention > 0 && <Chip label={`要確認 ${summary.attention}頭`} color="error" />}
        {summary.shipping > 0 && <Chip label={`出荷予定 ${summary.shipping}頭`} color="info" />}
        <Chip label={`離乳前 ${summary.nursing}頭`} color="warning" variant="outlined" />
        <Chip label={`離乳済み ${summary.weaned}頭`} color="success" variant="outlined" />
        <Chip label={`繁殖候補 ${summary.retained}頭`} color="primary" variant="outlined" />
      </Stack>

      {summary.attention > 0 && <Alert severity="warning">「飲み悪い」「下痢」などで再確認が必要な子牛を上に表示しています。次に正常な記録が入ると通常表示へ戻ります。</Alert>}
      {message && <Alert severity="success">{message}</Alert>}

      {filteredRows.map((row) => {
        const status = row.managementStatus || '育成中';
        const feedingMethod = row.feedingMethod || '人工哺育';
        const weaningStatus = row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前');
        const canPromote = isFemaleSex(row.sex) && status === '繁殖候補として留保';
        const attention = attentionByCalf.get(String(row.id));
        const treatment = treatmentByCalf.get(String(row.id));
        const sale = saleByCalf.get(String(row.id));
        const shippingPlanned = sale?.status === '出荷予定';
        const highlighted = Boolean(attention || treatment);
        return (
          <Card key={row.id} variant={highlighted ? 'outlined' : undefined} sx={highlighted ? { borderWidth: 2, borderColor: treatment ? 'warning.main' : 'error.main' } : undefined}>
            <CardContent><Stack spacing={1}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="h6" fontWeight={800}>{calfDisplayName(row)}</Typography>
                  {treatment && <Chip label={treatment.progress} size="small" color={treatment.progress === '治療中' ? 'warning' : 'info'} />}
                  {attention && <Chip label={`要確認：${attention.actionType || '気になる'}`} size="small" color="error" />}
                  {shippingPlanned && <Chip label="出荷予定" size="small" color="info" />}
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip label={formatSex(row.sex)} size="small" />
                  <Chip label={shippingPlanned ? '出荷予定' : statusLabel(status)} size="small" color={shippingPlanned ? 'info' : statusColor(status)} />
                  <Chip label={feedingMethod} size="small" variant="outlined" />
                  <Chip label={weaningStatus} size="small" color={weaningStatus === '離乳済み' ? 'success' : 'warning'} />
                </Stack>
              </Stack>
              <Typography>耳標番号：{row.calfNumber?.startsWith('TEMP-') ? '未装着' : row.calfNumber || '-'}</Typography>
              {row.calfNumber?.startsWith('TEMP-') && <Typography color="text.secondary">仮管理番号：{formatTemporaryCalfNumber(row.calfNumber, row.birthday)}</Typography>}
              <Typography color="text.secondary">個体識別番号：{row.identificationNumber || '-'}</Typography>
              <Typography color="text.secondary">生年月日：{row.birthday || '-'} / 日齢：{calcAgeDays(row.birthday) ?? '-'}日</Typography>
              <Typography color="text.secondary">母牛：{row.motherName || '-'}</Typography>
              {treatment && <Typography color="text.secondary">治療：{treatment.symptom || treatment.diagnosis || '-'} / {treatment.treatmentDate || '-'}</Typography>}
              {shippingPlanned && <Typography fontWeight={700} color="info.main">出荷予定：{sale?.shippingPlanDate || '-'} / {sale?.marketName || '市場未設定'}</Typography>}
              <Typography color="text.secondary">現在体重：{row.currentWeight || '-'}kg</Typography>
              <Typography color="text.secondary">離乳予定日：{row.weaningPlannedDate || '-'} / 実際の離乳日：{row.weaningDate || '-'}</Typography>
              {feedingMethod === '人工哺育' && <Typography color="text.secondary">ミルク終了日：{row.milkEndDate || '-'}</Typography>}
              {feedingMethod === '混合哺育' && <Typography color="text.secondary">補助ミルク終了日：{row.milkEndDate || '-'}</Typography>}
              {weaningStatus === '離乳済み' && <Typography color="text.secondary">離乳時体重：{row.weaningWeight || '-'}kg / スターター：{row.weaningStarterAmount || '-'}kg</Typography>}
              {row.note && <Typography color="text.secondary">備考：{row.note}</Typography>}
              <Divider />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
                <Button component={RouterLink} to={`/calves/${row.id}`} variant="contained">{highlighted ? '確認・記録' : '子牛情報'}</Button>
                {attention && !treatment && <Button component={RouterLink} to={treatmentLink(row)} color="warning" variant="contained">治療記録へ</Button>}
                {treatment && <Button component={RouterLink} to={`/treatments/${treatment.id}/edit`} color="warning" variant="outlined">治療記録を確認</Button>}
                <Button component={RouterLink} to={`/calves/${row.id}/edit`} variant="outlined">編集</Button>
                {shippingPlanned ? <Button component={RouterLink} to="/sales" color="info" variant="contained">出荷予定を確認</Button> : status === '販売予定' && <Button component={RouterLink} to="/market-shipping-plan" color="info" variant="contained">市場出荷予定</Button>}
                {canPromote && <Button color="success" variant="contained" onClick={() => handlePromote(row)}>個体カルテへ移行</Button>}
                <Button color="error" variant="text" onClick={() => handleDelete(row.id)}>削除</Button>
              </Stack>
            </Stack></CardContent>
          </Card>
        );
      })}

      {filteredRows.length === 0 && <Alert severity="info">現在、管理中の子牛はいません。</Alert>}

      <Button variant="outlined" onClick={() => setFilterOpen((open) => !open)} sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}>
        {filterOpen ? '検索・絞り込みを閉じる ▲' : `検索・絞り込みを開く ▼${filterActive ? '（適用中）' : ''}`}
      </Button>
      <Collapse in={filterOpen}>
        <Card variant="outlined"><CardContent sx={{ py: 1.5 }}><Stack spacing={1}>
          <TextField label="名前・耳標番号・母牛で検索" value={search} onChange={(e) => setSearch(e.target.value)} size="small" fullWidth />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <TextField label="性別" select value={sexFilter} onChange={(e) => setSexFilter(e.target.value)} size="small" fullWidth><MenuItem value="すべて">すべて</MenuItem><MenuItem value="雄">♂</MenuItem><MenuItem value="雌">♀</MenuItem><MenuItem value="去勢">♂去</MenuItem></TextField>
            <TextField label="飼養区分" select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} size="small" fullWidth><MenuItem value="すべて">すべて</MenuItem><MenuItem value="販売予定">販売予定</MenuItem><MenuItem value="育成中">育成中</MenuItem><MenuItem value="繁殖候補として留保">繁殖候補として留保</MenuItem><MenuItem value="死亡・その他">死亡・その他</MenuItem></TextField>
            <TextField label="哺育方法" select value={feedingFilter} onChange={(e) => setFeedingFilter(e.target.value)} size="small" fullWidth><MenuItem value="すべて">すべて</MenuItem><MenuItem value="人工哺育">人工哺育</MenuItem><MenuItem value="母乳哺育">母乳哺育</MenuItem><MenuItem value="混合哺育">混合哺育</MenuItem></TextField>
            <TextField label="離乳状態" select value={weaningFilter} onChange={(e) => setWeaningFilter(e.target.value)} size="small" fullWidth><MenuItem value="すべて">すべて</MenuItem><MenuItem value="離乳前">離乳前</MenuItem><MenuItem value="離乳済み">離乳済み</MenuItem></TextField>
          </Stack>
          <Button variant="outlined" onClick={clearFilters} disabled={!filterActive}>検索・絞り込みをクリア</Button>
        </Stack></CardContent></Card>
      </Collapse>

      {historyRows.length > 0 && <>
        <Button variant="outlined" onClick={() => setHistoryOpen((open) => !open)} sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}>
          {historyOpen ? '子牛期履歴を閉じる ▲' : `子牛期履歴を開く ▼（${historyRows.length}頭）`}
        </Button>
        <Collapse in={historyOpen}>
          <Stack spacing={1}>
            <Alert severity="info">個体カルテへ移行した牛の子牛期記録です。現在の管理は個体カルテで行います。</Alert>
            {historyRows.map((row) => (
              <Card key={row.id} variant="outlined"><CardContent><Stack spacing={1}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                  <Typography variant="h6" fontWeight={800}>{calfDisplayName(row)}</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap><Chip label={formatSex(row.sex)} size="small" /><Chip label="個体カルテへ移行済み" size="small" color="success" /><Chip label={row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前')} size="small" variant="outlined" /></Stack>
                </Stack>
                <Typography>耳標番号：{row.calfNumber?.startsWith('TEMP-') ? '未装着' : row.calfNumber || '-'}</Typography>
                <Typography color="text.secondary">生年月日：{row.birthday || '-'} / 子牛期の離乳日：{row.weaningDate || '-'}</Typography>
                <Divider />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>{row.promotedCattleId && <Button component={RouterLink} to={`/cattle/${row.promotedCattleId}`} variant="contained">個体カルテ</Button>}<Button component={RouterLink} to={`/calves/${row.id}`} variant="outlined">子牛期履歴</Button></Stack>
              </Stack></CardContent></Card>
            ))}
          </Stack>
        </Collapse>
      </>}

      {salesHistoryRows.length > 0 && <>
        <Button variant="outlined" onClick={() => setSalesHistoryOpen((open) => !open)} sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}>
          {salesHistoryOpen ? '出荷・販売履歴を閉じる ▲' : `出荷・販売履歴を開く ▼（${salesHistoryRows.length}頭）`}
        </Button>
        <Collapse in={salesHistoryOpen}>
          <Stack spacing={1}>
            <Alert severity="info">出荷済み・販売済みの子牛です。現在の管理は出荷・販売管理で行います。</Alert>
            {salesHistoryRows.map((row) => {
              const sale = saleByCalf.get(String(row.id));
              return <Card key={row.id} variant="outlined"><CardContent><Stack spacing={1}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                  <Typography variant="h6" fontWeight={800}>{calfDisplayName(row)}</Typography>
                  <Chip label={sale?.status || '出荷済み'} size="small" color="success" />
                </Stack>
                <Typography>耳標番号：{row.calfNumber || '-'}</Typography>
                <Typography color="text.secondary">市場：{sale?.marketName || '-'} / 出荷予定日：{sale?.shippingPlanDate || '-'} / 出荷日：{sale?.shippingDate || '-'}</Typography>
                <Divider />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button component={RouterLink} to="/sales" variant="contained">出荷・販売管理</Button><Button component={RouterLink} to={`/calves/${row.id}`} variant="outlined">子牛期履歴</Button></Stack>
              </Stack></CardContent></Card>;
            })}
          </Stack>
        </Collapse>
      </>}
    </Stack>
  );
}
