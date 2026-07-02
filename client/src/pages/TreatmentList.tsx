import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { Treatment } from '../types/treatment';
import { deleteTreatment, getTreatmentList } from '../services/treatmentApi';
import { daysUntil, judgeWithdrawal } from '../utils/treatment';

export function TreatmentList() {
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTreatments = async () => {
    setLoading(true);
    setTreatments(await getTreatmentList());
    setLoading(false);
  };

  useEffect(() => { loadTreatments(); }, []);

  const handleDelete = async (treatment: Treatment) => {
    if (!window.confirm(`${treatment.targetName} の治療記録を削除しますか？`)) return;
    await deleteTreatment(treatment.id);
    await loadTreatments();
  };

  const progressColor = (progress: string) => {
    if (progress === '回復') return 'success';
    if (progress === '要再診') return 'error';
    if (progress === '経過観察') return 'warning';
    return 'info';
  };

  const withdrawalColor = (label: string) => {
    if (label === '休薬中') return 'warning';
    if (label === '休薬終了') return 'success';
    return 'default';
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={800}>治療管理</Typography>
        <Button component={RouterLink} to="/treatments/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button>
      </Stack>

      <Card>
        <CardContent>
          {loading ? <Typography>読み込み中...</Typography> : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>対象</TableCell>
                  <TableCell>症状・診断</TableCell>
                  <TableCell>治療日</TableCell>
                  <TableCell>薬剤</TableCell>
                  <TableCell>経過</TableCell>
                  <TableCell>休薬</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {treatments.map((treatment) => {
                  const withdrawal = judgeWithdrawal(treatment.withdrawalEndDate);
                  return (
                    <TableRow key={treatment.id}>
                      <TableCell>
                        {treatment.targetName}
                        <br />
                        <Typography variant="caption" color="text.secondary">{treatment.targetNumber}</Typography>
                      </TableCell>
                      <TableCell>
                        {treatment.symptom}
                        {treatment.diagnosis && <><br /><Typography variant="caption" color="text.secondary">{treatment.diagnosis}</Typography></>}
                      </TableCell>
                      <TableCell>{treatment.treatmentDate}</TableCell>
                      <TableCell>{treatment.medicine || '-'}</TableCell>
                      <TableCell><Chip size="small" label={treatment.progress} color={progressColor(treatment.progress) as any} /></TableCell>
                      <TableCell>
                        <Chip size="small" label={withdrawal} color={withdrawalColor(withdrawal) as any} />
                        {treatment.withdrawalEndDate && <><br /><Typography variant="caption" color="text.secondary">{treatment.withdrawalEndDate} / あと{daysUntil(treatment.withdrawalEndDate)}日</Typography></>}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton component={RouterLink} to={`/treatments/${treatment.id}/edit`}><EditIcon /></IconButton>
                        <IconButton color="error" onClick={() => handleDelete(treatment)}><DeleteIcon /></IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
