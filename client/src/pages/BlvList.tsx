import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, IconButton, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { BlvTest } from '../types/blv';
import { assertBlvSyncContext, BLV_SYNC_STATUS_EVENT, deleteBlvTest, getBlvSyncContext, getBlvSyncStatus, getBlvTestList } from '../services/blvApi';
import { daysUntil, judgeBlvNextTest } from '../utils/blv';
import { matchesAnyText, matchesSelect } from '../utils/search';

function BlvSyncChip({ record }: { record: BlvTest }) {
  const status = getBlvSyncStatus(record);
  return status.pending || status.warning
    ? <Chip size="small" variant="outlined" color="warning" label={status.warning ? '同期の確認が必要' : '未送信'} />
    : null;
}

export function BlvList() {
  const [items, setItems] = useState<BlvTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [result, setResult] = useState('すべて');
  const [searchOpen, setSearchOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const viewGeneration = useRef(0);
  const mutationVersion = useRef(0);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);
  const [, refreshContext] = useState(0);
  const syncContext = getBlvSyncContext();

  useEffect(() => {
    let active = true;
    let running: Promise<void> | undefined;
    let requestedAgain = false;
    viewGeneration.current += 1;
    mutationVersion.current += 1;
    deletingRef.current = false;
    setDeleting(false);
    setItems([]);
    setLoading(true);
    setDeleteError('');
    setLoadError('');
    const currentContext = () => {
      try { assertBlvSyncContext(syncContext); return true; }
      catch { if (active) refreshContext(value => value + 1); return false; }
    };
    const load = (): Promise<void> => {
      if (!active || deletingRef.current) return Promise.resolve();
      if (running) { requestedAgain = true; return running; }
      const read = async () => {
        do {
          requestedAgain = false;
          const version = mutationVersion.current;
          if (!currentContext()) return;
          try {
            const records = await getBlvTestList();
            if (!active || !currentContext()) return;
            if (!deletingRef.current && mutationVersion.current === version) {
              setItems(records);
              setLoadError('');
            }
          } catch {
            if (active && currentContext() && !deletingRef.current && mutationVersion.current === version) {
              setLoadError('BLV検査記録の一覧を確認できませんでした。画面を再読み込みしてください。');
            }
          }
        } while (active && requestedAgain && !deletingRef.current);
      };
      running = read().finally(() => {
        running = undefined;
        if (active && currentContext() && !deletingRef.current) setLoading(false);
      });
      return running;
    };
    loadRef.current = load;
    const onResume = () => {
      if (!deletingRef.current && document.visibilityState !== 'hidden' && navigator.onLine !== false) void load();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') onResume(); };
    window.addEventListener(BLV_SYNC_STATUS_EVENT, onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onVisible);
    void load();
    return () => {
      active = false;
      viewGeneration.current += 1;
      if (loadRef.current === load) loadRef.current = async () => undefined;
      window.removeEventListener(BLV_SYNC_STATUS_EVENT, onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [syncContext.farmId, syncContext.userId, syncContext.planId, syncContext.token, syncContext.cloudEnabled]);

  const currentView = (generation: number) => {
    if (viewGeneration.current !== generation) return false;
    try { assertBlvSyncContext(syncContext); return true; }
    catch { refreshContext(value => value + 1); return false; }
  };
  const syncStates = items.map(getBlvSyncStatus);
  const pendingCount = syncStates.filter(status => status.pending).length;
  const syncWarnings = [...new Set(syncStates.map(status => status.warning).filter((warning): warning is string => Boolean(warning)))];

  const filteredItems = useMemo(() => items.filter((item) =>
    matchesAnyText([item.cowEarTag, item.cowName, item.note, item.isolationMemo], keyword) && matchesSelect(item.result, result)
  ), [items, keyword, result]);

  const handleDelete = async (item: BlvTest) => {
    if (deletingRef.current) return;
    const generation = viewGeneration.current;
    if (!currentView(generation) || !window.confirm(`${item.cowName}のBLV検査記録を削除しますか？`)) return;
    if (!currentView(generation)) return;
    deletingRef.current = true;
    mutationVersion.current += 1;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteBlvTest(item.id);
      if (currentView(generation)) setItems(current => current.filter(record => record.id !== item.id));
    } catch (cause) {
      if (currentView(generation)) setDeleteError(cause instanceof Error && !(cause instanceof TypeError)
        ? cause.message : 'BLV検査記録の削除を確認できませんでした。通信状態を確認して、もう一度お試しください。');
    } finally {
      if (currentView(generation)) {
        deletingRef.current = false;
        setDeleting(false);
        await loadRef.current();
      }
    }
  };

  const clearSearch = () => { setKeyword(''); setResult('すべて'); };
  const hasFilters = Boolean(keyword || result !== 'すべて');
  const resultColor = (value: string) => value === '陽性' ? 'error' : value === '陰性' ? 'success' : 'warning';
  const statusColor = (value: string) => value === '陽性管理' || value === '期限超過' ? 'error' : value === 'まもなく' ? 'warning' : 'default';

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
        <Stack spacing={0.25}><Typography variant="h5" fontWeight={800}>BLV管理</Typography><Typography color="text.secondary">表示：{filteredItems.length}件 / 全{items.length}件</Typography></Stack>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => setSearchOpen((value) => !value)}>{searchOpen ? '検索を閉じる' : hasFilters ? '検索・絞り込み中' : '検索・絞り込み'}</Button>
          <Button component={RouterLink} to="/blv/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button>
        </Stack>
      </Stack>

      {(deleteError || loadError) && <Alert severity="error">{deleteError || loadError}</Alert>}
      {(pendingCount > 0 || syncWarnings.length > 0) && <Alert severity={syncWarnings.length > 0 ? 'warning' : 'info'}>
        <Stack spacing={0.5}>
          {pendingCount > 0 && <Typography variant="body2">未送信のBLV検査記録が{pendingCount}件あります。この端末に保存されています。</Typography>}
          {syncWarnings.map(warning => <Typography key={warning} variant="body2">{warning}</Typography>)}
        </Stack>
      </Alert>}

      {searchOpen && <Card><CardContent sx={{ py: 1.5 }}><Stack spacing={1}>
        <Typography fontWeight={700} color="text.secondary">検索・絞り込み</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField label="検索" placeholder="耳標番号・牛名" value={keyword} onChange={(e) => setKeyword(e.target.value)} fullWidth size="small" />
          <TextField label="検査結果" select value={result} onChange={(e) => setResult(e.target.value)} size="small" sx={{ minWidth: 140 }}><MenuItem value="すべて">すべて</MenuItem><MenuItem value="未検査">未検査</MenuItem><MenuItem value="陰性">陰性</MenuItem><MenuItem value="陽性">陽性</MenuItem></TextField>
          <Button variant="outlined" onClick={clearSearch} size="small">クリア</Button>
        </Stack>
      </Stack></CardContent></Card>}

      {loading ? <Typography>読み込み中...</Typography> : <>
        <Card sx={{ display: { xs: 'none', md: 'block' } }}><CardContent sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 760 }}>
            <TableHead><TableRow><TableCell>対象牛</TableCell><TableCell>検査日</TableCell><TableCell>結果</TableCell><TableCell>次回検査</TableCell><TableCell>判定</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
            <TableBody>{filteredItems.map((item) => {
              const status = judgeBlvNextTest(item.result, item.nextTestDate);
              return <TableRow key={item.id}>
                <TableCell>{item.cowName}<br /><Typography variant="caption">{item.cowEarTag}</Typography><BlvSyncChip record={item} /></TableCell>
                <TableCell>{item.testDate || '未検査'}</TableCell>
                <TableCell><Chip size="small" label={item.result} color={resultColor(item.result) as any} /></TableCell>
                <TableCell>{item.nextTestDate || '未定'}{item.nextTestDate && <><br /><Typography variant="caption">あと{daysUntil(item.nextTestDate)}日</Typography></>}</TableCell>
                <TableCell><Chip size="small" label={status} color={statusColor(status) as any} /></TableCell>
                <TableCell align="right"><IconButton component={RouterLink} to={`/blv/${item.id}/edit`} disabled={deleting} aria-label={`${item.cowName}を編集`}><EditIcon /></IconButton><IconButton color="error" onClick={() => handleDelete(item)} disabled={deleting} aria-label={`${item.cowName}を削除`}><DeleteIcon /></IconButton></TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </CardContent></Card>

        <Stack spacing={1} sx={{ display: { xs: 'flex', md: 'none' } }}>
          {filteredItems.map((item) => {
            const status = judgeBlvNextTest(item.result, item.nextTestDate);
            return <Card key={item.id}><CardContent><Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box><Typography fontWeight={800}>{item.cowName}</Typography><Typography variant="body2" color="text.secondary">耳標：{item.cowEarTag || '-'}</Typography></Box>
                <Stack spacing={0.5} alignItems="flex-end"><Chip size="small" label={status} color={statusColor(status) as any} /><BlvSyncChip record={item} /></Stack>
              </Stack>
              <Typography><b>検査日：</b>{item.testDate || '未検査'}</Typography>
              <Stack direction="row" spacing={1} alignItems="center"><Typography><b>結果：</b></Typography><Chip size="small" label={item.result} color={resultColor(item.result) as any} /></Stack>
              <Typography><b>次回検査：</b>{item.nextTestDate || '未定'}{item.nextTestDate ? `（あと${daysUntil(item.nextTestDate)}日）` : ''}</Typography>
              {item.isolationMemo && <Typography><b>隔離メモ：</b>{item.isolationMemo}</Typography>}
              <Stack direction="row" spacing={1}><Button component={RouterLink} to={`/blv/${item.id}/edit`} variant="outlined" startIcon={<EditIcon />} disabled={deleting}>編集</Button><Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={() => handleDelete(item)} disabled={deleting}>削除</Button></Stack>
            </Stack></CardContent></Card>;
          })}
        </Stack>
      </>}
    </Stack>
  );
}
