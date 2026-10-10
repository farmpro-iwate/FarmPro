import { useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Stack } from '@mui/material';
import { getScheduleList } from '../services/scheduleApi';
import { getVaccineList } from '../services/vaccineApi';
import { getBlvTestList } from '../services/blvApi';
import { getTreatmentList } from '../services/treatmentApi';
import { getSalesList } from '../services/salesApi';
import { getCalfList } from '../services/calfApi';
import { formatTemporaryCalfNumber } from '../utils/temporaryCalfNumber';
import { isTreatmentRecovered } from '../utils/treatmentRecovery';
import { resolveMarketTaskTarget } from '../utils/marketTaskTarget';
import type { HomeTaskItem } from './HomeTaskSections';
import { HomeTaskCard } from './HomeTaskCard';
import { homeTaskStatus } from '../utils/homeTaskWindow';

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
  dateRole?: 'due' | 'reference';
};

function localDateText(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateStatus(value?: string, title = '') {
  return value ? homeTaskStatus(String(value).slice(0, 10), localDateText(), title) || '' : '';
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
  if (status === '要対応' || status === '期限超過') return 'error';
  if (status === '今日') return 'warning';
  if (status.startsWith('市場まで')) return 'info';
  return 'warning';
}

function sameTreatmentTarget(a: Row, b: Row) {
  const aNumber = String(a.targetNumber || a.cowEarTag || '').trim();
  const bNumber = String(b.targetNumber || b.cowEarTag || '').trim();
  if (aNumber && bNumber) return aNumber === bNumber;

  const aName = String(a.targetName || a.cowName || '').trim();
  const bName = String(b.targetName || b.cowName || '').trim();
  return Boolean(aName && bName && aName === bName);
}

function followUpAlreadyCompleted(row: Row, treatments: Row[]) {
  const plannedDate = String(row.nextScheduledDate || '').slice(0, 10);
  if (!plannedDate) return false;

  return treatments.some((candidate) => {
    if (candidate.id === row.id) return false;
    if (!sameTreatmentTarget(row, candidate)) return false;
    const treatmentDate = String(candidate.treatmentDate || '').slice(0, 10);
    return Boolean(treatmentDate && treatmentDate >= plannedDate);
  });
}

const EMPTY_SUPPRESSED_KEYS: string[] = [];

type TodayTasksProps = {
  suppressedScheduleKeys?: string[];
  renderItems?: (items: HomeTaskItem[], loading: boolean, issues: string[]) => ReactNode;
};

export function TodayTasks({ suppressedScheduleKeys = EMPTY_SUPPRESSED_KEYS, renderItems }: TodayTasksProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const unavailable: string[] = [];
      const failed = (label: string) => () => {
        unavailable.push(`${label}を読み込めませんでした。表示されていない対応がある可能性があります。`);
        return [];
      };
      const [schedules, vaccines, blv, treatments, sales, calves] = await Promise.all([
        getScheduleList().catch(failed('作業予定')),
        getVaccineList().catch(failed('ワクチン')),
        getBlvTestList().catch(failed('BLV検査')),
        getTreatmentList().catch(failed('治療記録')),
        getSalesList().catch(failed('出荷予定')),
        getCalfList().catch(failed('子牛情報'))
      ]);
      const result: Task[] = [];
      const suppressed = new Set(suppressedScheduleKeys);
      (schedules as Row[]).forEach((row) => {
        const status = ['完了', '取消', '取消済み', '中止'].includes(row.status) ? '' : dateStatus(row.dueDate, String(row.title || ''));
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
        if (status) result.push({
          id: `b-${row.id}`, label: 'BLV次回検査', target: row.cowName || row.cowEarTag || '-',
          status, link: '/blv', plannedDate: String(row.nextTestDate || '').slice(0, 10),
        });
      });
      const treatmentRows = treatments as Row[];
      treatmentRows.forEach((row) => {
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
        const treatmentParams = new URLSearchParams({
          targetNumber: String(calfMatch?.calfNumber || targetNumber),
          targetName: String(calfMatch?.name || targetName),
          sourceTreatmentId: String(row.id),
          returnTo: '/',
        });
        const treatmentLink = `/treatments/new?${treatmentParams.toString()}`;

        const followUpCompleted = followUpAlreadyCompleted(row, treatmentRows);
        const treatmentStatus = dateStatus(row.nextScheduledDate || row.treatmentDate);

        if ((row.progress === '治療中' || row.progress === '要再診') && !followUpCompleted && !isTreatmentRecovered(row, treatmentRows) && treatmentStatus) result.push({
          id: `t-${row.id}`,
          label: row.progress,
          target: targetName || targetNumber || '-',
          status: row.nextScheduledDate ? treatmentStatus : '注意',
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
        const { targetNumber, targetName } = resolveMarketTaskTarget(row, calves);
        const numberAndName = [targetNumber, targetName].filter(Boolean).join(' ');
        const market = row.marketName || '市場名未登録';
        const date = String(row.shippingPlanDate || '').slice(0, 10);
        result.push({
          id: `market-${row.id}`,
          label: preparation.label,
          target: `${numberAndName || '対象未登録'}　${market}`,
          status: preparation.status,
          link: '/market-shipping-plan',
          targetNumber,
          targetName,
          plannedDate: date,
          dateRole: 'reference',
        });
      });
      if (!active) return;
      setTasks(result);
      setIssues(unavailable);
      setLoading(false);
    }
    load().catch(() => {
      if (!active) return;
      setIssues(['対応予定を確認できませんでした。画面を開き直して確認してください。']);
      setLoading(false);
    });
    return () => { active = false; };
  }, [suppressedScheduleKeys]);

  const items: HomeTaskItem[] = tasks.map((task) => ({
    id: task.id,
    status: task.status,
    plannedDate: task.plannedDate,
    dateRole: task.dateRole,
    content: (
      <HomeTaskCard
        key={task.id}
        to={task.link}
        status={task.status}
        statusColor={taskColor(task.status)}
        date={task.plannedDate}
        dateLabel={task.dateRole === 'reference' ? '市場日' : undefined}
        title={task.label}
        detail={task.target}
      />
    ),
  }));

  if (!renderItems && !tasks.length && !loading && !issues.length) {
    return <Alert severity="success">追加の注意事項はありません。</Alert>;
  }

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
      {renderItems ? renderItems(items, loading, issues) : (
        <>
          {loading && <Alert severity="info">対応予定を確認しています...</Alert>}
          {issues.map((issue) => <Alert key={issue} severity="warning">{issue}</Alert>)}
          {items.map((item) => item.content)}
        </>
      )}
    </Stack>
  );
}
