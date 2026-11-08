import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent,
  Checkbox, FormControlLabel, MenuItem, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { AnalysisBarChart } from '../components/AnalysisBarChart';
import type { MaternalAnalysis } from '../utils/maternalAnalysis';
import { buildCycleEfficiency, buildReproductiveEfficiency, shiftAnalysisDate, type EfficiencyRow } from '../utils/reproductiveEfficiency';

const fmt = (n: number | null, unit: string) => n === null ? '記録不足・要確認' : `${Number(n.toFixed(1)).toLocaleString('ja-JP')}${unit}`;
function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <Card variant="outlined"><CardContent sx={{ px: { xs: 1.5, sm: 2 } }}>
    <Typography component="h3" fontSize=".9rem" color="text.secondary">{label}</Typography>
    <Typography fontWeight={900} sx={{ fontSize: { xs: '1.15rem', sm: '1.45rem' }, my: 1, overflowWrap: 'anywhere' }}>{value}</Typography>
    <Typography variant="caption" color="text.secondary">{note}</Typography>
  </CardContent></Card>;
}
const comparisonMetrics = {
  firstAiDays: { label: '分娩後初回授精日数', unit: '日', sample: (r: EfficiencyRow) => `${r.firstAiCount}分娩の実績` },
  daysOpen: { label: '空胎日数', unit: '日', sample: (r: EfficiencyRow) => `${r.openCount}受胎の実績（ET含む）` },
  conceptionRate: { label: '受胎率', unit: '%', sample: (r: EfficiencyRow) => `受胎 ${r.conceivedCount} / 授精 ${r.aiCount}回・未確定 ${r.unresolvedCount}回` },
};
type ComparisonMetric = keyof typeof comparisonMetrics;

