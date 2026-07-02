import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { Schedule } from '../types/schedule';
import { deleteSchedule, getScheduleList } from '../services/scheduleApi';
import { daysUntil, judgeSchedule } from '../utils/schedule';

export function ScheduleList() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSchedules = async () => {
    setLoading(true);
    setSchedules(await getScheduleList());
    setLoading(false);
  };

  useEffect(() => { loadSchedules(); }, []);

  const handleDelete = async (schedule: Schedule) => {
    if (!window.confirm(`${schedule.title} を削除しますか？`)) return;
    await deleteSchedule(schedule.id);
    await loadSchedules();
  };

  const statusColor = (label: string) => {
    if (label === '完了') return 'success';
    if (label === '期限超過') return 'error';
    if (label === '今日' || label === 'まもなく') return 'warning';
    return 'default';
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={800}>予定管理</Typography>
        <Button component={RouterLink} to="/schedules/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button>
      </Stack>

      <Card>
        <CardContent>
          {loading ? <Typography>読み込み中...</Typography> : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>予定区分</TableCell>
                  <TableCell>タイトル</TableCell>
                  <TableCell>対象</TableCell>
                  <TableCell>予定日</TableCell>
                  <TableCell>判定</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {schedules.map((schedule) => {
                  const label = judgeSchedule(schedule.status, schedule.dueDate);
                  return (
                    <TableRow key={schedule.id}>
                      <TableCell>{schedule.scheduleType}</TableCell>
                      <TableCell>{schedule.title}</TableCell>
                      <TableCell>
                        {schedule.targetName || '-'}
                        {schedule.targetNumber && <><br /><Typography variant="caption" color="text.secondary">{schedule.targetNumber}</Typography></>}
                      </TableCell>
                      <TableCell>
                        {schedule.dueDate}
                        <br />
                        <Typography variant="caption" color="text.secondary">
                          {schedule.status === '完了' ? '完了済み' : `あと${daysUntil(schedule.dueDate)}日`}
                        </Typography>
                      </TableCell>
                      <TableCell><Chip size="small" label={label} color={statusColor(label) as any} /></TableCell>
                      <TableCell align="right">
                        <IconButton component={RouterLink} to={`/schedules/${schedule.id}/edit`}><EditIcon /></IconButton>
                        <IconButton color="error" onClick={() => handleDelete(schedule)}><DeleteIcon /></IconButton>
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
