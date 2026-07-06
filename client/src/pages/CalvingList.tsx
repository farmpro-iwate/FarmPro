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
  Typography
} from '@mui/material';
import {
  deleteCalving,
  fetchCalvings,
  registerCalvingToCalfLedger,
  type CalvingRecord
} from '../services/calvingsApi';

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
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
  return [...records].sort((a, b) => {
    const da = a.actualCalvingDate || '';
    const db = b.actualCalvingDate || '';
    return db.localeCompare(da);
  });
}

function canRegisterCalf(row: CalvingRecord) {
  return Boolean(
    row.id &&
    !row.registeredToCalfLedger &&
    row.calvingResult !== '死産' &&
    row.calfName &&
    row.actualCalvingDate
  );
}

function StatCard({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={0.5}>
          <Typography color="text.secondary">{title}</Typography>
          <Typography variant="h5" fontWeight={900}>{value}</Typography>
          {note && <Typography color="text.secondary">{note}</Typography>}
        </Stack>
      </CardContent>
    </Card>
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
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.2}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography fontWeight={900} sx={{ flexGrow: 1 }}>
              {value(row.cowName)}
            </Typography>
            <Chip size="small" color={resultColor(row.calvingResult) as any} label={value(row.calvingResult)} />
            <Chip size="small" color={colostrumColor(row.colostrumStatus) as any} label={`初乳：${value(row.colostrumStatus)}`} />
          </Stack>

          <Grid container spacing={1}>
            <Grid item xs={6}>
              <Typography color="text.secondary">実分娩日</Typography>
              <Typography fontWeight={700}>{value(row.actualCalvingDate)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography color="text.secondary">予定日との差</Typography>
              <Typography fontWeight={700}>{daysText(row.daysFromExpected)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography color="text.secondary">子牛名</Typography>
              <Typography fontWeight={700}>{value(row.calfName)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography color="text.secondary">性別</Typography>
              <Typography fontWeight={700}>{value(row.calfSex)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography color="text.secondary">出生体重</Typography>
              <Typography fontWeight={700}>
                {row.birthWeightKg === '' || row.birthWeightKg === undefined ? '-' : `${row.birthWeightKg}kg`}
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography color="text.secondary">子牛台帳</Typography>
              <Typography fontWeight={700}>{row.registeredToCalfLedger ? '登録済み' : row.calvingResult === '死産' ? '対象外' : '未登録'}</Typography>
            </Grid>
          </Grid>

          {row.memo && <Alert severity="info">{row.memo}</Alert>}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button component={RouterLink} to={`/calvings/${row.id}/edit`} variant="outlined" fullWidth>
              編集
            </Button>

            {canRegisterCalf(row) && (
              <Button
                variant="contained"
                onClick={() => onRegister(row)}
                disabled={registeringId === row.id}
                fullWidth
              >
                {registeringId === row.id ? '登録中...' : '子牛台帳へ登録'}
              </Button>
            )}

            <Button
              color="error"
              variant="outlined"
              onClick={() => onDelete(row)}
              disabled={deletingId === row.id}
              fullWidth
            >
              {deletingId === row.id ? '削除中...' : '削除'}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function CalvingList() {
  const [records, setRecords] = useState<CalvingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [registeringId, setRegisteringId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [keyword, setKeyword] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [colostrumFilter, setColostrumFilter] = useState('');

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

  async function handleRegister(row: CalvingRecord) {
    if (!row.id) return;

    const ok = window.confirm(
      `分娩記録「${row.calfName || ''}」を子牛台帳へ登録します。\n重複がないか確認してからOKを押してください。`
    );

    if (!ok) return;

    setRegisteringId(row.id);
    setMessage('');
    setError('');

    try {
      await registerCalvingToCalfLedger(row.id);
      setMessage('子牛台帳へ登録しました。');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '子牛台帳へ登録できませんでした。');
    } finally {
      setRegisteringId('');
    }
  }

  async function handleDelete(row: CalvingRecord) {
    if (!row.id) return;

    const warning = row.registeredToCalfLedger
      ? '\n\n注意：この記録は子牛台帳へ登録済みです。分娩記録を削除しても、子牛台帳の子牛は自動削除されません。'
      : '';

    const ok = window.confirm(
      `分娩記録「${row.cowName || ''} / ${row.calfName || ''}」を削除します。${warning}\n\n本当に削除しますか？`
    );

    if (!ok) return;

    setDeletingId(row.id);
    setMessage('');
    setError('');

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

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();

    return sortRecords(records).filter((row) => {
      if (resultFilter && row.calvingResult !== resultFilter) return false;
      if (colostrumFilter && row.colostrumStatus !== colostrumFilter) return false;

      const text = [
        row.cowId,
        row.cowName,
        row.expectedCalvingDate,
        row.actualCalvingDate,
        row.calfName,
        row.calfSex,
        row.birthWeightKg,
        row.calvingResult,
        row.colostrumStatus,
        row.memo
      ].join(' ').toLowerCase();

      if (kw && !text.includes(kw)) return false;
      return true;
    });
  }, [records, keyword, resultFilter, colostrumFilter]);

  const naturalCount = records.filter((row) => row.calvingResult === '自然分娩').length;
  const dystociaCount = records.filter((row) => row.calvingResult === '難産').length;
  const surgicalCount = records.filter((row) => row.calvingResult === '外科的処置').length;
  const stillbirthCount = records.filter((row) => row.calvingResult === '死産').length;
  const colostrumNeedCount = records.filter((row) => row.colostrumStatus !== '確認済み' && row.calvingResult !== '死産').length;
  const calfLedgerNeedCount = records.filter((row) => !row.registeredToCalfLedger && row.calvingResult !== '死産').length;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        分娩記録
      </Typography>

      <Alert severity="info">
        分娩記録の一覧です。編集・削除、子牛台帳への登録ができます。
      </Alert>

      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="warning">{error}</Alert>}

      {calfLedgerNeedCount > 0 ? (
        <Alert severity="warning">
          子牛台帳へ未登録の分娩記録があります。登録前に重複がないか確認してください。
        </Alert>
      ) : (
        <Alert severity="success">
          子牛台帳未登録の通常分娩記録はありません。
        </Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button component={RouterLink} to="/calvings/new" variant="contained">
          分娩記録 新規登録
        </Button>
        <Button component={RouterLink} to="/calves" variant="outlined">
          子牛台帳を見る
        </Button>
        <Button onClick={load} variant="outlined">
          再読み込み
        </Button>
      </Stack>

      {loading && <Typography>読み込み中...</Typography>}

      {!loading && (
        <>
          <Grid container spacing={2}>
            <Grid item xs={6} md={2}>
              <StatCard title="全記録" value={`${records.length}件`} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard title="自然分娩" value={`${naturalCount}件`} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard title="難産" value={`${dystociaCount}件`} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard title="外科的処置" value={`${surgicalCount}件`} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard title="死産" value={`${stillbirthCount}件`} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard title="子牛台帳未登録" value={`${calfLedgerNeedCount}件`} />
            </Grid>
          </Grid>

          {colostrumNeedCount > 0 && (
            <Alert severity="warning">
              初乳確認が未確認または要確認の記録が {colostrumNeedCount} 件あります。
            </Alert>
          )}

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={800}>
                  検索・絞り込み
                </Typography>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="検索"
                      fullWidth
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="母牛名・子牛名・メモなど"
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="分娩結果"
                      select
                      fullWidth
                      value={resultFilter}
                      onChange={(e) => setResultFilter(e.target.value)}
                    >
                      <MenuItem value="">すべて</MenuItem>
                      <MenuItem value="自然分娩">自然分娩</MenuItem>
                      <MenuItem value="難産">難産</MenuItem>
                      <MenuItem value="外科的処置">外科的処置</MenuItem>
                      <MenuItem value="死産">死産</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="初乳確認"
                      select
                      fullWidth
                      value={colostrumFilter}
                      onChange={(e) => setColostrumFilter(e.target.value)}
                    >
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

          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            <Stack spacing={1.5}>
              {filtered.length === 0 ? (
                <Alert severity="info">表示する分娩記録はありません。</Alert>
              ) : (
                filtered.map((row, index) => (
                  <CalvingCard
                    key={row.id || index}
                    row={row}
                    registeringId={registeringId}
                    deletingId={deletingId}
                    onRegister={handleRegister}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </Stack>
          </Box>

          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <Card>
              <CardContent>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>実分娩日</TableCell>
                      <TableCell>母牛</TableCell>
                      <TableCell>子牛</TableCell>
                      <TableCell>性別</TableCell>
                      <TableCell>出生体重</TableCell>
                      <TableCell>分娩結果</TableCell>
                      <TableCell>初乳確認</TableCell>
                      <TableCell>予定日との差</TableCell>
                      <TableCell>子牛台帳</TableCell>
                      <TableCell>操作</TableCell>
                      <TableCell>メモ</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11}>表示する分娩記録はありません。</TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((row, index) => (
                        <TableRow key={row.id || index}>
                          <TableCell>{value(row.actualCalvingDate)}</TableCell>
                          <TableCell>{value(row.cowName)}</TableCell>
                          <TableCell>{value(row.calfName)}</TableCell>
                          <TableCell>{value(row.calfSex)}</TableCell>
                          <TableCell>
                            {row.birthWeightKg === '' || row.birthWeightKg === undefined ? '-' : `${row.birthWeightKg}kg`}
                          </TableCell>
                          <TableCell>
                            <Chip size="small" color={resultColor(row.calvingResult) as any} label={value(row.calvingResult)} />
                          </TableCell>
                          <TableCell>
                            <Chip size="small" color={colostrumColor(row.colostrumStatus) as any} label={value(row.colostrumStatus)} />
                          </TableCell>
                          <TableCell>{daysText(row.daysFromExpected)}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              color={row.registeredToCalfLedger ? 'success' : row.calvingResult === '死産' ? 'default' : 'warning'}
                              label={row.registeredToCalfLedger ? '登録済み' : row.calvingResult === '死産' ? '対象外' : '未登録'}
                            />
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1}>
                              <Button
                                component={RouterLink}
                                to={`/calvings/${row.id}/edit`}
                                size="small"
                                variant="outlined"
                              >
                                編集
                              </Button>

                              {canRegisterCalf(row) && (
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={() => handleRegister(row)}
                                  disabled={registeringId === row.id}
                                >
                                  {registeringId === row.id ? '登録中' : '子牛台帳へ登録'}
                                </Button>
                              )}

                              <Button
                                size="small"
                                color="error"
                                variant="outlined"
                                onClick={() => handleDelete(row)}
                                disabled={deletingId === row.id}
                              >
                                {deletingId === row.id ? '削除中' : '削除'}
                              </Button>
                            </Stack>
                          </TableCell>
                          <TableCell>{value(row.memo)}</TableCell>
                        </TableRow>
                      ))
                    )}
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
