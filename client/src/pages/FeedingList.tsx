import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
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
  deleteFeeding,
  FeedingRecord,
  feedingPurposeOptions,
  feedingUnitOptions,
  getFeedingsList
} from '../services/feedingsApi';

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}
function rawValue(v: unknown) { return v === null || v === undefined ? '' : String(v); }
function numberValue(valueText: string) { const n = Number(valueText); return Number.isNaN(n) ? 0 : n; }
function yen(valueText: string) { const n = Number(valueText); return Number.isNaN(n) || valueText === '' ? '-' : `${n.toLocaleString('ja-JP')}円`; }
function amountWithUnit(amount: string, unit: string) { if (!amount) return '-'; const n = Number(amount); return Number.isNaN(n) ? `${amount}${unit || ''}` : `${n.toLocaleString('ja-JP')}${unit || ''}`; }
function purposeColor(purpose: string) { if (purpose === '分娩前') return 'warning'; if (purpose === '子牛育成') return 'info'; if (purpose === '増体') return 'success'; if (purpose === '繁殖') return 'secondary'; return 'default'; }
function isDateInRange(dateText: string, startDate: string, endDate: string) { if (!dateText) return false; if (startDate && dateText < startDate) return false; if (endDate && dateText > endDate) return false; return true; }
function csvEscape(valueText: string) { return `"${valueText.replace(/"/g, '""')}"`; }
function todayText() { const today = new Date(); return `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`; }
function printedAtText() { return new Date().toLocaleString('ja-JP'); }

