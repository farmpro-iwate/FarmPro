import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { deleteCattle, getCattleList, pullNewerCattleRecordsFromCloud } from '../services/api';
import { previewSingleCattleCloudRetry, retrySingleCattleCloudUpload } from '../services/singleCattleCloudRetry';
import { getCattlePlanSnapshot } from '../services/cattlePlanSnapshot';
import { CattleBreedingPlanItems } from '../components/CattleBreedingPlanItems';
import { hasCattlePlanAttention, localCattlePlanToday, planAnimalMatch, resolveCattleBreedingPlans, type CattlePlanSnapshot, type CattlePlanSummary } from '../utils/cattleBreedingPlans';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { formatSex } from '../utils/sex';
import { ANIMAL_SYNC_STATUS_EVENT, assertAnimalSyncContext, getAnimalSyncContext } from '../services/animalRecordSyncSafety';
import type { AnimalLifecycle } from '../types/animalLifecycle';
import { isAnimalBreedingInactive, isAnimalDeceased } from '../utils/animalLifecycle';
import { animalLifecycleLabel } from '../utils/animalLifecycleDisplay';
import { formatAnimalAge } from '../utils/animalAge';

type CattleRow = {
  id: number;
  earTag: string;
  identificationNumber?: string;
  name: string;
  birthday?: string;
  sex?: '雌' | '雄' | '去勢';
  sire?: string;
  dam?: string;
  stage?: '育成牛' | '繁殖牛';
  note?: string;
  cloudSyncPending?: boolean;
  syncWarning?: string;
  lifecycle?: AnimalLifecycle;
};

type AnyRow = Record<string, any>;

type SoldInfo = {
  saleDate: string;
  salePrice: string;
};

function includesText(value: unknown, keyword: string) {
  return String(value ?? '').toLowerCase().includes(keyword.toLowerCase());
}

function dateOnly(value: unknown) {
  return value ? String(value).slice(0, 10) : '';
}

function soldSaleFor(cattle: CattleRow, sales: AnyRow[]) {
  return sales.find((sale) => sale.status === '販売済み' && sale.targetType === '成牛' &&
    !sale.deletedAt && planAnimalMatch(sale, cattle) === 'match');
}

