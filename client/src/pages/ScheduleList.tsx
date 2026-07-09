import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, IconButton, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { Schedule } from '../types/schedule';
import { deleteSchedule, getScheduleList } from '../services/scheduleApi';
import { daysUntil, judgeSchedule } from '../utils/schedule';
import { matchesAnyText, matchesSelect } from '../utils/search';

export function ScheduleList() {
  const [items, setItems] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [scheduleType, setScheduleType] = useState('すべて');
  const [status, setStatus] = useState('すべて');

  const load = async () => {
    setLoading(true);
    setItems(await getScheduleList());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) =>
      matchesAnyText([item.title, item.targetName, item.targetNumber, item.note], keyword) &&
      matchesSelect(item.scheduleType, scheduleType) &&
      matchesSelect(item.status, status)
    );
  }, [items, keyword, scheduleType, status]);

  const handleDelete = async (item: Schedule) => {
    if (!window.confirm(`${item.title} を削除しますか？`)) return;
    await deleteSchedule(item.id);
    await load();
  };

  const clearSearch = () => {
    setKeyword('');
    setScheduleType('すべて');
    setStatus('すべて');
  };

  const statusColor = (label: string) => {
    if (label === '完了') return 'success';
    if (label === '期限超過') return 'error';
    if (label === '今日' || label === 'まもなく') return 'warning';
    return 'default';
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>予定管理</Typography>
          <Typography color="text.secondary">表示：{filteredItems.length}件 / 全{items.length}件</Typography>
        </Stack>
        <Button component={RouterLink} to="/schedules/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button>
      </Stack>

      <Card>
        <CardContent>
          {loading ? <Typography>読み込み中...</Typography> : (
            <Table size="small">
              <TableHead><TableRow><TableCell>予定区分</TableCell><TableCell>タイトル</TableCell><TableCell>対象</TableCell><TableCell>予定日</TableCell><TableCell>判定</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
              <TableBody>
                {filteredItems.map((item) => {
                  const label = judgeSchedule(item.status, item.dueDate);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{item.scheduleType}</TableCell>
                      <TableCell>{item.title}</TableCell>
                      <TableCell>{item.targetName || '-'}{item.targetNumber && <><br /><Typography variant="caption" color="text.secondary">{item.targetNumber}</Typography></>}</TableCell>
                      <TableCell>{item.dueDate}<br /><Typography variant="caption" color="text.secondary">{item.status === '完了' ? '完了済み' : `あと${daysUntil(item.dueDate)}日`}</Typography></TableCell>
                      <TableCell><Chip size="small" label={label} color={statusColor(label) as any} /></TableCell>
                      <TableCell align="right">
                        <IconButton component={RouterLink} to={`/schedules/${item.id}/edit`}><EditIcon /></IconButton>
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
              <TextField label="検索" placeholder="タイトル・対象名・対象番号" value={keyword} onChange={(e) => setKeyword(e.target.value)} fullWidth size="small" />
              <TextField label="予定区分" select value={scheduleType} onChange={(e) => setScheduleType(e.target.value)} size="small" sx={{ minWidth: 140 }}>
                <MenuItem value="すべて">すべて</MenuItem>
                <MenuItem value="分娩">分娩</MenuItem>
                <MenuItem value="ワクチン">ワクチン</MenuItem>
                <MenuItem value="BLV検査">BLV検査</MenuItem>
                <MenuItem value="妊娠鑑定">妊娠鑑定</MenuItem>
                <MenuItem value="治療">治療</MenuItem>
                <MenuItem value="その他">その他</MenuItem>
              </TextField>
              <TextField label="状態" select value={status} onChange={(e) => setStatus(e.target.value)} size="small" sx={{ minWidth: 120 }}>
                <MenuItem value="すべて">すべて</MenuItem>
                <MenuItem value="未完了">未完了</MenuItem>
                <MenuItem value="完了">完了</MenuItem>
              </TextField>
              <Button variant="outlined" onClick={clearSearch} size="small">クリア</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
