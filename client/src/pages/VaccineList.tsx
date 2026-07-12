import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Card, CardContent, Chip, IconButton, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { Vaccine } from '../types/vaccine';
import { deleteVaccine, getVaccineList } from '../services/vaccineApi';
import { daysUntil, judgeVaccineDue } from '../utils/vaccine';
import { matchesAnyText, matchesSelect } from '../utils/search';

export function VaccineList() {
  const [items, setItems] = useState<Vaccine[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('すべて');

  const load = async () => {
    setLoading(true);
    setItems(await getVaccineList());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => items.filter((item) =>
    matchesAnyText([item.targetNumber, item.targetName, item.vaccineName, item.note], keyword) &&
    matchesSelect(item.status, status)
  ), [items, keyword, status]);

  const handleDelete = async (item: Vaccine) => {
    if (!window.confirm(`${item.targetName}のワクチン記録を削除しますか？`)) return;
    await deleteVaccine(item.id);
    await load();
  };

  const clearSearch = () => { setKeyword(''); setStatus('すべて'); };
  const chipColor = (label: string) => label === '接種済み' ? 'success' : label === '期限超過' ? 'error' : label === 'まもなく' ? 'warning' : 'default';

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>ワクチン管理</Typography>
          <Typography color="text.secondary">表示：{filteredItems.length}件 / 全{items.length}件</Typography>
        </Stack>
        <Button component={RouterLink} to="/vaccines/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button>
      </Stack>

      {loading ? <Typography>読み込み中...</Typography> : <>
        <Card sx={{ display: { xs: 'none', md: 'block' } }}>
          <CardContent sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 760 }}>
              <TableHead><TableRow><TableCell>対象</TableCell><TableCell>ワクチン名</TableCell><TableCell>接種日</TableCell><TableCell>次回予定</TableCell><TableCell>状態</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
              <TableBody>{filteredItems.map((item) => {
                const label = judgeVaccineDue(item.status, item.nextDueDate);
                return <TableRow key={item.id}>
                  <TableCell>{item.targetName}<br /><Typography variant="caption">{item.targetType} / {item.targetNumber}</Typography></TableCell>
                  <TableCell>{item.vaccineName}</TableCell>
                  <TableCell>{item.vaccinationDate || '未接種'}</TableCell>
                  <TableCell>{item.nextDueDate || '未定'}{item.nextDueDate && <><br /><Typography variant="caption">あと{daysUntil(item.nextDueDate)}日</Typography></>}</TableCell>
                  <TableCell><Chip size="small" label={label} color={chipColor(label) as any} /></TableCell>
                  <TableCell align="right"><IconButton component={RouterLink} to={`/vaccines/${item.id}/edit`}><EditIcon /></IconButton><IconButton color="error" onClick={() => handleDelete(item)}><DeleteIcon /></IconButton></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </CardContent>
        </Card>

        <Stack spacing={1} sx={{ display: { xs: 'flex', md: 'none' } }}>
          {filteredItems.map((item) => {
            const label = judgeVaccineDue(item.status, item.nextDueDate);
            return <Card key={item.id}><CardContent>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box><Typography fontWeight={800}>{item.targetName}</Typography><Typography variant="body2" color="text.secondary">{item.targetType} / {item.targetNumber}</Typography></Box>
                  <Chip size="small" label={label} color={chipColor(label) as any} />
                </Stack>
                <Typography><b>ワクチン：</b>{item.vaccineName}</Typography>
                <Typography><b>接種日：</b>{item.vaccinationDate || '未接種'}</Typography>
                <Typography><b>次回予定：</b>{item.nextDueDate || '未定'}{item.nextDueDate ? `（あと${daysUntil(item.nextDueDate)}日）` : ''}</Typography>
                <Stack direction="row" spacing={1}><Button component={RouterLink} to={`/vaccines/${item.id}/edit`} variant="outlined" startIcon={<EditIcon />}>編集</Button><Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={() => handleDelete(item)}>削除</Button></Stack>
              </Stack>
            </CardContent></Card>;
          })}
        </Stack>
      </>}

      <Card><CardContent sx={{ py: 1.5 }}><Stack spacing={1}>
        <Typography fontWeight={700} color="text.secondary">検索・絞り込み</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField label="検索" placeholder="対象番号・対象名・ワクチン名" value={keyword} onChange={(e) => setKeyword(e.target.value)} fullWidth size="small" />
          <TextField label="状態" select value={status} onChange={(e) => setStatus(e.target.value)} size="small" sx={{ minWidth: 140 }}><MenuItem value="すべて">すべて</MenuItem><MenuItem value="未接種">未接種</MenuItem><MenuItem value="接種済み">接種済み</MenuItem></TextField>
          <Button variant="outlined" onClick={clearSearch} size="small">クリア</Button>
        </Stack>
      </Stack></CardContent></Card>
    </Stack>
  );
}