export function CattleList({ stageFilter = 'all' }: { stageFilter?: 'all' | '育成牛' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const lifecycleView = searchParams.get('state') === 'deceased' ? 'deceased' : searchParams.get('state') === 'culled' ? 'culled' : 'resident';
  const [rows, setRows] = useState<CattleRow[]>([]);
  const [planSnapshot, setPlanSnapshot] = useState<CattlePlanSnapshot | null>(null);
  const [sales, setSales] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState('');
  const [retryMessage, setRetryMessage] = useState('');
  const [retryBusy, setRetryBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [attentionFilter, setAttentionFilter] = useState('すべて');
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<CattleRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteBusy = useRef(false);
  const mounted = useRef(true);
  const loaded = useRef(false);
  const loadWork = useRef<Promise<void> | null>(null);
  const reloadRequested = useRef(false);
  const rowsContext = useRef(getAnimalSyncContext());

  const load = async () => {
    if (loadWork.current) { reloadRequested.current = true; return loadWork.current; }
    const work = Promise.resolve().then(async () => {
      do {
        reloadRequested.current = false;
        if (!loaded.current) setLoading(true);
        setReadError('');
        const context = getAnimalSyncContext();
        try {
          if (context.cloudEnabled) {
            try { await pullNewerCattleRecordsFromCloud(); }
            catch (error) { console.warn('牛台帳のクラウド取り込みをスキップしました。', error); }
          }
          assertAnimalSyncContext(context);
          const [cattleData, snapshot] = await Promise.all([getCattleList(), getCattlePlanSnapshot()]);
          assertAnimalSyncContext(context);
          if (!mounted.current) return;
          rowsContext.current = context;
          setRows(cattleData as CattleRow[]);
          setPlanSnapshot(snapshot);
          setSales([...snapshot.sales]);
          setMenuAnchor(null);
          setMenuRow(null);
          loaded.current = true;
        } catch {
          if (mounted.current) setReadError('牛台帳を読み込めませんでした。画面を開き直してください。');
        } finally {
          if (mounted.current) setLoading(false);
        }
      } while (reloadRequested.current && mounted.current);
    });
    loadWork.current = work;
    try { await work; }
    finally { if (loadWork.current === work) loadWork.current = null; }
  };

  useEffect(() => {
    mounted.current = true;
    const reload = () => { void load(); };
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    reload();
    window.addEventListener('focus', reload);
    window.addEventListener('online', reload);
    window.addEventListener(ANIMAL_SYNC_STATUS_EVENT, reload);
    document.addEventListener('visibilitychange', visible);
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', reload);
      window.removeEventListener('online', reload);
      window.removeEventListener(ANIMAL_SYNC_STATUS_EVENT, reload);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  const soldMap = useMemo(() => {
    const map = new Map<number, SoldInfo>();
    rows.forEach((row) => {
      const sale = soldSaleFor(row, sales);
      if (!sale) return;
      map.set(row.id, {
        saleDate: dateOnly(sale.saleDate),
        salePrice: String(sale.salePrice || ''),
      });
    });
    return map;
  }, [rows, sales]);

  const residentRows = useMemo(
    () => rows.filter((row) => !soldMap.has(row.id) && !isAnimalDeceased(row)),
    [rows, soldMap],
  );
  const activeRows = useMemo(() => lifecycleView === 'deceased' ? rows.filter(row => isAnimalDeceased(row)) :
    lifecycleView === 'culled' ? residentRows.filter(row => isAnimalBreedingInactive(row)) : residentRows,
  [rows, residentRows, lifecycleView]);

  const today = localCattlePlanToday();
  const planMap = useMemo(() => {
    const map = new Map<number, CattlePlanSummary>();
    if (planSnapshot) residentRows.filter(row => !isAnimalBreedingInactive(row)).forEach((row) => {
      map.set(row.id, resolveCattleBreedingPlans(row, planSnapshot, today));
    });
    return map;
  }, [residentRows, planSnapshot, today]);

  const filteredRows = useMemo(() => {
    return activeRows.filter((row) => {
      if (stageFilter === '育成牛' ? row.stage !== '育成牛' : lifecycleView !== 'culled' && row.stage === '育成牛') return false;
      const keywordOk = !search || [
        row.earTag,
        row.identificationNumber,
        row.name,
        row.birthday,
        row.sex,
        row.sire,
        row.dam,
        row.stage,
        row.note,
      ].some((value) => includesText(value, search));

      const summary = planMap.get(row.id);
      const hasAttention = summary ? hasCattlePlanAttention(summary, today) : false;
      const attentionOk = attentionFilter === 'すべて' || hasAttention;
      return keywordOk && attentionOk;
    });
  }, [activeRows, search, attentionFilter, planMap, today, stageFilter, lifecycleView]);

  const handleDelete = async (id: number) => {
    if (deleteBusy.current) return;
    try {
      assertAnimalSyncContext(rowsContext.current);
      if (!confirm('削除しますか？')) return;
      deleteBusy.current = true;
      setDeleting(true);
      setReadError('');
      await deleteCattle(id);
      assertAnimalSyncContext(rowsContext.current);
      await load();
    } catch (error) {
      setReadError(error instanceof Error ? error.message : '牛台帳の削除を確認できませんでした。記録を保持しています。');
    } finally { deleteBusy.current = false; setDeleting(false); }
  };

  const retryOneCattle = async (row: CattleRow) => {
    if (retryBusy || !row.identificationNumber) return;
    setRetryBusy(true);
    setRetryMessage('');
    try {
      const context = rowsContext.current;
      assertAnimalSyncContext(context);
      const preview = await previewSingleCattleCloudRetry(row.identificationNumber);
      assertAnimalSyncContext(context);
      if (!preview.canRetry || preview.localId !== row.id) {
        setRetryMessage(preview.reason || 'クラウド側の照合に失敗したため、送信を中止しました。');
        return;
      }
      if (!window.confirm(`クラウド未登録の1頭だけを追加します。\\n名号：${preview.name}\\n耳標：${preview.earTag}\\n個体識別番号：${preview.identificationNumber}\\n\\n既存データは復元・削除しません。送信しますか？`)) return;
      assertAnimalSyncContext(context);
      await retrySingleCattleCloudUpload(preview.identificationNumber, preview.localId);
      assertAnimalSyncContext(context);
      setRetryMessage(`${preview.name}のクラウドへの新規送信に成功しました。別端末で牛台帳を開き直して確認してください。`);
      await load();
    } catch (error) {
      setRetryMessage(`再同期を中止しました：${error instanceof Error ? error.message : '通信に失敗しました'}`);
    } finally {
      setRetryBusy(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setAttentionFilter('すべて');
  };

  const hasFilters = Boolean(search || attentionFilter !== 'すべて');

  const openMenu = (event: React.MouseEvent<HTMLElement>, row: CattleRow) => {
    setMenuAnchor(event.currentTarget);
    setMenuRow(row);
  };

  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuRow(null);
  };
  const pendingRows = getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync
    ? rows.filter(row => row.cloudSyncPending) : [];

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>{stageFilter === '育成牛' ? '育成牛台帳' : '繁殖牛台帳'}</Typography>
          <Typography color="text.secondary">表示：{filteredRows.length}件 / 全{activeRows.filter(row => stageFilter === '育成牛' ? row.stage === '育成牛' : lifecycleView === 'culled' || row.stage !== '育成牛').length}件</Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => setSearchOpen((value) => !value)}>
            {searchOpen ? '検索を閉じる' : hasFilters ? '検索・絞り込み中' : '検索・絞り込み'}
          </Button>
          <Button component={RouterLink} to={stageFilter === '育成牛' ? '/cattle/new?stage=growing' : '/cattle/new'} variant="contained">新規登録</Button>
        </Stack>
      </Stack>
      {loading && <Typography color="text.secondary">読み込み中...</Typography>}
      {readError && <Alert severity="warning">{readError}</Alert>}
      {pendingRows.length > 0 && <Alert severity="warning">
        クラウド同期が完了していない牛が{pendingRows.length}頭あります。端末の記録は保持しています。
        {pendingRows.find(row => row.syncWarning)?.syncWarning && <Typography variant="body2">
          {pendingRows.find(row => row.syncWarning)?.syncWarning}
        </Typography>}
      </Alert>}
      {retryMessage && <Alert severity="info" onClose={() => setRetryMessage('')}>{retryMessage}</Alert>}
      <TextField label="表示対象" select value={lifecycleView} size="small" sx={{ maxWidth: { sm: 300 } }}
        onChange={event => setSearchParams(current => {
          const next = new URLSearchParams(current);
          if (event.target.value === 'resident') next.delete('state'); else next.set('state', event.target.value);
          return next;
        })}>
        <MenuItem value="resident">在籍牛</MenuItem>
        <MenuItem value="culled">廃用・在籍</MenuItem>
        <MenuItem value="deceased">死亡履歴</MenuItem>
      </TextField>

      {searchOpen && (
        <Card>
          <CardContent sx={{ py: 1.5 }}>
            <Stack spacing={1}>
              <Typography fontWeight={700} color="text.secondary">検索・絞り込み</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <TextField
                  label="検索"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  fullWidth
                  size="small"
                  placeholder="耳標番号、個体識別番号、名号など"
                />
                <TextField
                  label="要対応"
                  select
                  value={attentionFilter}
                  onChange={(e) => setAttentionFilter(e.target.value)}
                  fullWidth
                  size="small"
                  sx={{ maxWidth: { sm: 180 } }}
                >
                  <MenuItem value="すべて">すべて</MenuItem>
                  <MenuItem value="要対応のみ">要対応のみ</MenuItem>
                </TextField>
                <Button variant="outlined" onClick={clearFilters} size="small">クリア</Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <TableContainer component={Card}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>名号・耳標番号</TableCell>
                <TableCell>区分</TableCell>
                <TableCell>状態</TableCell>
                <TableCell>{stageFilter === '育成牛' ? '生年月日・月齢・日齢' : '生年月日'}</TableCell>
                <TableCell>血統</TableCell>
                <TableCell>次の予定</TableCell>
                <TableCell align="center">個体カルテ</TableCell>
                <TableCell align="center" sx={{ width: 56 }}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRows.map((row) => {
                const summary = planMap.get(row.id) || null;
                return (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Typography fontWeight={800}>{row.name || '-'}</Typography>
                      <Typography variant="body2" color="text.secondary">耳標 {row.earTag || '-'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={row.stage || '繁殖牛'} size="small" color={row.stage === '育成牛' ? 'info' : 'success'} />
                    </TableCell>
                    <TableCell>
                      <Chip label={animalLifecycleLabel(row) || '在籍'} size="small" color={isAnimalDeceased(row) ? 'default' : isAnimalBreedingInactive(row) ? 'warning' : 'success'} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      {stageFilter === '育成牛' ? <Stack spacing={0.25}>
                        <Typography variant="body2">{row.birthday || '-'}</Typography>
                        <Typography variant="body2" color="text.secondary">{formatAnimalAge(row, today)}</Typography>
                      </Stack> : row.birthday || '-'}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">父：{row.sire || '-'}</Typography>
                      <Typography variant="body2" color="text.secondary">母：{row.dam || '-'}</Typography>
                    </TableCell>
                    <TableCell>
                      {isAnimalBreedingInactive(row) ? <Typography color="text.secondary">{isAnimalDeceased(row) ? '在籍終了' : '繁殖対象外'}</Typography> : <CattleBreedingPlanItems animal={row} summary={summary} today={today} compact />}
                    </TableCell>
                    <TableCell align="center">
                      <Button component={RouterLink} to={`/cattle/${row.id}`} variant="outlined" size="small">開く</Button>
                    </TableCell>
                    <TableCell align="center">
                      <IconButton aria-label={`${row.name || row.earTag}の操作`} onClick={(event) => openMenu(event, row)}>
                        <MoreVertIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
      <Stack spacing={1.5}>
      {filteredRows.map((row) => {
        const summary = planMap.get(row.id) || null;
        return (
          <Card key={row.id}>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Typography variant="h6" fontWeight={800}>{row.name}</Typography>
                  <Chip label={row.stage || '繁殖牛'} size="small" color={row.stage === '育成牛' ? 'info' : 'success'} />
                </Stack>

                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography color="text.secondary">状態：</Typography>
                  <Chip label={animalLifecycleLabel(row) || '在籍'} size="small" color={isAnimalDeceased(row) ? 'default' : isAnimalBreedingInactive(row) ? 'warning' : 'success'} variant="outlined" />
                </Stack>

                {isAnimalBreedingInactive(row) ? <Typography color="text.secondary">{isAnimalDeceased(row) ? '在籍終了' : '繁殖対象外'}</Typography> : <CattleBreedingPlanItems animal={row} summary={summary} today={today} compact />}

                <Typography>耳標番号：{row.earTag || '-'}</Typography>
                <Typography color="text.secondary">個体識別番号：{row.identificationNumber || '-'}</Typography>
                <Stack spacing={0.25}>
                  <Typography color="text.secondary">生年月日：{row.birthday || '-'}</Typography>
                  {stageFilter === '育成牛' && <Typography variant="body2" color="text.secondary">{formatAnimalAge(row, today)}</Typography>}
                </Stack>
                <Typography color="text.secondary">性別：{formatSex(row.sex)}</Typography>
                <Typography color="text.secondary">父牛：{row.sire || '-'} / 母牛：{row.dam || '-'}</Typography>
                {row.note && <Typography color="text.secondary">備考：{row.note}</Typography>}

                <Divider />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap">
                  <Button component={RouterLink} to={`/cattle/${row.id}`} variant="contained" fullWidth>個体カルテ</Button>
                  <Button component={RouterLink} to={`/cattle/${row.id}/edit`} variant="outlined" fullWidth>編集</Button>
                  {getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync && row.identificationNumber && (
                    <Button variant="outlined" disabled={retryBusy} onClick={() => void retryOneCattle(row)} fullWidth>クラウド未登録の確認・再送信</Button>
                  )}
                  <Button color="error" variant="outlined" disabled={deleting} onClick={() => handleDelete(row.id)} fullWidth>{deleting ? '削除中...' : '削除'}</Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        );
      })}
      </Stack>
      </Box>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        {menuRow && (
          <MenuItem component={RouterLink} to={`/cattle/${menuRow.id}/edit`} onClick={closeMenu}>編集</MenuItem>
        )}
        {menuRow && getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync && menuRow.identificationNumber && (
          <MenuItem disabled={retryBusy} onClick={() => { const row = menuRow; closeMenu(); void retryOneCattle(row); }}>クラウド未登録の確認・再送信</MenuItem>
        )}
        <MenuItem
          disabled={deleting}
          sx={{ color: 'error.main' }}
          onClick={() => {
            const id = menuRow?.id;
            closeMenu();
            if (id !== undefined) void handleDelete(id);
          }}
        >
          削除
        </MenuItem>
      </Menu>

      {!loading && !readError && filteredRows.length === 0 && (
        <Card>
          <CardContent>
            <Typography color="text.secondary">該当する牛がありません。</Typography>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