function downloadFeedingsCsv(rows: FeedingRecord[]) {
  const headers = ['給与日','対象','飼料名','給与量','単位','単価','金額','給与目的','メモ','作成日時','更新日時'];
  const body = rows.map((row) => [row.feedingDate,row.target,row.feedName,row.amount,row.unit,row.unitPrice,row.totalPrice,row.purpose,row.memo,row.createdAt,row.updatedAt]);
  const lines = [headers.map(csvEscape).join(','), ...body.map((line) => line.map((item) => csvEscape(rawValue(item))).join(','))];
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `farmpro_feedings_${todayText()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function FeedingList() {
  const [rows, setRows] = useState<FeedingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [keyword, setKeyword] = useState('');
  const [purposeFilter, setPurposeFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  async function loadFeedings() {
    setLoading(true);
    setError('');
    try { setRows(await getFeedingsList()); }
    catch (err) { setError(err instanceof Error ? err.message : '飼料給与記録を取得できませんでした。'); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadFeedings(); }, []);

  async function handleDelete(row: FeedingRecord) {
    const ok = window.confirm(`この飼料給与記録を削除しますか？\n\n給与日：${row.feedingDate || '-'}\n対象：${row.target || '-'}\n飼料名：${row.feedName || '-'}`);
    if (!ok) return;
    setDeletingId(row.id); setError(''); setSuccess('');
    try { await deleteFeeding(row.id); setSuccess('飼料給与記録を削除しました。'); await loadFeedings(); }
    catch (err) { setError(err instanceof Error ? err.message : '飼料給与記録を削除できませんでした。'); }
    finally { setDeletingId(''); }
  }

  function clearFilters() { setKeyword(''); setPurposeFilter(''); setUnitFilter(''); setStartDate(''); setEndDate(''); }
  const hasFilter = Boolean(keyword || purposeFilter || unitFilter || startDate || endDate);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const text = [row.feedingDate,row.target,row.feedName,row.amount,row.unit,row.unitPrice,row.totalPrice,row.purpose,row.memo].join(' ').toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (purposeFilter && row.purpose !== purposeFilter) return false;
      if (unitFilter && row.unit !== unitFilter) return false;
      if ((startDate || endDate) && !isDateInRange(row.feedingDate, startDate, endDate)) return false;
      return true;
    });
  }, [rows, keyword, purposeFilter, unitFilter, startDate, endDate]);

  const totalAmount = useMemo(() => filteredRows.reduce((sum, row) => sum + numberValue(row.amount), 0), [filteredRows]);
  const totalPrice = useMemo(() => filteredRows.reduce((sum, row) => sum + numberValue(row.totalPrice), 0), [filteredRows]);
  const hasRows = rows.length > 0;

  return (
    <Stack spacing={1.25}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        alignItems={{ xs: 'stretch', md: 'center' }}
        className="no-print"
      >
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h5" fontWeight={900}>飼料給与管理</Typography>
          <Typography variant="body2" color="text.secondary">
            いつ・どの牛（群）に・何を・どれだけ給与したかを記録します。
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap justifyContent={{ md: 'flex-end' }}>
          {hasRows && (
            <Button size="small" variant="outlined" onClick={() => setSearchOpen((value) => !value)}>
              {searchOpen ? '検索を閉じる' : hasFilter ? '絞り込み中' : '検索・絞り込み'}
            </Button>
          )}
          {hasRows && <Button size="small" variant="outlined" onClick={() => window.print()}>印刷</Button>}
          {hasRows && <Button size="small" variant="outlined" onClick={() => downloadFeedingsCsv(filteredRows)}>CSV</Button>}
          <Button size="small" component={RouterLink} to="/feedings/new" variant="contained" sx={{ px: 2.25, fontWeight: 800 }}>新規登録</Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap className="no-print">
        <Chip size="small" variant="outlined" label={`全件 ${rows.length}件`} />
        {hasFilter && <Chip size="small" color="primary" variant="outlined" label={`表示 ${filteredRows.length}件`} />}
        {hasRows && <Chip size="small" variant="outlined" label={`給与量 ${totalAmount.toLocaleString('ja-JP')}`} />}
        {hasRows && <Chip size="small" variant="outlined" label={`金額 ${totalPrice.toLocaleString('ja-JP')}円`} />}
      </Stack>

      {searchOpen && <Card className="no-print" variant="outlined"><CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}><Stack spacing={1}>
        <Typography fontWeight={700} color="text.secondary">検索・絞り込み</Typography>
        <Grid container spacing={1}>
          <Grid item xs={12} md={6}><TextField label="キーワード検索" placeholder="日付、対象、飼料名、目的、メモなど" value={keyword} onChange={(e) => setKeyword(e.target.value)} fullWidth size="small" /></Grid>
          <Grid item xs={12} md={3}><TextField select label="給与目的" value={purposeFilter} onChange={(e) => setPurposeFilter(e.target.value)} fullWidth size="small"><MenuItem value="">すべて</MenuItem>{feedingPurposeOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField></Grid>
          <Grid item xs={12} md={3}><TextField select label="単位" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} fullWidth size="small"><MenuItem value="">すべて</MenuItem>{feedingUnitOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField></Grid>
          <Grid item xs={12} md={3}><TextField label="開始日" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={12} md={3}><TextField label="終了日" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} /></Grid>
          <Grid item xs={12} md={6}><Stack direction="row" spacing={1} alignItems="center" sx={{ height: '100%' }}><Button variant="outlined" onClick={clearFilters} disabled={!hasFilter} size="small">条件クリア</Button>{hasFilter && <Typography variant="body2" color="text.secondary">{filteredRows.length}件表示中</Typography>}</Stack></Grid>
        </Grid>
      </Stack></CardContent></Card>}

      <Stack spacing={0.5} className="print-only"><Typography variant="h5" fontWeight={800}>飼料給与台帳</Typography><Typography>印刷日時：{printedAtText()}</Typography><Typography>表示件数：{filteredRows.length}件 / 給与量合計：{totalAmount.toLocaleString('ja-JP')} / 金額合計：{totalPrice.toLocaleString('ja-JP')}円</Typography></Stack>
      {success && <Alert severity="success" className="no-print">{success}</Alert>}
      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && filteredRows.length === 0 && (
        <Box
          className="no-print"
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
            px: 2,
            py: 1.75,
            maxWidth: 620,
          }}
        >
          <Typography fontWeight={800}>飼料給与記録はまだありません</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            右上の「新規登録」から最初の給与記録を登録できます。
          </Typography>
        </Box>
      )}

      {!loading && !error && filteredRows.length > 0 && <>
        <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }} className="no-print">
          {filteredRows.map((row) => <Card key={row.id}><CardContent><Stack spacing={1.25}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}><Box><Typography fontWeight={800}>{value(row.feedName)}</Typography><Typography color="text.secondary">{value(row.feedingDate)}</Typography></Box><Chip size="small" color={purposeColor(row.purpose) as any} label={value(row.purpose)} /></Stack>
            <Divider /><Typography><b>対象：</b>{value(row.target)}</Typography><Typography><b>給与量：</b>{amountWithUnit(row.amount, row.unit)}</Typography><Typography><b>単価：</b>{yen(row.unitPrice)}</Typography><Typography><b>金額：</b>{yen(row.totalPrice)}</Typography>{row.memo && <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><b>メモ：</b>{row.memo}</Typography>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button component={RouterLink} to={`/feedings/${row.id}/edit`} variant="contained" fullWidth>編集</Button><Button variant="outlined" color="error" onClick={() => handleDelete(row)} disabled={deletingId === row.id} fullWidth>{deletingId === row.id ? '削除中' : '削除'}</Button></Stack>
          </Stack></CardContent></Card>)}
        </Stack>

        <Card className="print-card" sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}><CardContent><Table size="small" className="print-table"><TableHead><TableRow><TableCell className="no-print">操作</TableCell><TableCell>給与日</TableCell><TableCell>対象</TableCell><TableCell>飼料名</TableCell><TableCell>給与量</TableCell><TableCell>単価</TableCell><TableCell>金額</TableCell><TableCell>給与目的</TableCell><TableCell>メモ</TableCell></TableRow></TableHead><TableBody>
          {filteredRows.map((row) => <TableRow key={row.id}><TableCell className="no-print"><Stack direction="row" spacing={1}><Button component={RouterLink} to={`/feedings/${row.id}/edit`} variant="outlined" size="small">編集</Button><Button variant="outlined" color="error" size="small" onClick={() => handleDelete(row)} disabled={deletingId === row.id}>{deletingId === row.id ? '削除中' : '削除'}</Button></Stack></TableCell><TableCell>{value(row.feedingDate)}</TableCell><TableCell>{value(row.target)}</TableCell><TableCell>{value(row.feedName)}</TableCell><TableCell>{amountWithUnit(row.amount, row.unit)}</TableCell><TableCell>{yen(row.unitPrice)}</TableCell><TableCell>{yen(row.totalPrice)}</TableCell><TableCell><Chip size="small" color={purposeColor(row.purpose) as any} label={value(row.purpose)} /></TableCell><TableCell sx={{ maxWidth: 260, whiteSpace: 'normal !important', wordBreak: 'break-word' }}>{value(row.memo)}</TableCell></TableRow>)}
        </TableBody></Table></CardContent></Card>
      </>}
    </Stack>
  );
}
