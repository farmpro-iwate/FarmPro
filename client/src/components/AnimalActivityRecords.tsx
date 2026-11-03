import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { getAllRecords } from '../storage/repository';
import { getStoredAuthUser } from '../services/authClient';
import { ACTIVITY_RECORD_SYNC_STATUS_EVENT, getActivityRecords } from '../services/activityRecordsApi';
import type { ActivityRecord } from '../types/activityRecord';
import { findActivityAnimal, type ActivityAnimalKind, type ActivityAnimalRow } from '../utils/activityRecordAnimal';

type Props = { kind: ActivityAnimalKind; animal: ActivityAnimalRow; canAdd?: boolean };

export function AnimalActivityRecords({ kind, animal, canAdd = true }: Props) {
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const user = getStoredAuthUser();
  const farmId = user?.farmId;
  const userId = user?.id;
  const id = String(animal.id);
  const returnTo = `/${kind === 'calf' ? 'calves' : 'cattle'}/${encodeURIComponent(id)}`;
  const newQuery = new URLSearchParams({ type: 'animal', animalKind: kind, animalId: id, returnTo });

  useEffect(() => {
    const reload = () => { if (document.visibilityState !== 'hidden') setRefresh(value => value + 1); };
    window.addEventListener(ACTIVITY_RECORD_SYNC_STATUS_EVENT, reload);
    window.addEventListener('focus', reload);
    return () => {
      window.removeEventListener(ACTIVITY_RECORD_SYNC_STATUS_EVENT, reload);
      window.removeEventListener('focus', reload);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setRecords([]); setError(''); setLoading(true);
    const sameContext = () => {
      const current = getStoredAuthUser();
      return current?.farmId === farmId && current?.id === userId;
    };
    const load = async () => {
      try {
        const [all, animals] = await Promise.all([
          getActivityRecords(), getAllRecords<ActivityAnimalRow>(kind === 'calf' ? 'calves' : 'cattle'),
        ]);
        if (!active || !sameContext()) return;
        setRecords(all.filter(record => {
          if (record.deletedAt || record.activityRecordSyncDeletePending) return false;
          const found = findActivityAnimal(record, kind === 'cattle' ? animals : [], kind === 'calf' ? animals : []);
          return found?.kind === kind && String(found.animal.id) === id;
        }).sort((a, b) => String(b.recordDate || '').localeCompare(String(a.recordDate || '')) ||
          String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
      } catch {
        if (active && sameContext()) setError('個体の記録を読み込めませんでした。');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [kind, id, farmId, userId, refresh]);

  return (
    <Card>
      <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
        <Stack spacing={1.25}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <Typography variant="h6" fontWeight={800} sx={{ flexGrow: 1 }}>個体の記録</Typography>
            <Stack direction="row" spacing={1} className="no-print">
              {canAdd && <Button component={RouterLink} to={`/activities/new?${newQuery}`} variant="contained">記録を追加</Button>}
              <Button component={RouterLink} to="/activities?type=animal" variant="outlined">記録一覧</Button>
            </Stack>
          </Stack>
          {error && <Alert severity="error" action={<Button color="inherit" onClick={() => setRefresh(value => value + 1)}>再読み込み</Button>}>{error}</Alert>}
          {loading ? <Typography color="text.secondary">読み込み中...</Typography>
            : !error && records.length === 0 ? <Typography color="text.secondary">この個体の記録はまだありません。</Typography> : null}
          {records.map(record => (
            <Card key={record.id} variant="outlined">
              <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Stack spacing={0.5}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography color="text.secondary" sx={{ flexGrow: 1 }}>{record.recordDate}</Typography>
                    <Button component={RouterLink} to={`/activities/${encodeURIComponent(record.id)}/edit?${new URLSearchParams({ returnTo })}`}
                      variant="outlined" size="small" className="no-print">確認・編集</Button>
                  </Stack>
                  <Typography fontWeight={800} sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{record.title}</Typography>
                  {record.note && <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{record.note}</Typography>}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
