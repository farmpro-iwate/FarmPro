import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, MenuItem, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { AnalysisBarChart } from '../components/AnalysisBarChart';
import type { MaternalAnalysis } from '../utils/maternalAnalysis';
import { buildMotherCalvingSummaries } from '../utils/motherCalvingSummary';
import { buildReproductiveEfficiency, type EfficiencyRow } from '../utils/reproductiveEfficiency';
import { buildMotherCycleReferences, referenceRate } from '../utils/motherCycleReferences';

const fmt = (n: number | null, unit: string) => n === null ? '記録不足・要確認' : `${Number(n.toFixed(1)).toLocaleString('ja-JP')}${unit}`;
const date = (value: string) => value ? value.replace(/-/g, '/') : '記録なし';
const motherLabel = (row: EfficiencyRow) => `${row.name}（耳標 ${row.earTag || '未登録'}）`;
type CalvingSummary = ReturnType<typeof buildMotherCalvingSummaries>['total'];
type ComparisonMetric = 'interval' | 'calvings' | 'services' | 'firstServiceDays' | 'daysOpen' | 'conceptionRate';

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <Card variant="outlined"><CardContent sx={{ px: { xs: 1.5, sm: 2 } }}>
    <Typography component="h3" fontSize=".9rem" color="text.secondary">{label}</Typography>
    <Typography fontWeight={900} sx={{ fontSize: { xs: '1.15rem', sm: '1.45rem' }, my: 1, overflowWrap: 'anywhere' }}>{value}</Typography>
    <Typography variant="caption" color="text.secondary">{note}</Typography>
  </CardContent></Card>;
}
function firstServiceMethods(row: EfficiencyRow) {
  const episodes = row.episodes.filter(e => e.firstServiceDays !== null);
  const ai = episodes.filter(e => e.firstServiceMethod === 'ai').length;
  const et = episodes.filter(e => e.firstServiceMethod === 'et').length;
  return [ai ? `人工授精 ${ai}件` : '', et ? `ET移植 ${et}件` : ''].filter(Boolean).join('・') || '記録を確認';
}
function CalvingMetrics({ summary }: { summary: CalvingSummary }) {
  return <Stack spacing={.5}>
    <Box><Typography variant="body2">平均間隔：<strong>{fmt(summary.averageInterval, '日')}</strong></Typography>
      <Typography variant="caption" display="block">計算対象 {summary.intervalCount}間隔</Typography></Box>
    <Typography variant="body2">分娩 {summary.calvingCount}回</Typography>
    <Typography variant="caption" display="block">期間内最終：{date(summary.latestCalvingDate)}</Typography>
  </Stack>;
}
function DayMetrics({ row }: { row: EfficiencyRow }) {
  return <Stack spacing={1}>
    <Box><Typography variant="body2">初回授精・移植：<strong>{fmt(row.firstServiceDays, '日')}</strong></Typography>
      <Typography variant="caption" display="block">計算対象 {row.firstServiceCount}件{row.firstServiceCount > 0 && <><br />{firstServiceMethods(row)}</>}</Typography></Box>
    <Box><Typography variant="body2">空胎日数：<strong>{fmt(row.daysOpen, '日')}</strong></Typography>
      <Typography variant="caption" display="block">計算対象 {row.openCount}件</Typography></Box>
  </Stack>;
}
function ConceptionSummary({ row }: { row: EfficiencyRow }) {
  const methods = [
    { label: '人工授精', action: '授精', count: row.aiCount, conceived: row.aiConceivedCount, unresolved: row.aiUnresolvedCount, rate: row.aiConceptionRate },
    { label: 'ET', action: '移植', count: row.etCount, conceived: row.etConceivedCount, unresolved: row.etUnresolvedCount, rate: row.etConceptionRate },
  ].filter(method => method.count > 0);
  if (!methods.length) return <Typography variant="body2">授精・移植の記録を確認</Typography>;
  return <Stack spacing={.75}>
    {(methods.length > 1 || row.conceptionRate !== methods[0].rate) && <Typography variant="body2" fontWeight={800}>合計：{fmt(row.conceptionRate, '%')}</Typography>}
    {methods.map(method => <Box key={method.label}>
      <Typography variant="body2" fontWeight={700}>{method.label}：{fmt(method.rate, '%')}</Typography>
      <Typography variant="caption" display="block">受胎 {method.conceived} / {method.action} {method.count}回{method.unresolved > 0 && <><br />未確定 {method.unresolved}回</>}</Typography>
    </Box>)}
  </Stack>;
}

