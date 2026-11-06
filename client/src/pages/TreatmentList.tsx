import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, IconButton, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { Treatment } from '../types/treatment';
import { assertTreatmentSyncContext, deleteTreatment, getTreatmentList, getTreatmentSyncContext,
  getTreatmentSyncStatus, TREATMENT_SYNC_STATUS_EVENT } from '../services/treatmentApi';
import { deleteExpenseBySource, type ExpenseRecord } from '../services/expensesApi';
import { getAuthToken, getStoredAuthUser } from '../services/authClient';
import { getAllRecords } from '../storage/repository';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { daysUntil, judgeWithdrawal } from '../utils/treatment';
import { matchesAnyText, matchesSelect } from '../utils/search';

type DeletionContext = { farmId: string | null; userId: string | null; token: string | null; cloudEnabled: boolean; planId: string };
type ExpenseCleanup = { sourceId: string; context: DeletionContext };
const EXPENSE_CLEANUP_ERROR = '治療記録の削除は完了しましたが、関連経費の削除を完了できませんでした。未削除の経費は、再読み込み後も経費一覧に残ります。';

function getDeletionContext(): DeletionContext {
  const user = getStoredAuthUser();
  const planId = getCurrentFarmProPlanId();
  return {
    farmId: user?.farmId ?? null, userId: user?.id ?? null, token: getAuthToken(),
    planId, cloudEnabled: getFarmProPlan(planId).multiDeviceSync,
  };
}

function assertDeletionContext(context: DeletionContext): void {
  const current = getDeletionContext();
  if (current.farmId !== context.farmId || current.userId !== context.userId ||
      current.token !== context.token || current.planId !== context.planId || current.cloudEnabled !== context.cloudEnabled) {
    throw new Error('農場またはログイン状態が変わったため、削除を中止しました。画面を確認して、もう一度お試しください。');
  }
}

async function checkRelatedExpenseDeletion(sourceId: string, context: DeletionContext): Promise<void> {
  assertDeletionContext(context);
  const isRelated = (expense: ExpenseRecord) => expense.sourceType === 'treatment'
    && String(expense.sourceId || '') === sourceId
    && (expense.category === '医薬品費' || expense.category === '診療費')
    && !(expense.sourceDetail?.trim() || '');
  const rejectSettled = (expenses: ExpenseRecord[]) => {
    if (expenses.some((expense) => isRelated(expense) && expense.settlementSaleId)) {
      throw new Error('精算確定済みの関連経費があるため、治療記録は削除できません。販売精算の内容を確認してください。');
    }
  };
  const local = await getAllRecords<ExpenseRecord>('expenses');
  assertDeletionContext(context);
  rejectSettled(local);
  if (!context.cloudEnabled || !local.some(isRelated)) return;

  let current: ExpenseRecord[];
  try {
    if (!context.token) throw new Error('ログインが必要です。');
    // This preflight must not import records while an account switch is possible.
    const response = await fetch('/api/expenses/record-sync', {
      headers: { Authorization: `Bearer ${context.token}` }, cache: 'no-store',
    });
    if (!response.ok) throw new Error('経費の確認に失敗しました。');
    current = await response.json() as ExpenseRecord[];
    if (!Array.isArray(current) || current.some((expense) => !expense || typeof expense !== 'object')) {
      throw new Error('経費の確認結果が不正です。');
    }
  } catch {
    assertDeletionContext(context);
    throw new Error('関連経費の精算状況を確認できませんでした。治療記録は削除していません。通信状態を確認して、もう一度お試しください。');
  }
  assertDeletionContext(context);
  rejectSettled(current);
}

async function deleteRelatedExpenses(sourceId: string, context: DeletionContext): Promise<void> {
  assertDeletionContext(context);
  await deleteExpenseBySource('treatment', sourceId, '医薬品費');
  assertDeletionContext(context);
  await deleteExpenseBySource('treatment', sourceId, '診療費');
  assertDeletionContext(context);
}

