import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent,
  Chip, Divider, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow,
  Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { getMaternalSnapshot } from '../services/maternalAnalysisApi';
import { AnalysisBarChart } from '../components/AnalysisBarChart';
import { FarmPerformancePanel } from './FarmPerformancePanel';
import { ReproductiveEfficiencyPanel } from './ReproductiveEfficiencyPanel';
import {
  analysisMean, buildMaternalAnalysis, type MaternalSnapshot, type MotherAnalysis, type MotherBasis,
} from '../utils/maternalAnalysis';

const number = (n: number | null, unit = '') => n === null ? '記録不足' : `${Math.round(n).toLocaleString('ja-JP')}${unit}`;
const days = (n: number | null) => number(n, '日');
const yen = (n: number | null) => number(n, '円');
const date = (s: string) => s ? s.replace(/-/g, '/') : '記録なし';
function today() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }
const motherLabel = (row: MotherAnalysis) => `${row.name}（耳標 ${row.earTag || '未登録'}）`;
function pregnancy(row: MotherAnalysis) {
  return row.checkedCount ? `${Math.round(row.conceivedCount / row.checkedCount * 100)}%（${row.conceivedCount}/${row.checkedCount}件）` : '記録不足';
}
function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <Box sx={{ minWidth: 0 }}><Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
    {note && <Typography variant="caption" color="text.secondary">{note}</Typography>}</Box>;
}

