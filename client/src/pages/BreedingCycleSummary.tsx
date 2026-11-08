import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { MaternalAnalysis } from '../utils/maternalAnalysis';
import { buildCycleEfficiency, shiftAnalysisDate, type ReproductiveEfficiency } from '../utils/reproductiveEfficiency';
import { buildBreedingTargetCandidates, DEFAULT_BREEDING_WAIT_DAYS } from '../utils/breedingTargetCandidates';

const shortDate = (date: string) => date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}` : '日付未設定';
const percent = (value: number) => `${Number(value.toFixed(1))}%`;

/** Counts first; cohort settings and the calculation details stay available on demand. */
export function BreedingCycleSummary({ analysis, report, asOf }: { analysis: MaternalAnalysis; report: ReproductiveEfficiency; asOf: string }) {
  const [start, setStart] = useState(() => shiftAnalysisDate(asOf, -20));
  const [waitingDays, setWaitingDays] = useState(DEFAULT_BREEDING_WAIT_DAYS);
  const candidates = useMemo(() => buildBreedingTargetCandidates(analysis, report, start, waitingDays, asOf), [analysis, report, start, waitingDays, asOf]);
  const [selection, setSelection] = useState<{ signature: string; keys: string[]; confirmed: boolean } | null>(null);
  const currentSelection = selection?.signature === candidates.signature ? selection : null;
  const draftKeys = currentSelection?.keys ?? candidates.candidateKeys;
  const eligibleKeys = currentSelection?.confirmed ? draftKeys : [];
  const changeSelection = (keys: string[]) => setSelection({ signature: candidates.signature, keys, confirmed: false });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const cycle = useMemo(() => buildCycleEfficiency(analysis, report, start, eligibleKeys, asOf), [analysis, report, start, eligibleKeys, asOf]);
  const selected = cycle.eligibleCount > 0;
  const records = report.services.filter(s => cycle.validPeriod && s.method === 'ai' && s.date >= start && s.date <= cycle.end && (!selected || eligibleKeys.includes(s.motherKey)));
  const serviced = new Set(records.map(s => s.motherKey));
  const conceived = new Set(records.filter(s => s.conceived === true).map(s => s.motherKey));
  const pending = new Set(records.filter(s => s.conceived === null && s.outcomeState === 'pending').map(s => s.motherKey));
  const review = records.some(s => s.conceived === null && s.outcomeState !== 'pending');
  const waitingOnly = selected && cycle.unresolvedCount > 0 && !cycle.needsReview;
  const counts = [
    { label: '授精した牛', count: serviced.size, note: `授精 ${records.length}回` },
    { label: '受胎を確認', count: conceived.size, note: '受胎の記録あり' },
    { label: '鑑定待ち', count: pending.size, note: '未鑑定・再鑑定' },
  ];
  const rate = (value: number | null) => value !== null ? percent(value) : !cycle.validPeriod ? '期間を確認' : cycle.needsReview ? '記録を確認' : !cycle.aiCount ? '授精記録なし' : waitingOnly ? '鑑定待ち' : '確認が必要';
  return <Card component="section" variant="outlined" aria-labelledby="breeding-cycle-heading" sx={{ borderRadius: 2, mt: 2 }}><CardContent sx={{ p: { xs: 1.5, sm: 3 }, '&:last-child': { pb: { xs: 1.5, sm: 3 } } }}><Stack spacing={2}>
    <Box>
      <Typography id="breeding-cycle-heading" component="h2" variant="h6" fontWeight={900}>授精と受胎の状況</Typography>
      <Typography color="text.secondary" variant="body2">21日間の授精と、その後の妊娠鑑定の結果です。</Typography>
    </Box>
    <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5 }}>
      <Typography fontWeight={800}>{start.slice(0, 4)}年 {shortDate(start)} 〜 {shortDate(cycle.end)}<Typography component="span" variant="body2">（21日間）</Typography></Typography>
      <Typography variant="body2" color="text.secondary">{selected ? `選択した対象牛 ${cycle.eligibleCount}頭の記録` : '農場全体で確認できた記録'} ／ 鑑定結果は{shortDate(asOf)}時点</Typography>
    </Box>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: { xs: 1, sm: 2 } }}>
      {counts.map(item => <Box key={item.label} sx={{ minWidth: 0, p: { xs: 1, sm: 2 }, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <Typography component="h3" sx={{ fontSize: { xs: '.8rem', sm: '1rem' }, fontWeight: 700, minHeight: { xs: 42, sm: 28 } }}>{item.label}</Typography>
        <Typography sx={{ fontWeight: 900, fontSize: { xs: '1.8rem', sm: '2.1rem' }, my: .5 }}>{cycle.validPeriod ? item.count : '―'}<Typography component="span" fontSize=".9rem" sx={{ ml: .5 }}>頭</Typography></Typography>
        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{item.note}</Typography>
      </Box>)}
    </Box>
    {pending.size > 0 && <Alert severity="info"><strong>{pending.size}頭の妊娠鑑定待ちです。</strong>{waitingOnly && <><br />鑑定結果を記録すると、受胎率・妊娠率が表示されます。</>}</Alert>}
    {review && <Alert severity="info">鑑定結果や日付を確認する記録があります。</Alert>}

    {!selected ? <Box>
      <Typography fontWeight={800}>授精対象の候補 {candidates.candidateKeys.length}頭</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>開始時点で産後{waitingDays || '―'}日以降の記録から候補を出しています。確認すると発情発見率・妊娠率が見られます。</Typography>
      <Button variant="outlined" onClick={() => setSettingsOpen(true)} sx={{ minHeight: 44 }}>候補を確認して集計</Button>
    </Box> : <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3,minmax(0,1fr))' }, gap: 1.5 }}>
        {[
          { label: '発情発見率', value: cycle.heatDetectionRate, note: `対象${cycle.eligibleCount}頭のうち、発情・授精${cycle.detectedCount}頭` },
          { label: '受胎率', value: cycle.conceptionRate, note: `授精${cycle.aiCount}回のうち、受胎確認${cycle.conceivedCount}件` },
          { label: '妊娠率', value: cycle.pregnancyRate, note: '発情発見率と受胎率から計算' },
        ].map(item => <Box key={item.label} sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, minWidth: 0 }}>
          <Typography component="h3" fontSize=".9rem" color="text.secondary">{item.label}</Typography>
          <Typography fontWeight={800} fontSize="1.25rem" sx={{ my: .5 }}>{rate(item.value)}</Typography>
          <Typography variant="caption" color="text.secondary">{item.note}</Typography>
        </Box>)}
      </Box>
      {cycle.issues.length > 0 && !waitingOnly && <Accordion disableGutters elevation={0}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontSize=".9rem">成績が表示されない理由を見る</Typography></AccordionSummary>
        <AccordionDetails><Stack spacing={1}>{cycle.issues.map(issue => <Typography key={issue} variant="body2">{issue}</Typography>)}</Stack></AccordionDetails>
      </Accordion>}
    </>}
    {pending.size > 0 && <Accordion disableGutters elevation={0}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={700}>鑑定待ちの牛を見る（{pending.size}頭）</Typography></AccordionSummary>
      <AccordionDetails><Stack spacing={1}>{analysis.mothers.filter(m => pending.has(m.key)).map(m => <Box key={m.key} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{m.name}</Typography><Typography variant="body2" color="text.secondary">耳標 {m.earTag || '未登録'}</Typography></Box>
        <Button component={RouterLink} to={`/cattle/${encodeURIComponent(m.key)}`} sx={{ minHeight: 44 }}>牛台帳を見る</Button>
      </Box>)}</Stack></AccordionDetails>
    </Accordion>}
    <Accordion disableGutters expanded={settingsOpen} onChange={(_, open) => setSettingsOpen(open)} elevation={0}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={700}>期間・対象牛を変更</Typography></AccordionSummary>
      <AccordionDetails><Stack spacing={2}>
        <TextField type="date" label="21日間の開始日" value={start} onChange={e => { setStart(e.target.value); setSelection(null); }} InputLabelProps={{ shrink: true }} sx={{ maxWidth: 360 }} inputProps={{ max: shiftAnalysisDate(asOf, -20) }}
          helperText={cycle.validPeriod ? `${shortDate(start)} 〜 ${shortDate(cycle.end)}を集計。期間を変えると候補を出し直します。` : '本日までに終了した21日間を選んでください。'} error={!cycle.validPeriod} />
        <TextField type="number" label="授精を始める産後日数" value={waitingDays || ''} onChange={e => { setWaitingDays(Number(e.target.value)); setSelection(null); }} sx={{ maxWidth: 360 }} inputProps={{ min: 1, max: 365, step: 1 }}
          helperText="初期値は40日です。農場の方針に合わせて変更できます（今回の集計のみ）。" error={!Number.isInteger(waitingDays) || waitingDays < 1 || waitingDays > 365} />
        <Box><Typography component="h3" fontWeight={800}>候補を確認する</Typography>
          <Typography variant="body2" color="text.secondary">候補にチェックを入れています。体調や休養中かどうかを確認し、妊娠中・休養中・ET対象の牛は外してください。「要確認」の牛も対象なら追加できます。</Typography></Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,minmax(0,1fr))' }, gap: .5 }}>
          {candidates.rows.map(m => <Box key={m.key} sx={{ p: 1, minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <FormControlLabel sx={{ m: 0, minWidth: 0, '& .MuiFormControlLabel-label': { overflowWrap: 'anywhere' } }}
              control={<Checkbox checked={draftKeys.includes(m.key)} onChange={(_, checked) => changeSelection(checked ? [...draftKeys, m.key] : draftKeys.filter(k => k !== m.key))} />}
              label={`${m.name}（耳標 ${m.earTag || '未登録'}）`} />
            <Typography variant="body2" color="text.secondary" sx={{ pl: 5.25, overflowWrap: 'anywhere' }}>{m.status === 'candidate' ? '候補' : m.status === 'excluded' ? '候補から除外' : '要確認'}：{m.reason}</Typography>
          </Box>)}
        </Box>
        <Typography variant="body2" color="text.secondary">選択中：{draftKeys.length}頭。この選択で牛の記録は変更されません。</Typography>
        {!draftKeys.length && <Typography variant="body2">対象牛が選ばれていないため、割合は表示しません。</Typography>}
        <Button variant="contained" disabled={!candidates.valid || !draftKeys.length} onClick={() => { setSelection({ signature: candidates.signature, keys: draftKeys, confirmed: true }); setSettingsOpen(false); }} sx={{ alignSelf: 'flex-start', minHeight: 44 }}>この{draftKeys.length}頭で集計</Button>
      </Stack></AccordionDetails>
    </Accordion>
  </Stack></CardContent></Card>;
}
