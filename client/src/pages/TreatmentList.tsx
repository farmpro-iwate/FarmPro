import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Card, CardContent, Chip, IconButton, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { Treatment } from '../types/treatment';
import { deleteTreatment, getTreatmentList } from '../services/treatmentApi';
import { daysUntil, judgeWithdrawal } from '../utils/treatment';
import { matchesAnyText, matchesSelect } from '../utils/search';

export function TreatmentList() {
  const [items, setItems] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [progress, setProgress] = useState('すべて');

  const load = async () => { setLoading(true); setItems(await getTreatmentList()); setLoading(false); };
  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => items.filter((item) =>
    matchesAnyText([item.targetNumber, item.targetName, item.symptom, item.diagnosis, item.medicine, item.veterinarian, item.note], keyword) &&
    matchesSelect(item.progress, progress)
  ), [items, keyword, progress]);

  const handleDelete = async (item: Treatment) => {
    if (!window.confirm(`${item.targetName} の治療記録を削除しますか？`)) return;
    await deleteTreatment(item.id);
    await load();
  };

  const clearSearch = () => { setKeyword(''); setProgress('すべて'); };
  const progressColor = (value: string) => value === '回復' ? 'success' : value === '要再診' ? 'error' : value === '経過観察' ? 'warning' : 'info';
  const withdrawalColor = (label: string) => label === '休薬中' ? 'warning' : label === '休薬終了' ? 'success' : 'default';

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack spacing={0.25}><Typography variant="h5" fontWeight={800}>治療管理</Typography><Typography color="text.secondary">表示：{filteredItems.length}件 / 全{items.length}件</Typography></Stack>
        <Button component={RouterLink} to="/treatments/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button>
      </Stack>

      {loading ? <Typography>読み込み中...</Typography> : <>
        <Card sx={{ display: { xs: 'none', md: 'block' } }}><CardContent sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead><TableRow><TableCell>対象</TableCell><TableCell>症状・診断</TableCell><TableCell>治療日</TableCell><TableCell>薬剤</TableCell><TableCell>経過</TableCell><TableCell>休薬</TableCell><TableCell align="right" sx={{ position: 'sticky', right: 0, backgroundColor: 'background.paper', zIndex: 10 }}>操作</TableCell></TableRow></TableHead>
            <TableBody>{filteredItems.map((item) => {
              const withdrawal = judgeWithdrawal(item.withdrawalEndDate);
              return <TableRow key={item.id}>
                <TableCell>{item.targetName}<br /><Typography variant="caption" color="text.secondary">{item.targetNumber}</Typography></TableCell>
                <TableCell>{item.symptom}{item.diagnosis && <><br /><Typography variant="caption" color="text.secondary">{item.diagnosis}</Typography></>}</TableCell>
                <TableCell>{item.treatmentDate}</TableCell>
                <TableCell>{item.medicine || '-'}</TableCell>
                <TableCell><Chip size="small" label={item.progress} color={progressColor(item.progress) as any} /></TableCell>
                <TableCell sx={{ minWidth: 160 }}><Chip size="small" label={withdrawal} color={withdrawalColor(withdrawal) as any} />{item.withdrawalEndDate && <><br /><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{item.withdrawalEndDate}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>あと{daysUntil(item.withdrawalEndDate)}日</Typography></>}</TableCell>
                <TableCell align="right" sx={{ position: 'sticky', right: 0, backgroundColor: 'background.paper', zIndex: 9 }}><IconButton component={RouterLink} to={`/treatments/${item.id}/edit`}><EditIcon /></IconButton><IconButton color="error" onClick={() => handleDelete(item)}><DeleteIcon /></IconButton></TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </CardContent></Card>

        <Stack spacing={1} sx={{ display: { xs: 'flex', md: 'none' } }}>
          {filteredItems.map((item) => {
            const withdrawal = judgeWithdrawal(item.withdrawalEndDate);
            return <Card key={item.id}><CardContent><Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box><Typography fontWeight={800}>{item.targetName}</Typography><Typography variant="body2" color="text.secondary">{item.targetNumber || '-'}</Typography></Box>
                <Chip size="small" label={item.progress} color={progressColor(item.progress) as any} />
              </Stack>
              <Typography><b>症状：</b>{item.symptom || '-'}</Typography>
              {item.diagnosis && <Typography><b>診断：</b>{item.diagnosis}</Typography>}
              <Typography><b>治療日：</b>{item.treatmentDate || '-'}</Typography>
              <Typography><b>薬剤：</b>{item.medicine || '-'}</Typography>
              <Stack direction="row" spacing={1} alignItems="center"><Typography><b>休薬：</b></Typography><Chip size="small" label={withdrawal} color={withdrawalColor(withdrawal) as any} /></Stack>
              {item.withdrawalEndDate && <Typography><b>休薬終了：</b>{item.withdrawalEndDate}（あと{daysUntil(item.withdrawalEndDate)}日）</Typography>}
              <Stack direction="row" spacing={1}><Button component={RouterLink} to={`/treatments/${item.id}/edit`} variant="outlined" startIcon={<EditIcon />}>編集</Button><Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={() => handleDelete(item)}>削除</Button></Stack>
            </Stack></CardContent></Card>;
          })}
        </Stack>
      </>}

      <Card><CardContent sx={{ py: 1.5 }}><Stack spacing={1}>
        <Typography fontWeight={700} color="text.secondary">検索・絞り込み</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField label="検索" placeholder="対象・症状・薬剤・獣医師" value={keyword} onChange={(e) => setKeyword(e.target.value)} fullWidth size="small" />
          <TextField label="経過" select value={progress} onChange={(e) => setProgress(e.target.value)} size="small" sx={{ minWidth: 140 }}><MenuItem value="すべて">すべて</MenuItem><MenuItem value="治療中">治療中</MenuItem><MenuItem value="経過観察">経過観察</MenuItem><MenuItem value="回復">回復</MenuItem><MenuItem value="要再診">要再診</MenuItem></TextField>
          <Button variant="outlined" onClick={clearSearch} size="small">クリア</Button>
        </Stack>
      </Stack></CardContent></Card>
    </Stack>
  );
}
