import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { getScheduleList } from '../services/scheduleApi';
import type { Schedule } from '../types/schedule';

function todayText() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mapScheduleTitleToBreedingTreatmentType(title: string): string {
  if (title.includes('排卵')) return '排卵誘起処置';
  if (title.includes('発情')) return '発情誘起処置';
  if (title.includes('同期')) return '発情・排卵同期化';
  if (title.includes('黄体')) return '黄体関連処置';
  return 'その他の繁殖処置';
}

function isInseminationTitle(title: string): boolean {
  const normalized = title.trim().toUpperCase();
  return title.includes('人工授精') || title.includes('人工受精') || title.includes('種付') || normalized === 'AI' || normalized.includes('AI実施');
}

function isTransferTitle(title: string): boolean {
  return title.includes('受精卵移植') || title.toUpperCase().includes('ET');
}

function isAiOrEt(title: string): boolean {
  return isInseminationTitle(title) || isTransferTitle(title);
}

function buildExecuteUrl(item: Schedule): string {
  const commonParams = new URLSearchParams({
    targetNumber: item.targetNumber,
    targetName: item.targetName,
    actionDate: item.dueDate,
    sourceScheduleId: String(item.id),
    programId: item.synchronizationProgramId || '',
    programName: item.synchronizationProgramName || '',
    returnTo: '/schedules/synchronization/today',
  });

  if (isInseminationTitle(item.title)) {
    return `/breedings/synchronization/insemination?${commonParams.toString()}`;
  }

  if (isTransferTitle(item.title)) {
    return `/breedings/synchronization/transfer?${commonParams.toString()}`;
  }

  const treatmentParams = new URLSearchParams({
    targetNumber: item.targetNumber,
    targetName: item.targetName,
    recordType: '繁殖治療',
    breedingTreatmentType: mapScheduleTitleToBreedingTreatmentType(item.title),
    treatmentDate: item.dueDate,
    symptom: item.title,
    sourceScheduleId: String(item.id),
    returnTo: '/schedules/synchronization/today',
  });
  return `/treatments/new?${treatmentParams.toString()}`;
}

function buildBulkExecuteUrl(item: Schedule): string {
  const params = new URLSearchParams({
    programId: item.synchronizationProgramId || '',
    title: item.title,
    returnTo: '/schedules/synchronization/today',
  });
  return `/schedules/synchronization/bulk-treatment?${params.toString()}`;
}

export function TodaySynchronizationTasksPage() {
  const [items, setItems] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const today = todayText();

  useEffect(() => {
    getScheduleList()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  const todayItems = useMemo(
    () => items
      .filter((item) => Boolean(item.synchronizationProgramId))
      .filter((item) => item.status !== '完了' && item.dueDate === today)
      .sort((a, b) => {
        const programCompare = (a.synchronizationProgramName || '').localeCompare(b.synchronizationProgramName || '');
        if (programCompare !== 0) return programCompare;
        return a.title.localeCompare(b.title);
      }),
    [items, today],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    todayItems.forEach((item) => {
      const key = `${item.synchronizationProgramName || '同期化'}|${item.title}`;
      const current = map.get(key) || [];
      current.push(item);
      map.set(key, current);
    });
    return Array.from(map.entries());
  }, [todayItems]);

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>今日の同期化作業</Typography>
          <Typography color="text.secondary">{today} に実施する同期化関連の作業だけを表示します。</Typography>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button component={RouterLink} to="/schedules/synchronization/progress" variant="outlined">同期化進捗</Button>
          <Button component={RouterLink} to="/schedules" variant="outlined">予定管理へ戻る</Button>
        </Stack>
      </Stack>

      {todayItems.length === 0 ? (
        <Alert severity="info">今日の同期化作業はありません。</Alert>
      ) : (
        <>
          <Alert severity="info">今日の対象は {todayItems.length}件です。実施後に保存すると、元の同期化予定は自動で完了になります。</Alert>
          <Stack spacing={1.25}>
            {grouped.map(([key, groupItems]) => {
              const first = groupItems[0];
              const canBulkExecute = groupItems.length > 1 && !isAiOrEt(first.title);
              return (
                <Card key={key} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
                        <Stack spacing={0.2}>
                          <Typography variant="h6" fontWeight={900}>{first.title}</Typography>
                          <Typography color="text.secondary">{first.synchronizationProgramName || '同期化プログラム'} / {first.synchronizationPurpose || '-'}</Typography>
                        </Stack>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                          <Chip label={`${groupItems.length}頭`} color="primary" variant="outlined" />
                          {canBulkExecute && (
                            <Button component={RouterLink} to={buildBulkExecuteUrl(first)} variant="contained">
                              この処置を一括実施
                            </Button>
                          )}
                        </Stack>
                      </Stack>

                      {groupItems.map((item) => (
                        <Card key={item.id} variant="outlined">
                          <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                              <Stack spacing={0.2} sx={{ flexGrow: 1 }}>
                                <Typography fontWeight={900}>{item.targetName || '-'}</Typography>
                                <Typography color="text.secondary">耳標 {item.targetNumber || '-'} / {item.synchronizationStep || ''}</Typography>
                              </Stack>
                              <Button
                                component={RouterLink}
                                to={buildExecuteUrl(item)}
                                variant="outlined"
                                startIcon={<PlayArrowIcon />}
                              >
                                1頭ずつ実施
                              </Button>
                            </Stack>
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        </>
      )}
    </Stack>
  );
}