export function ReproductiveEfficiencyPanel({ analysis, asOf }: { analysis: MaternalAnalysis; asOf: string }) {
  const [year, setYear] = useState(asOf.slice(0, 4));
  const [display, setDisplay] = useState<'table' | 'chart'>('table');
  const [metric, setMetric] = useState<ComparisonMetric>('firstAiDays');
  const [cycleStart, setCycleStart] = useState(() => shiftAnalysisDate(asOf, -20));
  const [eligibleKeys, setEligibleKeys] = useState<string[]>([]);
  const report = useMemo(() => buildReproductiveEfficiency(analysis, asOf, year), [analysis, asOf, year]);
  const cycle = useMemo(() => buildCycleEfficiency(analysis, report, cycleStart, eligibleKeys, asOf), [analysis, report, cycleStart, eligibleKeys, asOf]);
  const years = [...new Set([asOf.slice(0, 4), ...analysis.mothers.flatMap(m => m.calvings.map(c => c.date.slice(0, 4))), ...report.services.map(s => s.date.slice(0, 4))])].sort().reverse();
  const total = report.total;
  const chartMetric = comparisonMetrics[metric];
  const summary = (row: EfficiencyRow) => <>
    <Typography variant="body2">分娩後初回授精：{fmt(row.firstAiDays, '日')}（{row.firstAiCount}分娩）</Typography>
    <Typography variant="body2">空胎日数：{fmt(row.daysOpen, '日')}（{row.openCount}受胎）</Typography>
    <Typography variant="body2">受胎率：{fmt(row.conceptionRate, '%')}（受胎 {row.conceivedCount} / 授精 {row.aiCount}回、未確定 {row.unresolvedCount}回）</Typography>
  </>;
  return <Stack spacing={2}>
    <Box>
      <Typography component="h2" variant="h6" fontWeight={900}>繁殖成績を5つの指標で確認</Typography>
      <Typography color="text.secondary" variant="body2">分娩後の経過と授精の実績、21日間の発情発見・妊娠効率を分けて確認できます。</Typography>
    </Box>
    <TextField select label="実績を振り返る年" value={year} onChange={e => setYear(e.target.value)} sx={{ maxWidth: 360 }} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
      <MenuItem value="">全期間</MenuItem>{years.map(y => <MenuItem key={y} value={y}>{y}年</MenuItem>)}
    </TextField>
    <Typography variant="body2" color="text.secondary">{year ? `${year}年` : '全期間'} ／ 初回授精日数・空胎日数は分娩日、受胎率は授精日で期間を選びます。鑑定結果は{asOf.replace(/-/g, '/')}時点です。</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3,minmax(0,1fr))' }, gap: 1.5 }}>
      <Metric label="分娩後初回授精日数" value={fmt(total.firstAiDays, '日')} note={`平均／${total.firstAiCount}分娩の初回授精。目安40〜50日。`} />
      <Metric label="空胎日数" value={fmt(total.daysOpen, '日')} note={`平均／受胎確認済み${total.openCount}件。人工授精・ETの成立日基準。`} />
      <Metric label="受胎率" value={fmt(total.conceptionRate, '%')} note={`受胎 ${total.conceivedCount} / 人工授精 ${total.aiCount}回。結果未確定・要確認 ${total.unresolvedCount}回。`} />
    </Box>
    <Alert severity="info">初回授精は保存済み記録で確認できる最初の人工授精です。40〜50日は管理の目安で、産後の回復を診断する値ではありません。受胎前の経過日数は、確定した空胎日数の平均に混ぜません。</Alert>

    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
      <Typography component="h2" variant="h6" fontWeight={800}>母牛ごとの繁殖成績</Typography>
      <ToggleButtonGroup exclusive value={display} onChange={(_, v) => v && setDisplay(v)} aria-label="繁殖成績の表示方法">
        <ToggleButton value="table" sx={{ minHeight: 44 }}>一覧表</ToggleButton><ToggleButton value="chart" sx={{ minHeight: 44 }}>グラフ</ToggleButton>
      </ToggleButtonGroup>
    </Stack>
    {display === 'chart' ? <Stack spacing={2}>
      <TextField select label="比較する繁殖成績" value={metric} onChange={e => setMetric(e.target.value as ComparisonMetric)} sx={{ maxWidth: 360 }}>
        {Object.entries(comparisonMetrics).map(([key, m]) => <MenuItem key={key} value={key}>{m.label}</MenuItem>)}
      </TextField>
      <AnalysisBarChart title={`母牛別の${chartMetric.label}`} unit={chartMetric.unit} format={v => fmt(v, chartMetric.unit)}
        items={report.mothers.map(r => ({ key: r.key, label: `${r.name}（耳標 ${r.earTag || '未登録'}）`, value: r[metric], sample: chartMetric.sample(r) }))}
        reference={{ value: total[metric], label: '農場全体の実績平均' }} />
    </Stack> : <>
      <Box sx={{ display: { xs: 'none', md: 'block' }, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small" aria-label="母牛別の繁殖成績" sx={{ tableLayout: 'fixed', '& th, & td': { overflowWrap: 'anywhere', p: 1.5 } }}>
          <TableHead><TableRow><TableCell>母牛</TableCell><TableCell>分娩後初回授精日数</TableCell><TableCell>空胎日数</TableCell><TableCell>受胎率</TableCell></TableRow></TableHead>
          <TableBody>{report.mothers.map(row => <TableRow key={row.key}>
            <TableCell><Typography fontWeight={800}>{row.name}</Typography><Typography variant="caption">耳標 {row.earTag || '未登録'}</Typography></TableCell>
            <TableCell>{fmt(row.firstAiDays, '日')}<Typography variant="caption" display="block">{row.firstAiCount}分娩</Typography></TableCell>
            <TableCell>{fmt(row.daysOpen, '日')}<Typography variant="caption" display="block">{row.openCount}受胎</Typography></TableCell>
            <TableCell>{fmt(row.conceptionRate, '%')}<Typography variant="caption" display="block">受胎 {row.conceivedCount} / 授精 {row.aiCount}回<br />未確定 {row.unresolvedCount}回</Typography></TableCell>
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
          <Typography variant="body2">初回授精 {e.firstAiDate || '記録なし'} ／ {fmt(e.firstAiDays, '日')}</Typography>
          <Typography variant="body2">受胎成立 {e.conceptionDate || '未確認・日付要確認'} {e.conceptionMethod} ／ 空胎日数 {fmt(e.daysOpen, '日')}</Typography>
          {e.elapsedUnconfirmedDays !== null && <Typography variant="body2" color="text.secondary">受胎未確認の経過：分娩から{e.elapsedUnconfirmedDays}日（空胎日数の平均には含めません）</Typography>}
        </Box>)}
        <Button component={RouterLink} to={`/cattle/${encodeURIComponent(row.key)}`} sx={{ minHeight: 44, mt: 1 }}>牛台帳を見る</Button>
      </Box>)}
    </Stack></AccordionDetails></Accordion>

    <Box sx={{ pt: 2 }}><Typography component="h2" variant="h6" fontWeight={900}>21日間の発情発見率・妊娠率</Typography>
      <Typography variant="body2" color="text.secondary">上の年別集計とは別に、同じ21日間・同じ対象牛で計算します。期間内の授精に対する鑑定結果は、本日時点の記録を使います。</Typography>
    </Box>
    <TextField type="date" label="21日間の開始日" value={cycleStart} onChange={e => { setCycleStart(e.target.value); setEligibleKeys([]); }} InputLabelProps={{ shrink: true }} sx={{ maxWidth: 360 }}
      inputProps={{ max: shiftAnalysisDate(asOf, -20) }} helperText={cycle.end ? `${cycleStart} 〜 ${cycle.end}（両端を含め21日）` : '正しい開始日を入力してください'} />
    <Accordion disableGutters defaultExpanded><AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={700}>授精対象牛を選ぶ（{cycle.eligibleCount}頭）</Typography></AccordionSummary><AccordionDetails>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>期間開始時に在籍し、産後の回復・繁殖方針を確認して授精対象だった未妊娠牛を選んでください。妊娠中・休養中・ET対象の牛は除きます。選択はこの画面の集計だけに使います。</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))' }, gap: 0.5 }}>
        {analysis.mothers.map(m => <FormControlLabel key={m.key} sx={{ m: 0, minWidth: 0, '& .MuiFormControlLabel-label': { overflowWrap: 'anywhere' } }}
          control={<Checkbox checked={eligibleKeys.includes(m.key)} onChange={(_, checked) => setEligibleKeys(keys => checked ? [...keys, m.key] : keys.filter(k => k !== m.key))} />}
          label={`${m.name}（耳標 ${m.earTag || '未登録'}）`} />)}
      </Box>
    </AccordionDetails></Accordion>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3,minmax(0,1fr))' }, gap: 1.5 }}>
      <Metric label="発情発見率（21日間）" value={fmt(cycle.heatDetectionRate, '%')} note={`発情日と授精日を確認 ${cycle.detectedCount}頭 / 授精対象 ${cycle.eligibleCount}頭`} />
      <Metric label="受胎率（同じ21日間の授精）" value={fmt(cycle.conceptionRate, '%')} note={`受胎 ${cycle.conceivedCount} / 授精 ${cycle.aiCount}回。未確定・要確認 ${cycle.unresolvedCount}回。`} />
      <Metric label="妊娠率（21日間）" value={fmt(cycle.pregnancyRate, '%')} note="発情発見率 × 同じ21日間の受胎率 ÷ 100" />
    </Box>
    {cycle.issues.map(issue => <Alert key={issue} severity="info">{issue}</Alert>)}
    <Accordion disableGutters><AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={700}>計算方法・集計元の確認{report.issues.length ? `（${report.issues.length}項目）` : ''}</Typography></AccordionSummary><AccordionDetails><Stack spacing={1}>
      <Typography variant="body2">分娩後初回授精日数＝分娩後の最初の人工授精日−分娩日。次の分娩より前の記録を使います。ET移植日は初回授精日には使いません。</Typography>
      <Typography variant="body2">空胎日数＝受胎が確認された授精日−分娩日。妊娠鑑定日では計算しません。ETでは保存された発情日を妊娠成立日の基準にし、発情日がなければ計算しません。妊娠成立日が確認できる実績だけの平均です。</Typography>
      <Typography variant="body2">受胎率＝受胎確認できた人工授精回数÷人工授精回数×100。未鑑定・再鑑定・流産など結果を確定できない記録が残る場合は「記録不足・要確認」と表示します。ETは除外し、従来の「確定妊鑑の受胎割合」とは分けています。</Typography>
      <Typography variant="body2">発情発見率＝21日間に発情日と人工授精日を確認できた牛の頭数÷選択した授精対象頭数×100。同じ牛は1頭と数えます。発情日がない授精があれば率は確定しません。対象牛は記録だけから自動判定せず、ご自身で選びます。</Typography>
      <Typography variant="body2">妊娠率＝発情発見率×同じ対象牛・同じ21日間の受胎率÷100。1頭に期間内の複数授精がある場合は、頭数と授精回数の基準が揃わないため、その期間の受胎率・妊娠率を計算しません。対象0頭・授精0回など分母がない値も0%にはしません。</Typography>
      <Typography variant="body2">農場平均は母牛ごとの平均の平均ではなく、実績を1件ずつ集計します。記録不足、母牛照合の不一致や重複は、元の記録を確認してください。</Typography>
      {report.issues.map(issue => <Alert key={issue} severity="warning">{issue}</Alert>)}
      {analysis.issues.map(issue => <Alert key={issue} severity="warning">{issue}</Alert>)}
    </Stack></AccordionDetails></Accordion>
  </Stack>;
}
