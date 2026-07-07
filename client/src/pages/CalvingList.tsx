import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import {
  deleteCalving,
  fetchCalvings,
  registerCalvingToCalfLedger,
  type CalvingRecord
} from '../services/calvingsApi';

type RegistrationFilter = 'すべて' | '登録できます' | '要確認' | '登録済み' | '登録対象外' | 'カルテ直行';
type RegisteredCalfLink = { id: string; label: string; path: string };

const registrationFilterOptions: RegistrationFilter[] = ['すべて', '登録できます', '要確認', '登録済み', '登録対象外', 'カルテ直行'];
const noPrintSx = { '@media print': { display: 'none' } };
const printOnlySx = { display: 'none', '@media print': { display: 'block' } };

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function csvCell(v: unknown) {
  const text = v === null || v === undefined ? '' : String(v);
  return `"${text.replace(/"/g, '""')}"`;
}

function todayText(separator = '') {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return separator ? `${y}${separator}${m}${separator}${day}` : `${y}${m}${day}`;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function resultColor(result?: string) {
  if (result === '自然分娩') return 'success';
  if (result === '難産') return 'warning';
  if (result === '外科的処置') return 'secondary';
  if (result === '死産') return 'error';
  return 'default';
}

function colostrumColor(status?: string) {
  if (status === '確認済み') return 'success';
  if (status === '要確認') return 'warning';
  if (status === '未確認') return 'info';
  return 'default';
}

function daysText(days?: number | null) {
  if (days === null || days === undefined) return '-';
  if (days === 0) return '予定日どおり';
  if (days > 0) return `+${days}日`;
  return `${days}日`;
}

function sortRecords(records: CalvingRecord[]) {
  return [...records].sort((a, b) => (b.actualCalvingDate || '').localeCompare(a.actualCalvingDate || ''));
}

function canRegisterCalf(row: CalvingRecord) {
  return Boolean(row.id && !row.registeredToCalfLedger && row.calvingResult !== '死産' && row.cowId && row.calfName && row.actualCalvingDate);
}

function missingRegisterFields(row: CalvingRecord) {
  const missing: string[] = [];
  if (!row.calfName && row.calvingResult !== '死産') missing.push('子牛耳標番号');
  if (!row.actualCalvingDate) missing.push('実分娩日');
  if (!row.cowId) missing.push('母牛耳標番号');
  return missing;
}

function registerReadiness(row: CalvingRecord) {
  if (row.calvingResult === '死産') {
    return { label: '登録対象外', color: 'default' as const, note: '死産のため子牛台帳へは登録しません。' };
  }
  if (row.registeredToCalfLedger) {
    return { label: '登録済み', color: 'success' as const, note: 'すでに子牛台帳へ登録されています。' };
  }
  const missing = missingRegisterFields(row);
  if (missing.length > 0) {
    return { label: '要確認', color: 'warning' as const, note: `${missing.join('、')} を入力すると子牛台帳へ登録できます。` };
  }
  return { label: '登録できます', color: 'info' as const, note: 'この内容で子牛台帳へ登録できます。登録前に重複がないか確認してください。' };
}

function matchesRegistrationFilter(row: CalvingRecord, filter: RegistrationFilter) {
  if (filter === 'すべて') return true;
  if (filter === '登録できます') return canRegisterCalf(row);
  if (filter === '要確認') return !row.registeredToCalfLedger && row.calvingResult !== '死産' && !canRegisterCalf(row);
  if (filter === '登録済み') return Boolean(row.registeredToCalfLedger && row.calvingResult !== '死産');
  if (filter === '登録対象外') return row.calvingResult === '死産';
  if (filter === 'カルテ直行') return Boolean(row.registeredToCalfLedger && row.calfId);
  return true;
}

function calfDetailPath(row: CalvingRecord) {
  return row.calfId ? `/calves/${row.calfId}?from=calving` : '/calves';
}

function calfLedgerStatus(row: CalvingRecord) {
  if (row.calvingResult === '死産') return { label: '対象外', color: 'default' as const };
  if (row.registeredToCalfLedger) return { label: '登録済み', color: 'success' as const };
  return { label: '未登録', color: 'warning' as const };
}

function CalvingActions({
  row,
  registeringId,
  deletingId,
  onRegister,
  onDelete
}: {
  row: CalvingRecord;
  registeringId: string;
  deletingId: string;
  onRegister: (row: CalvingRecord) => void;
  onDelete: (row: CalvingRecord) => void;
}) {
  return (
    <Stack direction="row" spacing={1} sx={noPrintSx} flexWrap="wrap" useFlexGap>
      <Button component={RouterLink} to={`/calvings/${row.id}/edit`} size="small" variant="outlined">編集</Button>
      {canRegisterCalf(row) && (
        <Button size="small" variant="contained" onClick={() => onRegister(row)} disabled={registeringId === row.id}>
          {registeringId === row.id ? '登録中...' : '登録してカルテへ進む'}
        </Button>
      )}
      {row.registeredToCalfLedger && (
        <Button component={RouterLink} to={calfDetailPath(row)} size="small" variant="contained" color="success">
          {row.calfId ? 'カルテ確認' : '台帳確認'}
        </Button>
      )}
      <Button size="small" color="error" variant="outlined" onClick={() => onDelete(row)} disabled={deletingId === row.id}>
        {deletingId === row.id ? '削除中' : '削除'}
      </Button>
    </Stack>
  );
}

function CalvingCard({
  row,
  registeringId,
  deletingId,
  onRegister,
  onDelete
}: {
  row: CalvingRecord;
  registeringId: string;
  deletingId: string;
  onRegister: (row: CalvingRecord) => void;
  onDelete: (row: CalvingRecord) => void;
}) {
  const ledger = calfLedgerStatus(row);
  const readiness = registerReadiness(row);

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack spacing={1.2}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Box sx={{ flexGrow: 1 }}>
              <Typography fontWeight={900}>母牛耳標番号：{value(row.cowId)}</Typography>
              <Typography color="text.secondary" variant="caption">母牛名：{value(row.cowName)}</Typography>
            </Box>
            <Chip size="small" color={resultColor(row.calvingResult) as any} label={value(row.calvingResult)} />
            <Chip size="small" color={colostrumColor(row.colostrumStatus) as any} label={`初乳：${value(row.colostrumStatus)}`} />
            <Chip size="small" color={readiness.color as any} label={readiness.label} variant="outlined" />
          </Stack>
          <Grid container spacing={1}>
            <Grid item xs={6}><Typography color="text.secondary">実分娩日</Typography><Typography fontWeight={700}>{value(row.actualCalvingDate)}</Typography></Grid>
            <Grid item xs={6}><Typography color="text.secondary">予定日との差</Typography><Typography fontWeight={700}>{daysText(row.daysFromExpected)}</Typography></Grid>
            <Grid item xs={6}><Typography color="text.secondary">母牛耳標番号</Typography><Typography fontWeight={700}>{value(row.cowId)}</Typography></Grid>
            <Grid item xs={6}><Typography color="text.secondary">子牛耳標番号</Typography><Typography fontWeight={700}>{value(row.calfName)}</Typography></Grid>
            <Grid item xs={6}><Typography color="text.secondary">性別</Typography><Typography fontWeight={700}>{value(row.calfSex)}</Typography></Grid>
            <Grid item xs={6}><Typography color="text.secondary">出生体重</Typography><Typography fontWeight={700}>{row.birthWeightKg === '' || row.birthWeightKg === undefined ? '-' : `${row.birthWeightKg}kg`}</Typography></Grid>
          </Grid>
          {!row.registeredToCalfLedger && row.calvingResult !== '死産' && <Alert severity={canRegisterCalf(row) ? 'info' : 'warning'}>{readiness.note}</Alert>}
          {row.registeredToCalfLedger && <Alert severity="success">子牛台帳へ登録済みです。子牛耳標番号: {value(row.calfName)}</Alert>}
          {row.memo && <Alert severity="info">{row.memo}</Alert>}
          <CalvingActions row={row} registeringId={registeringId} deletingId={deletingId} onRegister={onRegister} onDelete={onDelete} />
          <Chip size="small" color={ledger.color as any} label={`子牛台帳：${ledger.label}`} sx={{ alignSelf: 'flex-start' }} />
        </Stack>
      </CardContent>
    </Card>
  );
}

