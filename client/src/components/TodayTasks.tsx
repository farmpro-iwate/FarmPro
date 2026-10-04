import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Card, CardActionArea, CardContent, Chip, Stack, Typography } from '@mui/material';
import { getScheduleList } from '../services/scheduleApi';
import { getVaccineList } from '../services/vaccineApi';
import { getBlvTestList } from '../services/blvApi';
import { getTreatmentList } from '../services/treatmentApi';
import { getSalesList } from '../services/salesApi';
import { getCalfList } from '../services/calfApi';
import { formatTemporaryCalfNumber } from '../utils/temporaryCalfNumber';

type Row = Record<string, any>;
type Task = {
  id: string;
  label: string;
  target: string;
  status: string;
  link: string;
  targetNumber?: string;
  targetName?: string;
  plannedDate?: string;
};

function localDateText() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateStatus(value?: string) {
  if (!value) return '';
  const date = String(value).slice(0, 10);
  const today = localDateText();
  const next = new Date(`${today}T00:00:00`);
  next.setDate(next.getDate() + 7);
  const week = next.toISOString().slice(0, 10);
  if (date < today) return '要対応';
  if (date === today) return '今日';
  if (date <= week) return '近日中';
  return '';
}

function daysUntil(value?: string) {
  if (!value) return null;
  const today = new Date(`${localDateText()}T00:00:00`);
  const target = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function marketPreparation(days: number) {
  if (days > 30) return null;
  if (days >= 29) return { label: '出荷候補確認', status: `市場まで${days}日` };
  if (days >= 22) return { label: '削蹄確認', status: `市場まで${days}日` };
  if (days >= 15) return { label: 'ワクチン・治療歴確認', status: `市場まで${days}日` };
  if (days >= 8) return { label: '体重確認', status: `市場まで${days}日` };
  if (days >= 4) return { label: '耳標・個体識別番号確認', status: `市場まで${days}日` };
  if (days >= 1) return { label: '搬出準備', status: `市場まで${days}日` };
  if (days === 0) return { label: '市場出荷', status: '今日' };
  return { label: '市場出荷状況を確認', status: '要対応' };
}

function taskColor(status: string) {
  if (status === '要対応') return 'error';
  if (status === '今日') return 'warning';
  if (status.startsWith('市場まで')) return 'info';
  return 'warning';
}

type TodayTasksProps = {
  suppressedScheduleKeys?: string[];
};

export function TodayTasks({ suppressedScheduleKeys = [] }: TodayTasksProps) {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    async function load() {
      const [schedules, vaccines, blv, treatments, sales, calves] = await Promise.all([
        getScheduleList().catch(() => []),
        getVaccineList().catch(() => []),
        getBlvTestList().catch(() => []),
        getTreatmentList().catch(() => []),
        getSalesList().catch(() => []),
        getCalfList().catch(() => [])
      ]);
      const result: Task[] = [];
      const suppressed = new Set(suppressedScheduleKeys);
      (schedules as Row[]).forEach((row) => {
        const status = row.status === '完了' ? '' : dateStatus(row.dueDate);
        const targetNumber = String(row.targetNumber || row.cowEarTag || '').trim();
        const targetName = String(row.targetName || row.cowName || '').trim();
        const title = String(row.title || '作業予定').trim();
        const scheduleKey = targetNumber && title ? `${targetNumber}::${title}` : '';
        if (scheduleKey && suppressed.has(scheduleKey)) return;
        if (status) result.push({
          id: `s-${row.id}`,
          label: title,
          target: targetName || targetNumber || '農場全体',
          status,
          link: '/schedules',
          targetNumber,
          targetName,
          plannedDate: String(row.dueDate || '').slice(0, 10),
        });
      });
      (vaccines as Row[]).forEach((row) => {
        const status = row.status === '接種済み' ? '' : dateStatus(row.nextDueDate);
        const targetNumber = String(row.targetNumber || '').trim();
        const targetName = String(row.targetName || '').trim();
        if (status) result.push({
          id: `v-${row.id}`,
          label: row.vaccineName || 'ワクチン',
          target: targetName || targetNumber || '-',
          status,
          link: '/vaccines',
          targetNumber,
          targetName,
          plannedDate: String(row.nextDueDate || '').slice(0, 10),
        });
      });
      (blv as Row[]).forEach((row) => {
        const status = dateStatus(row.nextTestDate);
        if (status) result.push({ id: `b-${row.id}`, label: 'BLV次回検査', target: row.cowName || row.cowEarTag || '-', status, link: '/blv' });
      });
      (treatments as Row[]).forEach((row) => {
        const targetNumber = String(row.targetNumber || row.cowEarTag || '').trim();
        const targetName = String(row.targetName || row.cowName || '').trim();
        const calfList = calves as Row[];
        const calfByNumber = calfList.find((calf) => {
          if (!targetNumber) return false;
          const numbers = [
            String(calf.calfNumber || '').trim(),
            String(calf.temporaryCalfNumber || '').trim(),
            formatTemporaryCalfNumber(calf.calfNumber, calf.birthday).trim(),
          ].filter(Boolean);
          return numbers.includes(targetNumber);
        });
        const sameNameCalves = !calfByNumber && targetName
          ? calfList.filter((calf) => String(calf.name || '').trim() === targetName)
          : [];
        const calfMatch = calfByNumber || (sameNameCalves.length === 1 ? sameNameCalves[0] : undefined);
        const treatmentLink = calfMatch?.id ? `/calves/${calfMatch.id}` : '/treatments';

        if (row.progress === '治療中' || row.progress === '要再診') result.push({
          id: `t-${row.id}`,
          label: row.progress,
          target: targetName || targetNumber || '-',
          status: row.progress === '要再診' ? '要対応' : '注意',
          link: treatmentLink,
          targetNumber,
          targetName,
          plannedDate: String(row.nextScheduledDate || '').slice(0, 10),
        });
        if (row.withdrawalEndDate && String(row.withdrawalEndDate).slice(0, 10) >= localDateText()) result.push({ id: `w-${row.id}`, label: '休薬期間中', target: targetName || targetNumber || '-', status: '注意', link: '/treatments' });
      });
      (sales as Row[]).forEach((row) => {
        if (row.status !== '出荷予定') return;
        const remainingDays = daysUntil(row.shippingPlanDate);
        if (remainingDays === null) return;
        const preparation = marketPreparation(remainingDays);
        if (!preparation) return;
        const targetNumber = String(row.targetNumber || '').trim();
        const targetName = String(row.targetName || '').trim();
        const numberAndName = [targetNumber, targetName].filter(Boolean).join(' ');
        const market = row.marketName || '市場名未登録';
        const date = String(row.shippingPlanDate || '').slice(0, 10);
        result.push({
          id: `market-${row.id}`,
          label: preparation.label,
          target: `${numberAndName || '対象未登録'}　${market} ${date}`,
          status: preparation.status,
          link: '/market-shipping-plan',
          targetNumber,
          targetName,
          plannedDate: date,
        });
      });
      setTasks(result);
    }
    load();
  }, [suppressedScheduleKeys]);

  if (!tasks.length) return <Alert severity="success">追加の注意事項はありません。</Alert>;

  return (
    <Stack spacing={1}>
      <Button
        component={RouterLink}
        to="/alerts"
        size="small"
        variant="text"
        sx={{ alignSelf: 'flex-end' }}
      >
        アラート一覧
      </Button>

      {tasks.map((task) => (
        <Card key={task.id} variant="outlined">
          <CardActionArea component={RouterLink} to={task.link}>
            <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                <Chip size="small" label={task.status} color={taskColor(task.status)} />
                {task.plannedDate && (
                  <Typography fontWeight={800} sx={{ minWidth: { sm: 104 } }}>
                    {task.plannedDate}
                  </Typography>
                )}
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography fontWeight={900}>{task.label}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {task.target}
                  </Typography>
                </Box>
                <Typography variant="body2" color="primary" fontWeight={800}>
                  開く →
                </Typography>
              </Stack>
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Stack>
  );
}
