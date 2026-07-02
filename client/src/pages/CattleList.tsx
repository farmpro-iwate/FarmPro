import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, IconButton, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { Cattle } from '../types/cattle';
import { deleteCattle, getCattleList } from '../services/api';
import { matchesAnyText, matchesSelect } from '../utils/search';

export function CattleList() {
  const [items, setItems] = useState<Cattle[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [blvStatus, setBlvStatus] = useState('すべて');

  const load = async () => {
    setLoading(true);
    setItems(await getCattleList());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) =>
      matchesAnyText([item.earTag, item.name, item.sire, item.dam, item.note], keyword) &&
      matchesSelect(item.blvStatus, blvStatus)
    );
  }, [items, keyword, blvStatus]);

  const handleDelete = async (item: Cattle) => {
    if (!window.confirm(`${item.name}を削除しますか？`)) return;
    await deleteCattle(item.id);
    await load();
  };

  const clearSearch = () => {
    setKeyword('');
    setBlvStatus('すべて');
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={800}>牛台帳</Typography>
        <Button component={RouterLink} to="/cattle/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button>
      </Stack>

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField label="検索" placeholder="個体番号・名号・父牛・母牛" value={keyword} onChange={(e) => setKeyword(e.target.value)} fullWidth size="small" />
            <TextField label="BLV" select value={blvStatus} onChange={(e) => setBlvStatus(e.target.value)} size="small" sx={{ minWidth: 140 }}>
              <MenuItem value="すべて">すべて</MenuItem>
              <MenuItem value="未検査">未検査</MenuItem>
              <MenuItem value="陰性">陰性</MenuItem>
              <MenuItem value="陽性">陽性</MenuItem>
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
              <TableHead><TableRow><TableCell>個体番号</TableCell><TableCell>名号</TableCell><TableCell>生年月日</TableCell><TableCell>BLV</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.earTag}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.birthday}</TableCell>
                    <TableCell><Chip size="small" label={item.blvStatus} color={item.blvStatus === '陰性' ? 'success' : item.blvStatus === '陽性' ? 'error' : 'warning'} /></TableCell>
                    <TableCell align="right">
                      <IconButton component={RouterLink} to={`/cattle/${item.id}/edit`}><EditIcon /></IconButton>
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