export function CalvingList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<CalvingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [registeringId, setRegisteringId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [registeredCalfLink, setRegisteredCalfLink] = useState<RegisteredCalfLink | null>(null);
  const [keyword, setKeyword] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [colostrumFilter, setColostrumFilter] = useState('');
  const [registrationFilter, setRegistrationFilter] = useState<RegistrationFilter>('すべて');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchCalvings();
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '分娩記録を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const registration = searchParams.get('registration');
    if (registration === 'ready') {
      setKeyword('');
      setResultFilter('');
      setColostrumFilter('');
      setRegistrationFilter('登録できます');
    }
    if (registration === 'need-input') {
      setKeyword('');
      setResultFilter('');
      setColostrumFilter('');
      setRegistrationFilter('要確認');
    }
    if (registration === 'registered') {
      setKeyword('');
      setResultFilter('');
      setColostrumFilter('');
      setRegistrationFilter('登録済み');
    }
    if (registration === 'calf-card') {
      setKeyword('');
      setResultFilter('');
      setColostrumFilter('');
      setRegistrationFilter('カルテ直行');
    }
  }, [searchParams]);

  async function handleRegister(row: CalvingRecord) {
    if (!row.id) return;

    const ok = window.confirm(
      `この分娩記録を子牛台帳へ登録します。\n登録後、この画面から子牛カルテを開けます。\n\n` +
      `母牛耳標番号：${row.cowId || '-'}\n` +
      `母牛名：${row.cowName || '-'}\n` +
      `子牛耳標番号：${row.calfName || '-'}\n` +
      `性別：${row.calfSex || '-'}\n` +
      `出生日：${row.actualCalvingDate || '-'}\n` +
      `出生体重：${row.birthWeightKg || '-'}kg\n\n` +
      '内容に間違いがなければOKを押してください。'
    );

    if (!ok) return;
    setRegisteringId(row.id);
    setMessage('');
    setError('');
    setRegisteredCalfLink(null);

    try {
      const result = await registerCalvingToCalfLedger(row.id);
      const calfId = result.calf?.id || result.calving?.calfId || '';
      const label = result.calf?.earTag || result.calf?.name || row.calfName || '登録した子牛';

      if (calfId) {
        setRegisteredCalfLink({ id: calfId, label, path: `/calves/${calfId}?from=calving` });
        setMessage(`子牛台帳へ登録しました。${label} の子牛カルテを確認できます。`);
      } else {
        setMessage('子牛台帳へ登録しました。一覧の登録済みカードから子牛カルテを確認できます。');
      }

      setKeyword('');
      setResultFilter('');
      setColostrumFilter('');
      setRegistrationFilter(calfId ? 'カルテ直行' : '登録済み');
      setSearchParams({ registration: calfId ? 'calf-card' : 'registered' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '子牛台帳へ登録できませんでした。');
    } finally {
      setRegisteringId('');
    }
  }

  async function handleDelete(row: CalvingRecord) {
    if (!row.id) return;
    const warning = row.registeredToCalfLedger ? '\n\n注意：この記録は子牛台帳へ登録済みです。分娩記録を削除しても、子牛台帳の子牛は自動削除されません。' : '';
    const ok = window.confirm(`分娩記録「母牛耳標番号：${row.cowId || '-'} / 子牛耳標番号：${row.calfName || '-'}」を削除します。${warning}\n\n本当に削除しますか？`);
    if (!ok) return;

    setDeletingId(row.id);
    setMessage('');
    setError('');
    setRegisteredCalfLink(null);
    try {
      await deleteCalving(row.id);
      setMessage('分娩記録を削除しました。');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '分娩記録を削除できませんでした。');
    } finally {
      setDeletingId('');
    }
  }

  function clearFilters() {
    setKeyword('');
    setResultFilter('');
    setColostrumFilter('');
    setRegistrationFilter('すべて');
    setSearchParams({});
  }

  function showReadyToRegister() {
    setKeyword('');
    setResultFilter('');
    setColostrumFilter('');
    setRegistrationFilter('登録できます');
    setSearchParams({ registration: 'ready' });
  }

  function showNeedInput() {
    setKeyword('');
    setResultFilter('');
    setColostrumFilter('');
    setRegistrationFilter('要確認');
    setSearchParams({ registration: 'need-input' });
  }

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return sortRecords(records).filter((row) => {
      if (resultFilter && row.calvingResult !== resultFilter) return false;
      if (colostrumFilter && row.colostrumStatus !== colostrumFilter) return false;
      if (!matchesRegistrationFilter(row, registrationFilter)) return false;
      const text = [row.cowId, row.cowName, row.expectedCalvingDate, row.actualCalvingDate, row.calfName, row.calfSex, row.birthWeightKg, row.calvingResult, row.colostrumStatus, row.memo].join(' ').toLowerCase();
      return !kw || text.includes(kw);
    });
  }, [records, keyword, resultFilter, colostrumFilter, registrationFilter]);

  const readyToRegisterCount = records.filter((row) => canRegisterCalf(row)).length;
  const needInputCount = records.filter((row) => !row.registeredToCalfLedger && row.calvingResult !== '死産' && !canRegisterCalf(row)).length;
  const registeredCount = records.filter((row) => row.registeredToCalfLedger && row.calvingResult !== '死産').length;
  const colostrumNeedCount = records.filter((row) => row.colostrumStatus === '未確認' || row.colostrumStatus === '要確認').length;
  const hasActiveFilters = Boolean(keyword || resultFilter || colostrumFilter || registrationFilter !== 'すべて');

  function handleExportCsv() {
    const rows: unknown[][] = [
      ['実分娩日', '母牛耳標番号', '母牛名', '子牛耳標番号', '性別', '出生体重kg', '分娩結果', '初乳確認', '登録準備', '登録準備メモ', '子牛台帳状態', '子牛カルテ直接リンク', '予定日との差', 'メモ'],
      ...filtered.map((row) => {
        const readiness = registerReadiness(row);
        const ledger = calfLedgerStatus(row);
        return [row.actualCalvingDate || '', row.cowId || '', row.cowName || '', row.calfName || '', row.calfSex || '', row.birthWeightKg ?? '', row.calvingResult || '', row.colostrumStatus || '', readiness.label, readiness.note, ledger.label, row.calfId ? 'あり' : '', daysText(row.daysFromExpected), row.memo || ''];
      })
    ];
    downloadCsv(`calving-list-${todayText()}.csv`, rows);
  }

  return (
    <Stack spacing={2} sx={{ '@media print': { color: '#000', gap: 1 } }}>
      <Typography variant="h5" fontWeight={800}>分娩記録</Typography>

      <Box sx={printOnlySx}>
        <Typography fontWeight={700}>印刷日：{todayText('/')} / 表示件数：{filtered.length}件</Typography>
        <Typography>条件：検索 {keyword || 'なし'} / 登録状態 {registrationFilter} / 分娩結果 {resultFilter || 'すべて'} / 初乳 {colostrumFilter || 'すべて'}</Typography>
      </Box>

      <Card sx={noPrintSx}>
        <CardContent>
          <Stack spacing={1.5}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between">
              <Box>
                <Typography variant="h6" fontWeight={800}>まず確認すること</Typography>
                <Typography color="text.secondary">耳標番号を中心に表示します。必要な記録だけ絞り込んで確認できます。</Typography>
              </Box>
              {hasActiveFilters && <Button onClick={clearFilters} variant="outlined">すべて表示</Button>}
            </Stack>

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip label={`登録候補 ${readyToRegisterCount}件`} color={readyToRegisterCount > 0 ? 'warning' : 'default'} />
              <Chip label={`要確認 ${needInputCount}件`} color={needInputCount > 0 ? 'warning' : 'default'} variant="outlined" />
              <Chip label={`台帳登録済み ${registeredCount}件`} color="success" variant="outlined" />
              <Chip label={`初乳要確認 ${colostrumNeedCount}件`} color={colostrumNeedCount > 0 ? 'warning' : 'default'} variant="outlined" />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button component={RouterLink} to="/calvings/new" variant="contained">新規登録</Button>
              <Button onClick={showReadyToRegister} variant="contained" color="warning" disabled={readyToRegisterCount === 0}>登録候補</Button>
              <Button onClick={showNeedInput} variant="outlined" color="warning" disabled={needInputCount === 0}>要確認</Button>
              <Button component={RouterLink} to="/calves" variant="outlined">子牛台帳</Button>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button onClick={handleExportCsv} variant="outlined" disabled={filtered.length === 0}>CSV出力</Button>
              <Button onClick={() => window.print()} variant="outlined" disabled={filtered.length === 0}>印刷</Button>
              <Button onClick={load} variant="outlined">再読み込み</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {message && (
        <Alert severity="success" sx={noPrintSx}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
            <Typography>{message}</Typography>
            {registeredCalfLink && (
              <Button component={RouterLink} to={registeredCalfLink.path} variant="contained" color="success" size="small">
                子牛カルテを開く
              </Button>
            )}
          </Stack>
        </Alert>
      )}
      {error && <Alert severity="warning" sx={noPrintSx}>{error}</Alert>}

      {loading && <Typography>読み込み中...</Typography>}

      {!loading && (
        <>
          <Card sx={noPrintSx}>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
                  <Typography variant="h6" fontWeight={800}>記録を探す</Typography>
                  {hasActiveFilters && <Button onClick={clearFilters} variant="outlined" size="small">条件クリア</Button>}
                </Stack>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}><TextField label="耳標番号検索" fullWidth value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="母牛耳標番号・子牛耳標番号・母牛名・メモ" /></Grid>
                  <Grid item xs={12} md={3}>
                    <TextField label="登録状態" select fullWidth value={registrationFilter} onChange={(e) => setRegistrationFilter(e.target.value as RegistrationFilter)}>
                      {registrationFilterOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField label="分娩結果" select fullWidth value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
                      <MenuItem value="">すべて</MenuItem>
                      <MenuItem value="自然分娩">自然分娩</MenuItem>
                      <MenuItem value="難産">難産</MenuItem>
                      <MenuItem value="外科的処置">外科的処置</MenuItem>
                      <MenuItem value="死産">死産</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField label="初乳確認" select fullWidth value={colostrumFilter} onChange={(e) => setColostrumFilter(e.target.value)}>
                      <MenuItem value="">すべて</MenuItem>
                      <MenuItem value="未確認">未確認</MenuItem>
                      <MenuItem value="確認済み">確認済み</MenuItem>
                      <MenuItem value="要確認">要確認</MenuItem>
                    </TextField>
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>

          <Box sx={{ display: { xs: 'block', md: 'none' }, ...noPrintSx }}>
            <Stack spacing={1.5}>
              {filtered.length === 0 ? <Alert severity="info">表示する分娩記録はありません。</Alert> : filtered.map((row, index) => (
                <CalvingCard key={row.id || index} row={row} registeringId={registeringId} deletingId={deletingId} onRegister={handleRegister} onDelete={handleDelete} />
              ))}
            </Stack>
          </Box>

          <Box sx={{ display: { xs: 'none', md: 'block' }, '@media print': { display: 'block' } }}>
            <Card sx={{ '@media print': { boxShadow: 'none', border: 'none' } }}>
              <CardContent sx={{ '@media print': { p: 0, '&:last-child': { pb: 0 } } }}>
                <Table size="small" sx={{ '@media print': { '& th, & td': { borderColor: '#999', fontSize: 11, px: 0.5, py: 0.4 } } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>実分娩日</TableCell>
                      <TableCell>母牛耳標番号</TableCell>
                      <TableCell>母牛名</TableCell>
                      <TableCell>子牛耳標番号</TableCell>
                      <TableCell>性別</TableCell>
                      <TableCell>出生体重</TableCell>
                      <TableCell>分娩結果</TableCell>
                      <TableCell>初乳</TableCell>
                      <TableCell>登録準備</TableCell>
                      <TableCell>子牛台帳</TableCell>
                      <TableCell sx={noPrintSx}>操作</TableCell>
                      <TableCell>メモ</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={12}>表示する分娩記録はありません。</TableCell></TableRow>
                    ) : filtered.map((row, index) => {
                      const ledger = calfLedgerStatus(row);
                      const readiness = registerReadiness(row);
                      return (
                        <TableRow key={row.id || index} sx={{ '@media print': { breakInside: 'avoid' } }}>
                          <TableCell>{value(row.actualCalvingDate)}</TableCell>
                          <TableCell>{value(row.cowId)}</TableCell>
                          <TableCell>{value(row.cowName)}</TableCell>
                          <TableCell>{value(row.calfName)}</TableCell>
                          <TableCell>{value(row.calfSex)}</TableCell>
                          <TableCell>{row.birthWeightKg === '' || row.birthWeightKg === undefined ? '-' : `${row.birthWeightKg}kg`}</TableCell>
                          <TableCell><Chip size="small" color={resultColor(row.calvingResult) as any} label={value(row.calvingResult)} /></TableCell>
                          <TableCell><Chip size="small" color={colostrumColor(row.colostrumStatus) as any} label={value(row.colostrumStatus)} /></TableCell>
                          <TableCell><Chip size="small" color={readiness.color as any} label={readiness.label} variant="outlined" /></TableCell>
                          <TableCell>
                            <Stack spacing={0.5}>
                              <Chip size="small" color={ledger.color as any} label={ledger.label} />
                              {row.registeredToCalfLedger && row.calfId && <Typography variant="caption" color="text.secondary">カルテへ移動可</Typography>}
                            </Stack>
                          </TableCell>
                          <TableCell sx={noPrintSx}><CalvingActions row={row} registeringId={registeringId} deletingId={deletingId} onRegister={handleRegister} onDelete={handleDelete} /></TableCell>
                          <TableCell>{value(row.memo)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Box>
        </>
      )}
    </Stack>
  );
}

export default CalvingList;
