import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, IconButton, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { BlvTest } from '../types/blv';
import { deleteBlvTest, getBlvTestList } from '../services/blvApi';
import { daysUntil, judgeBlvNextTest } from '../utils/blv';
import { matchesAnyText, matchesSelect } from '../utils/search';

export function BlvList() {
  const [items, setItems] = useState<BlvTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [result, setResult] = useState('すべて');

  const load = async () => {
    setLoading(true);
    setItems(await getBlvTestList());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) =>
      matchesAnyText([item.cowEarTag, item.cowName, item.note, item.isolationMemo], keyword) &&
      matchesSelect(item.result, result)
    );
  }, [items, keyword, result]);

  const handleDelete = async (item: BlvTest) => {
    if (!window.confirm(`${item.cowName}のBLV検査記録を削除しますか？`)) return;
    await deleteBlvTest(item.id);
    await load();
  };

  const clearSearch = () => {
    setKeyword('');
    setResult('すべて');
  };

  const resultColor = (value: string) => value === '陽性' ? 'error' : value === '陰性' ? 'success' : 'warning';
  const statusColor = (value: string) => value === '陽性管理' || value === '期限超過' ? 'error' : value === 'まもなく' ? 'warning' : 'default';

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>BLV管理</Typography>
          <Typography color="text.secondary">表示：{filteredItems.length}件 / 全{items.length}件</Typography>
        </Stack>
        <Button component={RouterLink} to="/blv/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button>
      </Stack>

      <Card>
        <CardContent>
          {loading ? <Typography>読み込み中...</Typography> : (
            <Table size="small">
              <TableHead><TableRow><TableCell>対象牛</TableCell><TableCell>検査日</TableCell><TableCell>結果</TableCell><TableCell>次回検査</TableCell><TableCell>判定</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
              <TableBody>
                {filteredItems.map((item) => {
                  const status = judgeBlvNextTest(item.result, item.nextTestDate);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{item.cowName}<br /><Typography variant="caption">{item.cowEarTag}</Typography></TableCell>
                      <TableCell>{item.testDate || '未検査'}</TableCell>
                      <TableCell><Chip size="small" label={item.result} color={resultColor(item.result) as any} /></TableCell>
                      <TableCell>{item.nextTestDate || '未定'}{item.nextTestDate && <><br /><Typography variant="caption">あと{daysUntil(item.nextTestDate)}日</Typography></>}</TableCell>
                      <TableCell><Chip size="small" label={status} color={statusColor(status) as any} /></TableCell>
                      <TableCell align="right">
                        <IconButton component={RouterLink} to={`/blv/${item.id}/edit`}><EditIcon /></IconButton>
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

      <Card>
        <CardContent sx={{ py: 1.5 }}>
          <Stack spacing={1}>
            <Typography fontWeight={700} color="text.secondary">検索・絞り込み</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField label="検索" placeholder="耳標番号・牛名" value={keyword} onChange={(e) => setKeyword(e.target.value)} fullWidth size="small" />
              <TextField label="検査結果" select value={result} onChange={(e) => setResult(e.target.value)} size="small" sx={{ minWidth: 140 }}>
                <MenuItem value="すべて">すべて</MenuItem>
                <MenuItem value="未検査">未検査</MenuItem>
                <MenuItem value="陰性">陰性</MenuItem>
                <MenuItem value="陽性">陽性</MenuItem>
              </TextField>
              <Button variant="outlined" onClick={clearSearch} size="small">クリア</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
