import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Button, Card, CardActionArea, CardContent, Chip, Divider, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { getCattle } from '../services/api';
import { getBreedingList } from '../services/breedingApi';
import { getVaccineList } from '../services/vaccineApi';
import { getScheduleList } from '../services/scheduleApi';
import { getTreatmentList } from '../services/treatmentApi';
import { getSalesList } from '../services/salesApi';
import { getAllRecords } from '../storage/repository';
import { formatSex } from '../utils/sex';

type AnyRow = Record<string, any>;
type TimelineItem = { id: string; date: string; category: string; title: string; detail: string; to: string };
type NextAction = { id: string; title: string; date: string; note?: string };

function value(v: unknown) {
  return v === undefined || v === null || v === '' ? '-' : String(v);
}

function dateOnly(v: unknown) {
  return v ? String(v).slice(0, 10) : '';
}

function daysUntil(dateString?: string) {
  if (!dateString) return null;
  const target = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / 86400000);
}

function sameCow(row: AnyRow, cattle: AnyRow) {
  const cattleId = String(cattle.id ?? '');
  const rowCattleId = String(row.cattleId ?? row.targetCattleId ?? '');
  if (cattleId && rowCattleId && cattleId === rowCattleId) return true;
  return [row.cowId, row.cowEarTag, row.targetNumber, row.earTag].includes(cattle.earTag) ||
    [row.cowName, row.targetName, row.name].includes(cattle.name);
}

function SmallTable({ columns, rows }: { columns: { key: string; label: string }[]; rows: AnyRow[] }) {
  return (
    <Table size="small">
      <TableHead><TableRow>{columns.map((col) => <TableCell key={col.key}>{col.label}</TableCell>)}</TableRow></TableHead>
      <TableBody>{rows.map((row, index) => (
        <TableRow key={row.id || index}>{columns.map((col) => <TableCell key={col.key}>{value(row[col.key])}</TableCell>)}</TableRow>
      ))}</TableBody>
    </Table>
  );
}

