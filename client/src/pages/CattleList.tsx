import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { Cattle } from '../types/cattle';
import { deleteCattle, getCattleList } from '../services/api';

export function CattleList() {
  const [cattle, setCattle] = useState<Cattle[]>([]);
  const [loading, setLoading] = useState(true);
  const loadCattle = async () => { setLoading(true); setCattle(await getCattleList()); setLoading(false); };
  useEffect(() => { loadCattle(); }, []);
  const handleDelete = async (cow: Cattle) => {
    if (!window.confirm(`${cow.name}（${cow.earTag}）を削除しますか？`)) return;
    await deleteCattle(cow.id); await loadCattle();
  };
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={800}>牛台帳</Typography>
        <Button component={RouterLink} to="/cattle/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button>
      </Stack>
      <Card><CardContent>{loading ? <Typography>読み込み中...</Typography> : (
        <Table size="small"><TableHead><TableRow>
          <TableCell>個体番号</TableCell><TableCell>名号</TableCell><TableCell>生年月日</TableCell><TableCell>産次</TableCell><TableCell>BLV</TableCell><TableCell align="right">操作</TableCell>
        </TableRow></TableHead><TableBody>
          {cattle.map((cow) => (
            <TableRow key={cow.id}>
              <TableCell>{cow.earTag}</TableCell><TableCell>{cow.name}</TableCell><TableCell>{cow.birthday}</TableCell><TableCell>{cow.parity}産</TableCell>
              <TableCell><Chip size="small" label={cow.blvStatus} color={cow.blvStatus === '陰性' ? 'success' : cow.blvStatus === '陽性' ? 'error' : 'warning'} /></TableCell>
              <TableCell align="right"><IconButton component={RouterLink} to={`/cattle/${cow.id}/edit`}><EditIcon /></IconButton><IconButton color="error" onClick={() => handleDelete(cow)}><DeleteIcon /></IconButton></TableCell>
            </TableRow>
          ))}
        </TableBody></Table>
      )}</CardContent></Card>
    </Stack>
  );
}
