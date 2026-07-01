import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { Breeding } from '../types/breeding';
import { deleteBreeding, getBreedingList } from '../services/breedingApi';
import { daysUntil } from '../utils/breeding';

export function BreedingList() {
  const [breedings, setBreedings] = useState<Breeding[]>([]); const [loading, setLoading] = useState(true);
  const loadBreedings = async () => { setLoading(true); setBreedings(await getBreedingList()); setLoading(false); };
  useEffect(() => { loadBreedings(); }, []);
  const handleDelete = async (b: Breeding) => { if (!window.confirm(`${b.cowName} の繁殖記録を削除しますか？`)) return; await deleteBreeding(b.id); await loadBreedings(); };
  return <Stack spacing={2}><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h5" fontWeight={800}>繁殖管理</Typography><Button component={RouterLink} to="/breedings/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button></Stack><Card><CardContent>{loading ? <Typography>読み込み中...</Typography> : (
    <Table size="small"><TableHead><TableRow><TableCell>牛名</TableCell><TableCell>授精日</TableCell><TableCell>種雄牛</TableCell><TableCell>妊娠結果</TableCell><TableCell>分娩予定</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead><TableBody>
      {breedings.map((b) => <TableRow key={b.id}><TableCell>{b.cowName}<br />{b.cowEarTag}</TableCell><TableCell>{b.inseminationDate}</TableCell><TableCell>{b.bullName}</TableCell><TableCell><Chip size="small" label={b.pregnancyResult} color={b.pregnancyResult === '妊娠' ? 'success' : b.pregnancyResult === '不受胎' ? 'error' : 'warning'} /></TableCell><TableCell>{b.expectedCalvingDate}<br /><Typography variant="caption" color="text.secondary">あと{daysUntil(b.expectedCalvingDate)}日</Typography></TableCell><TableCell align="right"><IconButton component={RouterLink} to={`/breedings/${b.id}/edit`}><EditIcon /></IconButton><IconButton color="error" onClick={() => handleDelete(b)}><DeleteIcon /></IconButton></TableCell></TableRow>)}
    </TableBody></Table>)}</CardContent></Card></Stack>;
}
