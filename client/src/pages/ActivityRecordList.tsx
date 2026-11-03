import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, IconButton, Menu, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { ACTIVITY_RECORD_SYNC_STATUS_EVENT, assertActivityRecordSyncContext, deleteActivityRecord,
  getActivityRecords, getActivityRecordSyncContext, getActivityRecordSyncStatus } from '../services/activityRecordsApi';
import type { ActivityRecord } from '../types/activityRecord';
import { formatTemporaryCalfNumber, isTemporaryCalfNumber } from '../utils/temporaryCalfNumber';
import { useFeedingFatteningListSync } from './feedingFatteningPageSync';

export function ActivityRecordList() {
  const [params, setParams] = useSearchParams();
  const activityType = params.get('type') === 'animal' ? 'animal' : 'farm';
  const [keyword, setKeyword] = useState('');
  const [menu, setMenu] = useState<{ anchor: HTMLElement; record: ActivityRecord; context: ReturnType<typeof getActivityRecordSyncContext> } | null>(null);
  const viewContext = getActivityRecordSyncContext();
  const { records, loading, deletingId, error, handleDelete, reload } = useFeedingFatteningListSync({
    getContext: getActivityRecordSyncContext,
    assertContext: assertActivityRecordSyncContext,
    getList: getActivityRecords,
    deleteRecord: deleteActivityRecord,
    statusEvent: ACTIVITY_RECORD_SYNC_STATUS_EVENT,
    loadFailure: '活動記録を取得できませんでした。',
    deleteFailure: '記録を削除できませんでした。',
    confirmDelete: (record: ActivityRecord) => `「${record.title}」の記録を削除しますか？`,
  });
  const label = activityType === 'farm' ? '農場作業' : '個体の記録';
  const query = keyword.trim().toLocaleLowerCase();
  const visible = records.filter(record => record.activityType === activityType &&
    !record.deletedAt && !record.activityRecordSyncDeletePending &&
    (!query || [record.recordDate, record.title, record.note, record.animalName, record.animalEarTag].join(' ').toLocaleLowerCase().includes(query)))
    .sort((left, right) => String(right.recordDate || '').localeCompare(String(left.recordDate || '')) || String(right.createdAt || '').localeCompare(String(left.createdAt || '')) || left.id.localeCompare(right.id));
  const pendingCount = records.filter(record => getActivityRecordSyncStatus(record).pending).length;
  const warnings = [...new Set(records.map(record => getActivityRecordSyncStatus(record).warning).filter(Boolean))];
  const editPath = (record: ActivityRecord) => `/activities/${encodeURIComponent(record.id)}/edit?returnTo=${encodeURIComponent(`/activities?type=${activityType}`)}`;
  function currentMenu() {
    if (!menu) return null;
    try { assertActivityRecordSyncContext(menu.context); }
    catch { return null; }
    return records.some(record => record.id === menu.record.id) ? menu : null;
  }
  const activeMenu = currentMenu();

  return <Stack spacing={2}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
      <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>活動記録</Typography>
      <Button component={RouterLink} to={`/activities/new?type=${activityType}`} variant="contained" disabled={Boolean(deletingId)}>{label}を登録</Button>
    </Stack>
    <Tabs value={activityType} onChange={(_event, value) => { setMenu(null); setParams({ type: value }); }} variant="fullWidth" aria-label="記録の種類">
      <Tab value="farm" label="農場作業" />
      <Tab value="animal" label="個体の記録" />
    </Tabs>
    <TextField label="記録を検索" placeholder={activityType === 'farm' ? '日付・作業内容・メモ' : '名号・耳標番号・記録内容'} value={keyword} onChange={event => setKeyword(event.target.value)} fullWidth />
    {error && <Alert severity="warning" action={<Button onClick={() => void reload()} disabled={Boolean(deletingId)}>再読み込み</Button>}>{error}</Alert>}
    {(pendingCount > 0 || warnings.length > 0) && <Alert severity={warnings.length ? 'warning' : 'info'}>
      {pendingCount > 0 && <Typography variant="body2">未送信の活動記録が{pendingCount}件あります。この端末に保存されています。</Typography>}
      {warnings.map(warning => <Typography variant="body2" key={warning}>{warning}</Typography>)}
    </Alert>}
    {loading ? <Typography>読み込み中...</Typography> : <>
      <Typography color="text.secondary">{visible.length}件</Typography>
      {!visible.length && !error && <Typography color="text.secondary">{query ? '条件に合う記録はありません。' : `${label}はまだ登録されていません。`}</Typography>}
      {visible.map(record => {
        const status = getActivityRecordSyncStatus(record);
        const number = record.animalKind === 'calf' && isTemporaryCalfNumber(record.animalEarTag)
          ? `仮番号 ${formatTemporaryCalfNumber(record.animalEarTag, record.animalBirthday)}`
          : record.animalEarTag ? `耳標 ${record.animalEarTag}` : '';
        return <Card key={record.id} variant="outlined"><CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography color="text.secondary">{record.recordDate}</Typography>
                {status.pending && <Chip size="small" label="未送信" color="warning" />}
              </Stack>
              {record.activityType === 'animal' && <Typography fontWeight={700} sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>{record.animalName || '名号未登録'}{number ? `（${number}）` : ''}</Typography>}
              <Typography sx={{ mt: 0.75, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{record.title}</Typography>
              {record.note && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{record.note}</Typography>}
            </Box>
            <IconButton aria-label={`${record.title}の操作`} disabled={Boolean(deletingId)} onClick={event => {
              try { assertActivityRecordSyncContext(viewContext); setMenu({ anchor: event.currentTarget, record, context: viewContext }); }
              catch { setMenu(null); }
            }}><MoreVertIcon /></IconButton>
          </Stack>
        </CardContent></Card>;
      })}
    </>}
    <Menu anchorEl={activeMenu?.anchor} open={Boolean(activeMenu)} onClose={() => setMenu(null)}>
      <MenuItem component={RouterLink} to={activeMenu ? editPath(activeMenu.record) : '#'} onClick={event => {
        if (!currentMenu()) event.preventDefault();
        setMenu(null);
      }}>編集</MenuItem>
      <MenuItem sx={{ color: 'error.main' }} onClick={() => { const record = currentMenu()?.record; setMenu(null); if (record) void handleDelete(record); }}>削除</MenuItem>
    </Menu>
  </Stack>;
}
