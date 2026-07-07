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

type RegistrationFilter = 'すべて' | '登録できます' | '要確認' | '登録済み' | '登録対象外' | 'カルテ直行';

const registrationFilterOptions: RegistrationFilter[] = ['すべて', '登録できます', '要確認', '登録済み', '登録対象外', 'カルテ直行'];

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

function missingRegisterFields(row: CalvingRecord) {
  const missing: string[] = [];

  if (!row.calfName && row.calvingResult !== '死産') missing.push('子牛耳標番号');
  if (!row.actualCalvingDate) missing.push('実分娩日');
  if (!row.cowName) missing.push('母牛名');

  return missing;
}

function registerReadiness(row: CalvingRecord) {
  if (row.calvingResult === '死産') {
    return {
      label: '登録対象外',
      color: 'default' as const,
      note: '死産のため子牛台帳へは登録しません。'
    };
  }

  if (row.registeredToCalfLedger) {
    return {
      label: '登録済み',
      color: 'success' as const,
      note: 'すでに子牛台帳へ登録されています。'
    };
  }

  const missing = missingRegisterFields(row);
  if (missing.length > 0) {
    return {
      label: '要確認',
      color: 'warning' as const,
      note: `${missing.join('、')} を入力すると子牛台帳へ登録できます。`
    };
  }

  return {
    label: '登録できます',
    color: 'info' as const,
    note: 'この内容で子牛台帳へ登録できます。登録前に重複がないか確認してください。'
  };
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
  return row.calfId ? `/calves/${row.calfId}` : '/calves';
}

function calfDetailButtonText(row: CalvingRecord) {
  return row.calfId ? '子牛カルテを確認' : '子牛台帳を確認';
}

