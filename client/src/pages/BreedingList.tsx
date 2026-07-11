import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, IconButton, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { Breeding } from '../types/breeding';
import { deleteBreeding, getBreedingList } from '../services/breedingApi';
import { daysUntil } from '../utils/breeding';
import { matchesAnyText, matchesSelect } from '../utils/search';

function resultColor(result: string) {
  if (result === '受胎') return 'success';
  if (result === '空胎' || result === '流産・胎子喪失') return 'error';
  if (result === '再鑑定予定') return 'info';
  return 'warning';
}

function displayDate(value: string) { return value || '-'; }

export function BreedingList() {
  const [items, setItems] = useState<Breeding[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [result, setResult] = useState('すべて');

  const load = async () => { setLoading(true); setItems(await getBreedingList()); setLoading(false); };
  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => items.filter((item) =>
    matchesAnyText([
      item.cowEarTag, item.cowName, item.bullName, item.breedingMethod, item.breedingStatus,
      item.transferCancelReason, item.embryoNumber, item.donorCowName, item.donorCowEarTag,
      item.embryoSireName, item.strawNumber, item.supplierName, item.transferTechnician, item.note
    ], keyword) && matchesSelect(item.pregnancyResult, result)
  ), [items, keyword, result]);

  const handleDelete = async (item: Breeding) => {
    if (!window.confirm(`${item.cowName}の繁殖記録を削除しますか？`)) return;
    await deleteBreeding(item.id);
    await load();
  };

  const clearSearch = () => { setKeyword(''); setResult('すべて'); };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>繁殖管理</Typography>
          <Typography color="text.secondary">表示：{filteredItems.length}件 / 全{items.length}件</Typography>
        </Stack>
        <Button component={RouterLink} to="/breedings/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button>
      </Stack>

      <Card><CardContent sx={{ overflowX: 'auto' }}>
        {loading ? <Typography>読み込み中...</Typography> : (
          <Table size="small" sx={{ minWidth: 1120 }}>
            <TableHead><TableRow>
              <TableCell>母牛</TableCell><TableCell>方法・段階</TableCell><TableCell>実施日</TableCell>
              <TableCell>受精卵情報</TableCell><TableCell>次回発情予定</TableCell><TableCell>妊娠鑑定予定</TableCell>
              <TableCell>受胎確認</TableCell><TableCell>分娩予定</TableCell><TableCell align="right">操作</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {filteredItems.map((item) => {
                const performedDate = item.breedingMethod === '受精卵移植' ? item.transferDate : item.inseminationDate;
                return (
                  <TableRow key={item.id}>
                    <TableCell>{item.cowName}<br /><Typography variant="caption">耳標：{item.cowEarTag}</Typography></TableCell>
                    <TableCell>
                      {item.breedingMethod || '未選択'}<br /><Chip size="small" label={item.breedingStatus || '発情予定'} />
                      {item.breedingStatus === '中止' && item.transferCancelReason && <Typography variant="caption" display="block" color="error">{item.transferCancelReason}</Typography>}
                    </TableCell>
                    <TableCell>{displayDate(performedDate)}</TableCell>
                    <TableCell>
                      {item.breedingMethod === '受精卵移植' ? <>
                        <Typography variant="body2">番号：{item.embryoNumber || '-'}</Typography>
                        <Typography variant="caption" display="block">供卵牛：{item.donorCowName || '-'}</Typography>
                        <Typography variant="caption" display="block">父牛：{item.embryoSireName || '-'}</Typography>
                      </> : '-'}
                    </TableCell>
                    <TableCell>{displayDate(item.nextHeatExpectedDate)}</TableCell>
                    <TableCell>{displayDate(item.pregnancyCheckExpectedDate)}</TableCell>
                    <TableCell><Chip size="small" label={item.pregnancyResult || '未鑑定'} color={resultColor(item.pregnancyResult) as any} /></TableCell>
                    <TableCell>{displayDate(item.expectedCalvingDate)}{item.expectedCalvingDate && <><br /><Typography variant="caption">あと{daysUntil(item.expectedCalvingDate)}日</Typography></>}</TableCell>
                    <TableCell align="right">
                      <IconButton component={RouterLink} to={`/breedings/${item.id}/edit`}><EditIcon /></IconButton>
                      <IconButton color="error" onClick={() => handleDelete(item)}><DeleteIcon /></IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>

      <Card><CardContent sx={{ py: 1.5 }}><Stack spacing={1}>
        <Typography fontWeight={700} color="text.secondary">検索・絞り込み</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField label="検索" placeholder="耳標・牛名・受精卵番号・供卵牛・父牛" value={keyword} onChange={(e) => setKeyword(e.target.value)} fullWidth size="small" />
          <TextField label="受胎確認" select value={result} onChange={(e) => setResult(e.target.value)} size="small" sx={{ minWidth: 170 }}>
            <MenuItem value="すべて">すべて</MenuItem><MenuItem value="未鑑定">未鑑定</MenuItem><MenuItem value="再鑑定予定">再鑑定予定</MenuItem><MenuItem value="受胎">受胎</MenuItem><MenuItem value="空胎">空胎</MenuItem><MenuItem value="流産・胎子喪失">流産・胎子喪失</MenuItem>
          </TextField>
          <Button variant="outlined" onClick={clearSearch} size="small">クリア</Button>
        </Stack>
      </Stack></CardContent></Card>
    </Stack>
  );
}
