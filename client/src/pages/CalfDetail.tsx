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
import type { CalfManagementMode, FarmSettings } from '../types/settings';
import { getAllRecords, getRecordById } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import { registerCalfEarTag, registerCalfName } from '../services/calfApi';
import { createFeedingAlertAction } from '../services/feedingAlertActionsApi';
import { getFarmSettings, updateFarmSettings } from '../services/settingsApi';
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
  createdAt?: string;
  updatedAt?: string;
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

type QuickRecord = {
  label: string;
  needsAttention?: boolean;
};

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ageDaysFromBirthday(birthday?: string) {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return null;
  const current = new Date();
  return Math.floor((current.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
}

function calfNameOf(calf: Calf | null) {
  if (!calf) return '';
  return String(calf.name || calf.calfNumber || '');
}

function treatmentHistoryLink(calf: Calf | null) {
  const params = new URLSearchParams();
  if (calf?.calfNumber && !calf.calfNumber.startsWith('TEMP-')) {
    params.set('targetNumber', calf.calfNumber);
  } else if (calfNameOf(calf)) {
    params.set('targetName', calfNameOf(calf));
  }
  return `/treatments?${params.toString()}`;
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

function actionSortKey(item: FeedingAlertAction) {
  return `${item.actionDate || ''}-${item.updatedAt || item.createdAt || ''}-${item.id || ''}`;
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

function quickRecordsFor(calf: Calf | null): QuickRecord[] {
  if (calf?.weaningStatus === '離乳済み') {
    return [
      { label: '元気' },
      { label: '発育良好' },
      { label: '下痢', needsAttention: true },
      { label: '気になる', needsAttention: true },
    ];
  }

  if (calf?.feedingMethod === '母乳哺育') {
    return [
      { label: '吸乳確認' },
      { label: '元気' },
      { label: '吸乳が気になる', needsAttention: true },
      { label: '下痢', needsAttention: true },
      { label: '母牛側が気になる', needsAttention: true },
    ];
  }

  if (calf?.feedingMethod === '混合哺育') {
    return [
      { label: '吸乳確認' },
      { label: '追加給与済み' },
      { label: '元気' },
      { label: '飲み悪い', needsAttention: true },
      { label: '下痢', needsAttention: true },
    ];
  }

  return [
    { label: '給与済み' },
    { label: '元気' },
    { label: '飲み悪い', needsAttention: true },
    { label: '下痢', needsAttention: true },
    { label: '気になる', needsAttention: true },
  ];
}

export function CalfDetail() {
  const params = useParams();
  const calfId = String(params.id || '');
  const [calf, setCalf] = useState<Calf | null>(null);
  const [actions, setActions] = useState<FeedingAlertAction[]>([]);
  const [guides, setGuides] = useState<FeedingGuide[]>([]);
  const [farmSettings, setFarmSettings] = useState<FarmSettings | null>(null);
  const [managementMode, setManagementMode] = useState<CalfManagementMode>('かんたん');
  const [modeSaving, setModeSaving] = useState(false);
  const [quickSaving, setQuickSaving] = useState('');
  const [quickMessage, setQuickMessage] = useState('');
  const [quickError, setQuickError] = useState('');
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

  async function load() {
    setLoading(true);
    setError('');
    try {
      const numericId = Number(calfId);
      const recordId = Number.isFinite(numericId) ? numericId : calfId;
      const [calfData, actionsData, guidesData, settingsData] = await Promise.all([
        getRecordById<Calf>('calves', recordId),
        getAllRecords<FeedingAlertAction>('feedingAlertActions'),
        getAllRecords<FeedingGuide>('feedingGuide'),
        getFarmSettings(),
      ]);
      if (!calfData) throw new Error('子牛台帳に該当する子牛が見つかりませんでした。');
      setCalf(calfData);
      setActions(actionsData);
      setGuides(guidesData);
      setFarmSettings(settingsData);
      setManagementMode(settingsData.calfManagementMode || 'かんたん');
    } catch (err) {
      setError(err instanceof Error ? err.message : '子牛情報を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [calfId]);

  async function handleModeChange(nextMode: CalfManagementMode) {
    if (nextMode === managementMode || !farmSettings) return;
    setModeSaving(true);
    try {
      const updated = await updateFarmSettings({ ...farmSettings, calfManagementMode: nextMode });
      setFarmSettings(updated);
      setManagementMode(updated.calfManagementMode || nextMode);
    } finally {
      setModeSaving(false);
    }
  }

  async function handleQuickRecord(record: QuickRecord) {
    if (!calf) return;
    setQuickSaving(record.label);
    setQuickMessage('');
    setQuickError('');
    try {
      const saved = await createFeedingAlertAction({
        actionDate: today(), calfId: String(calf.id), calfName: calfNameOf(calf),
        ageDays: ageDaysFromBirthday(calf.birthday) === null ? '' : String(ageDaysFromBirthday(calf.birthday)),
        alertType: 'その他', actionType: record.label, memo: '子牛かんたん管理から1タップ記録',
        nextCheckDate: '', status: record.needsAttention ? '再確認必要' : '対応済み',
      });
      setActions((prev) => [saved, ...prev]);
      setQuickMessage(`${record.label} を記録しました。`);
    } catch (err) {
      setQuickError(err instanceof Error ? err.message : '記録できませんでした。');
    } finally { setQuickSaving(''); }
  }

  async function handleRegisterEarTag() {
    setEarTagMessage(''); setEarTagError('');
    try {
      setEarTagSaving(true);
      const updated = await registerCalfEarTag(calfId, earTagInput);
      setCalf(updated); setEarTagInput('');
      setEarTagMessage(`耳標番号 ${updated.calfNumber} を登録しました。`);
    } catch (err) { setEarTagError(err instanceof Error ? err.message : '耳標番号を登録できませんでした。'); }
    finally { setEarTagSaving(false); }
  }

  async function handleRegisterName() {
    setNameMessage(''); setNameError('');
    try {
      setNameSaving(true);
      const updated = await registerCalfName(calfId, nameInput);
      setCalf(updated); setNameInput('');
      setNameMessage(`名号 ${updated.name} を登録しました。`);
    } catch (err) { setNameError(err instanceof Error ? err.message : '名号を登録できませんでした。'); }
    finally { setNameSaving(false); }
  }

  const calfName = calfNameOf(calf);
  const isTemporaryCalfNumber = calf?.calfNumber?.startsWith('TEMP-') ?? false;
  const displayedEarTag = isTemporaryCalfNumber ? '未装着' : value(calf?.calfNumber);
  const displayedTemporaryNumber = isTemporaryCalfNumber ? formatTemporaryCalfNumber(calf?.calfNumber, calf?.birthday) : '';
  const nameMissing = !calf?.name || calf.name === '耳標未装着' || calf.name.startsWith('TEMP-');
  const displayedName = nameMissing ? '未登録' : calf?.name;
  const ageDays = ageDaysFromBirthday(calf?.birthday);
  const guide = nearestGuide(ageDays, guides);
  const quickRecords = quickRecordsFor(calf);
  const isWeaned = calf?.weaningStatus === '離乳済み';

  const calfActions = useMemo(() => actions
    .filter((item) => {
      const itemCalfId = String(item.calfId || '');
      const itemCalfName = String(item.calfName || '');
      return (calfId && itemCalfId === calfId) || (calfName && itemCalfName === calfName);
    })
    .sort((a, b) => actionSortKey(b).localeCompare(actionSortKey(a))), [actions, calfId, calfName]);

  const latestAction = calfActions[0];
  const needsCurrentAttention = latestAction?.status === '再確認必要';

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>子牛情報</Typography>
        <Button component={RouterLink} to="/calves" variant="outlined">子牛台帳へ戻る</Button>
        <Button component={RouterLink} to={treatmentHistoryLink(calf)} variant="outlined" disabled={!calf}>治療履歴</Button>
        {managementMode === '詳細' && <Button component={RouterLink} to="/feeding-alert-actions" variant="outlined">対応記録一覧</Button>}
      </Stack>
      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="warning">{error}</Alert>}
      {!loading && !error && <>
        <Card variant="outlined"><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Stack sx={{ flexGrow: 1 }}><Typography fontWeight={900}>子牛管理モード</Typography><Typography color="text.secondary" variant="body2">データは共通のまま、画面の細かさだけ切り替えます。詳細からかんたんへ戻しても記録は消えません。</Typography></Stack>
          <Stack direction="row" spacing={1}><Button variant={managementMode === 'かんたん' ? 'contained' : 'outlined'} onClick={() => handleModeChange('かんたん')} disabled={modeSaving}>かんたん</Button><Button variant={managementMode === '詳細' ? 'contained' : 'outlined'} onClick={() => handleModeChange('詳細')} disabled={modeSaving}>詳細</Button></Stack>
        </Stack></CardContent></Card>

        <Card><CardContent><Stack spacing={2}>
          <Typography variant="h6" fontWeight={800}>基本情報</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}><Typography color="text.secondary">耳標番号</Typography><Typography fontWeight={800}>{displayedEarTag}</Typography></Grid>
            {displayedTemporaryNumber && <Grid item xs={12} md={3}><Typography color="text.secondary">仮管理番号</Typography><Typography fontWeight={800}>{displayedTemporaryNumber}</Typography></Grid>}
            <Grid item xs={12} md={3}><Typography color="text.secondary">名号</Typography><Typography fontWeight={800}>{displayedName}</Typography></Grid>
            <Grid item xs={12} md={3}><Typography color="text.secondary">生年月日</Typography><Typography fontWeight={800}>{value(calf?.birthday)}</Typography></Grid>
            <Grid item xs={12} md={3}><Typography color="text.secondary">日齢</Typography><Typography fontWeight={800}>{ageDays === null ? '-' : `${ageDays}日`}</Typography></Grid>
            <Grid item xs={12} md={3}><Typography color="text.secondary">性別</Typography><Typography fontWeight={800}>{formatSex(calf?.sex)}</Typography></Grid>
            <Grid item xs={12} md={3}><Typography color="text.secondary">母牛</Typography><Typography fontWeight={800}>{value(calf?.motherName)}</Typography></Grid>
            <Grid item xs={12} md={3}><Typography color="text.secondary">哺育方法</Typography><Typography fontWeight={800}>{value(calf?.feedingMethod)}</Typography></Grid>
            <Grid item xs={12} md={3}><Typography color="text.secondary">離乳状態</Typography><Typography fontWeight={800}>{value(calf?.weaningStatus)}</Typography></Grid>
            {managementMode === '詳細' && <Grid item xs={12} md={6}><Typography color="text.secondary">備考</Typography><Typography fontWeight={800}>{value(calf?.note)}</Typography></Grid>}
          </Grid>

          {isTemporaryCalfNumber && <Card variant="outlined"><CardContent><Stack spacing={1.25}><Typography fontWeight={800}>耳標を装着したらここで登録</Typography><Typography color="text.secondary">この子牛の記録・母牛との親子関係をそのまま維持して、正式な耳標番号へ切り替えます。</Typography>{earTagMessage && <Alert severity="success">{earTagMessage}</Alert>}{earTagError && <Alert severity="error">{earTagError}</Alert>}<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><TextField label="正式な耳標番号" value={earTagInput} onChange={(e) => setEarTagInput(e.target.value)} fullWidth /><Button variant="contained" onClick={handleRegisterEarTag} disabled={earTagSaving || !earTagInput.trim()} sx={{ minWidth: 180 }}>{earTagSaving ? '登録中...' : '耳標番号を登録'}</Button></Stack></Stack></CardContent></Card>}
          {nameMissing && <Card variant="outlined"><CardContent><Stack spacing={1.25}><Typography fontWeight={800}>名号を登録</Typography><Typography color="text.secondary">決まった名号を、この子牛の情報にそのまま登録します。</Typography>{nameMessage && <Alert severity="success">{nameMessage}</Alert>}{nameError && <Alert severity="error">{nameError}</Alert>}<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><TextField label="名号" value={nameInput} onChange={(e) => setNameInput(e.target.value)} fullWidth /><Button variant="contained" onClick={handleRegisterName} disabled={nameSaving || !nameInput.trim()} sx={{ minWidth: 180 }}>{nameSaving ? '登録中...' : '名号を登録'}</Button></Stack></Stack></CardContent></Card>}
        </Stack></CardContent></Card>

        {managementMode === 'かんたん' && <Card><CardContent><Stack spacing={1.5}>
          <Typography variant="h6" fontWeight={800}>{isWeaned ? '今日の育成確認' : '今日の確認'}</Typography>
          <Typography color="text.secondary">{isWeaned ? '離乳後は哺乳確認を止め、体調や発育に変化があった時を中心に軽く記録します。' : '普段は1タップで記録します。気になる項目は「再確認必要」として残ります。'}</Typography>
          {quickMessage && <Alert severity="success">{quickMessage}</Alert>}{quickError && <Alert severity="error">{quickError}</Alert>}
          <Grid container spacing={1}>{quickRecords.map((record) => <Grid item xs={6} sm="auto" key={record.label}><Button variant={record.needsAttention ? 'outlined' : 'contained'} onClick={() => handleQuickRecord(record)} disabled={Boolean(quickSaving)} fullWidth sx={{ minHeight: 48, minWidth: { sm: 120 } }}>{quickSaving === record.label ? '記録中...' : record.label}</Button></Grid>)}</Grid>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button component={RouterLink} to={newActionLink(calf, ageDays)} variant="text">詳しく記録する</Button><Button onClick={() => handleModeChange('詳細')} variant="outlined" disabled={modeSaving}>詳細を開く</Button></Stack>
        </Stack></CardContent></Card>}

        {managementMode === '詳細' && <>
          <Card><CardContent><Stack spacing={1.25}><Typography variant="h6" fontWeight={800}>現在の状態</Typography>{!latestAction ? <Alert severity="info">まだ確認記録がありません。</Alert> : needsCurrentAttention ? <Alert severity="warning">現在：要確認（{value(latestAction.actionType)}） / 最終確認：{value(latestAction.actionDate)}</Alert> : <Alert severity="success">現在：問題なし / 最終確認：{value(latestAction.actionType)}・{value(latestAction.actionDate)}</Alert>}<Typography color="text.secondary" variant="body2">過去の「再確認必要」は履歴として残ります。現在状態は最新の確認記録で判断します。</Typography></Stack></CardContent></Card>
          <Card><CardContent><Stack spacing={2}><Typography variant="h6" fontWeight={800}>給与目安</Typography>{ageDays === null ? <Alert severity="info">生年月日がないため、日齢から給与目安を表示できません。</Alert> : !guide ? <Alert severity="info">給与目安が登録されていません。</Alert> : <Grid container spacing={2}><Grid item xs={12} md={3}><Typography color="text.secondary">近い日齢</Typography><Typography fontWeight={800}>{value(guide.ageDays)}日</Typography></Grid><Grid item xs={12} md={3}><Typography color="text.secondary">ステージ</Typography><Typography fontWeight={800}>{value(guide.stageName)}</Typography></Grid><Grid item xs={12} md={2}><Typography color="text.secondary">スターター</Typography><Typography fontWeight={800}>{value(guide.starterKg)}kg</Typography></Grid><Grid item xs={12} md={2}><Typography color="text.secondary">育成配合</Typography><Typography fontWeight={800}>{value(guide.growingFeedKg)}kg</Typography></Grid><Grid item xs={12} md={2}><Typography color="text.secondary">粗飼料</Typography><Typography fontWeight={800}>{value(guide.roughageKg)}kg</Typography></Grid></Grid>}</Stack></CardContent></Card>
          <Card><CardContent><Stack spacing={2}><Stack direction="row" spacing={1} alignItems="center"><Typography variant="h6" fontWeight={800} sx={{ flexGrow: 1 }}>過去の確認・対応履歴</Typography><Button component={RouterLink} to={newActionLink(calf, ageDays)} variant="contained">対応記録を追加</Button></Stack><Alert severity="info">この子牛に対して登録された確認・対応記録を時系列で残します。</Alert>{calfActions.length === 0 ? <Alert severity="success">この子牛の確認・対応記録はまだありません。</Alert> : <Table size="small"><TableHead><TableRow><TableCell>対応日</TableCell><TableCell>アラート</TableCell><TableCell>対応内容</TableCell><TableCell>記録時の状態</TableCell><TableCell>次回確認日</TableCell><TableCell>メモ</TableCell><TableCell>操作</TableCell></TableRow></TableHead><TableBody>{calfActions.map((item) => <TableRow key={item.id}><TableCell>{value(item.actionDate)}</TableCell><TableCell><Chip size="small" color={alertColor(String(item.alertType || '')) as any} label={value(item.alertType)} /></TableCell><TableCell>{value(item.actionType)}</TableCell><TableCell><Chip size="small" color={statusColor(String(item.status || '')) as any} label={value(item.status)} /></TableCell><TableCell>{value(item.nextCheckDate)}</TableCell><TableCell>{value(item.memo)}</TableCell><TableCell><Button component={RouterLink} to={`/feeding-alert-actions/${item.id}/edit`} size="small" variant="outlined">編集</Button></TableCell></TableRow>)}</TableBody></Table>}<Typography color="text.secondary">子牛IDまたは名号が一致する履歴を表示しています。</Typography></Stack></CardContent></Card>
        </>}
      </>}
    </Stack>
  );
}

export default CalfDetail;