function calfLedgerStatus(row: CalvingRecord) {
  if (row.calvingResult === '死産') {
    return {
      label: '対象外',
      color: 'default' as const,
      note: '死産は子牛台帳へ登録しません。'
    };
  }

  if (row.registeredToCalfLedger) {
    return {
      label: '登録済み',
      color: 'success' as const,
      note: row.calfId
        ? `子牛カルテへ直接移動できます。子牛耳標番号: ${value(row.calfName)}`
        : `子牛台帳へ登録済みです。子牛耳標番号: ${value(row.calfName)}`
    };
  }

  return {
    label: '未登録',
    color: 'warning' as const,
    note: '子牛台帳への登録が必要です。'
  };
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={0.5}>
          <Typography color="text.secondary">{title}</Typography>
          <Typography variant="h5" fontWeight={900}>{value}</Typography>
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
  const ledger = calfLedgerStatus(row);
  const readiness = registerReadiness(row);

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack spacing={1.2}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography fontWeight={900} sx={{ flexGrow: 1 }}>
              {value(row.cowName)}
            </Typography>
            <Chip size="small" color={resultColor(row.calvingResult) as any} label={value(row.calvingResult)} />
            <Chip size="small" color={colostrumColor(row.colostrumStatus) as any} label={`初乳：${value(row.colostrumStatus)}`} />
            <Chip size="small" color={ledger.color as any} label={`子牛台帳：${ledger.label}`} />
            <Chip size="small" color={readiness.color as any} label={readiness.label} variant="outlined" />
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
              <Typography color="text.secondary">母牛耳標番号</Typography>
              <Typography fontWeight={700}>{value(row.cowId)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography color="text.secondary">子牛耳標番号</Typography>
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
          </Grid>

          {row.registeredToCalfLedger && (
            <Alert severity="success">
              {ledger.note}
            </Alert>
          )}

          {!row.registeredToCalfLedger && row.calvingResult !== '死産' && (
            <Alert severity={canRegisterCalf(row) ? 'info' : 'warning'}>
              {readiness.note}
            </Alert>
          )}

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

            {row.registeredToCalfLedger && (
              <Button component={RouterLink} to={calfDetailPath(row)} variant="contained" color="success" fullWidth>
                {calfDetailButtonText(row)}
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

  async function handleRegister(row: CalvingRecord) {
    if (!row.id) return;

    const ok = window.confirm(
      `この分娩記録を子牛台帳へ登録します。\n\n` +
      `母牛：${row.cowName || '-'}\n` +
      `母牛耳標番号：${row.cowId || '-'}\n` +
      `子牛耳標番号：${row.calfName || '-'}\n` +
      `性別：${row.calfSex || '-'}\n` +
      `出生日：${row.actualCalvingDate || '-'}\n` +
      `出生体重：${row.birthWeightKg || '-'}kg\n\n` +
      '重複がないことを確認してからOKを押してください。'
    );

    if (!ok) return;

    setRegisteringId(row.id);
    setMessage('');
    setError('');

    try {
      await registerCalvingToCalfLedger(row.id);
      setMessage('子牛台帳へ登録しました。登録済みのカードから子牛カルテを確認できます。');
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

  function clearFilters() {
    setKeyword('');
    setResultFilter('');
    setColostrumFilter('');
    setRegistrationFilter('すべて');
  }

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();

    return sortRecords(records).filter((row) => {
      if (resultFilter && row.calvingResult !== resultFilter) return false;
      if (colostrumFilter && row.colostrumStatus !== colostrumFilter) return false;
      if (!matchesRegistrationFilter(row, registrationFilter)) return false;

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
  }, [records, keyword, resultFilter, colostrumFilter, registrationFilter]);

  const naturalCount = records.filter((row) => row.calvingResult === '自然分娩').length;
  const dystociaCount = records.filter((row) => row.calvingResult === '難産').length;
  const surgicalCount = records.filter((row) => row.calvingResult === '外科的処置').length;
  const stillbirthCount = records.filter((row) => row.calvingResult === '死産').length;
  const calfLedgerNeedCount = records.filter((row) => !row.registeredToCalfLedger && row.calvingResult !== '死産').length;
  const readyToRegisterCount = records.filter((row) => canRegisterCalf(row)).length;
  const needInputCount = records.filter((row) => !row.registeredToCalfLedger && row.calvingResult !== '死産' && !canRegisterCalf(row)).length;
  const registeredCount = records.filter((row) => row.registeredToCalfLedger && row.calvingResult !== '死産').length;
  const directCalfLinkCount = records.filter((row) => row.registeredToCalfLedger && row.calfId).length;
  const colostrumNeedCount = records.filter((row) => row.colostrumStatus === '未確認' || row.colostrumStatus === '要確認').length;
  const hasActiveFilters = Boolean(keyword || resultFilter || colostrumFilter || registrationFilter !== 'すべて');

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        分娩記録
      </Typography>

      <Alert severity="info">
        画面では耳標番号を中心に表示します。登録済みで子牛IDがある記録は、子牛カルテへ直接移動できます。
      </Alert>

      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="warning">{error}</Alert>}

      {calfLedgerNeedCount > 0 ? (
        <Alert severity="warning">
          子牛台帳へ未登録の分娩記録が {calfLedgerNeedCount} 件あります。このうち {readyToRegisterCount} 件はすぐ登録できます。
        </Alert>
      ) : (
        <Alert severity="success">
          子牛台帳未登録の通常分娩記録はありません。
        </Alert>
      )}

      {needInputCount > 0 && (
        <Alert severity="warning">
          子牛台帳登録前に入力確認が必要な分娩記録が {needInputCount} 件あります。
        </Alert>
      )}

      {directCalfLinkCount > 0 && (
        <Alert severity="success">
          子牛カルテへ直接移動できる分娩記録が {directCalfLinkCount} 件あります。
        </Alert>
      )}

      {colostrumNeedCount > 0 && (
        <Alert severity="warning">
          初乳確認が未確認または要確認の記録が {colostrumNeedCount} 件あります。
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
              <StatCard title="登録できます" value={`${readyToRegisterCount}件`} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard title="要入力確認" value={`${needInputCount}件`} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard title="死産" value={`${stillbirthCount}件`} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard title="台帳登録済み" value={`${registeredCount}件`} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard title="カルテ直行" value={`${directCalfLinkCount}件`} />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={6} md={3}>
              <StatCard title="自然分娩" value={`${naturalCount}件`} />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard title="難産" value={`${dystociaCount}件`} />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard title="外科的処置" value={`${surgicalCount}件`} />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard title="初乳要確認" value={`${colostrumNeedCount}件`} />
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
                  <Typography variant="h6" fontWeight={800}>
                    検索・絞り込み
                  </Typography>
                  {hasActiveFilters && (
                    <Button onClick={clearFilters} variant="outlined" size="small">
                      条件クリア
                    </Button>
                  )}
                </Stack>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="検索"
                      fullWidth
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="母牛名・耳標番号・メモ"
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="登録状態"
                      select
                      fullWidth
                      value={registrationFilter}
                      onChange={(e) => setRegistrationFilter(e.target.value as RegistrationFilter)}
                    >
                      {registrationFilterOptions.map((item) => (
                        <MenuItem key={item} value={item}>{item}</MenuItem>
                      ))}
                    </TextField>
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

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip label={`表示 ${filtered.length}件`} size="small" />
                  {registrationFilter !== 'すべて' && <Chip label={`登録状態: ${registrationFilter}`} size="small" variant="outlined" />}
                  {resultFilter && <Chip label={`分娩結果: ${resultFilter}`} size="small" variant="outlined" />}
                  {colostrumFilter && <Chip label={`初乳: ${colostrumFilter}`} size="small" variant="outlined" />}
                  {keyword && <Chip label={`検索: ${keyword}`} size="small" variant="outlined" />}
                </Stack>
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
                      <TableCell>母牛耳標番号</TableCell>
                      <TableCell>子牛耳標番号</TableCell>
                      <TableCell>性別</TableCell>
                      <TableCell>出生体重</TableCell>
                      <TableCell>分娩結果</TableCell>
                      <TableCell>初乳</TableCell>
                      <TableCell>登録準備</TableCell>
                      <TableCell>子牛台帳</TableCell>
                      <TableCell>操作</TableCell>
                      <TableCell>メモ</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12}>表示する分娩記録はありません。</TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((row, index) => {
                        const ledger = calfLedgerStatus(row);
                        const readiness = registerReadiness(row);

                        return (
                          <TableRow key={row.id || index}>
                            <TableCell>{value(row.actualCalvingDate)}</TableCell>
                            <TableCell>{value(row.cowName)}</TableCell>
                            <TableCell>{value(row.cowId)}</TableCell>
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
                            <TableCell>
                              <Stack spacing={0.5}>
                                <Chip size="small" color={readiness.color as any} label={readiness.label} variant="outlined" />
                                {!row.registeredToCalfLedger && row.calvingResult !== '死産' && (
                                  <Typography variant="caption" color="text.secondary">
                                    {readiness.note}
                                  </Typography>
                                )}
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Stack spacing={0.5}>
                                <Chip
                                  size="small"
                                  color={ledger.color as any}
                                  label={ledger.label}
                                />
                                {row.registeredToCalfLedger && row.calfId && (
                                  <Typography variant="caption" color="text.secondary">
                                    カルテへ移動可
                                  </Typography>
                                )}
                              </Stack>
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

                                {row.registeredToCalfLedger && (
                                  <Button
                                    component={RouterLink}
                                    to={calfDetailPath(row)}
                                    size="small"
                                    variant="contained"
                                    color="success"
                                  >
                                    {row.calfId ? 'カルテ確認' : '台帳確認'}
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
                        );
                      })
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
