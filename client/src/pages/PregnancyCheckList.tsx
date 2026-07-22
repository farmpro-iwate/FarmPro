import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
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
  Typography,
} from '@mui/material';
import { getBreedingList } from '../services/breedingApi';
import type { Breeding } from '../types/breeding';

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function todayText() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysUntil(dateText?: string) {
  if (!dateText) return '';
  const today = new Date();
  const target = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(target.getTime())) return '';

  today.setHours(0, 0, 0, 0);
  const diff = target.getTime() - today.getTime();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return '今日';
  if (days > 0) return `あと${days}日`;
  return `${Math.abs(days)}日超過`;
}

function normalizedResult(row: Breeding) {
  const result = row.pregnancyResult || '未鑑定';
  if (result === '受胎') return '妊娠';
  if (result === '空胎') return '不受胎';
  if (result === '再鑑定予定') return '再確認';
  if (result === '流産・胎子喪失') return '流産';
  return result;
}

function breedingType(row: Breeding) {
  if (row.breedingMethod === 'AI') return '人工授精';
  if (row.breedingMethod === 'ET') return '受精卵移植';
  return row.breedingMethod || '-';
}

function serviceDate(row: Breeding) {
  if (row.breedingMethod === 'ET') return row.transferDate || row.transferPlannedDate || '';
  return row.inseminationDate || row.heatDate || '';
}

function pregnancyCheckDate(row: Breeding) {
  return row.pregnancyCheckExpectedDate || row.pregnancyCheckDate || '';
}

function sireName(row: Breeding) {
  return row.breedingMethod === 'ET' ? row.embryoSireName : row.bullName;
}

function resultColor(result: string) {
  if (result === '妊娠') return 'success';
  if (result === '不受胎' || result === '流産') return 'error';
  if (result === '再確認') return 'warning';
  if (result === '未鑑定') return 'info';
  return 'default';
}

function typeColor(type: string) {
  if (type === '人工授精') return 'primary';
  if (type === '受精卵移植') return 'secondary';
  return 'default';
}

function checkStatus(row: Breeding) {
  const today = todayText();
  const result = normalizedResult(row);
  const date = pregnancyCheckDate(row);

  if (result === '妊娠') return '妊娠';
  if (result === '不受胎') return '不受胎';
  if (result === '流産') return '流産';
  if (result === '再確認') return '再確認';
  if (!date) return '予定日なし';
  if (date < today) return '期限切れ';
  if (date === today) return '今日鑑定';
  return '鑑定待ち';
}

function checkStatusColor(status: string) {
  if (status === '期限切れ') return 'error';
  if (status === '今日鑑定' || status === '再確認') return 'warning';
  if (status === '妊娠') return 'success';
  if (status === '不受胎' || status === '流産') return 'error';
  if (status === '鑑定待ち') return 'info';
  return 'default';
}

function sortRecords(records: Breeding[]) {
  return [...records].sort((a, b) => {
    const priority: Record<string, number> = {
      期限切れ: 1,
      今日鑑定: 2,
      再確認: 3,
      鑑定待ち: 4,
      予定日なし: 5,
      妊娠: 6,
      不受胎: 7,
      流産: 8,
    };
    const statusA = checkStatus(a);
    const statusB = checkStatus(b);
    const diff = (priority[statusA] || 99) - (priority[statusB] || 99);
    if (diff !== 0) return diff;
    return pregnancyCheckDate(a).localeCompare(pregnancyCheckDate(b));
  });
}

function StatCard({ title, count }: { title: string; count: number }) {
  return (
    <Card>
      <CardContent>
        <Typography color="text.secondary">{title}</Typography>
        <Typography variant="h5" fontWeight={900}>{count}件</Typography>
      </CardContent>
    </Card>
  );
}

