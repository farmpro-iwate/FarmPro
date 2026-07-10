import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Chip, Stack, Typography } from '@mui/material';
import { getScheduleList } from '../services/scheduleApi';
import { getVaccineList } from '../services/vaccineApi';
import { getBlvTestList } from '../services/blvApi';
import { getTreatmentList } from '../services/treatmentApi';

type Row = Record<string, any>;
type Task = { id: string; label: string; target: string; status: string; link: string };

function dateStatus(value?: string) {
  if (!value) return '';
  const date = String(value).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const next = new Date();
  next.setDate(next.getDate() + 7);
  const week = next.toISOString().slice(0, 10);
  if (date < today) return '要対応';
  if (date === today) return '今日';
  if (date <= week) return '近日中';
  return '';
}

export function TodayTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    async function load() {
      const [schedules, vaccines, blv, treatments] = await Promise.all([
        getScheduleList().catch(() => []),
        getVaccineList().catch(() => []),
        getBlvTestList().catch(() => []),
        getTreatmentList().catch(() => [])
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
        if (row.withdrawalEndDate && String(row.withdrawalEndDate).slice(0, 10) >= new Date().toISOString().slice(0, 10)) result.push({ id: `w-${row.id}`, label: '休薬期間中', target: row.targetName || row.targetNumber || '-', status: '注意', link: '/treatments' });
      });
      setTasks(result);
    }
    load();
  }, []);

  if (!tasks.length) return <Alert severity="success">追加の注意事項はありません。</Alert>;
  return <Stack spacing={1}>{tasks.map((task) => <Stack key={task.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}><Chip size="small" label={task.status} color={task.status === '要対応' ? 'error' : 'warning'} /><Typography fontWeight={800} sx={{ flexGrow: 1 }}>{task.label}　{task.target}</Typography><Button component={RouterLink} to={task.link} size="small">開く</Button></Stack>)}</Stack>;
}
