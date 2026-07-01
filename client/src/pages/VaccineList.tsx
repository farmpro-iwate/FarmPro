import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { Vaccine } from '../types/vaccine';
import { deleteVaccine, getVaccineList } from '../services/vaccineApi';
import { daysUntil, judgeVaccineDue } from '../utils/vaccine';

export function VaccineList() {
  const [vaccines, setVaccines] = useState<Vaccine[]>([]);
  const [loading, setLoading] = useState(true);

  const loadVaccines = async () => {
    setLoading(true);
    setVaccines(await getVaccineList());
    setLoading(false);
  };

  useEffect(() => { loadVaccines(); }, []);

  const handleDelete = async (vaccine: Vaccine) => {
    if (!window.confirm(`${vaccine.targetName} のワクチン記録を削除しますか？`)) return;
    await deleteVaccine(vaccine.id);
    await loadVaccines();
  };

  const chipColor = (label: string) => {
    if (label === '接種済み') return 'success';
    if (label === '期限超過') return 'error';
    if (label === 'まもなく') return 'warning';
    return 'default';
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={800}>ワクチン管理</Typography>
        <Button component={RouterLink} to="/vaccines/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button>
      </Stack>

      <Card><CardContent>
        {loading ? <Typography>読み込み中...</Typography> : (
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>対象</TableCell><TableCell>ワクチン名</TableCell><TableCell>接種日</TableCell><TableCell>次回予定</TableCell><TableCell>状態</TableCell><TableCell align="right">操作</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {vaccines.map((vaccine) => {
                const label = judgeVaccineDue(vaccine.status, vaccine.nextDueDate);
                return (
                  <TableRow key={vaccine.id}>
                    <TableCell>{vaccine.targetName}<br /><Typography variant="caption" color="text.secondary">{vaccine.targetType} / {vaccine.targetNumber}</Typography></TableCell>
                    <TableCell>{vaccine.vaccineName}</TableCell>
                    <TableCell>{vaccine.vaccinationDate || '未接種'}</TableCell>
                    <TableCell>{vaccine.nextDueDate || '未定'}{vaccine.nextDueDate && <><br /><Typography variant="caption" color="text.secondary">あと{daysUntil(vaccine.nextDueDate)}日</Typography></>}</TableCell>
                    <TableCell><Chip size="small" label={label} color={chipColor(label) as any} /></TableCell>
                    <TableCell align="right">
                      <IconButton component={RouterLink} to={`/vaccines/${vaccine.id}/edit`}><EditIcon /></IconButton>
                      <IconButton color="error" onClick={() => handleDelete(vaccine)}><DeleteIcon /></IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </Stack>
  );
}
