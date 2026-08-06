import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  deleteFatteningTransition,
  FatteningTransitionRecord,
  getFatteningTransitions,
} from '../services/fatteningTransitionsApi';

export function FatteningTransitionList() {
  const [records, setRecords] = useState<FatteningTransitionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getFatteningTransitions()
      .then(setRecords)
      .catch((err) => setError(err instanceof Error ? err.message : '肥育移行記録を読み込めませんでした。'))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(record: FatteningTransitionRecord) {
    const confirmed = window.confirm(
      `${record.targetName || '対象牛'}（耳標 ${record.targetNumber || '-'}）の肥育移行記録を削除しますか？`,
    );
    if (!confirmed) return;

    setError('');
    setDeletingId(record.id);
    try {
      await deleteFatteningTransition(record.id);
      setRecords((prev) => prev.filter((item) => item.id !== record.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '肥育移行記録を削除できませんでした。');
    } finally {
      setDeletingId('');
    }
  }

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Stack sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={800}>肥育移行管理</Typography>
          <Typography color="text.secondary">登録：{records.length}件</Typography>
        </Stack>
        <Button component={RouterLink} to="/fattening-transitions/new" variant="contained">
          新規登録
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {loading ? (
        <Typography>読み込み中...</Typography>
      ) : records.length === 0 ? (
        <Alert severity="info">肥育移行記録はまだありません。</Alert>
      ) : (
        <Card>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <TableContainer>
              <Table size="small" sx={{ minWidth: 980 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>対象牛</TableCell>
                    <TableCell>肥育開始日</TableCell>
                    <TableCell>開始時体重</TableCell>
                    <TableCell>目標体重</TableCell>
                    <TableCell>目標出荷日</TableCell>
                    <TableCell>飼養場所</TableCell>
                    <TableCell>状態</TableCell>
                    <TableCell align="center">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id} hover>
                      <TableCell>
                        <Typography fontWeight={800}>{record.targetName || '-'}</Typography>
                        <Typography variant="body2" color="text.secondary">耳標 {record.targetNumber || '-'}</Typography>
                      </TableCell>
                      <TableCell>{record.startDate || '-'}</TableCell>
                      <TableCell>{record.startWeight ? `${record.startWeight} kg` : '-'}</TableCell>
                      <TableCell>{record.targetWeight ? `${record.targetWeight} kg` : '-'}</TableCell>
                      <TableCell>{record.targetShippingDate || '-'}</TableCell>
                      <TableCell>{record.housingLocation || '-'}</TableCell>
                      <TableCell><Chip label={record.status || '肥育中'} size="small" color={record.status === '出荷準備' ? 'warning' : record.status === '出荷済み' ? 'default' : 'success'} /></TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="編集">
                            <IconButton
                              component={RouterLink}
                              to={`/fattening-transitions/${record.id}/edit`}
                              color="primary"
                              aria-label={`${record.targetName || '対象牛'}の肥育移行記録を編集`}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="削除">
                            <span>
                              <IconButton
                                color="error"
                                onClick={() => handleDelete(record)}
                                disabled={deletingId === record.id}
                                aria-label={`${record.targetName || '対象牛'}の肥育移行記録を削除`}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
