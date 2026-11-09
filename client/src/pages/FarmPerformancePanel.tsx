import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { AnalysisBarChart } from '../components/AnalysisBarChart';
import { buildFarmPerformance, type FarmPerformanceRow } from '../utils/farmPerformance';
import type { MaternalAnalysis } from '../utils/maternalAnalysis';

const value = (n: number | null, unit = '') => n === null ? '記録不足' : `${Math.round(n).toLocaleString('ja-JP')}${unit}`;
type MetricKey = 'calvingCount' | 'averageInterval' | 'serviceCount' | 'pregnancyRate' | 'soldCount' | 'saleTotal' | 'averagePrice' | 'averageShippingAge';
const metrics: Record<MetricKey, { label: string; unit: string }> = {
  calvingCount: { label: '分娩回数', unit: '回' }, averageInterval: { label: '平均分娩間隔', unit: '日' },
  serviceCount: { label: '授精・ET実施回数', unit: '回' }, pregnancyRate: { label: '確定妊鑑の受胎割合', unit: '%' },
  soldCount: { label: '子牛販売頭数', unit: '頭' }, saleTotal: { label: '子牛販売額（記録分）', unit: '円' },
  averagePrice: { label: '平均販売価格', unit: '円' }, averageShippingAge: { label: '平均出荷日齢', unit: '日' },
};
function sample(row: FarmPerformanceRow, metric: MetricKey): string {
  if (metric === 'averageInterval') return `${row.intervalCount}間隔`;
  if (metric === 'pregnancyRate') return `受胎 ${row.conceivedCount} / 確定鑑定 ${row.checkedCount}件`;
  if (metric === 'averagePrice' || metric === 'saleTotal') return `価格登録 ${row.priceCount} / 販売 ${row.soldCount}頭`;
  if (metric === 'averageShippingAge') return `実出荷 ${row.shippingCount}頭`;
  return '記録された実績';
}

