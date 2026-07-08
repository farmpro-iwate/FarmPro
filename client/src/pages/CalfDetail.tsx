import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { getCalf } from '../services/calfApi';
import { FeedingAlertAction, fetchFeedingAlertActions } from '../services/feedingAlertActionsApi';
import { FeedingGuideRecord, getFeedingGuideList } from '../services/feedingGuideApi';
import { getTreatmentList } from '../services/treatmentApi';
import { getVaccineList } from '../services/vaccineApi';
import { Treatment } from '../types/treatment';
import { Vaccine } from '../types/vaccine';
import { calculateAgeDays, calculateDg, judgeDg } from '../utils/calf';
import { daysUntil, judgeWithdrawal } from '../utils/treatment';
import { daysUntil as vaccineDaysUntil, judgeVaccineDue } from '../utils/vaccine';

type ChipColor = 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';

type Calf = {
  id?: number | string;
  name?: string;
  calfName?: string;
  calfNumber?: string;
  earTag?: string;
  birthday?: string;
  birthDate?: string;
  sex?: string;
  motherName?: string;
  motherId?: string;
  startWeight?: number | string;
  birthWeight?: number | string;
  currentWeight?: number | string;
  elapsedDays?: number | string;
  milkAmount?: number | string;
  starterAmount?: number | string;
  memo?: string;
  note?: string;
  source?: string;
  origin?: string;
  createdFrom?: string;
  calvingId?: string;
  calvingRecordId?: string;
  sourceCalvingId?: string;
};

type FeedingGuide = FeedingGuideRecord & {
  starterKg?: string | number;
  growingFeedKg?: string | number;
  roughageKg?: string | number;
};

const noPrintSx = {
  '@media print': {
    display: 'none'
  }
};

const printOnlySx = {
  display: 'none',
  '@media print': {
    display: 'block'
  }
};

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function normalize(v: unknown) {
  return String(v || '').trim().toLowerCase();
}