export function CattleDetail() {
  const { id } = useParams();
  const [cattle, setCattle] = useState<AnyRow | null>(null);
  const [breedings, setBreedings] = useState<AnyRow[]>([]);
  const [vaccines, setVaccines] = useState<AnyRow[]>([]);
  const [schedules, setSchedules] = useState<AnyRow[]>([]);
  const [treatments, setTreatments] = useState<AnyRow[]>([]);
  const [calvings, setCalvings] = useState<AnyRow[]>([]);
  const [sales, setSales] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showActivityChoices, setShowActivityChoices] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const cattleData = await getCattle(id);
      setCattle(cattleData as AnyRow);
      const [breedingData, vaccineData, scheduleData, treatmentData, calvingData, salesData] = await Promise.all([
        getBreedingList().catch(() => []), getVaccineList().catch(() => []), getScheduleList().catch(() => []),
        getTreatmentList().catch(() => []), getAllRecords<AnyRow & { id: string | number }>('calvings'), getSalesList().catch(() => [])
      ]);
      const selected = cattleData as AnyRow;
      setBreedings((breedingData as AnyRow[]).filter((row) => sameCow(row, selected)));
      setVaccines((vaccineData as AnyRow[]).filter((row) => sameCow(row, selected)));
      setSchedules((scheduleData as AnyRow[]).filter((row) => sameCow(row, selected)));
      setTreatments((treatmentData as AnyRow[]).filter((row) => sameCow(row, selected)));
      setCalvings((calvingData as AnyRow[]).filter((row) => sameCow(row, selected)));
      setSales((salesData as AnyRow[]).filter((row) => sameCow(row, selected)));
      setLoading(false);
    }
    load();
  }, [id]);

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];
    if (cattle) {
      const registeredDate = dateOnly(cattle.createdAt || cattle.updatedAt || cattle.birthday);
      if (registeredDate) items.push({ id: `cattle-${cattle.id}`, date: registeredDate, category: '繁殖牛台帳', title: '個体を登録', detail: `耳標 ${value(cattle.earTag)}　${value(cattle.name)}`, to: `/cattle/${cattle.id}/edit` });
    }
    breedings.forEach((row) => {
      const common = `種雄牛・受精卵：${value(row.bullName || row.embryoSireName || row.embryoNumber)}`;
      const to = `/breedings/${row.id}/edit`;
      const heatDate = dateOnly(row.heatDate);
      if (heatDate) items.push({ id: `heat-${row.id}`, date: heatDate, category: '発情', title: '発情を確認', detail: value(row.heatMemo || row.note), to });
      const inseminationDate = dateOnly(row.inseminationDate || row.serviceDate);
      if (inseminationDate) items.push({ id: `insemination-${row.id}`, date: inseminationDate, category: '種付', title: '人工授精・種付', detail: common, to });
      const transferDate = dateOnly(row.transferDate || row.actualTransferDate);
      if (transferDate) items.push({ id: `transfer-${row.id}`, date: transferDate, category: '移植', title: '受精卵移植', detail: common, to });
      const pregnancyDate = dateOnly(row.pregnancyCheckDate || row.pregnancyDiagnosisDate);
      if (pregnancyDate) items.push({ id: `pregnancy-${row.id}`, date: pregnancyDate, category: '妊娠鑑定', title: `結果：${value(row.pregnancyResult)}`, detail: value(row.pregnancyMemo || row.note), to });
    });
    calvings.forEach((row) => {
      const date = dateOnly(row.actualCalvingDate || row.calvingDate);
      if (date) items.push({ id: `calving-${row.id}`, date, category: '分娩', title: `結果：${value(row.calvingResult)}`, detail: `子牛：${value(row.calfName)}　性別：${formatSex(row.calfSex)}`, to: `/calvings/${row.id}/edit` });
    });
    treatments.forEach((row) => {
      const date = dateOnly(row.treatmentDate);
      if (date) items.push({ id: `treatment-${row.id}`, date, category: '治療', title: value(row.symptom || '治療記録'), detail: `薬剤：${value(row.medicine)}　経過：${value(row.progress)}`, to: `/treatments/${row.id}/edit` });
    });
    vaccines.forEach((row) => {
      const date = dateOnly(row.vaccinationDate);
      if (date) items.push({ id: `vaccine-${row.id}`, date, category: 'ワクチン', title: value(row.vaccineName), detail: `状態：${value(row.status)}　次回：${value(row.nextDueDate)}`, to: `/vaccines/${row.id}/edit` });
    });
    sales.forEach((row) => {
      const date = dateOnly(row.saleDate || row.shippingDate || row.shippingPlanDate);
      if (date) items.push({ id: `sale-${row.id}`, date, category: '販売', title: value(row.status || '出荷・販売'), detail: `市場・買受人：${value(row.marketName || row.buyer)}　価格：${value(row.salePrice)}円`, to: `/sales/${row.id}/edit` });
    });
    schedules.forEach((row) => {
      if (row.status !== '完了') return;
      const date = dateOnly(row.dueDate);
      if (date) items.push({ id: `schedule-${row.id}`, date, category: 'その他', title: value(row.title || row.scheduleType), detail: value(row.memo || row.status), to: `/schedules/${row.id}/edit` });
    });
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [breedings, calvings, cattle, sales, schedules, treatments, vaccines]);

  const breedingCards = useMemo(() => {
    const rows = breedings
      .filter((row) => Boolean(dateOnly(row.heatDate) || dateOnly(row.inseminationDate || row.serviceDate) || dateOnly(row.transferDate || row.actualTransferDate) || dateOnly(row.pregnancyCheckDate || row.pregnancyDiagnosisDate)))
      .sort((a, b) => {
        const aDate = dateOnly(a.pregnancyCheckDate || a.pregnancyDiagnosisDate || a.transferDate || a.actualTransferDate || a.inseminationDate || a.serviceDate || a.heatDate);
        const bDate = dateOnly(b.pregnancyCheckDate || b.pregnancyDiagnosisDate || b.transferDate || b.actualTransferDate || b.inseminationDate || b.serviceDate || b.heatDate);
        return bDate.localeCompare(aDate);
      });
    const unique = new Map<string, AnyRow>();
    rows.forEach((row) => {
      const key = [dateOnly(row.heatDate), dateOnly(row.inseminationDate || row.serviceDate), dateOnly(row.transferDate || row.actualTransferDate), dateOnly(row.pregnancyCheckDate || row.pregnancyDiagnosisDate), row.breedingMethod, row.bullName, row.embryoNumber, (row.estrusSigns || []).join(','), row.estrusSignsOther].join('|');
      if (!unique.has(key)) unique.set(key, row);
    });
    return Array.from(unique.values());
  }, [breedings]);

  const totalRecords = timeline.length;
  const openDays = useMemo(() => {
    const latestCalvingDate = calvings.map((row) => dateOnly(row.actualCalvingDate || row.calvingDate)).filter(Boolean).sort((a, b) => b.localeCompare(a))[0];
    if (!latestCalvingDate) return null;
    const conceptionDate = breedings.filter((row) => ['妊娠', '受胎'].includes(String(row.pregnancyResult || '')))
      .map((row) => dateOnly(row.serviceDate || row.inseminationDate || row.transferDate || row.actualTransferDate))
      .filter((date) => date && date >= latestCalvingDate).sort((a, b) => b.localeCompare(a))[0];
    const start = new Date(`${latestCalvingDate}T00:00:00`);
    const end = new Date(`${conceptionDate || dateOnly(new Date().toISOString())}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return { days: Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000)), status: conceptionDate ? '確定' : '現在', latestCalvingDate };
  }, [breedings, calvings]);

  const nextActions = useMemo(() => {
    const actions: NextAction[] = [];

    breedings.forEach((row) => {
      const pregnancyResult = String(row.pregnancyResult || '未鑑定');
      const breedingStatus = String(row.breedingStatus || '');
      const isCalved = breedingStatus === '分娩済み';
      const isPregnant = ['受胎', '妊娠'].includes(pregnancyResult);
      const isEmpty = ['空胎', '不受胎'].includes(pregnancyResult);
      const needsRecheck = pregnancyResult === '再鑑定予定';
      const hasPregnancyCheck = Boolean(dateOnly(row.pregnancyCheckDate || row.pregnancyDiagnosisDate));
      if (isCalved) return;

      if (!isPregnant && !needsRecheck && !hasPregnancyCheck) {
        const date = dateOnly(row.pregnancyCheckExpectedDate);
        if (date) actions.push({ id: `pregnancy-${row.id}`, title: '妊娠鑑定', date });
      }

      if (isEmpty) {
        const date = dateOnly(row.nextHeatExpectedDate);
        if (date) actions.push({ id: `next-heat-${row.id}`, title: '次回発情確認', date });
      }

      if (needsRecheck) {
        const date = dateOnly(row.recheckExpectedDate);
        if (date) actions.push({ id: `recheck-${row.id}`, title: '再鑑定', date });
      }

      if (isPregnant) {
        const date = dateOnly(row.expectedCalvingDate);
        if (date) {
          const days = daysUntil(date);
          if (days !== null && days <= 60) {
            actions.push({
              id: `feed-${row.id}`,
              title: '増し飼い検討',
              date,
              note: '分娩登録まで継続。配合飼料を通常より1～2kg程度増やすのは目安で、母牛の体況・飼料内容・獣医師や飼料設計に応じて調整します。'
            });
          }
          actions.push({ id: `calving-${row.id}`, title: '分娩予定', date });
        }
      }
    });

    treatments
      .filter((row) => dateOnly(row.nextScheduledDate))
      .forEach((row) => actions.push({
        id: `treatment-followup-${row.id}`,
        title: row.progress === '要再診' ? '再診' : '治療後の次回確認',
        date: dateOnly(row.nextScheduledDate),
        note: row.symptom || row.diagnosis || row.note || undefined
      }));

    schedules
      .filter((row) => row.status !== '完了' && dateOnly(row.dueDate))
      .forEach((row) => actions.push({
        id: `schedule-${row.id}`,
        title: value(row.title || row.scheduleType),
        date: dateOnly(row.dueDate),
        note: row.memo || undefined
      }));

    return actions.sort((a, b) => a.date.localeCompare(b.date));
  }, [breedings, schedules, treatments]);

  if (loading) return <Typography>読み込み中...</Typography>;
  if (!cattle) return <Alert severity="error">牛の情報が見つかりません。</Alert>;

  const query = new URLSearchParams({ targetNumber: cattle.earTag || '', targetName: cattle.name || '', cattleId: cattle.id || '', returnTo: `/cattle/${cattle.id}` }).toString();

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} className="no-print">
        <Button component={RouterLink} to="/cattle" variant="outlined">繁殖台帳へ戻る</Button>
        <Button component={RouterLink} to={`/cattle/${cattle.id}/edit`} variant="outlined">編集</Button>
        <Button variant="contained" onClick={() => window.print()}>印刷する</Button>
      </Stack>
      <Card className="print-card"><CardContent><Stack spacing={2}>
        <Typography variant="h5" fontWeight={800}>個体カルテ：{value(cattle.name)}</Typography>
        <Typography color="text.secondary">耳標 {value(cattle.earTag)}　個体識別番号 {value(cattle.identificationNumber)}</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <Card variant="outlined" sx={{ flex: 1 }}><CardContent><Stack spacing={0.75}><Typography fontWeight={900}>今の状態</Typography><Typography fontWeight={800}>空胎日数：{openDays ? `${openDays.days}日（${openDays.status}）` : '算出不可'}</Typography><Typography color="text.secondary">直近分娩日：{openDays?.latestCalvingDate || '-'}</Typography></Stack></CardContent></Card>
          <Card variant="outlined" sx={{ flex: 1 }}><CardContent><Stack spacing={0.75}><Typography fontWeight={900}>次の予定</Typography>{nextActions.length > 0 ? nextActions.slice(0, 3).map((action) => <Stack key={action.id} spacing={0.1}><Typography fontWeight={800}>{action.title}</Typography><Typography color="text.secondary">予定日：{action.date}</Typography>{action.note && <Typography variant="body2" color="text.secondary">{action.note}</Typography>}</Stack>) : <Typography color="text.secondary">現在、次の予定はありません。</Typography>}</Stack></CardContent></Card>
        </Stack>
        <Typography color="text.secondary">個体ストーリー：{totalRecords}件</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} className="no-print">
          <Button variant="contained" size="large" fullWidth onClick={() => setShowActivityChoices((current) => !current)}>活動を登録</Button>
          <Button component={RouterLink} to={`/schedules/new?${query}`} variant="outlined" size="large" fullWidth>予定を登録</Button>
        </Stack>
        {showActivityChoices && <Card variant="outlined" className="no-print"><CardContent><Stack spacing={1.5}><Typography fontWeight={900}>登録する活動を選んでください</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap"><Button component={RouterLink} to={`/breedings/new?${query}`} variant="outlined">発情・種付・移植</Button><Button component={RouterLink} to={`/calvings/new?${query}`} variant="outlined">分娩</Button><Button component={RouterLink} to={`/treatments/new?${query}`} variant="outlined">治療</Button><Button component={RouterLink} to={`/vaccines/new?${query}`} variant="outlined">ワクチン</Button><Button component={RouterLink} to={`/sales/new?${query}`} variant="outlined">出荷・販売</Button></Stack></Stack></CardContent></Card>}
        <Divider />
        <Typography variant="h5" fontWeight={900}>個体ストーリー</Typography>
        <Typography color="text.secondary">活動記録を押すと、その記録の確認・編集画面を開きます。</Typography>
        {timeline.length === 0 ? <Alert severity="info">この牛の活動記録はまだありません。</Alert> : <Stack spacing={1}>{timeline.map((item) => <Card key={item.id} variant="outlined"><CardActionArea component={RouterLink} to={item.to}><CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}><Typography fontWeight={900} sx={{ minWidth: 105 }}>{item.date}</Typography><Chip size="small" label={item.category} /><Stack spacing={0.25} sx={{ flexGrow: 1 }}><Typography fontWeight={800}>{item.title}</Typography><Typography color="text.secondary">{item.detail}</Typography></Stack><Typography color="primary" fontWeight={800}>個体ストーリー確認 →</Typography></Stack></CardContent></CardActionArea></Card>)}</Stack>}
        <Divider />
        <Typography variant="h6" fontWeight={800}>基本情報</Typography>
        <Table size="small"><TableBody><TableRow><TableCell>耳標番号</TableCell><TableCell>{value(cattle.earTag)}</TableCell></TableRow><TableRow><TableCell>個体識別番号</TableCell><TableCell>{value(cattle.identificationNumber)}</TableCell></TableRow><TableRow><TableCell>名号</TableCell><TableCell>{value(cattle.name)}</TableCell></TableRow><TableRow><TableCell>生年月日</TableCell><TableCell>{value(cattle.birthday)}</TableCell></TableRow><TableRow><TableCell>父牛</TableCell><TableCell>{value(cattle.sire)}</TableCell></TableRow><TableRow><TableCell>母牛</TableCell><TableCell>{value(cattle.dam)}</TableCell></TableRow>{cattle.sourceCalfId && <TableRow><TableCell>移行元</TableCell><TableCell><Button component={RouterLink} to={`/calves/${cattle.sourceCalfId}`} size="small" variant="outlined" className="no-print">子牛台帳の元記録を見る</Button></TableCell></TableRow>}<TableRow><TableCell>備考</TableCell><TableCell>{value(cattle.note)}</TableCell></TableRow></TableBody></Table>
        <Divider />
        <Typography variant="h6" fontWeight={800}>繁殖記録</Typography>
        {breedingCards.length === 0 ? <Typography color="text.secondary">記録はありません。</Typography> : <Stack spacing={0.6}>{breedingCards.map((row) => {
          const heatDate = dateOnly(row.heatDate);
          const inseminationDate = dateOnly(row.inseminationDate || row.serviceDate);
          const transferDate = dateOnly(row.transferDate || row.actualTransferDate);
          const pregnancyDate = dateOnly(row.pregnancyCheckDate || row.pregnancyDiagnosisDate);
          const method = transferDate || row.breedingMethod === '受精卵移植' ? '受精卵移植' : inseminationDate ? '人工授精・種付' : '発情確認';
          const mainDate = pregnancyDate || transferDate || inseminationDate || heatDate;
          const source = row.bullName || row.embryoSireName || row.embryoNumber;
          const technician = row.inseminatorName || row.transferTechnician;
          const signs = [...(row.estrusSigns || []), row.estrusSignsOther].filter(Boolean).join('、');
          const pregnancyResult = row.pregnancyResult && row.pregnancyResult !== '未鑑定' ? row.pregnancyResult : '未鑑定';
          return <Card key={row.id} variant="outlined"><CardContent sx={{ py: 0.8, px: 1.25, '&:last-child': { pb: 0.8 } }}><Stack spacing={0.45}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.75} alignItems={{ sm: 'center' }}><Typography fontWeight={900} sx={{ minWidth: 105 }}>{mainDate || '-'}</Typography><Chip size="small" label={method} /><Typography fontWeight={900} sx={{ flexGrow: 1 }}>{pregnancyDate ? `妊娠鑑定：${pregnancyResult}` : method}</Typography><Button component={RouterLink} to={`/breedings/${row.id}/edit`} size="small" variant="outlined" className="no-print">確認・編集</Button></Stack><Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 0.2, md: 2 }} flexWrap="wrap" useFlexGap>{heatDate && <Typography color="text.secondary">発情日：{heatDate}</Typography>}{signs && <Typography color="text.secondary">兆候：{signs}</Typography>}{inseminationDate && <Typography color="text.secondary">種付日：{inseminationDate}</Typography>}{transferDate && <Typography color="text.secondary">移植日：{transferDate}</Typography>}{source && <Typography color="text.secondary">種雄牛・受精卵：{source}</Typography>}{technician && <Typography color="text.secondary">担当者：{technician}</Typography>}{dateOnly(row.pregnancyCheckExpectedDate) && <Typography color="text.secondary">妊娠鑑定予定：{dateOnly(row.pregnancyCheckExpectedDate)}</Typography>}{pregnancyDate && <Typography color="text.secondary">妊娠鑑定日：{pregnancyDate}</Typography>}{dateOnly(row.expectedCalvingDate) && <Typography color="text.secondary">分娩予定日：{dateOnly(row.expectedCalvingDate)}</Typography>}</Stack></Stack></CardContent></Card>;
        })}</Stack>}
        {vaccines.length > 0 && <Fragment><Divider /><Typography variant="h6" fontWeight={800}>ワクチン記録</Typography><SmallTable rows={vaccines} columns={[{ key: 'vaccineName', label: 'ワクチン名' }, { key: 'vaccinationDate', label: '接種日' }, { key: 'nextDueDate', label: '次回予定日' }, { key: 'status', label: '状態' }]} /></Fragment>}
        {schedules.length > 0 && <Fragment><Divider /><Typography variant="h6" fontWeight={800}>予定</Typography><SmallTable rows={schedules} columns={[{ key: 'scheduleType', label: '区分' }, { key: 'title', label: 'タイトル' }, { key: 'dueDate', label: '予定日' }, { key: 'status', label: '状態' }]} /></Fragment>}
        {treatments.length > 0 && <Fragment><Divider /><Typography variant="h6" fontWeight={800}>治療記録</Typography><SmallTable rows={treatments} columns={[{ key: 'treatmentDate', label: '治療日' }, { key: 'symptom', label: '症状' }, { key: 'medicine', label: '薬剤' }, { key: 'progress', label: '経過' }, { key: 'withdrawalEndDate', label: '休薬終了日' }]} /></Fragment>}
      </Stack></CardContent></Card>
    </Stack>
  );
}