export function FarmPerformancePanel({ analysis, asOf }: { analysis: MaternalAnalysis; asOf: string }) {
  const [year, setYear] = useState(asOf.slice(0, 4));
  const [category, setCategory] = useState<'breeding' | 'sales'>('breeding');
  const [display, setDisplay] = useState<'table' | 'chart'>('table');
  const [metric, setMetric] = useState<MetricKey>('calvingCount');
  const farm = useMemo(() => buildFarmPerformance(analysis, year, asOf), [analysis, year, asOf]);
  const keys: MetricKey[] = category === 'breeding' ? ['calvingCount', 'averageInterval', 'serviceCount', 'pregnancyRate'] : ['soldCount', 'saleTotal', 'averagePrice', 'averageShippingAge'];
  const years = [...new Set([asOf.slice(0, 4), ...farm.years])].sort().reverse();
  const periodLabel = (period: string) => period.length === 4 ? `${period}年` : `${Number(period.slice(5))}月`;
  const chartMetric = metrics[metric];
  const format = (n: number | null) => value(n, chartMetric.unit);
  const averageMetric = ['averageInterval', 'pregnancyRate', 'averagePrice', 'averageShippingAge'].includes(metric);
  return <Stack spacing={2}>
    {analysis.issues.length > 0 && <Alert severity="warning">照合や集計について確認事項があります。画面下の「集計元の確認」で内容を確認できます。</Alert>}
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
      <TextField select label="集計する年（1月〜12月）" value={year} onChange={e => setYear(e.target.value)} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} sx={{ minWidth: { sm: 240 }, '& .MuiInputBase-root': { minHeight: 48 } }}>
        <MenuItem value="">全期間（年別で比較）</MenuItem>{years.map(y => <MenuItem key={y} value={y}>{y}年</MenuItem>)}
      </TextField>
      <Button component={RouterLink} to="/reports" variant="outlined" sx={{ minHeight: 44 }}>売上・経費・利益の分析を見る</Button>
    </Stack>
    <Typography variant="body2" color="text.secondary">農場全体 ／ {year ? `${year}年（${year === asOf.slice(0, 4) ? `${asOf.replace(/-/g, '/')}まで` : '1月〜12月'}）` : '記録の全期間'}。母牛別比較の検索・性別・ET区分に影響されず集計します。</Typography>
    <Tabs value={category} onChange={(_, v) => { setCategory(v); setMetric(v === 'breeding' ? 'calvingCount' : 'soldCount'); }} variant="fullWidth" aria-label="農場全体の成績区分" sx={{ '& .MuiTab-root': { minHeight: 48, minWidth: 0 } }}>
      <Tab value="breeding" label="繁殖の推移" /><Tab value="sales" label="販売・出荷成績" />
    </Tabs>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', md: 'repeat(4,minmax(0,1fr))' }, gap: 1.5 }}>
      {keys.map(key => <Card key={key} variant="outlined"><CardContent sx={{ px: { xs: 1.5, sm: 2 } }}>
        <Typography variant="body2" color="text.secondary">{metrics[key].label}</Typography>
        <Typography fontWeight={900} sx={{ fontSize: { xs: '1.1rem', sm: '1.35rem' }, overflowWrap: 'anywhere' }}>{value(farm.total[key], metrics[key].unit)}</Typography>
        <Typography variant="caption" color="text.secondary">{sample(farm.total, key)}</Typography>
      </CardContent></Card>)}
    </Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
      <Typography component="h2" variant="h6" fontWeight={800}>{year ? '月別' : '年別'}の成績</Typography>
      <ToggleButtonGroup exclusive value={display} onChange={(_, v) => v && setDisplay(v)} aria-label="農場全体の表示方法" sx={{ '& .MuiToggleButton-root': { minHeight: 44, px: 3 } }}>
        <ToggleButton value="table">一覧表</ToggleButton><ToggleButton value="chart">グラフ</ToggleButton>
      </ToggleButtonGroup>
    </Stack>
    {!farm.periods.length && <Alert severity="info">集計できる日付の記録がまだありません。</Alert>}
    {display === 'chart' ? <>
      <TextField select label="グラフにする指標" value={metric} onChange={e => setMetric(e.target.value as MetricKey)} sx={{ maxWidth: 420 }}>
        {keys.map(key => <MenuItem key={key} value={key}>{metrics[key].label}</MenuItem>)}
      </TextField>
      <AnalysisBarChart title={`${year ? `${year}年・月別` : '年別'}の${chartMetric.label}`} unit={chartMetric.unit} format={format}
        items={farm.periods.map(row => ({ key: row.period, label: periodLabel(row.period), value: row[metric], sample: sample(row, metric) }))}
        reference={averageMetric ? { value: farm.total[metric], label: '集計期間全体' } : undefined} />
    </> : <>
      <Box sx={{ display: { xs: 'none', md: 'block' }, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
        <Table size="small" aria-label={`農場全体の${year ? '月別' : '年別'}${category === 'breeding' ? '繁殖成績' : '販売出荷成績'}`} sx={{ tableLayout: 'fixed', '& th, & td': { px: 1, py: 1.5, overflowWrap: 'anywhere' } }}>
          <TableHead><TableRow><TableCell sx={{ width: '12%' }}>{year ? '月' : '年'}</TableCell>{keys.map(key => <TableCell key={key}>{metrics[key].label}</TableCell>)}</TableRow></TableHead>
          <TableBody>{farm.periods.map(row => <TableRow key={row.period}><TableCell>{periodLabel(row.period)}</TableCell>{keys.map(key => <TableCell key={key}><Typography fontWeight={700}>{value(row[key], metrics[key].unit)}</Typography><Typography variant="caption" color="text.secondary">{sample(row, key)}</Typography></TableCell>)}</TableRow>)}</TableBody>
        </Table>
      </Box>
      <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>{farm.periods.map(row => <Card key={row.period} variant="outlined"><CardContent>
        <Typography component="h3" fontWeight={800}>{periodLabel(row.period)}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 1.5, mt: 1 }}>{keys.map(key => <Box key={key} sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary">{metrics[key].label}</Typography><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{value(row[key], metrics[key].unit)}</Typography><Typography variant="caption" color="text.secondary">{sample(row, key)}</Typography>
        </Box>)}</Box>
      </CardContent></Card>)}</Stack>
    </>}
    {farm.total.unmatchedCalvings > 0 && <Alert severity="info">母牛を台帳と照合できない分娩{farm.total.unmatchedCalvings}回を農場全体に含めています。分娩間隔は母牛を照合できる実績だけで計算しています。</Alert>}
    {farm.missingSalePriceCount > 0 && <Alert severity="warning">販売済み{farm.total.soldCount}頭のうち{farm.missingSalePriceCount}頭は価格が未入力です。販売額と平均価格は、価格登録済み{farm.total.priceCount}頭だけの集計です。</Alert>}
    {farm.undatedPriceCount > 0 && <Typography variant="body2" color="text.secondary">販売日がない取込価格など{farm.undatedPriceCount}件は、この期間別集計から除外しています。母牛別の参考価格で確認できます。</Typography>}
    <Alert severity="info">分娩・授精は実施日、妊娠鑑定は確定鑑定日、販売は販売日、出荷日齢は実出荷日で集計します。分娩間隔は前年の分娩日も参照します。記録がない月の回数・頭数は0、平均は「記録不足」です。販売額は子牛の記録額で、経費控除後の利益ではありません。</Alert>
    {analysis.issues.length > 0 && <Accordion disableGutters><AccordionSummary><Typography fontWeight={700}>集計元の確認（{analysis.issues.length}項目）</Typography></AccordionSummary><AccordionDetails><Stack spacing={1}>
      <Typography variant="body2">母牛別の照合に関する注意も含みます。母牛を特定できなくても、日付や個体を確認できる実績は農場全体に含めています。</Typography>
      {analysis.issues.map(issue => <Alert key={issue} severity="warning">{issue}</Alert>)}
    </Stack></AccordionDetails></Accordion>}
  </Stack>;
}
