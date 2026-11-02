import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, Stack, TextField, Typography, IconButton, Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { changeManualSupplyMovement, getSupplyBatches, getSupplyMovements, SupplyKind, SupplyMovement } from '../services/supplyInventoryApi';
import { getSupplyInventorySyncStatus, SUPPLY_INVENTORY_SYNC_STATUS_EVENT } from '../services/supplyInventorySync';

const inventoryGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
  gap: 2,
};

export function SupplyInventoryPage() {
  const [params] = useSearchParams();
  const kind: SupplyKind = params.get('kind') === '受精卵' ? '受精卵' : '医薬品';
  const [rows, setRows] = useState<SupplyMovement[]>([]);
  const [error, setError] = useState('');
  const [syncStatus, setSyncStatus] = useState(getSupplyInventorySyncStatus);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [selected, setSelected] = useState<SupplyMovement | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const reload = async () => setRows(await getSupplyMovements());
  const remove = async () => {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try { await changeManualSupplyMovement(selected.id); await reload(); setDeleteOpen(false); setSelected(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '削除に失敗しました。'); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    let active = true;
    let running = false;
    let requestedAgain = false;
    const load = async () => {
      if (running) { requestedAgain = true; return; }
      running = true;
      do {
        requestedAgain = false;
        try {
          const data = await getSupplyMovements();
          if (active) {
            setRows(data);
            setError('');
            setSyncStatus(getSupplyInventorySyncStatus());
          }
        } catch (cause) {
          if (active) setError(cause instanceof Error ? cause.message : '在庫を読み込めませんでした。');
        } finally {
          if (active) setLoading(false);
        }
      } while (active && requestedAgain);
      running = false;
    };
    const refresh = () => { void load(); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const onSyncStatus = () => { if (active) setSyncStatus(getSupplyInventorySyncStatus()); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(SUPPLY_INVENTORY_SYNC_STATUS_EVENT, onSyncStatus);
    refresh();
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(SUPPLY_INVENTORY_SYNC_STATUS_EVENT, onSyncStatus);
    };
  }, []);

  const batches = useMemo(() => getSupplyBatches(rows, kind).filter((row) =>
    (row.itemName + row.lotNumber + row.storageLocation).toLocaleLowerCase().includes(keyword.toLocaleLowerCase())
  ), [rows, kind, keyword]);
  const history = useMemo(() => rows.filter((row) => row.kind === kind).sort((a, b) => b.date.localeCompare(a.date)), [rows, kind]);
  const currentDate = new Date().toLocaleDateString('sv-SE');

  return <Stack spacing={2}>
    <Typography variant="h5" fontWeight={800}>{kind}在庫管理</Typography>
    <Button size="large" variant="contained" component={RouterLink} to={'/supply-inventory/new?kind=' + encodeURIComponent(kind)}>
      ＋ 購入・入出庫を記録
    </Button>
    <TextField size="small" label="品名・番号で検索" value={keyword} onChange={(event) => setKeyword(event.target.value)} fullWidth />
    {error && <Alert severity="error">{error}</Alert>}
    {(syncStatus.state === 'pending' || syncStatus.state === 'conflict') && <Alert severity="warning">{syncStatus.message}</Alert>}
    {loading && <Typography>読み込み中…</Typography>}
    {!loading && !error && <Typography fontWeight={800}>現在の在庫（{batches.length}種類・ロット）</Typography>}
    {!loading && !error && batches.length === 0 && <Alert severity="info">該当する在庫はまだありません。</Alert>}
    <Box sx={inventoryGridSx}>
    {batches.map((batch) => {
      const expired = Boolean(batch.expiryDate && batch.expiryDate < currentDate);
      return <Card key={batch.key} variant="outlined" sx={{ height: '100%' }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
            <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <Typography fontWeight={800}>{batch.itemName}</Typography>
              <Typography variant="body2" color="text.secondary">{kind === '医薬品' ? 'ロット' : '受精卵番号'}：{batch.lotNumber.trim() || '未入力'}</Typography>
              {batch.storageLocation && <Typography variant="body2">保管：{batch.storageLocation}</Typography>}
              {batch.expiryDate && <Typography variant="body2">期限：{batch.expiryDate}</Typography>}
            </Box>
            <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
              <Typography fontWeight={900} variant="h6">{batch.balance} {batch.unit}</Typography>
              {batch.balance <= 0 && <Chip size="small" label="在庫なし" color="warning" />}
              {expired && batch.balance > 0 && <Chip size="small" label="期限切れ・要確認" color="error" />}
            </Stack>
          </Stack>
        </CardContent>
      </Card>;
    })}
    </Box>
    <Typography fontWeight={800}>入出庫の履歴</Typography>
    {history.length === 0 && <Typography color="text.secondary">記録なし</Typography>}
    <Box sx={inventoryGridSx}>
    {history.map((row) => <Card key={row.id} variant="outlined" sx={{ height: '100%' }}><CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
      <Stack direction="row" justifyContent="space-between" gap={1}>
        <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}><Typography fontWeight={700}>{row.date}　{row.action}</Typography>
          <Typography>{row.itemName}{row.lotNumber.trim() ? `（${row.lotNumber}）` : ''}</Typography>
          {row.cowEarTag && <Typography variant="body2">使用牛：{row.cowEarTag}</Typography>}
        </Box>
        <Stack direction="row" alignItems="center" sx={{ flexShrink: 0 }}><Typography fontWeight={800} sx={{ whiteSpace: 'nowrap' }}>{row.action === '購入' || row.action === '棚卸増' ? '+' : '−'}{row.quantity} {row.unit}</Typography><IconButton size="small" aria-label="履歴の操作" onClick={(event) => { setSelected(row); setMenuAnchor(event.currentTarget); }}>⋮</IconButton></Stack>
      </Stack>
    </CardContent></Card>)}
    </Box>
    <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
      <MenuItem component={RouterLink} to={selected ? '/supply-inventory/new?kind=' + encodeURIComponent(selected.kind) + '&editId=' + encodeURIComponent(selected.id) : '#'} onClick={() => setMenuAnchor(null)}>編集</MenuItem>
      <MenuItem onClick={() => { setMenuAnchor(null); setDeleteOpen(true); }}>削除</MenuItem>
    </Menu>
    <Dialog open={deleteOpen} onClose={() => !busy && setDeleteOpen(false)}>
      <DialogTitle>在庫履歴を削除しますか？</DialogTitle>
      <DialogContent>{selected?.itemName}{selected?.lotNumber.trim() ? `（${selected.lotNumber}）` : ''}の{selected?.action}記録を削除します。経費・治療・ET連動の記録は削除できません。</DialogContent>
      <DialogActions><Button onClick={() => setDeleteOpen(false)} disabled={busy}>やめる</Button><Button color="error" disabled={busy} onClick={remove}>削除する</Button></DialogActions>
    </Dialog>
    <Alert severity="info">治療や受精卵移植で農場在庫を選んだ場合、使用数量は自動的に出庫されます。同じ使用をこの画面から重複登録しないでください。手動の使用・廃棄・棚卸は、治療や移植と連動しない入出庫に利用してください。</Alert>
  </Stack>;
}
