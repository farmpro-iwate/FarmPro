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
  fetchBreedingAdvancedRecords,
  type BreedingAdvancedRecord
} from '../services/breedingAdvancedApi';

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

function resultColor(result: string) {
  if (result === '妊娠') return 'success';
  if (result === '不受胎' || result === '流産') return 'error';
  if (result === '再確認') return 'warning';
  if (result === '未鑑定') return 'info';
  return 'default';
}

function statusColor(status: string) {
  if (status === '妊娠') return 'success';
  if (status === '不受胎' || status === '流産') return 'error';
  if (status === '再確認') return 'warning';
  if (status === '鑑定待ち') return 'info';
  if (status === '分娩済み') return 'success';
  return 'default';
}

function typeColor(type: string) {
  if (type === '人工授精') return 'primary';
  if (type === '自然交配') return 'success';
  if (type === '受精卵移植') return 'secondary';
  return 'default';
}

function checkStatus(row: BreedingAdvancedRecord) {
  const today = todayText();
  const result = row.pregnancyResult || '未鑑定';
  const date = row.pregnancyCheckDate || '';

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
  if (status === '今日鑑定') return 'warning';
  if (status === '再確認') return 'warning';
  if (status === '妊娠') return 'success';
  if (status === '不受胎' || status === '流産') return 'error';
  if (status === '鑑定待ち') return 'info';
  return 'default';
}

function sortRecords(records: BreedingAdvancedRecord[]) {
  return [...records].sort((a, b) => {
    const statusA = checkStatus(a);
    const statusB = checkStatus(b);

    const priority: Record<string, number> = {
      '期限切れ': 1,
      '今日鑑定': 2,
      '再確認': 3,
      '鑑定待ち': 4,
      '予定日なし': 5,
      '妊娠': 6,
      '不受胎': 7,
      '流産': 8
    };

    const pa = priority[statusA] || 99;
    const pb = priority[statusB] || 99;
    if (pa !== pb) return pa - pb;

    const dateA = a.pregnancyCheckDate || '';
    const dateB = b.pregnancyCheckDate || '';
    return dateA.localeCompare(dateB);
  });
}

function StatCard({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={0.5}>
          <Typography color="text.secondary">{title}</Typography>
          <Typography variant="h5" fontWeight={900}>
            {value}
          </Typography>
          {note && <Typography color="text.secondary">{note}</Typography>}
        </Stack>
      </CardContent>
    </Card>
  );
}