export function MaternalAnalysisPage() {
  const [params, setParams] = useSearchParams();
  const scope = params.get('scope') === 'mothers' ? 'mothers' : params.get('scope') === 'efficiency' ? 'efficiency' : 'farm';
  const [snapshot, setSnapshot] = useState<MaternalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'breeding' | 'offspring'>('breeding');
  const [basis, setBasis] = useState<MotherBasis>('birth');
  const [sex, setSex] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const [presentation, setPresentation] = useState<'table' | 'chart'>('table');
  const [chartMetric, setChartMetric] = useState('interval');
  const [selected, setSelected] = useState('');
  const [asOf, setAsOf] = useState(today);
  const request = useRef(0);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const load = async () => {
    const version = ++request.current;
    setLoading(true); setError(''); setSnapshot(null);
    try {
      const value = await getMaternalSnapshot();
      if (version === request.current) { setSnapshot(value); setAsOf(today()); }
    } catch (err) {
      if (version === request.current) setError(err instanceof Error ? err.message : '分析用の記録を読み込めませんでした。');
    } finally { if (version === request.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { request.current++; }; }, []);
  const analysis = useMemo(() => snapshot ? buildMaternalAnalysis(snapshot, { today: asOf, basis, sex }) : null, [snapshot, asOf, basis, sex]);
  const rows = useMemo(() => {
    const word = query.trim().toLocaleLowerCase();
    return (analysis?.mothers || []).filter(row => !word || `${row.name} ${row.earTag} ${row.identificationNumber}`.toLocaleLowerCase().includes(word))
      .sort((a, b) => {
        let av: number | null = null, bv: number | null = null;
        if (sort.startsWith('interval')) { av = a.averageInterval; bv = b.averageInterval; }
        if (sort.startsWith('price')) { av = a.averagePrice; bv = b.averagePrice; }
        if (sort.startsWith('age')) { av = a.averageShippingAge; bv = b.averageShippingAge; }
        if (sort !== 'name') {
          if (av === null && bv !== null) return 1;
          if (av !== null && bv === null) return -1;
          if (av !== null && bv !== null && av !== bv) return (av - bv) * (sort.endsWith('desc') ? -1 : 1);
        }
        return a.earTag.localeCompare(b.earTag, 'ja', { numeric: true }) || a.name.localeCompare(b.name, 'ja');
      });
  }, [analysis, query, sort]);
  const selectedRow = rows.find(r => r.key === selected);
  useEffect(() => {
    if (selectedRow) { detailHeading.current?.focus({ preventScroll: true }); detailHeading.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }
  }, [selected]);
  const allIntervals = rows.flatMap(r => r.intervals);
  const allPrices = rows.flatMap(r => r.offspring.flatMap(c => c.price !== null && !c.saleConflict ? [c.price] : []));
  const allAges = rows.flatMap(r => r.offspring.flatMap(c => c.shippingAge !== null && !c.saleConflict ? [c.shippingAge] : []));
  const comparisonMetrics = view === 'breeding' ? [
    { key: 'interval', label: '平均分娩間隔', unit: '日', get: (r: MotherAnalysis) => r.averageInterval, sample: (r: MotherAnalysis) => `${r.intervals.length}間隔` },
    { key: 'calvings', label: '分娩回数', unit: '回', get: (r: MotherAnalysis) => r.calvings.length, sample: () => '実績日がある分娩' },
    { key: 'services', label: '授精・ET実施回数', unit: '回', get: (r: MotherAnalysis) => r.serviceCount, sample: () => '実施日の記録あり' },
    { key: 'pregnancy', label: '確定妊鑑の受胎割合', unit: '%', get: (r: MotherAnalysis) => r.checkedCount ? r.conceivedCount / r.checkedCount * 100 : null, sample: (r: MotherAnalysis) => `受胎 ${r.conceivedCount} / 確定鑑定 ${r.checkedCount}件` },
  ] : [
    { key: 'price', label: '平均販売価格', unit: '円', get: (r: MotherAnalysis) => r.averagePrice, sample: (r: MotherAnalysis) => `${r.priceCount}頭・件` },
    { key: 'shipping', label: '平均出荷日齢', unit: '日', get: (r: MotherAnalysis) => r.averageShippingAge, sample: (r: MotherAnalysis) => `${r.shippingCount}頭` },
    { key: 'offspring', label: '産子の記録数', unit: '頭・件', get: (r: MotherAnalysis) => r.offspring.length, sample: () => '選択中の母牛区分・性別' },
  ];
  const comparisonMetric = comparisonMetrics.find(m => m.key === chartMetric) || comparisonMetrics[0];
  const allMothers = analysis?.mothers || [];
  const globalChildren = allMothers.flatMap(r => r.offspring).filter(c => !c.saleConflict);
  const checked = allMothers.reduce((n, r) => n + r.checkedCount, 0);
  const comparisonReference = comparisonMetric.key === 'interval' ? analysisMean(allMothers.flatMap(r => r.intervals))
    : comparisonMetric.key === 'price' ? analysisMean(globalChildren.flatMap(c => c.price !== null ? [c.price] : []))
      : comparisonMetric.key === 'shipping' ? analysisMean(globalChildren.flatMap(c => c.shippingAge !== null ? [c.shippingAge] : []))
        : comparisonMetric.key === 'pregnancy' && checked ? allMothers.reduce((n, r) => n + r.conceivedCount, 0) / checked * 100 : null;
  const fieldSx = { minWidth: 0, flex: 1, '& .MuiInputBase-root': { minHeight: 48 } };
  return <Stack spacing={2} sx={{ maxWidth: 1200, mx: 'auto', width: '100%', minWidth: 0 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} alignItems={{ sm: 'center' }}>
      <Box><Typography variant="h5" component="h1" fontWeight={900}>分析</Typography>
        <Typography color="text.secondary">農場全体の成績と母牛ごとの比較を、一覧表やグラフで確認できます。</Typography></Box>
      <Button variant="outlined" onClick={() => void load()} disabled={loading} sx={{ minHeight: 44, flexShrink: 0 }}>最新の記録で再集計</Button>
    </Stack>
    <Alert severity="info">この端末の全期間の記録で比較します。元の記録は変更しません。</Alert>
    <Tabs value={scope} onChange={(_, v) => { const next = new URLSearchParams(params); next.set('scope', v); setParams(next); }} variant="fullWidth" aria-label="分析の対象" sx={{ '& .MuiTab-root': { minHeight: 48, minWidth: 0, fontWeight: 800, px: 1 } }}>
      <Tab value="farm" label="農場全体" /><Tab value="mothers" label="母牛ごとの比較" />
      <Tab value="efficiency" label="繁殖効率" />
    </Tabs>
    {scope === 'mothers' && <Tabs value={view} onChange={(_, v) => { setView(v); setSort('name'); setChartMetric(v === 'breeding' ? 'interval' : 'price'); }} variant="fullWidth" aria-label="分析の種類" sx={{ '& .MuiTab-root': { minHeight: 48, minWidth: 0, fontWeight: 800, px: 1 } }}>
      <Tab value="breeding" label="母牛の繁殖成績" id="maternal-breeding-tab" aria-controls="maternal-comparison" />
      <Tab value="offspring" label="産子・販売成績" id="maternal-offspring-tab" aria-controls="maternal-comparison" />
    </Tabs>}
    {loading && <Typography role="status">記録を集計しています…</Typography>}
    {error && <Alert severity="error">{error}</Alert>}
    {analysis && <>
      {scope === 'farm' && <FarmPerformancePanel analysis={analysis} asOf={asOf} />}
      {scope === 'efficiency' && <ReproductiveEfficiencyPanel analysis={analysis} asOf={asOf} />}
      {scope === 'mothers' && <>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
        <TextField label="母牛を検索" helperText="名号・耳標番号・個体識別番号" value={query} onChange={e => setQuery(e.target.value)} sx={{ ...fieldSx, flex: 2 }} />
        <TextField select label="並び順" value={sort} onChange={e => setSort(e.target.value)} sx={fieldSx}>
          <MenuItem value="name">耳標番号順</MenuItem>
          {view === 'breeding' ? [<MenuItem key="i1" value="interval-asc">分娩間隔が短い順</MenuItem>, <MenuItem key="i2" value="interval-desc">分娩間隔が長い順</MenuItem>] : [
            <MenuItem key="p1" value="price-desc">平均販売価格が高い順</MenuItem>, <MenuItem key="p2" value="price-asc">平均販売価格が低い順</MenuItem>,
            <MenuItem key="a1" value="age-asc">出荷日齢が若い順</MenuItem>, <MenuItem key="a2" value="age-desc">出荷日齢が高い順</MenuItem>]}
        </TextField>
      </Stack>
      {view === 'offspring' && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField select label="産子をまとめる母牛" value={basis} onChange={e => setBasis(e.target.value as MotherBasis)} sx={fieldSx}>
          <MenuItem value="birth">分娩した母牛（代理母を含む）</MenuItem><MenuItem value="genetic">血統上の母牛（ET供卵母）</MenuItem>
        </TextField>
        <TextField select label="産子の性別" value={sex} onChange={e => setSex(e.target.value)} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} sx={fieldSx}>
          <MenuItem value="">すべて</MenuItem><MenuItem value="雄">雄</MenuItem><MenuItem value="去勢">去勢</MenuItem><MenuItem value="雌">雌</MenuItem>
        </TextField>
      </Stack>}
      <Typography variant="body2" color="text.secondary">{date(asOf)}時点 ／ 表示中 {rows.length}頭。平均は記録がある実績だけで計算し、対象件数を併記しています。</Typography>
      {analysis.issues.length > 0 && <Alert severity="warning">照合できない記録や集計から除外した記録があります。画面下の「集計方法と記録の確認」で内容を確認できます。</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
        {(view === 'breeding' ? [
          ['平均分娩間隔', days(analysisMean(allIntervals)), `${allIntervals.length}間隔の平均`],
          ['実績のある母牛', `${rows.filter(r => r.calvings.length).length}頭`, '分娩日が確認できる母牛'],
          ['記録上の分娩回数', `${rows.reduce((n, r) => n + r.calvings.length, 0)}回`, '同じ母牛・同じ日は1回'],
        ] : [
          ['平均販売価格', yen(analysisMean(allPrices)), `${allPrices.length}頭・件の価格記録`],
          ['平均出荷日齢', days(analysisMean(allAges)), `${allAges.length}頭の出荷実績`],
          ['産子の記録', `${rows.reduce((n, r) => n + r.offspring.length, 0)}頭・件`, '選択した母牛区分・性別で集計'],
        ]).map(([label, value, note]) => <Card key={label} variant="outlined"><CardContent><Metric label={label} value={value} note={note} /></CardContent></Card>)}
      </Box>
      {rows.length === 0 && <Alert severity="info">{query ? '検索条件に合う母牛がいません。' : '母牛の台帳記録がまだありません。牛台帳に登録されている母牛が分析の対象です。'}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Typography component="h2" variant="h6" fontWeight={800}>母牛ごとの比較</Typography>
        <ToggleButtonGroup exclusive value={presentation} onChange={(_, v) => v && setPresentation(v)} aria-label="母牛比較の表示方法" sx={{ '& .MuiToggleButton-root': { minHeight: 44, px: 3 } }}>
          <ToggleButton value="table">一覧表</ToggleButton><ToggleButton value="chart">グラフ</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Box id="maternal-comparison" role="tabpanel" aria-labelledby={`maternal-${view}-tab`}>
        {presentation === 'chart' ? <Stack spacing={2}>
          <TextField select label="比較する指標" value={comparisonMetric.key} onChange={e => setChartMetric(e.target.value)} sx={{ maxWidth: 420 }}>
            {comparisonMetrics.map(m => <MenuItem key={m.key} value={m.key}>{m.label}</MenuItem>)}
          </TextField>
          <AnalysisBarChart title={`母牛別の${comparisonMetric.label}`} unit={comparisonMetric.unit} format={n => number(n, comparisonMetric.unit)}
            items={rows.map(r => ({ key: r.key, label: motherLabel(r), value: comparisonMetric.get(r), sample: comparisonMetric.sample(r) }))}
            reference={comparisonReference !== null ? { value: comparisonReference, label: '全母牛の実績平均（現在の産子条件）' } : undefined} onSelect={setSelected} />
        </Stack> : <>
        <Box sx={{ display: { xs: 'none', md: 'block' }, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
          <Table size="small" aria-label={view === 'breeding' ? '母牛別の繁殖成績' : '母牛別の産子販売成績'} sx={{ tableLayout: 'fixed', '& th, & td': { overflowWrap: 'anywhere', px: 1, py: 1.5 } }}>
            <TableHead><TableRow><TableCell sx={{ width: '22%' }}>母牛</TableCell>
              {view === 'breeding' ? <><TableCell>分娩回数</TableCell><TableCell>平均分娩間隔</TableCell><TableCell>最終分娩日</TableCell><TableCell>授精・ET実施</TableCell><TableCell>確定妊鑑の受胎割合</TableCell></> : <><TableCell>産子記録</TableCell><TableCell>平均出荷日齢</TableCell><TableCell>平均販売価格</TableCell></>}
              <TableCell sx={{ width: 80 }}>履歴</TableCell></TableRow></TableHead>
            <TableBody>{rows.map(row => <TableRow key={row.key} selected={selected === row.key}>
              <TableCell><Typography fontWeight={800}>{row.name}</Typography><Typography variant="body2" color="text.secondary">耳標 {row.earTag || '未登録'}</Typography></TableCell>
              {view === 'breeding' ? <><TableCell>{row.calvings.length}回</TableCell><TableCell>{days(row.averageInterval)}<Typography variant="caption" display="block">{row.intervals.length}間隔</Typography></TableCell><TableCell>{date(row.calvings.slice(-1)[0]?.date || '')}</TableCell><TableCell>{row.serviceCount}回</TableCell><TableCell>{pregnancy(row)}</TableCell></> : <><TableCell>{row.offspring.length}頭・件</TableCell><TableCell>{days(row.averageShippingAge)}<Typography variant="caption" display="block">{row.shippingCount}頭</Typography></TableCell><TableCell>{yen(row.averagePrice)}<Typography variant="caption" display="block">{row.priceCount}頭・件</Typography></TableCell></>}
              <TableCell><Button onClick={() => setSelected(row.key)} aria-label={`${motherLabel(row)}の詳細`} sx={{ minHeight: 44 }}>詳細</Button></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </Box>
        <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>{rows.map(row => <Card key={row.key} variant="outlined"><CardContent>
          <Typography component="h2" fontWeight={900}>{row.name}</Typography><Typography color="text.secondary">耳標 {row.earTag || '未登録'}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 1.5, my: 2 }}>
            {view === 'breeding' ? <><Metric label="分娩回数" value={`${row.calvings.length}回`} /><Metric label="平均分娩間隔" value={days(row.averageInterval)} note={`${row.intervals.length}間隔`} /><Metric label="最終分娩日" value={date(row.calvings.slice(-1)[0]?.date || '')} /><Metric label="授精・ET実施" value={`${row.serviceCount}回`} /><Metric label="確定妊鑑の受胎割合" value={pregnancy(row)} /></> : <><Metric label="産子記録" value={`${row.offspring.length}頭・件`} /><Metric label="平均出荷日齢" value={days(row.averageShippingAge)} note={`${row.shippingCount}頭`} /><Metric label="平均販売価格" value={yen(row.averagePrice)} note={`${row.priceCount}頭・件`} /></>}
          </Box><Button variant="outlined" fullWidth onClick={() => setSelected(row.key)} sx={{ minHeight: 44 }}>{motherLabel(row)}の詳細</Button>
        </CardContent></Card>)}</Stack>
        </>}
      </Box>
      {selectedRow && <Card variant="outlined" sx={{ borderColor: 'primary.main' }}><CardContent><Stack spacing={2}>
        <Typography ref={detailHeading} tabIndex={-1} component="h2" variant="h6" fontWeight={900} sx={{ scrollMarginTop: 90 }}>{motherLabel(selectedRow)}の記録</Typography>
        <Button component={RouterLink} to={`/cattle/${encodeURIComponent(selectedRow.key)}`} variant="outlined" sx={{ alignSelf: 'flex-start', minHeight: 44 }}>牛台帳を見る</Button>
        <Box sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
          <Typography fontWeight={800}>記録から分かる特徴</Typography>
          <Typography>{selectedRow.intervals.length ? `分娩間隔は平均${days(selectedRow.averageInterval)}、最短${days(Math.min(...selectedRow.intervals))}〜最長${days(Math.max(...selectedRow.intervals))}（${selectedRow.intervals.length}間隔）。` : '分娩間隔を比較できる記録が不足しています。'}</Typography>
          <Typography>{selectedRow.priceCount ? `産子の平均販売価格は${yen(selectedRow.averagePrice)}（${selectedRow.priceCount}頭・件）。` : '比較できる産子の販売価格がまだありません。'}</Typography>
          <Typography>{selectedRow.shippingCount ? `平均出荷日齢は${days(selectedRow.averageShippingAge)}（${selectedRow.shippingCount}頭）。` : '生年月日と実出荷日が揃った記録がまだありません。'}</Typography>
          <Typography variant="body2" color="text.secondary">表示中の母牛全体：分娩間隔 {days(analysisMean(allIntervals))} ／ 販売価格 {yen(analysisMean(allPrices))}。価格は市場・販売年・性別・父牛などでも変わります。母牛の優劣を自動判定するものではありません。</Typography>
        </Box>
        <Typography component="h3" fontWeight={800}>分娩間隔の履歴</Typography>
        {!selectedRow.calvings.length && <Typography color="text.secondary">分娩日の記録がありません。</Typography>}
        {selectedRow.calvings.map(event => <Box key={event.date} sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}>
          <Typography fontWeight={700}>{date(event.date)} ／ {days(event.days)}</Typography>
          <Typography variant="body2" color="text.secondary">{event.previous ? `前回 ${date(event.previous)} からの日数` : event.days !== null ? '取込履歴に記載された分娩間隔' : '前回の分娩日がないため間隔は未計算'} ／ {event.source}</Typography>
        </Box>)}
        <Divider /><Typography component="h3" fontWeight={800}>過去の産子・出荷販売</Typography>
        <Typography variant="body2" color="text.secondary">{basis === 'birth' ? '分娩した母牛（代理母を含む）' : '血統上の母牛（ET供卵母）'}で集計 ／ 性別：{sex || 'すべて'}。ETの母牛区分は「産子・販売成績」で切り替えられます。</Typography>
        {!selectedRow.offspring.length && <Typography color="text.secondary">照合できる産子の記録がありません。</Typography>}
        {selectedRow.offspring.map(child => <Box key={child.key} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap"><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{child.name && child.name !== '耳標未装着' ? child.name : '子牛（名号未登録）'}</Typography>{child.et && <Chip label="ET" size="small" />}</Stack>
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>耳標 {child.number.startsWith('TEMP-') ? '未装着' : child.number || '記録なし'} ／ {child.sources.join('・')}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', sm: 'repeat(3,minmax(0,1fr))' }, gap: 1.5, mt: 1.5 }}>
            <Metric label="生年月日" value={date(child.birthday)} /><Metric label="性別" value={child.sex || '記録なし'} /><Metric label="父牛" value={child.sire || '記録なし'} />
            <Metric label="出荷日" value={date(child.shippingDate)} /><Metric label="出荷日齢" value={days(child.shippingAge)} /><Metric label="販売日" value={date(child.saleDate)} />
            <Metric label="販売価格" value={child.saleConflict ? '要確認・集計除外' : yen(child.price)} /><Metric label="出荷・販売体重" value={number(child.weight, 'kg')} />
          </Box>
          {child.et && <Typography variant="body2" sx={{ mt: 1 }}>分娩母：{analysis.mothers.find(m => m.key === child.birthMother)?.name || '台帳照合なし'} ／ 血統上の母：{analysis.mothers.find(m => m.key === child.geneticMother)?.name || '台帳照合なし'}</Typography>}
        </Box>)}
      </Stack></CardContent></Card>}
      <Accordion disableGutters><AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={700}>集計方法と記録の確認{analysis.issues.length ? `（${analysis.issues.length}項目）` : ''}</Typography></AccordionSummary><AccordionDetails><Stack spacing={1}>
        <Typography variant="body2">分娩回数は実分娩日・子牛の生年月日・取込履歴から確認できる回数です。台帳の産次とは異なる場合があります。同一母牛・同日は1回とし、予定日は含めません。</Typography>
        <Typography variant="body2">分娩間隔は隣り合う実績日の差です。最初の実績だけは、取込履歴に記載された間隔があれば使います。産子の性別・母牛区分を変えても、分娩間隔と繁殖成績は変わりません。</Typography>
        <Typography variant="body2">確定妊鑑の受胎割合＝受胎確認件数÷受胎・不受胎が確定した鑑定件数。授精・ETの実施日と鑑定日がある記録が対象です。未鑑定・再確認・旧形式の繁殖記録は分母に含めません。</Typography>
        <Typography variant="body2">出荷日齢＝実出荷日−生年月日（生まれた日は0日）。販売日や出荷予定日では代用しません。価格は販売済みの販売額と取込産子履歴の記載額を使用し、同じ産子の販売記録があれば販売記録を優先します。未入力は0円にしません。</Typography>
        <Typography variant="body2">価格は記録された金額の単純比較です。税込・税抜、市場、販売時期、性別などの条件を揃えて確認してください。経費控除後の利益とは異なります。</Typography>
        {analysis.issues.map(issue => <Alert key={issue} severity="warning">{issue}</Alert>)}
      </Stack></AccordionDetails></Accordion>
      </>}
    </>}
  </Stack>;
}
