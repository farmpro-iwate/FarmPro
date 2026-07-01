import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { Calf } from '../types/calf';
import { deleteCalf, getCalfList } from '../services/calfApi';
import { calculateAgeDays, calculateDg, judgeDg } from '../utils/calf';

export function CalfList() {
  const [calves, setCalves] = useState<Calf[]>([]); const [loading, setLoading] = useState(true);
  const loadCalves = async () => { setLoading(true); setCalves(await getCalfList()); setLoading(false); };
  useEffect(() => { loadCalves(); }, []);
  const handleDelete = async (calf: Calf) => { if (!window.confirm(`${calf.name}（${calf.calfNumber}）を削除しますか？`)) return; await deleteCalf(calf.id); await loadCalves(); };
  return (
    <Stack spacing={2}><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h5" fontWeight={800}>子牛管理</Typography><Button component={RouterLink} to="/calves/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button></Stack>
      <Card><CardContent>{loading ? <Typography>読み込み中...</Typography> : (
        <Table size="small"><TableHead><TableRow><TableCell>子牛番号</TableCell><TableCell>名号</TableCell><TableCell>日齢</TableCell><TableCell>DG</TableCell><TableCell>判定</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead><TableBody>
          {calves.map((calf) => { const dg = calculateDg(calf.startWeight, calf.currentWeight, calf.elapsedDays); return <TableRow key={calf.id}><TableCell>{calf.calfNumber}</TableCell><TableCell>{calf.name}</TableCell><TableCell>{calculateAgeDays(calf.birthday)}日</TableCell><TableCell>{dg.toFixed(2)}kg</TableCell><TableCell><Chip size="small" label={judgeDg(dg)} color={dg >= 0.8 ? 'success' : dg >= 0.6 ? 'warning' : 'error'} /></TableCell><TableCell align="right"><IconButton component={RouterLink} to={`/calves/${calf.id}/edit`}><EditIcon /></IconButton><IconButton color="error" onClick={() => handleDelete(calf)}><DeleteIcon /></IconButton></TableCell></TableRow>; })}
        </TableBody></Table>)}</CardContent></Card>
    </Stack>
  );
}
