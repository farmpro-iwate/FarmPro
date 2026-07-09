import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, IconButton, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
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

  const load = async () => {
    setLoading(true);
    setItems(await getTreatmentList());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) =>
      matchesAnyText([item.targetNumber, item.targetName, item.symptom, item.diagnosis, item.medicine, item.veterinarian, item.note], keyword) &&
      matchesSelect(item.progress, progress)
    );
  }, [items, keyword, progress]);

  const handleDelete = async (item: Treatment) => {
    if (!window.confirm(`${item.targetName} の治療記録を削除しますか？`)) return;
    await deleteTreatment(item.id);
    await load();
  };

  const clearSearch = () => {
    setKeyword('');
    setProgress('すべて');
  };

  const progressColor = (value: string) => {
    if (value === '回復') return 'success';
    if (value === '要再診') return 'error';
    if (value === '経過観察') return 'warning';
    return 'info';
  };

  const withdrawalColor = (label: string) => {
    if (label === '休薬中') return 'warning';
    if (label === '休薬終了') return 'success';
    return 'default';
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>治療管理</Typography>
          <Typography color="text.secondary">表示：{filteredItems.length}件 / 全{items.length}件</Typography>
        </Stack>
        <Button component={RouterLink} to="/treatments/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button>
      </Stack>

      <Card>
        <CardContent>
          {loading ? <Typography>読み込み中...</Typography> : (
            <Table size="small">
              <TableHead><TableRow><TableCell>対象</TableCell><TableCell>症状・診断</TableCell><TableCell>治療日</TableCell><TableCell>薬剤</TableCell><TableCell>経過</TableCell><TableCell>休薬</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
              <TableBody>
                {filteredItems.map((item) => {
                  const withdrawal = judgeWithdrawal(item.withdrawalEndDate);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{item.targetName}<br /><Typography variant="caption" color="text.secondary">{item.targetNumber}</Typography></TableCell>
                      <TableCell>{item.symptom}{item.diagnosis && <><br /><Typography variant="caption" color="text.secondary">{item.diagnosis}</Typography></>}</TableCell>
                      <TableCell>{item.treatmentDate}</TableCell>
                      <TableCell>{item.medicine || '-'}</TableCell>
                      <TableCell><Chip size="small" label={item.progress} color={progressColor(item.progress) as any} /></TableCell>
                      <TableCell>
                        <Chip size="small" label={withdrawal} color={withdrawalColor(withdrawal) as any} />
                        {item.withdrawalEndDate && <><br /><Typography variant="caption" color="text.secondary">{item.withdrawalEndDate} / あと{daysUntil(item.withdrawalEndDate)}日</Typography></>}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton component={RouterLink} to={`/treatments/${item.id}/edit`}><EditIcon /></IconButton>
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
              <TextField label="検索" placeholder="対象・症状・薬剤・獣医師" value={keyword} onChange={(e) => setKeyword(e.target.value)} fullWidth size="small" />
              <TextField label="経過" select value={progress} onChange={(e) => setProgress(e.target.value)} size="small" sx={{ minWidth: 140 }}>
                <MenuItem value="すべて">すべて</MenuItem>
                <MenuItem value="治療中">治療中</MenuItem>
                <MenuItem value="経過観察">経過観察</MenuItem>
                <MenuItem value="回復">回復</MenuItem>
                <MenuItem value="要再診">要再診</MenuItem>
              </TextField>
              <Button variant="outlined" onClick={clearSearch} size="small">クリア</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
