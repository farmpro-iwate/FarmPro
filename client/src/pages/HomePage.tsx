import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography
} from '@mui/material';

type ReportSummary = {
  cattleCount?: number;
  calfCount?: number;
  breedingCount?: number;
  vaccineCount?: number;
  treatmentCount?: number;
  salesCount?: number;
  expenseCount?: number;
  feedingCount?: number;
  feedInventoryCount?: number;
  feedingGuideCount?: number;
  feedingAlerts?: {
    totalCalves?: number;
    withGuideCount?: number;
    noBirthDateCount?: number;
    noGuideCount?: number;
    noRecordCount?: number;
    shortageCalfCount?: number;
    overCalfCount?: number;
    okCalfCount?: number;
  };
};

function numberText(v: unknown) {
  const n = Number(v || 0);
  return n.toLocaleString('ja-JP');
}

function StatCard({
  title,
  value,
  note
}: {
  title: string;
  value: string;
  note?: string;
}) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={1}>
          <Typography color="text.secondary">{title}</Typography>
          <Typography variant="h5" fontWeight={800}>{value}</Typography>
          {note && <Typography color="text.secondary">{note}</Typography>}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function HomePage() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadSummary() {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('http://localhost:4000/api/reports/summary');
      if (!res.ok) throw new Error('集計情報を取得できませんでした。');
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '集計情報を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const feedingAlerts = summary?.feedingAlerts;
  const shortageCount = Number(feedingAlerts?.shortageCalfCount || 0);
  const overCount = Number(feedingAlerts?.overCalfCount || 0);
  const noRecordCount = Number(feedingAlerts?.noRecordCount || 0);
  const hasAlert = shortageCount > 0 || overCount > 0 || noRecordCount > 0;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        ホーム
      </Typography>

      <Alert severity="info">
        繁殖Farm Proのホームです。主要な管理画面と給与アラートをここから確認できます。
      </Alert>

      {loading && <Typography>集計情報を読み込み中...</Typography>}
      {error && <Alert severity="warning">{error}</Alert>}

      {!loading && !error && (
        <>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <StatCard title="成牛" value={`${numberText(summary?.cattleCount)}頭`} />
            </Grid>
            <Grid item xs={12} md={3}>
              <StatCard title="子牛" value={`${numberText(summary?.calfCount)}頭`} />
            </Grid>
            <Grid item xs={12} md={3}>
              <StatCard title="飼料給与実績" value={`${numberText(summary?.feedingCount)}件`} />
            </Grid>
            <Grid item xs={12} md={3}>
              <StatCard title="給与目安" value={`${numberText(summary?.feedingGuideCount)}件`} />
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={800}>
                  給与アラート
                </Typography>

                {hasAlert ? (
                  <Alert severity={shortageCount > 0 || overCount > 0 ? 'warning' : 'info'}>
                    給与確認が必要な子牛があります。詳細は「給与目安」または「レポート」で確認してください。
                  </Alert>
                ) : (
                  <Alert severity="success">
                    現在、大きな給与アラートはありません。
                  </Alert>
                )}

                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}>
                    <StatCard
                      title="全子牛"
                      value={`${numberText(feedingAlerts?.totalCalves)}頭`}
                      note="給与アラート集計対象"
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <StatCard
                      title="不足気味"
                      value={`${numberText(shortageCount)}頭`}
                      note="目安より少なめ"
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <StatCard
                      title="多め"
                      value={`${numberText(overCount)}頭`}
                      note="目安より多め"
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <StatCard
                      title="実績なし"
                      value={`${numberText(noRecordCount)}頭`}
                      note="給与実績が未登録"
                    />
                  </Grid>
                </Grid>

                <Stack direction="row" spacing={1}>
                  <Button component={RouterLink} to="/feeding-guide" variant="contained">
                    給与目安で確認
                  </Button>
                  <Button component={RouterLink} to="/reports" variant="outlined">
                    レポートで確認
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={800}>
                  よく使う画面
                </Typography>

                <Grid container spacing={1}>
                  <Grid item xs={12} md={3}>
                    <Button component={RouterLink} to="/cattle" variant="outlined" fullWidth>
                      牛台帳
                    </Button>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Button component={RouterLink} to="/calves" variant="outlined" fullWidth>
                      子牛管理
                    </Button>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Button component={RouterLink} to="/feedings" variant="outlined" fullWidth>
                      飼養管理
                    </Button>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Button component={RouterLink} to="/feed-inventory" variant="outlined" fullWidth>
                      飼料在庫
                    </Button>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Button component={RouterLink} to="/sales" variant="outlined" fullWidth>
                      出荷・販売
                    </Button>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Button component={RouterLink} to="/expenses" variant="outlined" fullWidth>
                      経費管理
                    </Button>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Button component={RouterLink} to="/monthly-balance" variant="outlined" fullWidth>
                      月別収支
                    </Button>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Button component={RouterLink} to="/reports" variant="outlined" fullWidth>
                      レポート
                    </Button>
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}

export default HomePage;
