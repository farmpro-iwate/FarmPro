import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { getSupplyBatches, getSupplyMovements, SupplyKind, SupplyMovement } from '../services/supplyInventoryApi';

export function SupplyInventoryPage() {
  const [params, setParams] = useSearchParams();
  const kind: SupplyKind = params.get('kind') === '受精卵' ? '受精卵' : '医薬品';
  const [rows, setRows] = useState<SupplyMovement[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    let active = true;
    getSupplyMovements().then((data) => { if (active) setRows(data); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : '在庫を読み込めませんでした。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const batches = useMemo(() => getSupplyBatches(rows, kind).filter((row) =>
    (row.itemName + row.lotNumber + row.storageLocation).toLocaleLowerCase().includes(keyword.toLocaleLowerCase())
  ), [rows, kind, keyword]);
  const history = useMemo(() => rows.filter((row) => row.kind === kind).sort((a, b) => b.date.localeCompare(a.date)), [rows, kind]);
  const currentDate = new Date().toLocaleDateString('sv-SE');

  return <Stack spacing={2}>
    <Typography variant="h5" fontWeight={800}>医薬品・受精卵 在庫管理</Typography>
    <TextField select size="small" label="種類" value={kind} onChange={(event) => setParams({ kind: event.target.value })}>
      <MenuItem value="医薬品">医薬品</MenuItem><MenuItem value="受精卵">受精卵</MenuItem>
    </TextField>
    <Button size="large" variant="contained" component={RouterLink} to={'/supply-inventory/new?kind=' + encodeURIComponent(kind)}>
      ＋ 購入・入出庫を記録
    </Button>
    <TextField size="small" label="品名・番号で検索" value={keyword} onChange={(event) => setKeyword(event.target.value)} fullWidth />
    {error && <Alert severity="error">{error}</Alert>}
    {loading && <Typography>読み込み中…</Typography>}
    {!loading && !error && <Typography fontWeight={800}>現在の在庫（{batches.length}種類・ロット）</Typography>}
    {!loading && !error && batches.length === 0 && <Alert severity="info">該当する在庫はまだありません。</Alert>}
    {batches.map((batch) => {
      const expired = Boolean(batch.expiryDate && batch.expiryDate < currentDate);
      return <Card variant="outlined" key={batch.key}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
            <Box>
              <Typography fontWeight={800}>{batch.itemName}</Typography>
              <Typography variant="body2" color="text.secondary">{kind === '医薬品' ? 'ロット' : '受精卵番号'}：{batch.lotNumber}</Typography>
              {batch.storageLocation && <Typography variant="body2">保管：{batch.storageLocation}</Typography>}
              {batch.expiryDate && <Typography variant="body2">期限：{batch.expiryDate}</Typography>}
            </Box>
            <Stack alignItems="flex-end" spacing={0.5}>
              <Typography fontWeight={900} variant="h6">{batch.balance} {batch.unit}</Typography>
              {batch.balance <= 0 && <Chip size="small" label="在庫なし" color="warning" />}
              {expired && batch.balance > 0 && <Chip size="small" label="期限切れ・要確認" color="error" />}
            </Stack>
          </Stack>
        </CardContent>
      </Card>;
    })}
    <Typography fontWeight={800}>入出庫の履歴</Typography>
    {history.length === 0 && <Typography color="text.secondary">記録なし</Typography>}
    {history.map((row) => <Card key={row.id} variant="outlined"><CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
      <Stack direction="row" justifyContent="space-between" gap={1}>
        <Box><Typography fontWeight={700}>{row.date}　{row.action}</Typography>
          <Typography>{row.itemName}（{row.lotNumber}）</Typography>
          {row.cowEarTag && <Typography variant="body2">使用牛：{row.cowEarTag}</Typography>}
        </Box>
        <Typography fontWeight={800} sx={{ whiteSpace: 'nowrap' }}>{row.action === '購入' || row.action === '棚卸増' ? '+' : '−'}{row.quantity} {row.unit}</Typography>
      </Stack>
    </CardContent></Card>)}
    <Alert severity="info">治療・ワクチン・ETの既存記録は変更しません。今後の正式連動までは、在庫使用をこの画面で記録してください。</Alert>
  </Stack>;
}
