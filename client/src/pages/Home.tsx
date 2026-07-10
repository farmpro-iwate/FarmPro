import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  Typography
} from '@mui/material';

type AnyRow = Record<string, any>;

type CalvingRecord = {
  id?: string;
  cowName?: string;
  cowEarTag?: string;
  actualCalvingDate?: string;
  calfName?: string;
  calvingResult?: string;
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

function formatToday() {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  }).format(new Date());
}

function resultColor(result?: string) {
  if (result === '自然分娩') return 'success';
  if (result === '難産') return 'warning';
  if (result === '外科的処置') return 'secondary';
  if (result === '死産') return 'error';
  return 'default';
}

function StatCard({ title, count, note, to }: { title: string; count: number; note: string; to: string }) {
  return (
    <Card sx={{ height: '100%', border: 1, borderColor: 'divider' }}>
      <CardActionArea component={RouterLink} to={to} sx={{ height: '100%' }}>
        <CardContent sx={{ py: 2.25 }}>
          <Stack spacing={0.5}>
            <Typography color="text.secondary" fontWeight={800}>{title}</Typography>
            <Typography variant="h3" fontWeight={900} lineHeight={1.1}>
              {count}<Typography component="span" variant="h6" fontWeight={700}> 件</Typography>
            </Typography>
            <Typography color="text.secondary">{note}</Typography>
            <Typography color="primary" fontWeight={800} sx={{ pt: 0.5 }}>一覧を開く →</Typography>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

function QuickAction({ title, note, to }: { title: string; note: string; to: string }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={1.25}>
          <Typography variant="h6" fontWeight={800}>{title}</Typography>
          <Typography color="text.secondary">{note}</Typography>
          <Button component={RouterLink} to={to} variant="outlined" sx={{ alignSelf: 'flex-start' }}>
            開く
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function Home() {
  const [cattle, setCattle] = useState<AnyRow[]>([]);
  const [calves, setCalves] = useState<AnyRow[]>([]);
  const [calvings, setCalvings] = useState<CalvingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [cattleData, calfData, calvingData] = await Promise.all([
        fetchJson<AnyRow[]>('http://localhost:4000/api/cattle', []),
        fetchJson<AnyRow[]>('http://localhost:4000/api/calves', []),
        fetchJson<CalvingRecord[]>('http://localhost:4000/api/calvings', [])
      ]);

      setCattle(Array.isArray(cattleData) ? cattleData : []);
      setCalves(Array.isArray(calfData) ? calfData : []);
      setCalvings(Array.isArray(calvingData) ? calvingData : []);
      setLoading(false);
    }

    load();
  }, []);

  const board = useMemo(() => {
    const recentCalvings = [...calvings]
      .sort((a, b) => String(b.actualCalvingDate || '').localeCompare(String(a.actualCalvingDate || '')))
      .slice(0, 3);

    return {
      cattleCount: cattle.length,
      calfCount: calves.length,
      calvingCount: calvings.length,
      recentCalvings
    };
  }, [cattle, calves, calvings]);

  return (
    <Stack spacing={3}>
      <Card sx={{ overflow: 'hidden' }}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography color="text.secondary" fontWeight={700}>{formatToday()}</Typography>
              <Typography variant="h4" fontWeight={900}>FarmPro ファームボード</Typography>
              <Typography color="text.secondary">
                農場全体の状況と、よく使う機能を一画面にまとめます。
              </Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button component={RouterLink} to="/alerts" variant="contained">アラートを見る</Button>
              <Button component={RouterLink} to="/calendar" variant="outlined">予定を見る</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {loading && <Alert severity="info">ファームボードを読み込み中です...</Alert>}

      <Box>
        <Typography variant="h6" fontWeight={900}>農場の状況</Typography>
        <Typography color="text.secondary">カード全体を押すと、それぞれの一覧を開けます。</Typography>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <StatCard title="牛台帳" count={board.cattleCount} note="母牛・育成牛" to="/cattle" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard title="子牛管理" count={board.calfCount} note="現在の子牛台帳" to="/calves" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard title="分娩記録" count={board.calvingCount} note="これまでの分娩記録" to="/calvings" />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" fontWeight={900}>最近の分娩</Typography>
                    <Typography color="text.secondary">分娩日、母牛、子牛、分娩結果を表示します。</Typography>
                  </Box>
                  <Button component={RouterLink} to="/calvings" variant="outlined" size="small">分娩記録一覧</Button>
                </Stack>

                <Divider />

                {board.recentCalvings.length === 0 ? (
                  <Typography color="text.secondary">分娩記録はまだありません。</Typography>
                ) : (
                  <Stack spacing={1}>
                    {board.recentCalvings.map((row, index) => (
                      <Card key={row.id || index} variant="outlined">
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                            <Box sx={{ flexGrow: 1 }}>
                              <Typography fontWeight={900}>{value(row.actualCalvingDate)}</Typography>
                              <Typography>母牛：{value(row.cowEarTag || row.cowName)}</Typography>
                              <Typography color="text.secondary">子牛：{value(row.calfName)}</Typography>
                            </Box>
                            <Chip size="small" color={resultColor(row.calvingResult) as any} label={value(row.calvingResult)} />
                          </Stack>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h6" fontWeight={900}>すぐ登録</Typography>
                  <Typography color="text.secondary">よく使う登録を上から順に並べています。</Typography>
                </Box>
                <Button
                  component={RouterLink}
                  to="/calvings/new"
                  variant="contained"
                  size="large"
                  fullWidth
                  sx={{ minHeight: 52, fontWeight: 900 }}
                >
                  分娩記録を登録
                </Button>
                <Button
                  component={RouterLink}
                  to="/breedings/new"
                  variant="contained"
                  size="large"
                  fullWidth
                  sx={{ minHeight: 52, fontWeight: 900 }}
                >
                  繁殖記録を登録
                </Button>
                <Button
                  component={RouterLink}
                  to="/calves/new"
                  variant="outlined"
                  size="large"
                  fullWidth
                  sx={{ minHeight: 52, fontWeight: 800 }}
                >
                  子牛を登録
                </Button>
                <Divider />
                <Button
                  component={RouterLink}
                  to="/feedings/new"
                  variant="text"
                  fullWidth
                  sx={{ minHeight: 44, fontWeight: 700 }}
                >
                  飼料給与を登録
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box>
        <Typography variant="h6" fontWeight={900}>農場管理メニュー</Typography>
        <Typography color="text.secondary">今まで積み上げた機能は、そのまま各管理画面で利用できます。</Typography>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}><QuickAction title="繁殖・分娩" note="種付、妊娠鑑定、分娩予定、分娩記録を確認します。" to="/breedings" /></Grid>
        <Grid item xs={12} md={4}><QuickAction title="健康管理" note="治療、ワクチン、BLV検査をまとめて管理します。" to="/alerts" /></Grid>
        <Grid item xs={12} md={4}><QuickAction title="飼養管理" note="飼料給与、在庫、給与目安、対応記録を確認します。" to="/feedings" /></Grid>
        <Grid item xs={12} md={4}><QuickAction title="経営管理" note="販売・出荷、経費、月別収支を確認します。" to="/monthly-balance" /></Grid>
        <Grid item xs={12} md={4}><QuickAction title="レポート" note="農場データの集計と印刷メニューを確認します。" to="/reports" /></Grid>
        <Grid item xs={12} md={4}><QuickAction title="設定・バックアップ" note="農場設定、使い方、データ保存を確認します。" to="/settings" /></Grid>
      </Grid>
    </Stack>
  );
}

export default Home;