export function TreatmentList() {
  const [items, setItems] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [progress, setProgress] = useState('すべて');
  const [recordType, setRecordType] = useState('すべて');
  const [searchOpen, setSearchOpen] = useState(false);
  const [synchronizationOpen, setSynchronizationOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [pendingExpenseCleanup, setPendingExpenseCleanup] = useState<ExpenseCleanup | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const deletingRef = useRef(false);
  const viewGeneration = useRef(0);
  const mutationVersion = useRef(0);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);
  const [, refreshContext] = useState(0);
  const syncContext = getTreatmentSyncContext();

  useEffect(() => {
    let active = true;
    let running: Promise<void> | undefined;
    let requestedAgain = false;
    const interruptedDeletion = deletingRef.current;
    viewGeneration.current += 1;
    mutationVersion.current += 1;
    deletingRef.current = false;
    setDeletingId(null);
    setItems([]);
    setLoading(true);
    setLoadError('');
    if (!pendingExpenseCleanup || pendingExpenseCleanup.context.farmId !== syncContext.farmId ||
        pendingExpenseCleanup.context.userId !== syncContext.userId) {
      setPendingExpenseCleanup(null);
      setDeleteError(interruptedDeletion
        ? '農場またはログイン状態が変わったため、削除を中止しました。画面を確認して、もう一度お試しください。' : '');
    }
    const currentContext = () => {
      try { assertTreatmentSyncContext(syncContext); return true; }
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
            const records = await getTreatmentList();
            if (!active || !currentContext()) return;
            if (!deletingRef.current && mutationVersion.current === version) {
              setItems(records);
              setLoadError('');
            }
          } catch {
            if (active && currentContext() && !deletingRef.current && mutationVersion.current === version) {
              setLoadError('治療記録の一覧を確認できませんでした。画面を再読み込みしてください。');
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
    window.addEventListener(TREATMENT_SYNC_STATUS_EVENT, onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onVisible);
    void load();
    return () => {
      active = false;
      viewGeneration.current += 1;
      if (loadRef.current === load) loadRef.current = async () => undefined;
      window.removeEventListener(TREATMENT_SYNC_STATUS_EVENT, onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [syncContext.farmId, syncContext.userId, syncContext.planId, syncContext.token, syncContext.cloudEnabled]);

  const currentView = (generation: number) => {
    if (viewGeneration.current !== generation) return false;
    try { assertTreatmentSyncContext(syncContext); return true; }
    catch { refreshContext(value => value + 1); return false; }
  };
  const syncStates = items.map(getTreatmentSyncStatus);
  const pendingCount = syncStates.filter(state => state.pending).length;
  const syncWarnings = [...new Set(syncStates.map(state => state.warning).filter((warning): warning is string => Boolean(warning)))];

  const filteredItems = useMemo(() => items.filter((item) =>
    matchesAnyText([item.targetNumber, item.targetName, item.recordType || '治療', item.symptom, item.diagnosis, item.treatmentProcedure, item.medicine, item.veterinarian, item.note], keyword) &&
    matchesSelect(item.progress, progress) &&
    matchesSelect(item.recordType || '治療', recordType)
  ), [items, keyword, progress, recordType]);

  const handleDelete = async (item: Treatment) => {
    if (deletingRef.current) return;
    const generation = viewGeneration.current;
    if (!currentView(generation)) return;
    if (!window.confirm(`${item.targetName} の治療記録を削除しますか？`)) return;
    if (!currentView(generation)) return;
    deletingRef.current = true;
    mutationVersion.current += 1;
    setDeletingId(item.id);
    setDeleteError('');
    setPendingExpenseCleanup(null);
    const sourceId = String(item.id);
    const context = getDeletionContext();
    try {
      try {
        await checkRelatedExpenseDeletion(sourceId, context);
        assertDeletionContext(context);
        await deleteTreatment(item.id);
        assertDeletionContext(context);
      } catch (error) {
        if (currentView(generation)) setDeleteError(error instanceof Error && !(error instanceof TypeError)
          ? error.message : '治療記録の削除を確認できませんでした。通信状態を確認して、もう一度お試しください。');
        return;
      }

      if (currentView(generation)) setItems((current) => current.filter((record) => record.id !== item.id));
      try {
        await deleteRelatedExpenses(sourceId, context);
      } catch {
        if (currentView(generation)) {
          setPendingExpenseCleanup({ sourceId, context });
          setDeleteError(EXPENSE_CLEANUP_ERROR);
        }
      }
    } finally {
      if (currentView(generation)) {
        deletingRef.current = false;
        setDeletingId(null);
        await loadRef.current();
      }
    }
  };

  const retryExpenseCleanup = async () => {
    if (!pendingExpenseCleanup || deletingRef.current) return;
    const generation = viewGeneration.current;
    if (!currentView(generation)) return;
    const pending = pendingExpenseCleanup;
    const context = getDeletionContext();
    if (context.farmId !== pending.context.farmId || context.userId !== pending.context.userId) {
      setDeleteError(`${EXPENSE_CLEANUP_ERROR} 削除を開始した農場・利用者を確認してください。`);
      return;
    }
    deletingRef.current = true;
    mutationVersion.current += 1;
    setDeletingId(Number(pending.sourceId));
    try {
      await checkRelatedExpenseDeletion(pending.sourceId, context);
      await deleteRelatedExpenses(pending.sourceId, context);
      if (currentView(generation)) {
        setPendingExpenseCleanup(null);
        setDeleteError('');
      }
    } catch {
      if (currentView(generation)) setDeleteError(EXPENSE_CLEANUP_ERROR);
    } finally {
      if (currentView(generation)) {
        deletingRef.current = false;
        setDeletingId(null);
        await loadRef.current();
      }
    }
  };

  const clearSearch = () => { setKeyword(''); setProgress('すべて'); setRecordType('すべて'); };
  const hasFilters = Boolean(keyword || progress !== 'すべて' || recordType !== 'すべて');
  const progressColor = (value: string) => value === '回復' ? 'success' : value === '要再診' ? 'error' : value === '経過観察' ? 'warning' : 'info';
  const withdrawalColor = (label: string) => label === '休薬中' ? 'warning' : label === '休薬終了' ? 'success' : 'default';
  const recordTypeColor = (value: string) => {
    if (value === '投薬') return 'primary';
    if (value === '去勢') return 'warning';
    if (value === '削蹄') return 'secondary';
    if (value === '予防') return 'info';
    if (value === 'その他の処置') return 'default';
    return 'success';
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} spacing={1}>
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>治療・投薬履歴</Typography>
          <Typography color="text.secondary">治療・投薬・予防・繁殖処置など、実施した記録を確認します。</Typography>
          <Typography color="text.secondary">表示：{filteredItems.length}件 / 全{items.length}件</Typography>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap sx={{ flexWrap: 'wrap', '& > .MuiButton-root': { minHeight: 44 } }}>
          <Button component={RouterLink} to="/treatments/new" variant="contained" startIcon={<AddIcon />} sx={{ width: { xs: '100%', sm: 'auto' } }}>治療を記録</Button>
          <Button component={RouterLink} to="/treatments/new?recordType=投薬" variant="outlined" startIcon={<AddIcon />} sx={{ width: { xs: '100%', sm: 'auto' } }}>投薬を記録</Button>
          <Button variant="outlined" onClick={() => setSynchronizationOpen((value) => !value)}>{synchronizationOpen ? '同期化を閉じる' : '同期化'}</Button>
          <Button variant="outlined" onClick={() => setSearchOpen((value) => !value)}>{searchOpen ? '検索を閉じる' : hasFilters ? '検索・絞り込み中' : '検索・絞り込み'}</Button>
        </Stack>
      </Stack>

      {(deleteError || loadError) && <Alert severity="error">
        {deleteError || loadError}
        {pendingExpenseCleanup && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
          <Button color="inherit" size="small" disabled={deletingId !== null} onClick={() => void retryExpenseCleanup()}>関連経費の削除を再試行</Button>
          <Button component={RouterLink} to="/expenses" color="inherit" size="small">経費一覧</Button>
        </Stack>}
      </Alert>}
      {(pendingCount > 0 || syncWarnings.length > 0) && <Alert severity={syncWarnings.length > 0 ? 'warning' : 'info'}>
        <Stack spacing={0.5}>
          {pendingCount > 0 && <Typography variant="body2">未送信の治療記録が{pendingCount}件あります。この端末に保存されています。</Typography>}
          {syncWarnings.map(warning => <Typography key={warning} variant="body2">{warning}</Typography>)}
        </Stack>
      </Alert>}

      {synchronizationOpen && (
        <Card variant="outlined">
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack spacing={1}>
              <Typography fontWeight={800}>同期化</Typography>
              <Typography color="text.secondary" variant="body2">同期化プログラムを作成し、進み具合を確認します。実施する処置は予定から治療記録へ登録します。</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button component={RouterLink} to="/schedules/synchronization/progress" variant="outlined">同期化進捗</Button>
                <Button component={RouterLink} to="/schedules/synchronization/new" variant="contained">同期化を開始</Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      {searchOpen && <Card><CardContent sx={{ py: 1.5 }}><Stack spacing={1}>
        <Typography fontWeight={700} color="text.secondary">検索・絞り込み</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField label="検索" placeholder="対象・症状・疾病・処置・薬剤・獣医師" value={keyword} onChange={(e) => setKeyword(e.target.value)} fullWidth size="small" />
          <TextField label="記録区分" select value={recordType} onChange={(e) => setRecordType(e.target.value)} size="small" sx={{ minWidth: 160 }}>
            <MenuItem value="すべて">すべて</MenuItem>
            <MenuItem value="治療">治療</MenuItem>
            <MenuItem value="投薬">投薬</MenuItem>
            <MenuItem value="予防">予防</MenuItem>
            <MenuItem value="去勢">去勢</MenuItem>
            <MenuItem value="削蹄">削蹄</MenuItem>
            <MenuItem value="その他の処置">その他の処置</MenuItem>
          </TextField>
          <TextField label="経過" select value={progress} onChange={(e) => setProgress(e.target.value)} size="small" sx={{ minWidth: 140 }}><MenuItem value="すべて">すべて</MenuItem><MenuItem value="治療中">治療中</MenuItem><MenuItem value="経過観察">経過観察</MenuItem><MenuItem value="回復">回復</MenuItem><MenuItem value="要再診">要再診</MenuItem></TextField>
          <Button variant="outlined" onClick={clearSearch} size="small">クリア</Button>
        </Stack>
      </Stack></CardContent></Card>}

      {loading ? <Typography>読み込み中...</Typography> : <>
        <Card sx={{ display: { xs: 'none', md: 'block' } }}><CardContent sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead><TableRow><TableCell>対象</TableCell><TableCell>実施日</TableCell><TableCell>記録区分</TableCell><TableCell>疾病・処置</TableCell><TableCell>薬剤</TableCell><TableCell>経過</TableCell><TableCell>休薬</TableCell><TableCell>備考</TableCell><TableCell align="right" sx={{ position: 'sticky', right: 0, backgroundColor: 'background.paper', zIndex: 10 }}>操作</TableCell></TableRow></TableHead>
            <TableBody>{filteredItems.map((item) => {
              const withdrawal = judgeWithdrawal(item.withdrawalEndDate);
              const syncState = getTreatmentSyncStatus(item);
              const type = item.recordType || '治療';
              return <TableRow key={item.id}>
                <TableCell>{item.targetName}<br /><Typography variant="caption" color="text.secondary">{item.targetNumber}</Typography></TableCell>
                <TableCell>{type === '投薬' && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>投薬日</Typography>}{item.treatmentDate}</TableCell>
                <TableCell><Chip size="small" label={type} color={recordTypeColor(type) as any} /></TableCell>
                <TableCell><Typography>{item.diagnosis || '-'}</Typography>{item.treatmentProcedure && <Typography variant="caption" color="text.secondary">処置：{item.treatmentProcedure}</Typography>}</TableCell>
                <TableCell>{item.medicine || '-'}{type === '投薬' && item.dosage && <Typography variant="body2">投薬量：{item.dosage}</Typography>}</TableCell>
                <TableCell><Stack spacing={0.5} alignItems="flex-start">
                  {item.progress && <Chip size="small" label={item.progress} color={progressColor(item.progress) as any} />}
                  {(syncState.pending || syncState.warning) && <Chip size="small" variant="outlined" color="warning" label={syncState.warning ? '同期の確認が必要' : '未送信'} />}
                </Stack></TableCell>
                <TableCell sx={{ minWidth: 160 }}><Chip size="small" label={withdrawal} color={withdrawalColor(withdrawal) as any} />{item.withdrawalEndDate && <><br /><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{item.withdrawalEndDate}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>あと{daysUntil(item.withdrawalEndDate)}日</Typography></>}</TableCell>
                <TableCell sx={{ maxWidth: 240, whiteSpace: 'normal', wordBreak: 'break-word' }}>{item.note || '-'}</TableCell>
                <TableCell align="right" sx={{ position: 'sticky', right: 0, backgroundColor: 'background.paper', zIndex: 9 }}>
                  <Stack direction="row" spacing={0.75} justifyContent="flex-end">
                    <Button component={RouterLink} to={`/treatments/${item.id}/edit`} variant="outlined" size="small" disabled={deletingId !== null}>編集</Button>
                    <Button color="error" variant="outlined" size="small" disabled={deletingId !== null} onClick={() => void handleDelete(item)}>{deletingId === item.id ? '削除中…' : '削除'}</Button>
                  </Stack>
                </TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </CardContent></Card>

        <Stack spacing={1} sx={{ display: { xs: 'flex', md: 'none' } }}>
          {filteredItems.map((item) => {
            const withdrawal = judgeWithdrawal(item.withdrawalEndDate);
            const syncState = getTreatmentSyncStatus(item);
            return <Card key={item.id}><CardContent><Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start"><Box><Typography fontWeight={800}>{item.targetName}</Typography><Typography variant="body2" color="text.secondary">{item.targetNumber || '-'}</Typography></Box><Stack spacing={0.5} alignItems="flex-end">
                {item.progress && <Chip size="small" label={item.progress} color={progressColor(item.progress) as any} />}
                {(syncState.pending || syncState.warning) && <Chip size="small" variant="outlined" color="warning" label={syncState.warning ? '同期の確認が必要' : '未送信'} />}
              </Stack></Stack>
              <Stack direction="row" spacing={1} alignItems="center"><Typography><b>区分：</b></Typography><Chip size="small" label={item.recordType || '治療'} color={recordTypeColor(item.recordType || '治療') as any} /></Stack>
              {(item.recordType !== '投薬' || item.symptom) && <Typography><b>症状：</b>{item.symptom || '-'}</Typography>}
              {item.diagnosis && <Typography><b>診断：</b>{item.diagnosis}</Typography>}
              {item.treatmentProcedure && <Typography><b>処置内容：</b>{item.treatmentProcedure}</Typography>}
              <Typography><b>{item.recordType === '投薬' ? '投薬日：' : '治療日：'}</b>{item.treatmentDate || '-'}</Typography>
              <Typography><b>薬剤：</b>{item.medicine || '-'}</Typography>
              {item.recordType === '投薬' && item.dosage && <Typography><b>投薬量：</b>{item.dosage}</Typography>}
              <Stack direction="row" spacing={1} alignItems="center"><Typography><b>休薬：</b></Typography><Chip size="small" label={withdrawal} color={withdrawalColor(withdrawal) as any} /></Stack>
              {item.withdrawalEndDate && <Typography><b>休薬終了：</b>{item.withdrawalEndDate}（あと{daysUntil(item.withdrawalEndDate)}日）</Typography>}
              <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><b>備考：</b>{item.note || '-'}</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button component={RouterLink} to={`/treatments/${item.id}/edit`} variant="outlined" startIcon={<EditIcon />} disabled={deletingId !== null} fullWidth>編集</Button><Button color="error" variant="outlined" startIcon={<DeleteIcon />} disabled={deletingId !== null} onClick={() => void handleDelete(item)} fullWidth>{deletingId === item.id ? '削除中…' : '削除'}</Button></Stack>
            </Stack></CardContent></Card>;
          })}
        </Stack>
      </>}
    </Stack>
  );
}
