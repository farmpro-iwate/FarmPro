import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { Cattle } from '../types/cattle';
import { deleteCattle, getCattleList } from '../services/api';

export function CattleList() {
  const [items, setItems] = useState<Cattle[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); setItems(await getCattleList()); setLoading(false); };
  useEffect(() => { load(); }, []);
  const handleDelete = async (item: Cattle) => { if (!window.confirm(`${item.name}を削除しますか？`)) return; await deleteCattle(item.id); await load(); };
  return <Stack spacing={2}><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h5" fontWeight={800}>牛台帳</Typography><Button component={RouterLink} to="/cattle/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button></Stack><Card><CardContent>{loading ? <Typography>読み込み中...</Typography> : <Table size="small"><TableHead><TableRow><TableCell>個体番号</TableCell><TableCell>名号</TableCell><TableCell>生年月日</TableCell><TableCell>BLV</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell>{item.earTag}</TableCell><TableCell>{item.name}</TableCell><TableCell>{item.birthday}</TableCell><TableCell><Chip size="small" label={item.blvStatus} color={item.blvStatus === '陰性' ? 'success' : item.blvStatus === '陽性' ? 'error' : 'warning'} /></TableCell><TableCell align="right"><IconButton component={RouterLink} to={`/cattle/${item.id}/edit`}><EditIcon /></IconButton><IconButton color="error" onClick={() => handleDelete(item)}><DeleteIcon /></IconButton></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card></Stack>;
}
