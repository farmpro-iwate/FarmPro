import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { getScheduleList } from '../services/scheduleApi';
import type { Schedule } from '../types/schedule';

type SynchronizationGroup = {
  id: string;
  name: string;
  purpose: string;
  startDate: string;
  items: Schedule[];
  cattleCount: number;
  completedCount: number;
  pendingCount: number;
  todayCount: number;
};

function todayText() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function SynchronizationGroupProgressPage() {
  const [items, setItems] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getScheduleList()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo<SynchronizationGroup[]>(() => {
    const today = todayText();
    const byProgram = new Map<string, Schedule[]>();

    items
      .filter((item) => Boolean(item.synchronizationProgramId))
      .forEach((item) => {
        const id = item.synchronizationProgramId as string;
        const current = byProgram.get(id) || [];
        current.push(item);
        byProgram.set(id, current);
      });

    return Array.from(byProgram.entries())
      .map(([id, programItems]) => {
        const first = programItems[0];
        const cattleKeys = new Set(
          programItems.map((item) => `${item.targetNumber}|${item.targetName}`),
        );
        const completedCount = programItems.filter((item) => item.status === '完了').length;
        const pendingCount = programItems.length - completedCount;
        const todayCount = programItems.filter(
          (item) => item.status !== '完了' && item.dueDate === today,
        ).length;

        return {
          id,
          name: first.synchronizationProgramName || '同期化プログラム',
          purpose: first.synchronizationPurpose || '-',
          startDate: first.synchronizationStartDate || '-',
          items: [...programItems].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
          cattleCount: cattleKeys.size,
          completedCount,
          pendingCount,
          todayCount,
        };
      })
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [items]);

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>同期化グループ進捗</Typography>
          <Typography color="text.secondary">同期化プログラムごとに、対象牛と予定の進み具合を確認します。</Typography>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button component={RouterLink} to="/schedules/synchronization/today" variant="contained">今日の同期化作業</Button>
          <Button component={RouterLink} to="/schedules/synchronization/new" variant="outlined">同期化を開始</Button>
          <Button component={RouterLink} to="/schedules" variant="outlined">予定管理へ戻る</Button>
        </Stack>
      </Stack>

      {groups.length === 0 ? (
        <Alert severity="info">同期化プログラムはまだありません。</Alert>
      ) : (
        <Stack spacing={1.25}>
          {groups.map((group) => {
            const total = group.items.length;
            const percent = total > 0 ? Math.round((group.completedCount / total) * 100) : 0;
            return (
              <Card key={group.id} variant="outlined">
                <CardContent>
                  <Stack spacing={1.25}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
                      <Stack spacing={0.25}>
                        <Typography variant="h6" fontWeight={900}>{group.name}</Typography>
                        <Typography color="text.secondary">{group.purpose} / 開始日：{group.startDate}</Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        <Chip label={`対象 ${group.cattleCount}頭`} />
                        <Chip label={`予定 ${total}件`} />
                        <Chip label={`完了 ${group.completedCount}件`} color={group.completedCount === total ? 'success' : 'default'} />
                        <Chip label={`未完了 ${group.pendingCount}件`} color={group.pendingCount > 0 ? 'warning' : 'success'} />
                        {group.todayCount > 0 && <Chip label={`今日 ${group.todayCount}件`} color="primary" />}
                      </Stack>
                    </Stack>

                    <Stack spacing={0.5}>
                      <Stack direction="row" justifyContent="space-between">
                        <Typography fontWeight={800}>進捗</Typography>
                        <Typography fontWeight={800}>{percent}%</Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={percent} />
                    </Stack>

                    <Stack spacing={0.75}>
                      {group.items.map((item) => (
                        <Card key={item.id} variant="outlined">
                          <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                              <Typography fontWeight={900} sx={{ minWidth: 105 }}>{item.dueDate}</Typography>
                              <Typography fontWeight={800} sx={{ minWidth: 150 }}>{item.title}</Typography>
                              <Typography sx={{ flexGrow: 1 }}>{item.targetName || '-'}{item.targetNumber ? `（${item.targetNumber}）` : ''}</Typography>
                              <Chip size="small" label={item.status === '完了' ? '完了' : '未完了'} color={item.status === '完了' ? 'success' : 'default'} />
                            </Stack>
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