function toNumber(valueText: unknown) {
  if (valueText === null || valueText === undefined || valueText === '') return null;
  const numberValue = Number(valueText);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function formatAmount(valueText: unknown, suffix: string) {
  const numberValue = toNumber(valueText);
  if (numberValue === null || numberValue <= 0) return '-';
  return `${numberValue.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
}

function todayText() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function todayDisplayText() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function csvCell(v: unknown) {
  const text = String(v ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFilenamePart(text: string) {
  return text.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'calf';
}

function getCalfNumber(calf: Calf | null) {
  return String(calf?.calfNumber || calf?.earTag || '');
}

function getCalfName(calf: Calf | null) {
  return String(calf?.name || calf?.calfName || '');
}

function getBirthday(calf: Calf | null) {
  return String(calf?.birthday || calf?.birthDate || '');
}

function getMother(calf: Calf | null) {
  return String(calf?.motherName || calf?.motherId || '');
}

function getNote(calf: Calf | null) {
  return String(calf?.note || calf?.memo || '');
}

function isFromCalvingRecord(calf: Calf | null, note: string, routeFromCalving: boolean) {
  const sourceText = [calf?.source, calf?.origin, calf?.createdFrom, note].join(' ');
  return Boolean(routeFromCalving || calf?.calvingId || calf?.calvingRecordId || calf?.sourceCalvingId || sourceText.includes('分娩'));
}

function getAgeDays(calf: Calf | null) {
  const birthday = getBirthday(calf);
  if (birthday) {
    const ageDays = calculateAgeDays(birthday);
    if (Number.isFinite(ageDays) && ageDays >= 0) return ageDays;
  }

  const elapsedDays = toNumber(calf?.elapsedDays);
  if (elapsedDays !== null && elapsedDays >= 0) return elapsedDays;

  return null;
}

function getDg(calf: Calf | null) {
  const startWeight = toNumber(calf?.startWeight ?? calf?.birthWeight);
  const currentWeight = toNumber(calf?.currentWeight);
  const elapsedDays = toNumber(calf?.elapsedDays) ?? getAgeDays(calf);

  if (
    startWeight === null ||
    currentWeight === null ||
    elapsedDays === null ||
    startWeight <= 0 ||
    currentWeight <= 0 ||
    elapsedDays <= 0
  ) {
    return null;
  }

  const dg = calculateDg(startWeight, currentWeight, elapsedDays);
  return Number.isFinite(dg) ? dg : null;
}

function dgColor(dg: number | null): ChipColor {
  if (dg === null) return 'default';
  const judgement = judgeDg(dg);
  if (judgement === '良') return 'success';
  if (judgement === '注意') return 'warning';
  return 'error';
}

function statusColor(status: string): ChipColor {
  if (status.includes('済み')) return 'success';
  if (status.includes('対応中')) return 'warning';
  if (status.includes('様子見')) return 'info';
  if (status.includes('再確認')) return 'error';
  return 'default';
}

function alertColor(alertType: string): ChipColor {
  if (alertType.includes('不足')) return 'warning';
  if (alertType.includes('多め')) return 'error';
  if (alertType.includes('実績なし')) return 'info';
  return 'default';
}

function treatmentProgressColor(progress: string): ChipColor {
  if (progress === '回復') return 'success';
  if (progress === '要再診') return 'error';
  if (progress === '経過観察') return 'warning';
  if (progress === '治療中') return 'info';
  return 'default';
}

function withdrawalColor(label: string): ChipColor {
  if (label === '休薬中') return 'warning';
  if (label === '休薬終了') return 'success';
  return 'default';
}

function vaccineStatusColor(label: string): ChipColor {
  if (label === '接種済み') return 'success';
  if (label === '期限超過') return 'error';
  if (label === 'まもなく') return 'warning';
  if (label === '予定あり') return 'info';
  return 'default';
}

function nearestGuide(ageDays: number | null, guides: FeedingGuide[]) {
  if (ageDays === null || guides.length === 0) return null;

  return [...guides].sort((a, b) => {
    const da = Math.abs(Number(a.ageDays || 0) - ageDays);
    const db = Math.abs(Number(b.ageDays || 0) - ageDays);
    return da - db;
  })[0];
}

function inferAlertTypeFromMemo(memo: string) {
  if (memo.includes('不足')) return '不足気味';
  if (memo.includes('多め')) return '多め';
  if (memo.includes('実績なし')) return '実績なし';
  if (memo.includes('生年月日')) return '生年月日なし';
  if (memo.includes('目安')) return '給与目安なし';
  return 'その他';
}

function sameCalf(item: FeedingAlertAction, calf: Calf | null, routeCalfId: string) {
  const identifiers = [
    routeCalfId,
    calf?.id,
    calf?.calfNumber,
    calf?.earTag,
    calf?.name,
    calf?.calfName
  ]
    .map((itemValue) => String(itemValue || ''))
    .filter(Boolean);

  const itemCalfId = String(item.calfId || '');
  const itemCalfName = String(item.calfName || '');

  return identifiers.includes(itemCalfId) || identifiers.includes(itemCalfName);
}

function sameTreatmentTarget(item: Treatment, calf: Calf | null, routeCalfId: string) {
  const identifiers = [
    routeCalfId,
    calf?.id,
    calf?.calfNumber,
    calf?.earTag,
    calf?.name,
    calf?.calfName
  ]
    .map(normalize)
    .filter(Boolean);

  const targetNumber = normalize(item.targetNumber);
  const targetName = normalize(item.targetName);

  return identifiers.includes(targetNumber) || identifiers.includes(targetName);
}

function sameVaccineTarget(item: Vaccine, calf: Calf | null, routeCalfId: string) {
  const identifiers = [
    routeCalfId,
    calf?.id,
    calf?.calfNumber,
    calf?.earTag,
    calf?.name,
    calf?.calfName
  ]
    .map(normalize)
    .filter(Boolean);

  const targetNumber = normalize(item.targetNumber);
  const targetName = normalize(item.targetName);

  return identifiers.includes(targetNumber) || identifiers.includes(targetName);
}

function vaccineSortDate(item: Vaccine) {
  return String(item.vaccinationDate || item.nextDueDate || item.updatedAt || item.createdAt || '');
}

function newActionLink(calf: Calf | null, ageDays: number | null) {
  const calfNumber = getCalfNumber(calf);
  const params = new URLSearchParams();
  params.set('calfId', String(calf?.id || ''));
  params.set('calfName', calfNumber || getCalfName(calf));
  params.set('ageDays', ageDays === null ? '' : String(ageDays));
  params.set('alertType', inferAlertTypeFromMemo('その他'));
  params.set('memo', '子牛カルテから登録');
  return `/feeding-alert-actions/new?${params.toString()}`;
}

function InfoBox({ label, valueText, helper }: { label: string; valueText: string; helper?: string }) {
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        flex: '1 1 160px',
        minWidth: { xs: '100%', sm: 160 },
        p: 1.25,
        '@media print': {
          minWidth: 120,
          p: 0.75
        }
      }}
    >
      <Typography color="text.secondary" variant="caption">{label}</Typography>
      <Typography fontWeight={800}>{valueText}</Typography>
      {helper && <Typography color="text.secondary" variant="caption">{helper}</Typography>}
    </Box>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Box>
      <Typography fontWeight={900} variant="h6">{title}</Typography>
      {subtitle && <Typography color="text.secondary" sx={noPrintSx}>{subtitle}</Typography>}
    </Box>
  );
}

export function CalfDetail() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const calfId = String(params.id || '');
  const routeFromCalving = searchParams.get('from') === 'calving';

  const [calf, setCalf] = useState<Calf | null>(null);
  const [actions, setActions] = useState<FeedingAlertAction[]>([]);
  const [guides, setGuides] = useState<FeedingGuide[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [vaccines, setVaccines] = useState<Vaccine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const [calfData, actionData, guideData, treatmentData, vaccineData] = await Promise.all([
          getCalf(calfId),
          fetchFeedingAlertActions().catch(() => []),
          getFeedingGuideList().catch(() => []),
          getTreatmentList().catch(() => []),
          getVaccineList().catch(() => [])
        ]);

        if (!active) return;
        setCalf(calfData as Calf);
        setActions(Array.isArray(actionData) ? actionData : []);
        setGuides(Array.isArray(guideData) ? guideData as FeedingGuide[] : []);
        setTreatments(Array.isArray(treatmentData) ? treatmentData : []);
        setVaccines(Array.isArray(vaccineData) ? vaccineData : []);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : '子牛カルテを取得できませんでした。');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [calfId]);

  const calfNumber = getCalfNumber(calf);
  const calfName = getCalfName(calf);
  const birthday = getBirthday(calf);
  const mother = getMother(calf);
  const note = getNote(calf);
  const fromCalvingRecord = isFromCalvingRecord(calf, note, routeFromCalving);
  const ageDays = getAgeDays(calf);
  const dg = getDg(calf);
  const dgJudgement = dg === null ? '未計算' : judgeDg(dg);
  const guide = nearestGuide(ageDays, guides);

  const calfActions = useMemo(() => {
    return actions
      .filter((item) => sameCalf(item, calf, calfId))
      .sort((a, b) => String(b.actionDate || '').localeCompare(String(a.actionDate || '')));
  }, [actions, calf, calfId]);

  const calfTreatments = useMemo(() => {
    return treatments
      .filter((item) => sameTreatmentTarget(item, calf, calfId))
      .sort((a, b) => String(b.treatmentDate || '').localeCompare(String(a.treatmentDate || '')));
  }, [treatments, calf, calfId]);

  const calfVaccines = useMemo(() => {
    return vaccines
      .filter((item) => sameVaccineTarget(item, calf, calfId))
      .sort((a, b) => vaccineSortDate(b).localeCompare(vaccineSortDate(a)));
  }, [vaccines, calf, calfId]);

  const pendingActions = useMemo(() => {
    return calfActions.filter((item) => !String(item.status || '').includes('済み'));
  }, [calfActions]);

  const activeTreatments = useMemo(() => {
    return calfTreatments.filter((item) => item.progress !== '回復');
  }, [calfTreatments]);

  const pendingVaccines = useMemo(() => {
    return calfVaccines.filter((item) => item.status !== '接種済み');
  }, [calfVaccines]);

  const nextCheckDate = useMemo(() => {
    return calfActions
      .map((item) => item.nextCheckDate)
      .filter(Boolean)
      .sort()[0] || '';
  }, [calfActions]);

  const handleExportCsv = () => {
    if (!calf) return;

    const rows: unknown[][] = [
      ['区分', '項目', '値', '補足'],
      ['基本情報', '耳標番号', value(calfNumber), ''],
      ['基本情報', '名号', value(calfName), ''],
      ['基本情報', '性別', value(calf.sex), ''],
      ['基本情報', '母牛', value(mother), ''],
      ['基本情報', '生年月日', value(birthday), ageDays === null ? '日齢 -' : `日齢 ${ageDays}日`],
      ['基本情報', '由来', fromCalvingRecord ? '分娩記録から登録' : '-', ''],
      ['基本情報', '開始体重', formatAmount(calf.startWeight ?? calf.birthWeight, 'kg'), ''],
      ['基本情報', '現在体重', formatAmount(calf.currentWeight, 'kg'), ''],
      ['基本情報', 'DG', dg === null ? '-' : `${dg.toFixed(2)}kg/日`, dgJudgement],
      ['基本情報', 'ミルク量', formatAmount(calf.milkAmount, 'L'), ''],
      ['基本情報', 'スターター', formatAmount(calf.starterAmount, 'kg'), ''],
      ['基本情報', '備考', note || '-', ''],
      ['治療記録', '記録件数', `${calfTreatments.length}件`, `治療中・経過観察など ${activeTreatments.length}件`],
      ['ワクチン記録', '記録件数', `${calfVaccines.length}件`, `未接種・予定など ${pendingVaccines.length}件`],
      ['給与目安', '現在日齢', ageDays === null ? '-' : `${ageDays}日`, ''],
      ['給与目安', '近い日齢', guide ? `${value(guide.ageDays)}日` : '-', value(guide?.stageName)],
      ['給与目安', '月齢', value(guide?.ageMonth), ''],
      ['給与目安', '目標体重', guide ? formatAmount(guide.targetWeight, 'kg') : '-', ''],
      ['給与目安', '目標体高', guide ? formatAmount(guide.targetHeight, 'cm') : '-', ''],
      ['給与目安', '胸囲', guide ? formatAmount(guide.targetChest, 'cm') : '-', ''],
      ['給与目安', 'スターター', guide ? formatAmount(guide.starterAmount ?? guide.starterKg, 'kg') : '-', ''],
      ['給与目安', '育成配合', guide ? formatAmount(guide.growingFeedAmount ?? guide.growingFeedKg, 'kg') : '-', ''],
      ['給与目安', '粗飼料', guide ? formatAmount(guide.roughageAmount ?? guide.roughageKg, 'kg') : '-', ''],
      ['給与目安', 'その他', guide ? formatAmount(guide.otherAmount, 'kg') : '-', ''],
      ['給与目安', 'メモ', value(guide?.memo), ''],
      ['対応履歴', '履歴件数', `${calfActions.length}件`, `未完了 ${pendingActions.length}件 / 次回確認 ${nextCheckDate || '-'}`]
    ];

    if (calfTreatments.length === 0) {
      rows.push(['治療記録', '記録', 'なし', '']);
    } else {
      calfTreatments.forEach((item, index) => {
        rows.push([
          '治療記録',
          `${index + 1}. ${value(item.treatmentDate)}`,
          `${value(item.symptom)} / ${value(item.medicine)}`,
          `診断 ${value(item.diagnosis)} / 経過 ${value(item.progress)} / 休薬 ${value(item.withdrawalEndDate)} / メモ ${value(item.note)}`
        ]);
      });
    }

    if (calfVaccines.length === 0) {
      rows.push(['ワクチン記録', '記録', 'なし', '']);
    } else {
      calfVaccines.forEach((item, index) => {
        rows.push([
          'ワクチン記録',
          `${index + 1}. ${value(item.vaccinationDate || item.nextDueDate)}`,
          `${value(item.vaccineName)} / ${value(item.targetNumber)} / ${value(item.targetName)}`,
          `状態 ${value(item.status)} / 次回 ${value(item.nextDueDate)} / メモ ${value(item.note)}`
        ]);
      });
    }

    if (calfActions.length === 0) {
      rows.push(['対応履歴', '記録', 'なし', '']);
    } else {
      calfActions.forEach((item, index) => {
        rows.push([
          '対応履歴',
          `${index + 1}. ${value(item.actionDate)}`,
          `${value(item.alertType)} / ${value(item.actionType)}`,
          `状態 ${value(item.status)} / 次回 ${value(item.nextCheckDate)} / メモ ${value(item.memo)}`
        ]);
      });
    }

    downloadCsv(`calf-card-${safeFilenamePart(calfNumber || calfName || calfId)}-${todayText()}.csv`, rows);
  };

  return (
    <Stack
      spacing={2}
      sx={{
        '@media print': {
          color: '#000',
          gap: 1
        }
      }}
    >
      <Stack
        alignItems={{ xs: 'stretch', md: 'center' }}
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ '@media print': { alignItems: 'flex-start' } }}
      >
        <Box>
          <Typography fontWeight={900} variant="h5">子牛カルテ</Typography>
          <Typography color="text.secondary">
            耳標番号を中心に、基本情報・治療記録・給与目安・対応履歴をまとめて確認します。
          </Typography>
          <Box sx={printOnlySx}>
            <Typography fontWeight={700} sx={{ mt: 1 }}>
              印刷日：{todayDisplayText()} / 耳標番号：{value(calfNumber)} / 名号：{value(calfName)}
            </Typography>
            <Typography>
              治療記録：{calfTreatments.length}件 / ワクチン記録：{calfVaccines.length}件 / 未完了対応：{pendingActions.length}件 / 次回確認：{nextCheckDate || '-'}
            </Typography>
          </Box>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={noPrintSx}>
          {routeFromCalving && <Button component={RouterLink} to="/calvings?registration=calf-card" variant="outlined" color="success">分娩記録へ戻る</Button>}
          <Button component={RouterLink} to="/calves" variant="outlined">子牛台帳へ</Button>
          {calf?.id && <Button component={RouterLink} to={`/calves/${calf.id}/edit`} variant="outlined">編集</Button>}
          <Button component={RouterLink} to="/treatments" variant="outlined">治療記録一覧</Button>
          <Button component={RouterLink} to="/vaccines" variant="outlined">ワクチン記録一覧</Button>
          <Button component={RouterLink} to="/feeding-alert-actions" variant="outlined">対応記録一覧</Button>
          <Button disabled={!calf} onClick={handleExportCsv} variant="outlined">CSV出力</Button>
          <Button onClick={() => window.print()} variant="outlined">印刷</Button>
        </Stack>
      </Stack>

      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="warning">{error}</Alert>}

      {!loading && !error && !calf && (
        <Alert severity="warning">子牛情報が見つかりません。</Alert>
      )}

      {!loading && !error && calf && (
        <>
          {fromCalvingRecord && (
            <Alert severity="success" sx={noPrintSx}>
              この子牛は分娩記録から子牛台帳へ登録された記録です。耳標番号・出生日・母牛情報を確認できます。
            </Alert>
          )}

          <Card variant="outlined" sx={{ borderRadius: 3, '@media print': { breakInside: 'avoid', boxShadow: 'none', borderColor: '#999', borderRadius: 1 } }}>
            <CardContent sx={{ '@media print': { p: 1.25, '&:last-child': { pb: 1.25 } } }}>
              <Stack spacing={2} sx={{ '@media print': { gap: 1 } }}>
                <Stack
                  alignItems={{ xs: 'stretch', md: 'center' }}
                  direction={{ xs: 'column', md: 'row' }}
                  justifyContent="space-between"
                  spacing={2}
                  sx={{ '@media print': { flexDirection: 'row', alignItems: 'center' } }}
                >
                  <Stack
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                    sx={{ '@media print': { flexDirection: 'row', gap: 1 } }}
                  >
                    <Box
                      sx={{
                        bgcolor: 'grey.50',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 2,
                        minWidth: { xs: '100%', sm: 200 },
                        p: 1.5,
                        textAlign: 'center',
                        '@media print': {
                          bgcolor: '#fff',
                          minWidth: 130,
                          p: 0.75
                        }
                      }}
                    >
                      <Typography color="text.secondary" variant="caption">耳標番号</Typography>
                      <Typography fontWeight={900} sx={{ letterSpacing: 0.5 }} variant="h5">
                        {value(calfNumber)}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography color="text.secondary" variant="caption">名号</Typography>
                      <Typography fontWeight={900} variant="h5">{value(calfName)}</Typography>
                      <Typography color="text.secondary">母牛：{value(mother)}</Typography>
                    </Box>
                  </Stack>

                  <Stack alignItems={{ xs: 'flex-start', md: 'flex-end' }} spacing={1}>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      <Chip label={value(calf.sex)} size="small" />
                      <Chip label={ageDays === null ? '日齢 -' : `日齢 ${ageDays}日`} size="small" variant="outlined" />
                      {fromCalvingRecord && <Chip color="success" label="分娩記録から登録" size="small" variant="outlined" />}
                    </Stack>
                    <Chip
                      color={dgColor(dg)}
                      label={dg === null ? 'DG未計算' : `DG ${dg.toFixed(2)}kg/日・${dgJudgement}`}
                      sx={{ fontWeight: 700 }}
                      variant={dg === null ? 'outlined' : 'filled'}
                    />
                  </Stack>
                </Stack>

                <Divider />

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <InfoBox label="生年月日" valueText={value(birthday)} />
                  <InfoBox label="開始体重" valueText={formatAmount(calf.startWeight ?? calf.birthWeight, 'kg')} />
                  <InfoBox label="現在体重" valueText={formatAmount(calf.currentWeight, 'kg')} />
                  <InfoBox label="ミルク量" valueText={formatAmount(calf.milkAmount, 'L')} />
                  <InfoBox label="スターター" valueText={formatAmount(calf.starterAmount, 'kg')} />
                  <InfoBox label="治療記録" valueText={`${calfTreatments.length}件`} helper={`対応中 ${activeTreatments.length}件`} />
                  <InfoBox label="ワクチン記録" valueText={`${calfVaccines.length}件`} helper={`未接種 ${pendingVaccines.length}件`} />
                  <InfoBox label="対応履歴" valueText={`${calfActions.length}件`} helper={`未完了 ${pendingActions.length}件`} />
                </Stack>

                {note && (
                  <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 1.25, '@media print': { bgcolor: '#fff', p: 0.75 } }}>
                    <Typography color="text.secondary" variant="caption">備考</Typography>
                    <Typography>{note}</Typography>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 3, '@media print': { breakInside: 'avoid', boxShadow: 'none', borderColor: '#999', borderRadius: 1 } }}>
            <CardContent sx={{ '@media print': { p: 1.25, '&:last-child': { pb: 1.25 } } }}>
              <Stack spacing={2} sx={{ '@media print': { gap: 1 } }}>
                <Stack
                  alignItems={{ xs: 'stretch', md: 'center' }}
                  direction={{ xs: 'column', md: 'row' }}
                  justifyContent="space-between"
                  spacing={1.5}
                >
                  <SectionTitle
                    title="ワクチン記録"
                    subtitle="この子牛に対して登録されたワクチン記録を新しい順で表示します。"
                  />

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={noPrintSx}>
                    <Button component={RouterLink} to="/vaccines" variant="outlined">
                      ワクチン記録一覧
                    </Button>
                    <Button component={RouterLink} to="/vaccines/new" variant="contained">
                      ワクチン記録を追加
                    </Button>
                  </Stack>
                </Stack>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip label={`ワクチン記録 ${calfVaccines.length}件`} size="small" />
                  <Chip color={pendingVaccines.length > 0 ? 'warning' : 'success'} label={`未接種 ${pendingVaccines.length}件`} size="small" variant="outlined" />
                </Stack>

                {calfVaccines.length === 0 ? (
                  <Alert severity="success">この子牛のワクチン記録はまだありません。</Alert>
                ) : (
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small" sx={{ '@media print': { '& th, & td': { px: 0.75, py: 0.5, fontSize: 12 } } }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>接種日</TableCell>
                          <TableCell>ワクチン名</TableCell>
                          <TableCell>対象</TableCell>
                          <TableCell>次回予定日</TableCell>
                          <TableCell>状態</TableCell>
                          <TableCell>メモ</TableCell>
                          <TableCell sx={noPrintSx}>操作</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {calfVaccines.map((item) => {
                          const statusLabel = judgeVaccineDue(item.status, item.nextDueDate);
                          return (
                            <TableRow key={item.id}>
                              <TableCell>{value(item.vaccinationDate || '未接種')}</TableCell>
                              <TableCell>{value(item.vaccineName)}</TableCell>
                              <TableCell>
                                {value(item.targetNumber)}
                                <br />
                                <Typography color="text.secondary" variant="caption">
                                  {value(item.targetName)}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                {value(item.nextDueDate || '未定')}
                                {item.nextDueDate && <><br /><Typography color="text.secondary" variant="caption">あと{vaccineDaysUntil(item.nextDueDate)}日</Typography></>}
                              </TableCell>
                              <TableCell>
                                <Chip color={vaccineStatusColor(statusLabel)} label={statusLabel} size="small" />
                              </TableCell>
                              <TableCell>{value(item.note)}</TableCell>
                              <TableCell sx={noPrintSx}>
                                <Button component={RouterLink} size="small" to={`/vaccines/${item.id}/edit`} variant="outlined">
                                  編集
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 3, '@media print': { breakInside: 'avoid', boxShadow: 'none', borderColor: '#999', borderRadius: 1 } }}>
            <CardContent sx={{ '@media print': { p: 1.25, '&:last-child': { pb: 1.25 } } }}>
              <Stack spacing={2} sx={{ '@media print': { gap: 1 } }}>
                <Stack
                  alignItems={{ xs: 'stretch', md: 'center' }}
                  direction={{ xs: 'column', md: 'row' }}
                  justifyContent="space-between"
                  spacing={1.5}
                >
                  <SectionTitle
                    title="治療記録"
                    subtitle="この子牛に対して登録された治療記録を新しい順で表示します。"
                  />

                  <Button component={RouterLink} to="/treatments/new" variant="contained" sx={noPrintSx}>
                    治療記録を追加
                  </Button>
                </Stack>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip label={`治療記録 ${calfTreatments.length}件`} size="small" />
                  <Chip color={activeTreatments.length > 0 ? 'warning' : 'success'} label={`対応中 ${activeTreatments.length}件`} size="small" variant="outlined" />
                </Stack>

                {calfTreatments.length === 0 ? (
                  <Alert severity="success">この子牛の治療記録はまだありません。</Alert>
                ) : (
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small" sx={{ '@media print': { '& th, & td': { px: 0.75, py: 0.5, fontSize: 12 } } }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>治療日</TableCell>
                          <TableCell>症状・診断</TableCell>
                          <TableCell>薬剤</TableCell>
                          <TableCell>経過</TableCell>
                          <TableCell>休薬</TableCell>
                          <TableCell>メモ</TableCell>
                          <TableCell sx={noPrintSx}>操作</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {calfTreatments.map((item) => {
                          const withdrawal = judgeWithdrawal(item.withdrawalEndDate);
                          return (
                            <TableRow key={item.id}>
                              <TableCell>{value(item.treatmentDate)}</TableCell>
                              <TableCell>
                                {value(item.symptom)}
                                {item.diagnosis && <><br /><Typography color="text.secondary" variant="caption">{item.diagnosis}</Typography></>}
                              </TableCell>
                              <TableCell>
                                {value(item.medicine)}
                                {item.dosage && <><br /><Typography color="text.secondary" variant="caption">{item.dosage}</Typography></>}
                              </TableCell>
                              <TableCell>
                                <Chip color={treatmentProgressColor(item.progress)} label={value(item.progress)} size="small" />
                              </TableCell>
                              <TableCell>
                                <Chip color={withdrawalColor(withdrawal)} label={withdrawal} size="small" />
                                {item.withdrawalEndDate && <><br /><Typography color="text.secondary" variant="caption">{item.withdrawalEndDate} / あと{daysUntil(item.withdrawalEndDate)}日</Typography></>}
                              </TableCell>
                              <TableCell>{value(item.note)}</TableCell>
                              <TableCell sx={noPrintSx}>
                                <Button component={RouterLink} size="small" to={`/treatments/${item.id}/edit`} variant="outlined">
                                  編集
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 3, '@media print': { breakInside: 'avoid', boxShadow: 'none', borderColor: '#999', borderRadius: 1 } }}>
            <CardContent sx={{ '@media print': { p: 1.25, '&:last-child': { pb: 1.25 } } }}>
              <Stack spacing={2} sx={{ '@media print': { gap: 1 } }}>
                <SectionTitle
                  title="給与目安"
                  subtitle="現在の日齢に最も近い給与目安を表示します。"
                />

                {ageDays === null ? (
                  <Alert severity="info">生年月日または経過日数がないため、日齢から給与目安を表示できません。</Alert>
                ) : !guide ? (
                  <Alert severity="info">給与目安が登録されていません。</Alert>
                ) : (
                  <>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      <Chip label={`現在日齢 ${ageDays}日`} size="small" />
                      <Chip label={`近い日齢 ${value(guide.ageDays)}日`} size="small" variant="outlined" />
                      <Chip label={value(guide.stageName)} size="small" variant="outlined" />
                    </Stack>

                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      <InfoBox label="月齢" valueText={value(guide.ageMonth)} />
                      <InfoBox label="目標体重" valueText={formatAmount(guide.targetWeight, 'kg')} />
                      <InfoBox label="目標体高" valueText={formatAmount(guide.targetHeight, 'cm')} />
                      <InfoBox label="胸囲" valueText={formatAmount(guide.targetChest, 'cm')} />
                      <InfoBox label="スターター" valueText={formatAmount(guide.starterAmount ?? guide.starterKg, 'kg')} />
                      <InfoBox label="育成配合" valueText={formatAmount(guide.growingFeedAmount ?? guide.growingFeedKg, 'kg')} />
                      <InfoBox label="粗飼料" valueText={formatAmount(guide.roughageAmount ?? guide.roughageKg, 'kg')} />
                      <InfoBox label="その他" valueText={formatAmount(guide.otherAmount, 'kg')} />
                    </Stack>

                    {guide.memo && (
                      <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 1.25, '@media print': { bgcolor: '#fff', p: 0.75 } }}>
                        <Typography color="text.secondary" variant="caption">給与目安メモ</Typography>
                        <Typography>{guide.memo}</Typography>
                      </Box>
                    )}
                  </>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 3, '@media print': { breakInside: 'avoid', boxShadow: 'none', borderColor: '#999', borderRadius: 1 } }}>
            <CardContent sx={{ '@media print': { p: 1.25, '&:last-child': { pb: 1.25 } } }}>
              <Stack spacing={2} sx={{ '@media print': { gap: 1 } }}>
                <Stack
                  alignItems={{ xs: 'stretch', md: 'center' }}
                  direction={{ xs: 'column', md: 'row' }}
                  justifyContent="space-between"
                  spacing={1.5}
                >
                  <SectionTitle
                    title="給与アラート対応履歴"
                    subtitle="この子牛に対して登録された対応記録を新しい順で表示します。"
                  />

                  <Button component={RouterLink} to={newActionLink(calf, ageDays)} variant="contained" sx={noPrintSx}>
                    対応記録を追加
                  </Button>
                </Stack>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip label={`履歴 ${calfActions.length}件`} size="small" />
                  <Chip color={pendingActions.length > 0 ? 'warning' : 'success'} label={`未完了 ${pendingActions.length}件`} size="small" variant="outlined" />
                  <Chip label={`次回確認 ${nextCheckDate || '-'}`} size="small" variant="outlined" />
                </Stack>

                {calfActions.length === 0 ? (
                  <Alert severity="success">この子牛の給与アラート対応記録はまだありません。</Alert>
                ) : (
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small" sx={{ '@media print': { '& th, & td': { px: 0.75, py: 0.5, fontSize: 12 } } }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>対応日</TableCell>
                          <TableCell>アラート</TableCell>
                          <TableCell>対応内容</TableCell>
                          <TableCell>状態</TableCell>
                          <TableCell>次回確認日</TableCell>
                          <TableCell>メモ</TableCell>
                          <TableCell sx={noPrintSx}>操作</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {calfActions.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{value(item.actionDate)}</TableCell>
                            <TableCell>
                              <Chip
                                color={alertColor(String(item.alertType || ''))}
                                label={value(item.alertType)}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>{value(item.actionType)}</TableCell>
                            <TableCell>
                              <Chip
                                color={statusColor(String(item.status || ''))}
                                label={value(item.status)}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>{value(item.nextCheckDate)}</TableCell>
                            <TableCell>{value(item.memo)}</TableCell>
                            <TableCell sx={noPrintSx}>
                              <Button
                                component={RouterLink}
                                size="small"
                                to={`/feeding-alert-actions/${item.id}/edit`}
                                variant="outlined"
                              >
                                編集
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}

export default CalfDetail;
