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
  Typography
} from '@mui/material';

type CalvingRecord = {
  id?: string;
  cowName?: string;
  actualCalvingDate?: string;
  calfName?: string;
  calfSex?: string;
  birthWeightKg?: number | string;
  calvingResult?: string;
  colostrumStatus?: string;
  registeredToCalfLedger?: boolean;
  memo?: string;
};

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return res.json();
  } catch {
    return fallback;
  }
}

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

function sortRecentCalvings(records: CalvingRecord[]) {
  return [...records].sort((a, b) => {
    const da = a.actualCalvingDate || '';
    const db = b.actualCalvingDate || '';
    return db.localeCompare(da);
  });
}

function StatCard({ title, count, note }: { title: string; count: number; note?: string }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={0.5}>
          <Typography color="text.secondary">{title}</Typography>
          <Typography variant="h5" fontWeight={900}>{count}件</Typography>
          {note && <Typography color="text.secondary">{note}</Typography>}
        </Stack>
      </CardContent>
    </Card>
  );
}

function HomeCalvingSummary() {
  const [calvings, setCalvings] = useState<CalvingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await fetchJson<CalvingRecord[]>('http://localhost:4000/api/calvings', []);
    setCalvings(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const normalTargets = calvings.filter((row) => row.calvingResult !== '死産');
    const notRegistered = normalTargets.filter((row) => !row.registeredToCalfLedger);
    const colostrumNeed = normalTargets.filter((row) => row.colostrumStatus !== '確認済み');
    const recent = sortRecentCalvings(calvings).slice(0, 5);

    return {
      notRegistered,
      colostrumNeed,
      recent
    };
  }, [calvings]);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Typography>分娩記録を読み込み中...</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6" fontWeight={900}>
                分娩記録 確認
              </Typography>
              <Typography color="text.secondary">
                登録漏れと初乳確認だけを軽く確認します。
              </Typography>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button component={RouterLink} to="/calvings" variant="outlined">
                分娩記録を見る
              </Button>
              <Button component={RouterLink} to="/calvings/new" variant="contained">
                分娩記録 新規登録
              </Button>
            </Stack>
          </Stack>

          {summary.notRegistered.length > 0 ? (
            <Alert severity="warning">
              子牛台帳へ未登録の分娩記録が {summary.notRegistered.length} 件あります。
            </Alert>
          ) : (
            <Alert severity="success">
              子牛台帳へ未登録の通常分娩記録はありません。
            </Alert>
          )}

          {summary.colostrumNeed.length > 0 && (
            <Alert severity="warning">
              初乳が未確認または要確認の分娩記録が {summary.colostrumNeed.length} 件あります。
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <StatCard title="分娩記録" count={calvings.length} />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard title="子牛台帳未登録" count={summary.notRegistered.length} />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard title="初乳確認待ち" count={summary.colostrumNeed.length} />
            </Grid>
          </Grid>

          <Stack spacing={1}>
            <Typography fontWeight={800}>最近の分娩記録</Typography>

            {summary.recent.length === 0 ? (
              <Typography color="text.secondary">分娩記録はまだありません。</Typography>
            ) : (
              summary.recent.map((row, index) => (
                <Card key={row.id || index} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography fontWeight={800} sx={{ flexGrow: 1 }}>
                          {value(row.actualCalvingDate)} / {value(row.cowName)} / {value(row.calfName)}
                        </Typography>
                        <Chip size="small" color={resultColor(row.calvingResult) as any} label={value(row.calvingResult)} />
                        <Chip size="small" color={colostrumColor(row.colostrumStatus) as any} label={`初乳：${value(row.colostrumStatus)}`} />
                        <Chip
                          size="small"
                          color={row.registeredToCalfLedger ? 'success' : row.calvingResult === '死産' ? 'default' : 'warning'}
                          label={row.registeredToCalfLedger ? '台帳登録済み' : row.calvingResult === '死産' ? '台帳対象外' : '台帳未登録'}
                        />
                      </Stack>

                      {row.memo && (
                        <Typography color="text.secondary">
                          {row.memo}
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              ))
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function Home() {
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" fontWeight={900}>
          FarmPro
        </Typography>
        <Typography color="text.secondary">
          繁殖和牛農家向け管理アプリ
        </Typography>
      </Box>

      <Alert severity="info">
        今日は「登録漏れ」と「確認待ち」だけを確認しましょう。細かい管理は各画面で行えます。
      </Alert>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="h6" fontWeight={800}>牛台帳</Typography>
                <Typography color="text.secondary">母牛・育成牛などの基本情報を管理します。</Typography>
                <Button component={RouterLink} to="/cattle" variant="outlined">牛台帳を見る</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="h6" fontWeight={800}>子牛管理</Typography>
                <Typography color="text.secondary">子牛の出生・成長・履歴を確認します。</Typography>
                <Button component={RouterLink} to="/calves" variant="outlined">子牛管理を見る</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="h6" fontWeight={800}>繁殖管理</Typography>
                <Typography color="text.secondary">種付・妊娠鑑定・分娩予定を確認します。</Typography>
                <Button component={RouterLink} to="/breedings" variant="outlined">繁殖管理を見る</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <HomeCalvingSummary />

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="h6" fontWeight={800}>販売・出荷</Typography>
                <Typography color="text.secondary">販売・出荷の記録を確認します。</Typography>
                <Button component={RouterLink} to="/sales" variant="outlined">販売・出荷を見る</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="h6" fontWeight={800}>経費管理</Typography>
                <Typography color="text.secondary">飼料代・診療費などの支出を確認します。</Typography>
                <Button component={RouterLink} to="/expenses" variant="outlined">経費を見る</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="h6" fontWeight={800}>レポート</Typography>
                <Typography color="text.secondary">集計や収支を確認します。</Typography>
                <Button component={RouterLink} to="/reports" variant="outlined">レポートを見る</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}

export default Home;
