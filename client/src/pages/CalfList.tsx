import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Chip, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { deleteCalf, getCalfList, promoteCalf } from '../services/calfApi';
import type { Calf, CalfStatus } from '../types/calf';

function calcAgeDays(birthday?: string) {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return null;
  return Math.floor((Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24));
}

function statusColor(status: CalfStatus): 'warning' | 'success' | 'info' | 'default' | 'primary' {
  if (status === '繁殖候補として留保') return 'warning';
  if (status === '繁殖牛へ移行済み') return 'success';
  if (status === '販売予定') return 'info';
  if (status === '死亡・その他') return 'default';
  return 'primary';
}

export function CalfList() {
  const [rows, setRows] = useState<Calf[]>([]);
  const [sexFilter, setSexFilter] = useState('すべて');
  const [statusFilter, setStatusFilter] = useState('すべて');
  const [message, setMessage] = useState('');

  const load = async () => setRows(await getCalfList());

  useEffect(() => { load(); }, []);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const sexOk = sexFilter === 'すべて' || row.sex === sexFilter;
    const status = row.managementStatus || '育成中';
    const statusOk = statusFilter === 'すべて' || status === statusFilter;
    return sexOk && statusOk;
  }), [rows, sexFilter, statusFilter]);

  const handleDelete = async (id: number) => {
    if (!confirm('削除しますか？')) return;
    await deleteCalf(id);
    await load();
  };

  const handlePromote = async (row: Calf) => {
    if (!confirm(`${row.name}を繁殖牛へ移行しますか？\n耳標番号などを引き継いで牛台帳へ登録します。`)) return;
    try {
      const cattle = await promoteCalf(String(row.id));
      setMessage(`${row.name}を繁殖牛へ移行しました。`);
      await load();
      window.location.href = `/cattle/${cattle.id}`;
    } catch (error: any) {
      alert(error?.response?.data?.message || '繁殖牛への移行に失敗しました');
    }
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>子牛管理</Typography>
          <Typography color="text.secondary">表示：{filteredRows.length}件 / 全{rows.length}件</Typography>
        </Stack>
        <Button component={RouterLink} to="/calves/new" variant="contained">新規登録</Button>
      </Stack>

      {message && <Alert severity="success">{message}</Alert>}

      <Card>
        <CardContent sx={{ py: 1.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField label="性別" select value={sexFilter} onChange={(e) => setSexFilter(e.target.value)} size="small" fullWidth>
              <MenuItem value="すべて">すべて</MenuItem><MenuItem value="雄">雄</MenuItem><MenuItem value="雌">雌</MenuItem><MenuItem value="去勢">去勢</MenuItem>
            </TextField>
            <TextField label="飼養区分" select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} size="small" fullWidth>
              <MenuItem value="すべて">すべて</MenuItem><MenuItem value="販売予定">販売予定</MenuItem><MenuItem value="育成中">育成中</MenuItem><MenuItem value="繁殖候補として留保">繁殖候補として留保</MenuItem><MenuItem value="繁殖牛へ移行済み">繁殖牛へ移行済み</MenuItem><MenuItem value="死亡・その他">死亡・その他</MenuItem>
            </TextField>
            <Button variant="outlined" onClick={() => { setSexFilter('すべて'); setStatusFilter('すべて'); }}>クリア</Button>
          </Stack>
        </CardContent>
      </Card>

      {filteredRows.map((row) => {
        const status = row.managementStatus || '育成中';
        const canPromote = row.sex === '雌' && status === '繁殖候補として留保';
        return (
          <Card key={row.id}>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                  <Typography variant="h6" fontWeight={800}>{row.name}</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Chip label={row.sex || '未設定'} size="small" />
                    <Chip label={status} size="small" color={statusColor(status)} />
                  </Stack>
                </Stack>
                <Typography>耳標番号：{row.calfNumber || '-'}</Typography>
                <Typography color="text.secondary">個体識別番号：{row.identificationNumber || '-'}</Typography>
                <Typography color="text.secondary">生年月日：{row.birthday || '-'} / 日齢：{calcAgeDays(row.birthday) ?? '-'}日</Typography>
                <Typography color="text.secondary">母牛：{row.motherName || '-'}</Typography>
                <Typography color="text.secondary">現在体重：{row.currentWeight || '-'}kg</Typography>
                {row.note && <Typography color="text.secondary">備考：{row.note}</Typography>}
                <Divider />
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button component={RouterLink} to={`/calves/${row.id}`} variant="contained">子牛カルテ</Button>
                  <Button component={RouterLink} to={`/calves/${row.id}/edit`} variant="outlined">編集</Button>
                  {canPromote && <Button color="success" variant="contained" onClick={() => handlePromote(row)}>繁殖牛へ移行</Button>}
                  {status === '繁殖牛へ移行済み' && row.promotedCattleId && <Button component={RouterLink} to={`/cattle/${row.promotedCattleId}`} color="success" variant="outlined">繁殖牛カルテ</Button>}
                  <Button color="error" variant="outlined" onClick={() => handleDelete(row.id)}>削除</Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        );
      })}

      {filteredRows.length === 0 && <Alert severity="info">該当する子牛がありません。</Alert>}
    </Stack>
  );
}
