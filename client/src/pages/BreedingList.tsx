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

export function BreedingList() {
  const [items, setItems] = useState<Breeding[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [result, setResult] = useState('すべて');

  const load = async () => {
    setLoading(true);
    setItems(await getBreedingList());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) =>
      matchesAnyText([item.cowEarTag, item.cowName, item.bullName, item.note], keyword) &&
      matchesSelect(item.pregnancyResult, result)
    );
  }, [items, keyword, result]);

  const handleDelete = async (item: Breeding) => {
    if (!window.confirm(`${item.cowName}の繁殖記録を削除しますか？`)) return;
    await deleteBreeding(item.id);
    await load();
  };

  const clearSearch = () => {
    setKeyword('');
    setResult('すべて');
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={800}>繁殖管理</Typography>
        <Button component={RouterLink} to="/breedings/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button>
      </Stack>

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField label="検索" placeholder="個体番号・牛名・種雄牛" value={keyword} onChange={(e) => setKeyword(e.target.value)} fullWidth size="small" />
            <TextField label="妊娠結果" select value={result} onChange={(e) => setResult(e.target.value)} size="small" sx={{ minWidth: 140 }}>
              <MenuItem value="すべて">すべて</MenuItem>
              <MenuItem value="未鑑定">未鑑定</MenuItem>
              <MenuItem value="妊娠">妊娠</MenuItem>
              <MenuItem value="不受胎">不受胎</MenuItem>
            </TextField>
            <Button variant="outlined" onClick={clearSearch}>クリア</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">表示件数：{filteredItems.length}件 / 全{items.length}件</Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? <Typography>読み込み中...</Typography> : (
            <Table size="small">
              <TableHead><TableRow><TableCell>牛名</TableCell><TableCell>授精日</TableCell><TableCell>種雄牛</TableCell><TableCell>妊娠結果</TableCell><TableCell>分娩予定</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.cowName}<br /><Typography variant="caption">{item.cowEarTag}</Typography></TableCell>
                    <TableCell>{item.inseminationDate}</TableCell>
                    <TableCell>{item.bullName}</TableCell>
                    <TableCell><Chip size="small" label={item.pregnancyResult} color={item.pregnancyResult === '妊娠' ? 'success' : item.pregnancyResult === '不受胎' ? 'error' : 'warning'} /></TableCell>
                    <TableCell>{item.expectedCalvingDate}<br /><Typography variant="caption">あと{daysUntil(item.expectedCalvingDate)}日</Typography></TableCell>
                    <TableCell align="right">
                      <IconButton component={RouterLink} to={`/breedings/${item.id}/edit`}><EditIcon /></IconButton>
                      <IconButton color="error" onClick={() => handleDelete(item)}><DeleteIcon /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