export function ReproductiveEfficiencyPanel({ analysis, asOf, year, onYearChange, query, onQueryChange, onSelectMother, selectedMotherKey }: {
  analysis: MaternalAnalysis; asOf: string; year: string; onYearChange: (value: string) => void;
  query: string; onQueryChange: (value: string) => void; onSelectMother: (key: string) => void; selectedMotherKey?: string;
}) {
  const [sort, setSort] = useState('name');
  const [display, setDisplay] = useState<'table' | 'chart'>('table');
  const [metric, setMetric] = useState<ComparisonMetric>('interval');
  // Search only changes visible rows. Farm totals and historical candidate denominators always use the full farm.
  const report = useMemo(() => buildReproductiveEfficiency(analysis, asOf, year), [analysis, asOf, year]);
  const calvings = useMemo(() => buildMotherCalvingSummaries(analysis, asOf, year), [analysis, asOf, year]);
  const cycleReferences = useMemo(() => buildMotherCycleReferences(analysis, report, asOf, year), [analysis, report, asOf, year]);
  const rows = useMemo(() => {
    const word = query.trim().toLocaleLowerCase();
    const mothers = new Map(analysis.mothers.map(mother => [mother.key, mother]));
    return report.mothers.filter(row => !word || `${row.name} ${row.earTag} ${mothers.get(row.key)?.identificationNumber || ''}`.toLocaleLowerCase().includes(word))
      .sort((a, b) => {
        if (sort.startsWith('interval')) {
          const av = calvings.byMother.get(a.key)!.averageInterval, bv = calvings.byMother.get(b.key)!.averageInterval;
          if (av === null && bv !== null) return 1;
          if (av !== null && bv === null) return -1;
          if (av !== null && bv !== null && av !== bv) return (av - bv) * (sort.endsWith('desc') ? -1 : 1);
        }
        return a.earTag.localeCompare(b.earTag, 'ja', { numeric: true }) || a.name.localeCompare(b.name, 'ja');
      });
  }, [analysis, report, calvings, query, sort]);
  const years = [...new Set([asOf.slice(0, 4), ...(year ? [year] : []), ...analysis.mothers.flatMap(m => m.calvings.map(c => c.date.slice(0, 4))), ...report.services.map(s => s.date.slice(0, 4))])].sort().reverse();
  const total = report.total;
  const comparisonMetrics = [
    { key: 'interval', label: '平均分娩間隔', unit: '日', get: (r: EfficiencyRow) => calvings.byMother.get(r.key)!.averageInterval, sample: (r: EfficiencyRow) => `計算対象 ${calvings.byMother.get(r.key)!.intervalCount}間隔`, reference: calvings.total.averageInterval },
    { key: 'calvings', label: '分娩回数', unit: '回', get: (r: EfficiencyRow) => calvings.byMother.get(r.key)!.calvingCount, sample: () => '対象期間内の実分娩記録', reference: null },
    { key: 'services', label: '授精・ET実施回数', unit: '回', get: (r: EfficiencyRow) => r.serviceCount, sample: (r: EfficiencyRow) => `人工授精 ${r.aiCount}回・ET ${r.etCount}回`, reference: null },
    { key: 'firstServiceDays', label: '分娩後初回の授精・移植', unit: '日', get: (r: EfficiencyRow) => r.firstServiceDays, sample: (r: EfficiencyRow) => `計算対象 ${r.firstServiceCount}件／${firstServiceMethods(r)}`, reference: total.firstServiceDays },
    { key: 'daysOpen', label: '空胎日数', unit: '日', get: (r: EfficiencyRow) => r.daysOpen, sample: (r: EfficiencyRow) => `計算対象 ${r.openCount}件（ET含む）`, reference: total.daysOpen },
    { key: 'conceptionRate', label: '受胎率', unit: '%', get: (r: EfficiencyRow) => r.conceptionRate, sample: (r: EfficiencyRow) => `受胎 ${r.conceivedCount} / 授精・移植 ${r.serviceCount}回・未確定 ${r.unresolvedCount}回`, reference: total.conceptionRate },
  ];
  const chartMetric = comparisonMetrics.find(item => item.key === metric)!;
  const fieldSx = { minWidth: 0, flex: 1, '& .MuiInputBase-root': { minHeight: 48 } };
  const cycleReference = (row: EfficiencyRow) => {
    const reference = cycleReferences.get(row.key)!;
    return <Stack spacing={.5} sx={{ minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
      {reference.blockedReason ? <Typography variant="body2">{reference.blockedReason}</Typography> : <>
        <Typography variant="body2">発情発見率：<strong>{referenceRate(reference, 'heatDetectionRate')}</strong></Typography>
        <Typography variant="body2">妊娠率：<strong>{referenceRate(reference, 'pregnancyRate')}</strong></Typography>
      </>}
      {reference.serviceDate && <Typography variant="caption" color="text.secondary">{reference.start.replace(/-/g, '/')}〜{reference.end.replace(/-/g, '/')}<br />対象候補 {reference.candidateCount}頭{reference.reviewCount > 0 ? `／要確認${reference.reviewCount}頭は含まず` : ''}</Typography>}
      {reference.cycle && reference.cycle.missingHeatCount > 0 && <Typography variant="caption" color="text.secondary">期間内の発情記録なし {reference.cycle.missingHeatCount}回</Typography>}
    </Stack>;
  };
  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <Typography component="h2" variant="h6" fontWeight={900}>母牛の繁殖成績</Typography>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
      <TextField label="母牛を検索" helperText="名号・耳標番号・個体識別番号" value={query} onChange={e => onQueryChange(e.target.value)} sx={{ ...fieldSx, flex: 2 }} />
      <TextField select label="実績を振り返る年" value={year} onChange={e => onYearChange(e.target.value)} sx={fieldSx} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
        <MenuItem value="">全期間</MenuItem>{years.map(y => <MenuItem key={y} value={y}>{y}年</MenuItem>)}
      </TextField>
      <TextField select label="並び順" value={sort} onChange={e => setSort(e.target.value)} sx={fieldSx}>
        <MenuItem value="name">耳標番号順</MenuItem><MenuItem value="interval-asc">分娩間隔が短い順</MenuItem><MenuItem value="interval-desc">分娩間隔が長い順</MenuItem>
      </TextField>
    </Stack>
    <Typography variant="body2" color="text.secondary">{year ? `${year}年` : '全期間'} ／ 分娩実績と分娩後の日数は分娩日、受胎率は授精日・移植日で期間を選びます。鑑定結果は{date(asOf)}時点です。</Typography>
    <Box component="section" aria-label="農場全体の繁殖実績">
      <Typography fontWeight={800} sx={{ mb: 1 }}>農場全体の実績</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))', lg: 'repeat(4,minmax(0,1fr))' }, gap: 1.5 }}>
        <Metric label="平均分娩間隔" value={fmt(calvings.total.averageInterval, '日')} note={`計算対象 ${calvings.total.intervalCount}間隔。期間内の分娩 ${calvings.total.calvingCount}回。`} />
        <Metric label="分娩後初回の授精・移植" value={fmt(total.firstServiceDays, '日')} note={`平均／計算対象 ${total.firstServiceCount}件。${firstServiceMethods(total)}。`} />
        <Metric label="空胎日数" value={fmt(total.daysOpen, '日')} note={`平均／計算対象 ${total.openCount}件。人工授精・ETの成立日基準。`} />
        <Metric label="受胎率" value={fmt(total.conceptionRate, '%')} note={`受胎 ${total.conceivedCount} / 授精・移植 ${total.serviceCount}回（人工授精 ${total.aiCount}回・ET ${total.etCount}回）。未確定 ${total.unresolvedCount}回。`} />
      </Box>
    </Box>
    <Alert severity="info">初回授精・移植は、分娩後に保存済み記録で確認できる最初の実施です。人工授精の目安40〜50日をET移植日には当てはめません。受胎前の経過日数は、確定した空胎日数の平均に混ぜません。</Alert>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
      <Typography variant="body2" color="text.secondary">表示中 {rows.length}頭／全{report.mothers.length}頭。農場全体の実績・参考値は検索で変わりません。</Typography>
      <ToggleButtonGroup exclusive value={display} onChange={(_, v) => v && setDisplay(v)} aria-label="繁殖成績の表示方法">
        <ToggleButton value="table" sx={{ minHeight: 44 }}>一覧表</ToggleButton><ToggleButton value="chart" sx={{ minHeight: 44 }}>グラフ</ToggleButton>
      </ToggleButtonGroup>
    </Stack>
    <Typography variant="body2" color="text.secondary">発情発見率・妊娠率は、その牛の直近の授精日・移植日まで21日間の「農場の参考値」です。発情は授精・移植の有無にかかわらず記録から数えます。産後40日以降の候補で集計します（体調・休養は未確認）。</Typography>
    {display === 'chart' ? <Stack spacing={2}>
      <TextField select label="比較する繁殖成績" value={metric} onChange={e => setMetric(e.target.value as ComparisonMetric)} sx={{ maxWidth: 420 }}>
        {comparisonMetrics.map(item => <MenuItem key={item.key} value={item.key}>{item.label}</MenuItem>)}
      </TextField>
      <AnalysisBarChart title={`母牛別の${chartMetric.label}`} unit={chartMetric.unit} format={v => fmt(v, chartMetric.unit)}
        items={rows.map(row => ({ key: row.key, label: motherLabel(row), value: chartMetric.get(row), sample: chartMetric.sample(row) }))}
        reference={chartMetric.reference !== null ? { value: chartMetric.reference, label: '農場全体の実績平均' } : undefined} onSelect={onSelectMother} />
    </Stack> : <>
      <Box sx={{ display: { xs: 'none', md: 'block' }, minWidth: 0, maxWidth: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small" aria-label="母牛別の繁殖成績" sx={{ width: '100%', minWidth: 0, tableLayout: 'fixed', '& th, & td': { whiteSpace: 'normal', overflowWrap: 'anywhere', p: 1.5 } }}>
          <TableHead><TableRow>
            <TableCell sx={{ width: '15%' }}>母牛</TableCell><TableCell sx={{ width: '18%' }}>分娩実績</TableCell><TableCell sx={{ width: '22%' }}>分娩後の日数</TableCell><TableCell sx={{ width: '20%' }}>受胎率</TableCell>
            <TableCell sx={{ width: '25%' }}>授精・移植時の農場成績<Typography variant="caption" display="block">発情発見率・妊娠率（参考値）</Typography></TableCell>
          </TableRow></TableHead>
          <TableBody>{rows.map(row => <TableRow key={row.key} selected={selectedMotherKey === row.key}>
            <TableCell><Typography fontWeight={800}>{row.name}</Typography><Typography variant="caption" display="block">耳標 {row.earTag || '未登録'}</Typography>
              <Button onClick={() => onSelectMother(row.key)} aria-label={`${motherLabel(row)}の詳細`} sx={{ minHeight: 44, px: 0 }}>詳細</Button></TableCell>
            <TableCell><CalvingMetrics summary={calvings.byMother.get(row.key)!} /></TableCell>
            <TableCell><DayMetrics row={row} /></TableCell>
            <TableCell><ConceptionSummary row={row} /></TableCell>
            <TableCell>{cycleReference(row)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </Box>
      <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>{rows.map(row => <Card key={row.key} variant="outlined" sx={{ minWidth: 0, borderColor: selectedMotherKey === row.key ? 'primary.main' : 'divider' }}><CardContent sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
        <Typography component="h3" fontWeight={900}>{motherLabel(row)}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))' }, gap: 1.5, my: 1.5 }}>
          <Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={800} sx={{ mb: .5 }}>分娩実績</Typography><CalvingMetrics summary={calvings.byMother.get(row.key)!} /></Box>
          <Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={800} sx={{ mb: .5 }}>分娩後の日数</Typography><DayMetrics row={row} /></Box>
        </Box>
        <Box><Typography variant="body2" fontWeight={800} sx={{ mb: .5 }}>受胎率</Typography><ConceptionSummary row={row} /></Box>
        <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}><Typography variant="body2" fontWeight={800}>授精・移植時の農場成績（参考値）</Typography>{cycleReference(row)}</Box>
        <Button variant="outlined" fullWidth onClick={() => onSelectMother(row.key)} sx={{ mt: 1.5, minHeight: 44 }}>{motherLabel(row)}の詳細</Button>
      </CardContent></Card>)}</Stack>
    </>}
    {!rows.length && <Alert severity="info">{query ? '検索条件に合う母牛がいません。' : '母牛の台帳記録がまだありません。'}</Alert>}
  </Stack>;
}