function PregnancyCard({ row }: { row: BreedingAdvancedRecord }) {
  const status = checkStatus(row);
  const result = String(row.pregnancyResult || '未鑑定');

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.2}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography fontWeight={900} sx={{ flexGrow: 1 }}>
              {value(row.cowName)}
            </Typography>
            <Chip size="small" color={checkStatusColor(status) as any} label={status} />
            <Chip size="small" color={typeColor(String(row.breedingType || '')) as any} label={value(row.breedingType)} />
          </Stack>

          <Grid container spacing={1}>
            <Grid item xs={6}>
              <Typography color="text.secondary">実施日</Typography>
              <Typography fontWeight={700}>{value(row.serviceDate)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography color="text.secondary">鑑定予定日</Typography>
              <Typography fontWeight={700}>
                {value(row.pregnancyCheckDate)}
                {row.pregnancyCheckDate ? `（${daysUntil(row.pregnancyCheckDate)}）` : ''}
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography color="text.secondary">鑑定結果</Typography>
              <Chip size="small" color={resultColor(result) as any} label={value(result)} />
            </Grid>
            <Grid item xs={6}>
              <Typography color="text.secondary">状態</Typography>
              <Chip size="small" color={statusColor(String(row.status || '')) as any} label={value(row.status)} />
            </Grid>
            <Grid item xs={6}>
              <Typography color="text.secondary">分娩予定日</Typography>
              <Typography fontWeight={700}>{value(row.expectedCalvingDate)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography color="text.secondary">種雄牛</Typography>
              <Typography fontWeight={700}>{value(row.sireName)}</Typography>
            </Grid>
          </Grid>

          {row.memo && <Alert severity="info">{row.memo}</Alert>}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function PregnancyCheckList() {
  const [records, setRecords] = useState<BreedingAdvancedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const data = await fetchBreedingAdvancedRecords();
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '妊娠鑑定一覧を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();

    return sortRecords(records).filter((row) => {
      const status = checkStatus(row);
      const text = [
        row.cowName,
        row.breedingType,
        row.serviceDate,
        row.pregnancyCheckDate,
        row.pregnancyResult,
        row.status,
        row.expectedCalvingDate,
        row.sireName,
        row.semenNo,
        row.donorCowName,
        row.embryoNo,
        row.memo,
        status
      ].join(' ').toLowerCase();

      if (statusFilter && status !== statusFilter) return false;
      if (kw && !text.includes(kw)) return false;
      return true;
    });
  }, [records, keyword, statusFilter]);

  const overdueCount = records.filter((row) => checkStatus(row) === '期限切れ').length;
  const todayCount = records.filter((row) => checkStatus(row) === '今日鑑定').length;
  const waitingCount = records.filter((row) => checkStatus(row) === '鑑定待ち').length;
  const recheckCount = records.filter((row) => checkStatus(row) === '再確認').length;
  const pregnantCount = records.filter((row) => checkStatus(row) === '妊娠').length;
  const openAttentionCount = overdueCount + todayCount + recheckCount;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        妊娠鑑定 一覧確認
      </Typography>

      <Alert severity="info">
        種付・受精卵移植後の妊娠鑑定を確認する専用画面です。既存の繁殖画面は変更していません。
      </Alert>

      {openAttentionCount > 0 ? (
        <Alert severity="warning">
          確認が必要な妊娠鑑定があります。期限切れ・今日鑑定・再確認を優先してください。
        </Alert>
      ) : (
        <Alert severity="success">
          期限切れ・今日鑑定・再確認の注意項目はありません。
        </Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button component={RouterLink} to="/breedings-advanced/new" variant="contained">
          繁殖強化 新規登録
        </Button>
        <Button component={RouterLink} to="/breedings-advanced" variant="outlined">
          繁殖強化 一覧
        </Button>
        <Button component={RouterLink} to="/breedings" variant="outlined">
          既存の繁殖一覧
        </Button>
        <Button onClick={load} variant="outlined">
          再読み込み
        </Button>
      </Stack>

      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="warning">{error}</Alert>}

      {!loading && !error && (
        <>
          <Grid container spacing={2}>
            <Grid item xs={6} md={2}>
              <StatCard title="期限切れ" value={`${overdueCount}件`} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard title="今日鑑定" value={`${todayCount}件`} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard title="鑑定待ち" value={`${waitingCount}件`} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard title="再確認" value={`${recheckCount}件`} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard title="妊娠" value={`${pregnantCount}件`} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard title="全記録" value={`${records.length}件`} />
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={800}>
                  検索・絞り込み
                </Typography>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={8}>
                    <TextField
                      label="検索"
                      fullWidth
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="母牛名・種雄牛・鑑定結果・メモなど"
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      label="鑑定状態"
                      select
                      fullWidth
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <MenuItem value="">すべて</MenuItem>
                      <MenuItem value="期限切れ">期限切れ</MenuItem>
                      <MenuItem value="今日鑑定">今日鑑定</MenuItem>
                      <MenuItem value="鑑定待ち">鑑定待ち</MenuItem>
                      <MenuItem value="再確認">再確認</MenuItem>
                      <MenuItem value="妊娠">妊娠</MenuItem>
                      <MenuItem value="不受胎">不受胎</MenuItem>
                      <MenuItem value="流産">流産</MenuItem>
                      <MenuItem value="予定日なし">予定日なし</MenuItem>
                    </TextField>
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>

          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            <Stack spacing={1.5}>
              {filtered.length === 0 ? (
                <Alert severity="info">表示する妊娠鑑定記録はありません。</Alert>
              ) : (
                filtered.map((row, index) => (
                  <PregnancyCard key={row.id || index} row={row} />
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
                      <TableCell>母牛・受卵牛</TableCell>
                      <TableCell>区分</TableCell>
                      <TableCell>実施日</TableCell>
                      <TableCell>鑑定状態</TableCell>
                      <TableCell>鑑定予定日</TableCell>
                      <TableCell>鑑定結果</TableCell>
                      <TableCell>分娩予定日</TableCell>
                      <TableCell>状態</TableCell>
                      <TableCell>メモ</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9}>表示する妊娠鑑定記録はありません。</TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((row, index) => {
                        const check = checkStatus(row);
                        const result = String(row.pregnancyResult || '未鑑定');

                        return (
                          <TableRow key={row.id || index}>
                            <TableCell>{value(row.cowName)}</TableCell>
                            <TableCell>
                              <Chip size="small" color={typeColor(String(row.breedingType || '')) as any} label={value(row.breedingType)} />
                            </TableCell>
                            <TableCell>{value(row.serviceDate)}</TableCell>
                            <TableCell>
                              <Chip size="small" color={checkStatusColor(check) as any} label={check} />
                            </TableCell>
                            <TableCell>
                              {value(row.pregnancyCheckDate)}
                              {row.pregnancyCheckDate ? `（${daysUntil(row.pregnancyCheckDate)}）` : ''}
                            </TableCell>
                            <TableCell>
                              <Chip size="small" color={resultColor(result) as any} label={value(result)} />
                            </TableCell>
                            <TableCell>{value(row.expectedCalvingDate)}</TableCell>
                            <TableCell>
                              <Chip size="small" color={statusColor(String(row.status || '')) as any} label={value(row.status)} />
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

export default PregnancyCheckList;
