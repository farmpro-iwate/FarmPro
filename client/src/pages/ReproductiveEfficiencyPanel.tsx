import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent,
  MenuItem, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { AnalysisBarChart } from '../components/AnalysisBarChart';
import type { MaternalAnalysis } from '../utils/maternalAnalysis';
import { buildReproductiveEfficiency, type EfficiencyRow } from '../utils/reproductiveEfficiency';
import { buildMotherCycleReferences, referenceRate } from '../utils/motherCycleReferences';

const fmt = (n: number | null, unit: string) => n === null ? '記録不足・要確認' : `${Number(n.toFixed(1)).toLocaleString('ja-JP')}${unit}`;
function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <Card variant="outlined"><CardContent sx={{ px: { xs: 1.5, sm: 2 } }}>
    <Typography component="h3" fontSize=".9rem" color="text.secondary">{label}</Typography>
    <Typography fontWeight={900} sx={{ fontSize: { xs: '1.15rem', sm: '1.45rem' }, my: 1, overflowWrap: 'anywhere' }}>{value}</Typography>
    <Typography variant="caption" color="text.secondary">{note}</Typography>
  </CardContent></Card>;
}
const comparisonMetrics = {
  firstServiceDays: { label: '分娩後初回の授精・移植', unit: '日', sample: (r: EfficiencyRow) => `計算対象 ${r.firstServiceCount}件／${firstServiceMethods(r)}` },
  daysOpen: { label: '空胎日数', unit: '日', sample: (r: EfficiencyRow) => `計算対象 ${r.openCount}件（ET含む）` },
  conceptionRate: { label: '受胎率', unit: '%', sample: (r: EfficiencyRow) => `受胎 ${r.conceivedCount} / 授精・移植 ${r.serviceCount}回・未確定 ${r.unresolvedCount}回` },
};
type ComparisonMetric = keyof typeof comparisonMetrics;
function firstServiceMethods(row: EfficiencyRow) {
  const episodes = row.episodes.filter(e => e.firstServiceDays !== null);
  const ai = episodes.filter(e => e.firstServiceMethod === 'ai').length;
  const et = episodes.filter(e => e.firstServiceMethod === 'et').length;
  return [ai ? `人工授精 ${ai}件` : '', et ? `ET移植 ${et}件` : ''].filter(Boolean).join('・') || '記録を確認';
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

export function ReproductiveEfficiencyPanel({ analysis, asOf }: { analysis: MaternalAnalysis; asOf: string }) {
  const [year, setYear] = useState(asOf.slice(0, 4));
  const [display, setDisplay] = useState<'table' | 'chart'>('table');
  const [metric, setMetric] = useState<ComparisonMetric>('firstServiceDays');
  const report = useMemo(() => buildReproductiveEfficiency(analysis, asOf, year), [analysis, asOf, year]);
  const cycleReferences = useMemo(() => buildMotherCycleReferences(analysis, report, asOf, year), [analysis, report, asOf, year]);
  const years = [...new Set([asOf.slice(0, 4), ...analysis.mothers.flatMap(m => m.calvings.map(c => c.date.slice(0, 4))), ...report.services.map(s => s.date.slice(0, 4))])].sort().reverse();
  const total = report.total;
  const chartMetric = comparisonMetrics[metric];
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
  const summary = (row: EfficiencyRow) => <>
    <Typography variant="body2">分娩後初回の授精・移植：{fmt(row.firstServiceDays, '日')}（計算対象 {row.firstServiceCount}件）</Typography>
    {row.firstServiceCount > 0 && <Typography variant="caption" display="block">{firstServiceMethods(row)}</Typography>}
    <Typography variant="body2">空胎日数：{fmt(row.daysOpen, '日')}（計算対象 {row.openCount}件）</Typography>
    <Box sx={{ mt: 1 }}><Typography variant="body2" fontWeight={800}>受胎率</Typography><ConceptionSummary row={row} /></Box>
    <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}><Typography variant="body2" fontWeight={800}>授精・移植時の農場成績（参考値）</Typography>{cycleReference(row)}</Box>
  </>;
  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <Box>
      <Typography component="h2" variant="h6" fontWeight={900}>繁殖成績を5つの指標で確認</Typography>
      <Typography color="text.secondary" variant="body2">分娩後の経過と人工授精・ETの実績、当時の農場成績を確認できます。</Typography>
    </Box>
    <TextField select label="実績を振り返る年" value={year} onChange={e => setYear(e.target.value)} sx={{ maxWidth: 360 }} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
      <MenuItem value="">全期間</MenuItem>{years.map(y => <MenuItem key={y} value={y}>{y}年</MenuItem>)}
    </TextField>
    <Typography variant="body2" color="text.secondary">{year ? `${year}年` : '全期間'} ／ 初回の授精・移植までの日数と空胎日数は分娩日、受胎率は授精日・移植日で期間を選びます。鑑定結果は{asOf.replace(/-/g, '/')}時点です。</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3,minmax(0,1fr))' }, gap: 1.5 }}>
      <Metric label="分娩後初回の授精・移植" value={fmt(total.firstServiceDays, '日')} note={`平均／計算対象 ${total.firstServiceCount}件。${firstServiceMethods(total)}。`} />
      <Metric label="空胎日数" value={fmt(total.daysOpen, '日')} note={`平均／計算対象 ${total.openCount}件。人工授精・ETの成立日基準。`} />
      <Metric label="受胎率" value={fmt(total.conceptionRate, '%')} note={`受胎 ${total.conceivedCount} / 授精・移植 ${total.serviceCount}回（人工授精 ${total.aiCount}回・ET ${total.etCount}回）。未確定 ${total.unresolvedCount}回。`} />
    </Box>
    <Alert severity="info">保存済み記録から、分娩後の最初の人工授精・ET移植までの日数を表示します。人工授精の目安40〜50日をET移植日には当てはめません。受胎前の経過日数は、確定した空胎日数の平均に混ぜません。</Alert>

    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
      <Typography component="h2" variant="h6" fontWeight={800}>母牛ごとの繁殖成績</Typography>
      <ToggleButtonGroup exclusive value={display} onChange={(_, v) => v && setDisplay(v)} aria-label="繁殖成績の表示方法">
        <ToggleButton value="table" sx={{ minHeight: 44 }}>一覧表</ToggleButton><ToggleButton value="chart" sx={{ minHeight: 44 }}>グラフ</ToggleButton>
      </ToggleButtonGroup>
    </Stack>
    {display === 'table' && <Typography variant="body2" color="text.secondary">発情発見率・妊娠率は、その牛の直近の授精日・移植日まで21日間の「農場の参考値」です。発情は授精・移植の有無にかかわらず記録から数えます。産後40日以降の候補で集計します（体調・休養は未確認）。</Typography>}
    {display === 'chart' ? <Stack spacing={2}>
      <TextField select label="比較する繁殖成績" value={metric} onChange={e => setMetric(e.target.value as ComparisonMetric)} sx={{ maxWidth: 360 }}>
        {Object.entries(comparisonMetrics).map(([key, m]) => <MenuItem key={key} value={key}>{m.label}</MenuItem>)}
      </TextField>
      <AnalysisBarChart title={`母牛別の${chartMetric.label}`} unit={chartMetric.unit} format={v => fmt(v, chartMetric.unit)}
        items={report.mothers.map(r => ({ key: r.key, label: `${r.name}（耳標 ${r.earTag || '未登録'}）`, value: r[metric], sample: chartMetric.sample(r) }))}
        reference={{ value: total[metric], label: '農場全体の実績平均' }} />
    </Stack> : <>
      <Box sx={{ display: { xs: 'none', md: 'block' }, minWidth: 0, maxWidth: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small" aria-label="母牛別の繁殖成績" sx={{ width: '100%', minWidth: 0, tableLayout: 'fixed', '& th, & td': { whiteSpace: 'normal', overflowWrap: 'anywhere', p: 1.5 } }}>
          <TableHead><TableRow><TableCell sx={{ width: '18%' }}>母牛</TableCell><TableCell sx={{ width: '18%' }}>分娩後初回の授精・移植</TableCell><TableCell sx={{ width: '16%' }}>空胎日数</TableCell><TableCell sx={{ width: '18%' }}>受胎率</TableCell><TableCell sx={{ width: '30%' }}>授精・移植時の農場成績<Typography variant="caption" display="block">発情発見率・妊娠率（参考値）</Typography></TableCell></TableRow></TableHead>
          <TableBody>{report.mothers.map(row => <TableRow key={row.key}>
            <TableCell><Typography fontWeight={800}>{row.name}</Typography><Typography variant="caption">耳標 {row.earTag || '未登録'}</Typography></TableCell>
            <TableCell>{fmt(row.firstServiceDays, '日')}<Typography variant="caption" display="block">計算対象 {row.firstServiceCount}件{row.firstServiceCount > 0 && <><br />{firstServiceMethods(row)}</>}</Typography></TableCell>
            <TableCell>{fmt(row.daysOpen, '日')}<Typography variant="caption" display="block">計算対象 {row.openCount}件</Typography></TableCell>
            <TableCell><ConceptionSummary row={row} /></TableCell>
            <TableCell>{cycleReference(row)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </Box>
      <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>{report.mothers.map(row => <Card key={row.key} variant="outlined"><CardContent>
        <Typography component="h3" fontWeight={900}>{row.name}（耳標 {row.earTag || '未登録'}）</Typography>{summary(row)}
      </CardContent></Card>)}</Stack>
    </>}
    {!report.mothers.length && <Alert severity="info">母牛の台帳記録がまだありません。</Alert>}
    <Accordion disableGutters><AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={700}>母牛ごとの分娩後の経過</Typography></AccordionSummary><AccordionDetails><Stack spacing={1.5}>
      {report.mothers.map(row => <Box key={row.key} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Typography component="h3" fontWeight={800}>{row.name}（耳標 {row.earTag || '未登録'}）</Typography>
        {!row.episodes.length && <Typography variant="body2">対象年の分娩記録がありません。</Typography>}
        {row.episodes.map(e => <Box key={e.calvingDate} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography fontWeight={700}>分娩 {e.calvingDate}</Typography>
          <Typography variant="body2">初回の授精・移植 {e.firstServiceDate || '記録なし'} {e.firstServiceMethod === 'et' ? 'ET移植' : e.firstServiceMethod === 'ai' ? '人工授精' : ''} ／ {fmt(e.firstServiceDays, '日')}</Typography>
          <Typography variant="body2">受胎成立 {e.conceptionDate || '未確認・日付要確認'} {e.conceptionMethod} ／ 空胎日数 {fmt(e.daysOpen, '日')}</Typography>
          {e.elapsedUnconfirmedDays !== null && <Typography variant="body2" color="text.secondary">受胎未確認の経過：分娩から{e.elapsedUnconfirmedDays}日（空胎日数の平均には含めません）</Typography>}
        </Box>)}
        <Button component={RouterLink} to={`/cattle/${encodeURIComponent(row.key)}`} sx={{ minHeight: 44, mt: 1 }}>牛台帳を見る</Button>
      </Box>)}
    </Stack></AccordionDetails></Accordion>


  </Stack>;
}
