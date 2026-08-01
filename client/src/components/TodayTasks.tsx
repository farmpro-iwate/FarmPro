import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Chip, Stack, Typography } from '@mui/material';
import { getScheduleList } from '../services/scheduleApi';
import { getVaccineList } from '../services/vaccineApi';
import { getBlvTestList } from '../services/blvApi';
import { getTreatmentList } from '../services/treatmentApi';
import { getSalesList } from '../services/salesApi';

type Row = Record<string, any>;
type Task = { id: string; label: string; target: string; status: string; link: string };

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
  if (days >= 22) return { label: '出荷候補確認', status: `市場まで${days}日` };
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

export function TodayTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    async function load() {
      const [schedules, vaccines, blv, treatments, sales] = await Promise.all([
        getScheduleList().catch(() => []),
        getVaccineList().catch(() => []),
        getBlvTestList().catch(() => []),
        getTreatmentList().catch(() => []),
        getSalesList().catch(() => [])
      ]);
      const result: Task[] = [];
      (schedules as Row[]).forEach((row) => {
        const status = row.status === '完了' ? '' : dateStatus(row.dueDate);
        if (status) result.push({ id: `s-${row.id}`, label: row.title || '作業予定', target: row.targetName || '農場全体', status, link: '/schedules' });
      });
      (vaccines as Row[]).forEach((row) => {
        const status = row.status === '接種済み' ? '' : dateStatus(row.nextDueDate);
        if (status) result.push({ id: `v-${row.id}`, label: row.vaccineName || 'ワクチン', target: row.targetName || row.targetNumber || '-', status, link: '/vaccines' });
      });
      (blv as Row[]).forEach((row) => {
        const status = dateStatus(row.nextTestDate);
        if (status) result.push({ id: `b-${row.id}`, label: 'BLV次回検査', target: row.cowName || row.cowEarTag || '-', status, link: '/blv' });
      });
      (treatments as Row[]).forEach((row) => {
        if (row.progress === '治療中' || row.progress === '要再診') result.push({ id: `t-${row.id}`, label: row.progress, target: row.targetName || row.targetNumber || '-', status: row.progress === '要再診' ? '要対応' : '注意', link: '/treatments' });
        if (row.withdrawalEndDate && String(row.withdrawalEndDate).slice(0, 10) >= localDateText()) result.push({ id: `w-${row.id}`, label: '休薬期間中', target: row.targetName || row.targetNumber || '-', status: '注意', link: '/treatments' });
      });
      (sales as Row[]).forEach((row) => {
        if (row.status !== '出荷予定') return;
        const remainingDays = daysUntil(row.shippingPlanDate);
        if (remainingDays === null) return;
        const preparation = marketPreparation(remainingDays);
        if (!preparation) return;
        const numberAndName = [row.targetNumber, row.targetName].filter(Boolean).join(' ');
        const market = row.marketName || '市場名未登録';
        const date = String(row.shippingPlanDate || '').slice(0, 10);
        result.push({
          id: `market-${row.id}`,
          label: preparation.label,
          target: `${numberAndName || '対象未登録'}　${market} ${date}`,
          status: preparation.status,
          link: '/market-shipping-plan'
        });
      });
      setTasks(result);
    }
    load();
  }, []);

  if (!tasks.length) return <Alert severity="success">追加の注意事項はありません。</Alert>;
  return (
    <Stack spacing={1}>
      {tasks.map((task) => (
        <Stack key={task.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <Chip size="small" label={task.status} color={taskColor(task.status)} />
          <Typography fontWeight={800} sx={{ flexGrow: 1 }}>{task.label}　{task.target}</Typography>
          <Button component={RouterLink} to={task.link} size="small">開く</Button>
        </Stack>
      ))}
    </Stack>
  );
}