function PregnancyCard({ row }: { row: Breeding }) {
  const status = checkStatus(row);
  const result = normalizedResult(row);
  const checkDate = pregnancyCheckDate(row);
  const type = breedingType(row);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.2}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography fontWeight={900} sx={{ flexGrow: 1 }}>
              {value(row.cowEarTag)} {row.cowName ? `・${row.cowName}` : ''}
            </Typography>
            <Chip size="small" color={checkStatusColor(status) as any} label={status} />
            <Chip size="small" color={typeColor(type) as any} label={type} />
          </Stack>

          <Grid container spacing={1}>
            <Grid item xs={6}><Typography color="text.secondary">実施日</Typography><Typography fontWeight={700}>{value(serviceDate(row))}</Typography></Grid>
            <Grid item xs={6}><Typography color="text.secondary">鑑定予定日</Typography><Typography fontWeight={700}>{value(checkDate)}{checkDate ? `（${daysUntil(checkDate)}）` : ''}</Typography></Grid>
            <Grid item xs={6}><Typography color="text.secondary">鑑定結果</Typography><Chip size="small" color={resultColor(result) as any} label={result} /></Grid>
            <Grid item xs={6}><Typography color="text.secondary">分娩予定日</Typography><Typography fontWeight={700}>{value(row.expectedCalvingDate)}</Typography></Grid>
            <Grid item xs={6}><Typography color="text.secondary">種雄牛</Typography><Typography fontWeight={700}>{value(sireName(row))}</Typography></Grid>
          </Grid>

          {row.note && <Alert severity="info">{row.note}</Alert>}
          <Button component={RouterLink} to={`/breedings/${row.id}/edit`} variant="outlined">繁殖記録を確認・編集</Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function PregnancyCheckList() {
  const [records, setRecords] = useState<Breeding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getBreedingList();
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '妊娠鑑定一覧を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return sortRecords(records).filter((row) => {
      const status = checkStatus(row);
      const text = [
        row.cowEarTag,
        row.cowName,
        breedingType(row),
        serviceDate(row),
        pregnancyCheckDate(row),
        normalizedResult(row),
        row.expectedCalvingDate,
        sireName(row),
        row.embryoNumber,
        row.donorCowName,
        row.note,
        status,
      ].join(' ').toLowerCase();
      if (statusFilter && status !== statusFilter) return false;
      return !kw || text.includes(kw);
    });
  }, [records, keyword, statusFilter]);

  const counts = {
    overdue: records.filter((row) => checkStatus(row) === '期限切れ').length,
    today: records.filter((row) => checkStatus(row) === '今日鑑定').length,
    waiting: records.filter((row) => checkStatus(row) === '鑑定待ち').length,
    recheck: records.filter((row) => checkStatus(row) === '再確認').length,
    pregnant: records.filter((row) => checkStatus(row) === '妊娠').length,
  };
  const attentionCount = counts.overdue + counts.today + counts.recheck;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>妊娠鑑定一覧</Typography>
      <Alert severity="info">通常の繁殖記録に登録した人工授精・受精卵移植・妊娠鑑定の内容を表示します。</Alert>
      {attentionCount > 0 ? <Alert severity="warning">確認が必要な妊娠鑑定があります。期限切れ・今日鑑定・再確認を優先してください。</Alert> : <Alert severity="success">期限切れ・今日鑑定・再確認の注意項目はありません。</Alert>}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button component={RouterLink} to="/breedings/new" variant="contained">繁殖記録を新規登録</Button>
        <Button component={RouterLink} to="/breedings" variant="outlined">繁殖記録一覧</Button>
        <Button onClick={load} variant="outlined">再読み込み</Button>
      </Stack>

      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="warning">{error}</Alert>}

      {!loading && !error && (
        <>
          <Grid container spacing={2}>
            <Grid item xs={6} md={2}><StatCard title="期限切れ" count={counts.overdue} /></Grid>
            <Grid item xs={6} md={2}><StatCard title="今日鑑定" count={counts.today} /></Grid>
            <Grid item xs={6} md={2}><StatCard title="鑑定待ち" count={counts.waiting} /></Grid>
            <Grid item xs={6} md={2}><StatCard title="再確認" count={counts.recheck} /></Grid>
            <Grid item xs={6} md={2}><StatCard title="妊娠" count={counts.pregnant} /></Grid>
            <Grid item xs={6} md={2}><StatCard title="全記録" count={records.length} /></Grid>
          </Grid>

          <Card><CardContent><Grid container spacing={2}>
            <Grid item xs={12} md={8}><TextField label="検索" fullWidth value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="耳標番号・母牛名・種雄牛・鑑定結果・メモなど" /></Grid>
            <Grid item xs={12} md={4}><TextField label="鑑定状態" select fullWidth value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <MenuItem value="">すべて</MenuItem><MenuItem value="期限切れ">期限切れ</MenuItem><MenuItem value="今日鑑定">今日鑑定</MenuItem><MenuItem value="鑑定待ち">鑑定待ち</MenuItem><MenuItem value="再確認">再確認</MenuItem><MenuItem value="妊娠">妊娠</MenuItem><MenuItem value="不受胎">不受胎</MenuItem><MenuItem value="流産">流産</MenuItem><MenuItem value="予定日なし">予定日なし</MenuItem>
            </TextField></Grid>
          </Grid></CardContent></Card>

          <Box sx={{ display: { xs: 'block', md: 'none' } }}><Stack spacing={1.5}>{filtered.length === 0 ? <Alert severity="info">表示する妊娠鑑定記録はありません。</Alert> : filtered.map((row) => <PregnancyCard key={row.id} row={row} />)}</Stack></Box>

          <Box sx={{ display: { xs: 'none', md: 'block' } }}><Card><CardContent><Table size="small"><TableHead><TableRow>
            <TableCell>母牛</TableCell><TableCell>区分</TableCell><TableCell>実施日</TableCell><TableCell>鑑定状態</TableCell><TableCell>鑑定予定日</TableCell><TableCell>鑑定結果</TableCell><TableCell>分娩予定日</TableCell><TableCell>操作</TableCell>
          </TableRow></TableHead><TableBody>
            {filtered.length === 0 ? <TableRow><TableCell colSpan={8}>表示する妊娠鑑定記録はありません。</TableCell></TableRow> : filtered.map((row) => {
              const status = checkStatus(row);
              const result = normalizedResult(row);
              const date = pregnancyCheckDate(row);
              return <TableRow key={row.id}>
                <TableCell>{value(row.cowEarTag)} {row.cowName ? `・${row.cowName}` : ''}</TableCell>
                <TableCell><Chip size="small" color={typeColor(breedingType(row)) as any} label={breedingType(row)} /></TableCell>
                <TableCell>{value(serviceDate(row))}</TableCell>
                <TableCell><Chip size="small" color={checkStatusColor(status) as any} label={status} /></TableCell>
                <TableCell>{value(date)}{date ? `（${daysUntil(date)}）` : ''}</TableCell>
                <TableCell><Chip size="small" color={resultColor(result) as any} label={result} /></TableCell>
                <TableCell>{value(row.expectedCalvingDate)}</TableCell>
                <TableCell><Button component={RouterLink} to={`/breedings/${row.id}/edit`} size="small">確認・編集</Button></TableCell>
              </TableRow>;
            })}
          </TableBody></Table></CardContent></Card></Box>
        </>
      )}
    </Stack>
  );
}

export default PregnancyCheckList;
