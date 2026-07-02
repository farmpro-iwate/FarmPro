import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, IconButton, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { Calf } from '../types/calf';
import { deleteCalf, getCalfList } from '../services/calfApi';
import { calculateAgeDays, calculateDg, judgeDg } from '../utils/calf';
import { matchesAnyText, matchesSelect } from '../utils/search';

export function CalfList() {
  const [items, setItems] = useState<Calf[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [sex, setSex] = useState('すべて');

  const load = async () => {
    setLoading(true);
    setItems(await getCalfList());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) =>
      matchesAnyText([item.calfNumber, item.name, item.motherName, item.note], keyword) &&
      matchesSelect(item.sex, sex)
    );
  }, [items, keyword, sex]);

  const handleDelete = async (item: Calf) => {
    if (!window.confirm(`${item.name}を削除しますか？`)) return;
    await deleteCalf(item.id);
    await load();
  };

  const clearSearch = () => {
    setKeyword('');
    setSex('すべて');
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={800}>子牛管理</Typography>
        <Button component={RouterLink} to="/calves/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button>
      </Stack>

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField label="検索" placeholder="子牛番号・名号・母牛名" value={keyword} onChange={(e) => setKeyword(e.target.value)} fullWidth size="small" />
            <TextField label="性別" select value={sex} onChange={(e) => setSex(e.target.value)} size="small" sx={{ minWidth: 120 }}>
              <MenuItem value="すべて">すべて</MenuItem>
              <MenuItem value="雌">雌</MenuItem>
              <MenuItem value="雄">雄</MenuItem>
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
              <TableHead><TableRow><TableCell>子牛番号</TableCell><TableCell>名号</TableCell><TableCell>日齢</TableCell><TableCell>DG</TableCell><TableCell>判定</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
              <TableBody>
                {filteredItems.map((item) => {
                  const dg = calculateDg(item.startWeight, item.currentWeight, item.elapsedDays);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{item.calfNumber}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{calculateAgeDays(item.birthday)}日</TableCell>
                      <TableCell>{dg.toFixed(2)}kg</TableCell>
                      <TableCell><Chip size="small" label={judgeDg(dg)} color={dg >= 0.8 ? 'success' : dg >= 0.6 ? 'warning' : 'error'} /></TableCell>
                      <TableCell align="right">
                        <IconButton component={RouterLink} to={`/calves/${item.id}/edit`}><EditIcon /></IconButton>
                        <IconButton color="error" onClick={() => handleDelete(item)}><DeleteIcon /></IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
