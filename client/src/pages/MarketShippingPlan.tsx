import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { getCalfList } from '../services/calfApi';
import { getSalesList, type SaleRecord } from '../services/salesApi';
import { getRecordById, saveRecord } from '../storage/repository';
import type { Calf } from '../types/calf';
import { formatSex } from '../utils/sex';
import { formatTemporaryCalfNumber } from '../utils/temporaryCalfNumber';

type MarketSchedule = { id: string; marketName: string; marketDate: string };
type MarketPlanSettings = {
  id: string;
  fiscalYear: string;
  minAgeDays: number;
  maxAgeDays: number;
  schedules: MarketSchedule[];
};

const SETTINGS_ID = 'market-shipping-plan-settings';
const DEFAULT_MIN_AGE = 260;
const DEFAULT_MAX_AGE = 310;

function createScheduleId() {
  return `market-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function startOfDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calcAgeDays(birthday?: string, targetDate?: string) {
  if (!birthday || !targetDate) return null;
  const birth = startOfDay(birthday);
  const target = startOfDay(targetDate);
  if (!birth || !target) return null;
  return Math.floor((target.getTime() - birth.getTime()) / 86400000);
}

function currentFiscalYear() {
  const now = new Date();
  return String(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1);
}

function displayNumber(row: Calf) {
  return formatTemporaryCalfNumber(row.calfNumber, row.birthday);
}

function displayName(row: Calf) {
  if (!row.name || row.name === '耳標未装着' || row.name.startsWith('TEMP-')) return '子牛（耳標未装着）';
  return row.name;
}

function formatDate(dateText: string) {
  const date = startOfDay(dateText);
  if (!date) return dateText;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  }).format(date);
}

function isCompletedSaleForCalf(row: Calf, sales: SaleRecord[]) {
  const numbers = [row.calfNumber, row.identificationNumber].filter(Boolean).map(String);
  return sales.some((sale) =>
    sale.targetType === '子牛' &&
    (sale.status === '出荷済み' || sale.status === '販売済み') &&
    numbers.includes(String(sale.targetNumber || ''))
  );
}

export function MarketShippingPlan() {
  const [calves, setCalves] = useState<Calf[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [fiscalYear, setFiscalYear] = useState(currentFiscalYear());
  const [minAgeDays, setMinAgeDays] = useState(DEFAULT_MIN_AGE);
  const [maxAgeDays, setMaxAgeDays] = useState(DEFAULT_MAX_AGE);
  const [schedules, setSchedules] = useState<MarketSchedule[]>([]);
  const [newMarketName, setNewMarketName] = useState('');
  const [newMarketDate, setNewMarketDate] = useState('');
  const [message, setMessage] = useState('');
  const [messageSeverity, setMessageSeverity] = useState<'success' | 'warning' | 'error'>('success');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [calfRows, saleRows, saved] = await Promise.all([
          getCalfList(),
          getSalesList(),
          getRecordById<MarketPlanSettings>('metadata', SETTINGS_ID),
        ]);
        setCalves(calfRows);
        setSales(saleRows);
        if (saved) {
          setFiscalYear(saved.fiscalYear || currentFiscalYear());
          setMinAgeDays(Number(saved.minAgeDays) || DEFAULT_MIN_AGE);
          setMaxAgeDays(Number(saved.maxAgeDays) || DEFAULT_MAX_AGE);
          setSchedules(Array.isArray(saved.schedules) ? saved.schedules : []);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '市場出荷予定を読み込めませんでした。');
        setMessageSeverity('error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function persist(nextSchedules: MarketSchedule[], nextMin: number, nextMax: number, nextYear: string) {
    await saveRecord<MarketPlanSettings>('metadata', {
      id: SETTINGS_ID,
      fiscalYear: nextYear,
      minAgeDays: nextMin,
      maxAgeDays: nextMax,
      schedules: nextSchedules,
    });
  }

  async function saveCriteria() {
    if (minAgeDays < 0 || maxAgeDays < 0 || minAgeDays > maxAgeDays) {
      setMessage('開始日齢は終了日齢以下で入力してください。');
      setMessageSeverity('warning');
      return;
    }
    try {
      setSaving(true);
      await persist(schedules, minAgeDays, maxAgeDays, fiscalYear);
      setMessage(`出荷候補基準を ${minAgeDays}日齢～${maxAgeDays}日齢で保存しました。`);
      setMessageSeverity('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '基準を保存できませんでした。');
      setMessageSeverity('error');
    } finally {
      setSaving(false);
    }
  }

  async function addSchedule() {
    const marketName = newMarketName.trim();
    if (!marketName || !newMarketDate) {
      setMessage('市場名と開催日を入力してください。');
      setMessageSeverity('warning');
      return;
    }
    if (schedules.some((item) => item.marketName === marketName && item.marketDate === newMarketDate)) {
      setMessage('同じ市場名・開催日の予定がすでにあります。');
      setMessageSeverity('warning');
      return;
    }

    const next = [...schedules, {
      id: createScheduleId(),
      marketName,
      marketDate: newMarketDate,
    }].sort((a, b) => a.marketDate.localeCompare(b.marketDate));

    try {
      setSaving(true);
      await persist(next, minAgeDays, maxAgeDays, fiscalYear);
      setSchedules(next);
      setNewMarketDate('');
      setMessage('市場開催日を追加しました。');
      setMessageSeverity('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '市場開催日を追加できませんでした。');
      setMessageSeverity('error');
    } finally {
      setSaving(false);
    }
  }

  async function removeSchedule(id: string) {
    const next = schedules.filter((item) => item.id !== id);
    try {
      setSaving(true);
      await persist(next, minAgeDays, maxAgeDays, fiscalYear);
      setSchedules(next);
      setMessage('市場開催日を削除しました。');
      setMessageSeverity('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '市場開催日を削除できませんでした。');
      setMessageSeverity('error');
    } finally {
      setSaving(false);
    }
  }

  const eligibleCalves = useMemo(() => calves.filter((row) =>
    row.managementStatus !== '牛台帳へ移行済み' &&
    row.managementStatus !== '死亡・その他' &&
    !isCompletedSaleForCalf(row, sales) &&
    Boolean(row.birthday)
  ), [calves, sales]);

  const scheduleGroups = useMemo(() => schedules.map((schedule) => ({
    schedule,
    candidates: eligibleCalves
      .map((row) => ({ row, marketAge: calcAgeDays(row.birthday, schedule.marketDate) }))
      .filter((item) => item.marketAge !== null && item.marketAge >= minAgeDays && item.marketAge <= maxAgeDays)
      .sort((a, b) => (b.marketAge ?? 0) - (a.marketAge ?? 0)),
  })), [schedules, eligibleCalves, minAgeDays, maxAgeDays]);

  if (loading) return <Typography>市場出荷予定を読み込み中です...</Typography>;

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h5" fontWeight={800}>市場出荷予定</Typography>
        <Typography color="text.secondary">年度の市場開催日程と農場の出荷日齢基準から、各開催日の対象子牛を自動表示します。</Typography>
      </Stack>

      {message && <Alert severity={messageSeverity}>{message}</Alert>}
      <Alert severity="info">出荷済み・販売済みの子牛は候補に表示しません。</Alert>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={800}>農場の出荷候補基準</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField label="年度" type="number" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} helperText="例：2026年度" fullWidth />
              <TextField label="候補開始日齢" type="number" value={minAgeDays} onChange={(e) => setMinAgeDays(Number(e.target.value))} fullWidth />
              <TextField label="候補終了日齢" type="number" value={maxAgeDays} onChange={(e) => setMaxAgeDays(Number(e.target.value))} fullWidth />
              <Button variant="contained" onClick={saveCriteria} disabled={saving} sx={{ minWidth: 120 }}>{saving ? '保存中' : '基準を保存'}</Button>
            </Stack>
            <Alert severity="info">市場当日の日齢が {minAgeDays}日～{maxAgeDays}日の子牛を候補表示します。</Alert>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={800}>{fiscalYear}年度 市場開催日程</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField label="市場名" value={newMarketName} onChange={(e) => setNewMarketName(e.target.value)} fullWidth />
              <TextField label="開催日" type="date" value={newMarketDate} onChange={(e) => setNewMarketDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
              <Button variant="contained" onClick={addSchedule} disabled={saving} sx={{ minWidth: 120 }}>{saving ? '追加中' : '開催日を追加'}</Button>
            </Stack>

            {schedules.length === 0 ? <Alert severity="info">市場開催日を追加してください。</Alert> : (
              <Stack spacing={1}>
                {schedules.map((item) => (
                  <Card key={item.id} variant="outlined">
                    <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography fontWeight={700}>{formatDate(item.marketDate)}　{item.marketName}</Typography>
                        <IconButton color="error" onClick={() => removeSchedule(item.id)} disabled={saving}><DeleteIcon /></IconButton>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Divider />
      <Typography variant="h6" fontWeight={800}>開催日別の出荷候補</Typography>

      {scheduleGroups.map(({ schedule, candidates }) => (
        <Card key={schedule.id} sx={{ border: 2, borderColor: candidates.length ? 'success.main' : 'divider' }}>
          <CardContent>
            <Stack spacing={1.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between">
                <Stack><Typography variant="h6" fontWeight={900}>{formatDate(schedule.marketDate)}</Typography><Typography color="text.secondary">{schedule.marketName}</Typography></Stack>
                <Chip label={`該当候補 ${candidates.length}頭`} color={candidates.length ? 'success' : 'default'} />
              </Stack>
              <Divider />
              {candidates.length === 0 ? <Typography color="text.secondary">設定した日齢範囲に該当する子牛はいません。</Typography> : candidates.map(({ row, marketAge }) => (
                <Card key={`${schedule.id}-${row.id}`} variant="outlined"><CardContent><Stack spacing={0.75}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between">
                    <Typography fontWeight={900}>{displayNumber(row)}　{displayName(row)}</Typography>
                    <Stack direction="row" spacing={1}><Chip size="small" label={formatSex(row.sex)} /><Chip size="small" label={`${marketAge}日齢`} color="success" /></Stack>
                  </Stack>
                  <Typography color="text.secondary">生年月日：{row.birthday || '-'}　母牛：{row.motherName || '-'}</Typography>
                  <Typography color="text.secondary">現在体重：{row.currentWeight || '-'}kg　飼養状態：{row.managementStatus || '育成中'}</Typography>
                </Stack></CardContent></Card>
              ))}
            </Stack>
          </CardContent>
        </Card>
      ))}

      {schedules.length === 0 && <Alert severity="info">開催日を登録すると、ここに該当する子牛が自動表示されます。</Alert>}
    </Stack>
  );
}

export default MarketShippingPlan;
