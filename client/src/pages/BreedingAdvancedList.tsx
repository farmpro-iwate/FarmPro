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

function typeColor(type: string) {
  if (type === '人工授精') return 'primary';
  if (type === '自然交配') return 'success';
  if (type === '受精卵移植') return 'secondary';
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

function pregnancyColor(result: string) {
  if (result === '妊娠') return 'success';
  if (result === '不受胎' || result === '流産') return 'error';
  if (result === '再確認') return 'warning';
  if (result === '未鑑定') return 'info';
  return 'default';
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

function sortByServiceDate(records: BreedingAdvancedRecord[]) {
  return [...records].sort((a, b) => {
    const dateA = a.serviceDate || '';
    const dateB = b.serviceDate || '';
    return dateB.localeCompare(dateA);
  });
}

function RecordCard({ row }: { row: BreedingAdvancedRecord }) {
  const type = String(row.breedingType || '');
  const status = String(row.status || '');
  const pregnancy = String(row.pregnancyResult || '');

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.2}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography fontWeight={900} sx={{ flexGrow: 1 }}>
              {value(row.cowName)}
            </Typography>
            <Chip size="small" color={typeColor(type) as any} label={value(type)} />
            <Chip size="small" color={statusColor(status) as any} label={value(status)} />
          </Stack>

          <Grid container spacing={1}>
            <Grid item xs={6}>
              <Typography color="text.secondary">実施日</Typography>
              <Typography fontWeight={700}>{value(row.serviceDate)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography color="text.secondary">分娩予定日</Typography>
              <Typography fontWeight={700}>
                {value(row.expectedCalvingDate)}
                {row.expectedCalvingDate ? `（${daysUntil(row.expectedCalvingDate)}）` : ''}
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography color="text.secondary">鑑定予定日</Typography>
              <Typography fontWeight={700}>
                {value(row.pregnancyCheckDate)}
                {row.pregnancyCheckDate ? `（${daysUntil(row.pregnancyCheckDate)}）` : ''}
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography color="text.secondary">妊娠結果</Typography>
              <Chip size="small" color={pregnancyColor(pregnancy) as any} label={value(pregnancy)} />
            </Grid>
          </Grid>

          {type === '人工授精' && (
            <Grid container spacing={1}>
              <Grid item xs={6}>
                <Typography color="text.secondary">種雄牛</Typography>
                <Typography fontWeight={700}>{value(row.sireName)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography color="text.secondary">精液番号</Typography>
                <Typography fontWeight={700}>{value(row.semenNo)}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography color="text.secondary">授精師</Typography>
                <Typography fontWeight={700}>{value(row.inseminatorName)}</Typography>
              </Grid>
            </Grid>
          )}

          {type === '自然交配' && (
            <Grid container spacing={1}>
              <Grid item xs={6}>
                <Typography color="text.secondary">種雄牛</Typography>
                <Typography fontWeight={700}>{value(row.sireName)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography color="text.secondary">同居期間</Typography>
                <Typography fontWeight={700}>
                  {value(row.matingStartDate)} 〜 {value(row.matingEndDate)}
                </Typography>
              </Grid>
            </Grid>
          )}

          {type === '受精卵移植' && (
            <Grid container spacing={1}>
              <Grid item xs={6}>
                <Typography color="text.secondary">ドナー牛</Typography>
                <Typography fontWeight={700}>{value(row.donorCowName)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography color="text.secondary">種雄牛</Typography>
                <Typography fontWeight={700}>{value(row.sireName)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography color="text.secondary">受精卵番号</Typography>
                <Typography fontWeight={700}>{value(row.embryoNo)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography color="text.secondary">卵区分・ランク</Typography>
                <Typography fontWeight={700}>
                  {value(row.embryoType)} / {value(row.embryoRank)}
                </Typography>
              </Grid>
            </Grid>
          )}

          {row.memo && (
            <Alert severity="info">
              {row.memo}
            </Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function BreedingAdvancedList() {
  const [records, setRecords] = useState<BreedingAdvancedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const data = await fetchBreedingAdvancedRecords();
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '繁殖強化一覧を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();

    return sortByServiceDate(records).filter((row) => {
      const text = [
        row.cowName,
        row.breedingType,
        row.serviceDate,
        row.expectedCalvingDate,
        row.pregnancyCheckDate,
        row.pregnancyResult,
        row.status,
        row.sireName,
        row.semenNo,
        row.donorCowName,
        row.embryoNo,
        row.memo
      ].join(' ').toLowerCase();

      if (typeFilter && row.breedingType !== typeFilter) return false;
      if (kw && !text.includes(kw)) return false;

      return true;
    });
  }, [records, keyword, typeFilter]);

  const aiCount = records.filter((row) => row.breedingType === '人工授精').length;
  const naturalCount = records.filter((row) => row.breedingType === '自然交配').length;
  const etCount = records.filter((row) => row.breedingType === '受精卵移植').length;
  const waitingCount = records.filter((row) => row.pregnancyResult === '未鑑定').length;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        繁殖強化 一覧確認
      </Typography>

      <Alert severity="info">
        既存の繁殖画面を壊さないための別画面です。人工授精・自然交配・受精卵移植の詳細項目を確認できます。
      </Alert>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button component={RouterLink} to="/breedings-advanced/new" variant="contained">
          繁殖強化 新規登録
        </Button>
        <Button component={RouterLink} to="/breedings" variant="outlined">
          既存の繁殖一覧へ戻る
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
            <Grid item xs={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary">全記録</Typography>
                  <Typography variant="h5" fontWeight={900}>{records.length}件</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary">人工授精</Typography>
                  <Typography variant="h5" fontWeight={900}>{aiCount}件</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary">受精卵移植</Typography>
                  <Typography variant="h5" fontWeight={900}>{etCount}件</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary">未鑑定</Typography>
                  <Typography variant="h5" fontWeight={900}>{waitingCount}件</Typography>
                </CardContent>
              </Card>
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
                      placeholder="母牛名・種雄牛・受精卵番号・メモなど"
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      label="繁殖区分"
                      select
                      fullWidth
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                    >
                      <MenuItem value="">すべて</MenuItem>
                      <MenuItem value="人工授精">人工授精</MenuItem>
                      <MenuItem value="自然交配">自然交配</MenuItem>
                      <MenuItem value="受精卵移植">受精卵移植</MenuItem>
                      <MenuItem value="その他">その他</MenuItem>
                    </TextField>
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>

          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            <Stack spacing={1.5}>
              {filtered.length === 0 ? (
                <Alert severity="info">表示する繁殖記録はありません。</Alert>
              ) : (
                filtered.map((row, index) => (
                  <RecordCard key={row.id || index} row={row} />
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
                      <TableCell>種雄牛</TableCell>
                      <TableCell>精液/受精卵</TableCell>
                      <TableCell>妊娠鑑定</TableCell>
                      <TableCell>分娩予定</TableCell>
                      <TableCell>状態</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8}>表示する繁殖記録はありません。</TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((row, index) => {
                        const type = String(row.breedingType || '');
                        const status = String(row.status || '');
                        const pregnancy = String(row.pregnancyResult || '');

                        return (
                          <TableRow key={row.id || index}>
                            <TableCell>{value(row.cowName)}</TableCell>
                            <TableCell>
                              <Chip size="small" color={typeColor(type) as any} label={value(type)} />
                            </TableCell>
                            <TableCell>{value(row.serviceDate)}</TableCell>
                            <TableCell>{value(row.sireName)}</TableCell>
                            <TableCell>
                              {type === '受精卵移植'
                                ? `${value(row.embryoNo)} / ${value(row.embryoType)} / ${value(row.embryoRank)}`
                                : value(row.semenNo)}
                            </TableCell>
                            <TableCell>
                              <Stack spacing={0.5}>
                                <Chip size="small" color={pregnancyColor(pregnancy) as any} label={value(pregnancy)} />
                                <Typography variant="body2">
                                  {value(row.pregnancyCheckDate)}
                                  {row.pregnancyCheckDate ? `（${daysUntil(row.pregnancyCheckDate)}）` : ''}
                                </Typography>
                              </Stack>
                            </TableCell>
                            <TableCell>
                              {value(row.expectedCalvingDate)}
                              {row.expectedCalvingDate ? `（${daysUntil(row.expectedCalvingDate)}）` : ''}
                            </TableCell>
                            <TableCell>
                              <Chip size="small" color={statusColor(status) as any} label={value(status)} />
                            </TableCell>
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

export default BreedingAdvancedList;
