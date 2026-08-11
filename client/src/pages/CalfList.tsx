import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Chip, Collapse, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { deleteCalf, getCalfList, promoteCalf } from '../services/calfApi';
import { fetchFeedingAlertActions, type FeedingAlertAction } from '../services/feedingAlertActionsApi';
import { getTreatmentList } from '../services/treatmentApi';
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

export function CalfList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Calf[]>([]);
  const [actions, setActions] = useState<FeedingAlertAction[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [search, setSearch] = useState('');
  const [sexFilter, setSexFilter] = useState('すべて');
  const [statusFilter, setStatusFilter] = useState('すべて');
  const [feedingFilter, setFeedingFilter] = useState('すべて');
  const [weaningFilter, setWeaningFilter] = useState('すべて');
  const [filterOpen, setFilterOpen] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    const [calves, actionRows, treatmentRows] = await Promise.all([getCalfList(), fetchFeedingAlertActions(), getTreatmentList()]);
    setRows(calves); setActions(actionRows); setTreatments(treatmentRows);
  };

  useEffect(() => { load(); }, []);

  const latestActions = useMemo(() => latestActionByCalf(actions), [actions]);
  const latestTreatments = useMemo(() => latestTreatmentByTarget(treatments), [treatments]);

  const attentionByCalf = useMemo(() => {
    const result = new Map<string, FeedingAlertAction>();
    for (const [calfId, action] of latestActions) if (action.status === '再確認必要') result.set(calfId, action);
    return result;
  }, [latestActions]);

  const treatmentByCalf = useMemo(() => {
    const result = new Map<string, Treatment>();
    for (const row of rows) {
      const treatment = latestTreatments.get(String(row.calfNumber || '').trim());
      if (treatment && ['治療中', '経過観察'].includes(treatment.progress)) result.set(String(row.id), treatment);
    }
    return result;
  }, [rows, latestTreatments]);

  const filteredRows = useMemo(() => rows.filter((row) => {
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
  }), [rows, search, sexFilter, statusFilter, feedingFilter, weaningFilter, attentionByCalf, treatmentByCalf]);

  const summary = useMemo(() => ({
    nursing: rows.filter((row) => (row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前')) === '離乳前').length,
    weaned: rows.filter((row) => (row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前')) === '離乳済み').length,
    retained: rows.filter((row) => row.managementStatus === '繁殖候補として留保').length,
    attention: rows.filter((row) => attentionByCalf.has(String(row.id))).length,
    underTreatment: rows.filter((row) => treatmentByCalf.get(String(row.id))?.progress === '治療中').length,
    observation: rows.filter((row) => treatmentByCalf.get(String(row.id))?.progress === '経過観察').length,
  }), [rows, attentionByCalf, treatmentByCalf]);

  const filterActive = Boolean(search.trim() || sexFilter !== 'すべて' || statusFilter !== 'すべて' || feedingFilter !== 'すべて' || weaningFilter !== 'すべて');
  const clearFilters = () => { setSearch(''); setSexFilter('すべて'); setStatusFilter('すべて'); setFeedingFilter('すべて'); setWeaningFilter('すべて'); };

  const handleDelete = async (id: number) => {
    if (!confirm('削除しますか？')) return;
    await deleteCalf(id); await load();
  };

  const handlePromote = async (row: Calf) => {
    if (!confirm(`${calfDisplayName(row)}を牛台帳へ移行しますか？\n牛台帳では「育成牛」として登録されます。`)) return;
    try {
      const cattle = await promoteCalf(String(row.id));
      setMessage(`${calfDisplayName(row)}を牛台帳へ移行しました。`);
      await load();
      navigate(`/cattle/${cattle.id}`);
    } catch (error: any) {
      alert(error?.response?.data?.message || error?.message || '牛台帳への移行に失敗しました');
    }
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
        <Stack spacing={0.25}><Typography variant="h5" fontWeight={800}>子牛台帳</Typography><Typography color="text.secondary">表示：{filteredRows.length}件 / 全{rows.length}件</Typography></Stack>
        <Button component={RouterLink} to="/calves/new" variant="contained">新規登録</Button>
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {summary.underTreatment > 0 && <Chip label={`治療中 ${summary.underTreatment}頭`} color="warning" />}
        {summary.observation > 0 && <Chip label={`経過観察 ${summary.observation}頭`} color="info" />}
        {summary.attention > 0 && <Chip label={`要確認 ${summary.attention}頭`} color="error" />}
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
        const highlighted = Boolean(attention || treatment);
        return (
          <Card key={row.id} variant={highlighted ? 'outlined' : undefined} sx={highlighted ? { borderWidth: 2, borderColor: treatment ? 'warning.main' : 'error.main' } : undefined}>
            <CardContent><Stack spacing={1}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="h6" fontWeight={800}>{calfDisplayName(row)}</Typography>
                  {treatment && <Chip label={treatment.progress} size="small" color={treatment.progress === '治療中' ? 'warning' : 'info'} />}
                  {attention && <Chip label={`要確認：${attention.actionType || '気になる'}`} size="small" color="error" />}
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip label={formatSex(row.sex)} size="small" /><Chip label={status} size="small" color={statusColor(status)} /><Chip label={feedingMethod} size="small" variant="outlined" /><Chip label={weaningStatus} size="small" color={weaningStatus === '離乳済み' ? 'success' : 'warning'} />
                </Stack>
              </Stack>
              <Typography>耳標番号：{row.calfNumber?.startsWith('TEMP-') ? '未装着' : row.calfNumber || '-'}</Typography>
              {row.calfNumber?.startsWith('TEMP-') && <Typography color="text.secondary">仮管理番号：{formatTemporaryCalfNumber(row.calfNumber, row.birthday)}</Typography>}
              <Typography color="text.secondary">個体識別番号：{row.identificationNumber || '-'}</Typography>
              <Typography color="text.secondary">生年月日：{row.birthday || '-'} / 日齢：{calcAgeDays(row.birthday) ?? '-'}日</Typography>
              <Typography color="text.secondary">母牛：{row.motherName || '-'}</Typography>
              {treatment && <Typography color="text.secondary">治療：{treatment.symptom || treatment.diagnosis || '-'} / {treatment.treatmentDate || '-'}</Typography>}
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
                {canPromote && <Button color="success" variant="contained" onClick={() => handlePromote(row)}>牛台帳へ移行</Button>}
                {status === '牛台帳へ移行済み' && row.promotedCattleId && <Button component={RouterLink} to={`/cattle/${row.promotedCattleId}`} color="success" variant="outlined">牛情報</Button>}
                <Button color="error" variant="text" onClick={() => handleDelete(row.id)}>削除</Button>
              </Stack>
            </Stack></CardContent>
          </Card>
        );
      })}

      {filteredRows.length === 0 && <Alert severity="info">該当する子牛がありません。</Alert>}
      <Button variant="outlined" onClick={() => setFilterOpen((open) => !open)} sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}>
        {filterOpen ? '検索・絞り込みを閉じる ▲' : `検索・絞り込みを開く ▼${filterActive ? '（適用中）' : ''}`}
      </Button>
      <Collapse in={filterOpen}>
        <Card variant="outlined"><CardContent sx={{ py: 1.5 }}><Stack spacing={1}>
          <TextField label="名前・耳標番号・母牛で検索" value={search} onChange={(e) => setSearch(e.target.value)} size="small" fullWidth />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <TextField label="性別" select value={sexFilter} onChange={(e) => setSexFilter(e.target.value)} size="small" fullWidth><MenuItem value="すべて">すべて</MenuItem><MenuItem value="雄">♂</MenuItem><MenuItem value="雌">♀</MenuItem><MenuItem value="去勢">♂去</MenuItem></TextField>
            <TextField label="飼養区分" select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} size="small" fullWidth><MenuItem value="すべて">すべて</MenuItem><MenuItem value="販売予定">販売予定</MenuItem><MenuItem value="育成中">育成中</MenuItem><MenuItem value="繁殖候補として留保">繁殖候補として留保</MenuItem><MenuItem value="牛台帳へ移行済み">牛台帳へ移行済み</MenuItem><MenuItem value="死亡・その他">死亡・その他</MenuItem></TextField>
            <TextField label="哺育方法" select value={feedingFilter} onChange={(e) => setFeedingFilter(e.target.value)} size="small" fullWidth><MenuItem value="すべて">すべて</MenuItem><MenuItem value="人工哺育">人工哺育</MenuItem><MenuItem value="母乳哺育">母乳哺育</MenuItem><MenuItem value="混合哺育">混合哺育</MenuItem></TextField>
            <TextField label="離乳状態" select value={weaningFilter} onChange={(e) => setWeaningFilter(e.target.value)} size="small" fullWidth><MenuItem value="すべて">すべて</MenuItem><MenuItem value="離乳前">離乳前</MenuItem><MenuItem value="離乳済み">離乳済み</MenuItem></TextField>
          </Stack>
          <Button variant="outlined" onClick={clearFilters} disabled={!filterActive}>検索・絞り込みをクリア</Button>
        </Stack></CardContent></Card>
      </Collapse>
    </Stack>
  );
}
