import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  getReportSummary,
  type ManagementAnalysisSummary,
  type ManagementCompositionItem,
} from '../services/reportApi';

function yen(value: number) {
  return `${Number(value || 0).toLocaleString('ja-JP')}円`;
}

const pieColorByLabel: Record<string, string> = {
  '取得原価': '#4f7fc8',
  '飼料費': '#63a35c',
  '診療・医薬品費': '#d96c6c',
  '繁殖費': '#9b7bc4',
  '農場共通経費': '#d6a64f',
  'その他': '#8a98a8',
  '内訳未保存': '#8a98a8',
  '利益': '#f57c00',
};

function CompositionPie({ title, items }: { title: string; items: ManagementCompositionItem[] }) {
  const filtered = items.filter((item) => item.amount > 0);
  const total = filtered.reduce((sum, item) => sum + item.amount, 0);

  if (!total) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={800}>{title}</Typography>
          <Alert severity="info" sx={{ mt: 1 }}>表示できるデータがまだありません。</Alert>
        </CardContent>
      </Card>
    );
  }

  let current = 0;
  const slices = filtered.map((item) => {
    const ratio = (item.amount / total) * 100;
    const start = current;
    const end = current + ratio;
    current = end;
    return {
      ...item,
      ratio,
      start,
      end,
      color: pieColorByLabel[item.label] || '#8a98a8',
    };
  });

  const stops = slices.map((item) => `${item.color} ${item.start}% ${item.end}%`);

  return (
    <Card>
      <CardContent>
        <Stack spacing={1.75}>
          <Typography variant="h6" fontWeight={800}>{title}</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="center">
            <Box
              role="img"
              aria-label={title}
              sx={{
                position: 'relative',
                width: { xs: 240, sm: 280 },
                height: { xs: 240, sm: 280 },
                borderRadius: '50%',
                background: `conic-gradient(${stops.join(', ')})`,
                flexShrink: 0,
                boxShadow: '0 10px 28px rgba(0,0,0,0.12)',
                border: '8px solid',
                borderColor: 'background.paper',
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  inset: '31%',
                  borderRadius: '50%',
                  bgcolor: 'background.paper',
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  px: 1,
                }}
              >
                <Stack spacing={0.15}>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>売上</Typography>
                  <Typography variant="h6" fontWeight={900}>100%</Typography>
                  <Typography variant="caption" color="text.secondary">{yen(total)}</Typography>
                </Stack>
              </Box>

              {slices.map((item) => {
                if (item.ratio < 7) return null;
                const angle = ((item.start + item.end) / 2) * 3.6 - 90;
                const radius = 38;
                const x = 50 + Math.cos((angle * Math.PI) / 180) * radius;
                const y = 50 + Math.sin((angle * Math.PI) / 180) * radius;
                return (
                  <Typography
                    key={item.label}
                    component="span"
                    sx={{
                      position: 'absolute',
                      left: `${x}%`,
                      top: `${y}%`,
                      transform: 'translate(-50%, -50%)',
                      color: '#fff',
                      fontWeight: 900,
                      fontSize: { xs: '0.72rem', sm: '0.8rem' },
                      lineHeight: 1,
                      textShadow: '0 1px 4px rgba(0,0,0,0.55)',
                      pointerEvents: 'none',
                    }}
                  >
                    {item.ratio.toFixed(0)}%
                  </Typography>
                );
              })}
            </Box>

            <Stack spacing={0.85} sx={{ width: '100%', maxWidth: 560 }}>
              {slices.map((item) => (
                <Stack
                  key={item.label}
                  direction="row"
                  justifyContent="space-between"
                  spacing={1.5}
                  alignItems="center"
                  sx={{
                    py: 0.65,
                    px: 1,
                    borderRadius: 1.5,
                    bgcolor: 'action.hover',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: item.color, flexShrink: 0 }} />
                    <Typography fontWeight={700} noWrap>{item.label}</Typography>
                  </Stack>
                  <Typography fontWeight={900} sx={{ whiteSpace: 'nowrap' }}>
                    {item.ratio.toFixed(1)}%　{yen(item.amount)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function StatCard({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={0.5}>
          <Typography color="text.secondary">{title}</Typography>
          <Typography variant="h5" fontWeight={900}>{value}</Typography>
          {note && <Typography variant="body2" color="text.secondary">{note}</Typography>}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function ReportPage() {
  const [summary, setSummary] = useState<ManagementAnalysisSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getReportSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : '経営分析を取得できませんでした。'))
      .finally(() => setLoading(false));
  }, []);

  const maxProfit = useMemo(() => {
    return Math.max(1, ...(summary?.monthly || []).map((row) => Math.abs(row.profitTotal)));
  }, [summary]);

  return (
    <Stack spacing={2}>
      <Stack spacing={0.4}>
        <Typography variant="h5" fontWeight={900}>経営分析</Typography>
        <Typography color="text.secondary">
          販売済みの記録をもとに、売上・生産費・利益を経営判断向けにまとめます。
        </Typography>
      </Stack>

      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && summary && (
        <>
          {summary.soldCount === 0 && (
            <Alert severity="info">
              今年の販売済み記録はまだありません。販売済み記録が入ると分析が表示されます。
            </Alert>
          )}

          <Typography variant="h6" fontWeight={800}>{summary.year}年の販売実績</Typography>
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6} md={3}><StatCard title="販売利益" value={yen(summary.profitTotal)} note={`${summary.soldCount}頭の合計`} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="1頭あたり平均利益" value={yen(summary.averageProfit)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="1頭あたり平均生産費" value={yen(summary.averageProductionCost)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="平均販売額" value={yen(summary.averageSaleAmount)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="売上合計" value={yen(summary.salesTotal)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="販売時生産費合計" value={yen(summary.productionCostTotal)} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="販売頭数" value={`${summary.soldCount}頭`} /></Grid>
            <Grid item xs={12} sm={6} md={3}><StatCard title="利益率" value={`${summary.profitMargin}%`} note="販売利益 ÷ 売上" /></Grid>
          </Grid>

          {summary.profitTotal >= 0 ? (
            <CompositionPie title="売上に対する費用・利益の構成比" items={summary.salesCostComposition} />
          ) : (
            <Card>
              <CardContent>
                <Stack spacing={1}>
                  <Typography variant="h6" fontWeight={800}>売上に対する費用・利益の構成比</Typography>
                  <Alert severity="warning">
                    費用が売上を上回っているため、円グラフは表示していません。売上・販売時生産費・販売利益の金額を確認してください。
                  </Alert>
                </Stack>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="h6" fontWeight={800}>月別の販売利益推移</Typography>
                {summary.monthly.length === 0 ? (
                  <Alert severity="info">月別に表示できる販売実績はまだありません。</Alert>
                ) : (
                  <Stack spacing={1}>
                    {summary.monthly.map((row) => {
                      const width = Math.max(4, Math.round((Math.abs(row.profitTotal) / maxProfit) * 100));
                      return (
                        <Stack key={row.yearMonth} spacing={0.4}>
                          <Stack direction="row" justifyContent="space-between" spacing={1}>
                            <Typography fontWeight={800}>{row.yearMonth}</Typography>
                            <Typography fontWeight={900}>{yen(row.profitTotal)}</Typography>
                          </Stack>
                          <Box sx={{ height: 18, borderRadius: 999, bgcolor: 'action.hover', overflow: 'hidden' }}>
                            <Box sx={{ width: `${width}%`, height: '100%', bgcolor: row.profitTotal >= 0 ? 'success.main' : 'error.main' }} />
                          </Box>
                        </Stack>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>

          {summary.monthly.length > 0 && (
            <Card>
              <CardContent sx={{ p: 1.5 }}>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 760 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>年月</TableCell>
                        <TableCell>販売頭数</TableCell>
                        <TableCell>売上</TableCell>
                        <TableCell>販売時生産費</TableCell>
                        <TableCell>販売利益</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {summary.monthly.map((row) => (
                        <TableRow key={row.yearMonth}>
                          <TableCell sx={{ fontWeight: 800 }}>{row.yearMonth}</TableCell>
                          <TableCell>{row.soldCount}頭</TableCell>
                          <TableCell>{yen(row.salesTotal)}</TableCell>
                          <TableCell>{yen(row.productionCostTotal)}</TableCell>
                          <TableCell sx={{ fontWeight: 900 }}>{yen(row.profitTotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Stack>
  );
}

export default ReportPage;
