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
  if (status === '牛台帳へ移行済み') return 'success';
  if (status === '販売予定') return 'info';
  if (status === '死亡・その他') return 'default';
  return 'primary';
}

export function CalfList() {
  const [rows, setRows] = useState<Calf[]>([]);
  const [search, setSearch] = useState('');
  const [sexFilter, setSexFilter] = useState('すべて');
  const [statusFilter, setStatusFilter] = useState('すべて');
  const [feedingFilter, setFeedingFilter] = useState('すべて');
  const [weaningFilter, setWeaningFilter] = useState('すべて');
  const [message, setMessage] = useState('');

  const load = async () => setRows(await getCalfList());

  useEffect(() => { load(); }, []);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const keyword = search.trim().toLowerCase();
    const feedingMethod = row.feedingMethod || '人工哺育';
    const weaningStatus = row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前');
    const status = row.managementStatus || '育成中';
    const keywordOk = !keyword || [row.name, row.calfNumber, row.identificationNumber, row.motherName]
      .some((value) => String(value || '').toLowerCase().includes(keyword));
    const sexOk = sexFilter === 'すべて' || row.sex === sexFilter;
    const statusOk = statusFilter === 'すべて' || status === statusFilter;
    const feedingOk = feedingFilter === 'すべて' || feedingMethod === feedingFilter;
    const weaningOk = weaningFilter === 'すべて' || weaningStatus === weaningFilter;
    return keywordOk && sexOk && statusOk && feedingOk && weaningOk;
  }), [rows, search, sexFilter, statusFilter, feedingFilter, weaningFilter]);

  const summary = useMemo(() => ({
    nursing: rows.filter((row) => (row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前')) === '離乳前').length,
    weaned: rows.filter((row) => (row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前')) === '離乳済み').length,
    retained: rows.filter((row) => row.managementStatus === '繁殖候補として留保').length,
  }), [rows]);

  const clearFilters = () => {
    setSearch('');
    setSexFilter('すべて');
    setStatusFilter('すべて');
    setFeedingFilter('すべて');
    setWeaningFilter('すべて');
  };

  const handleDelete = async (id: number) => {
    if (!confirm('削除しますか？')) return;
    await deleteCalf(id);
    await load();
  };

  const handlePromote = async (row: Calf) => {
    if (!confirm(`${row.name}を牛台帳へ移行しますか？\n牛台帳では「育成牛」として登録されます。`)) return;
    try {
      const cattle = await promoteCalf(String(row.id));
      setMessage(`${row.name}を牛台帳へ移行しました。`);
      await load();
      window.location.href = `/cattle/${cattle.id}`;
    } catch (error: any) {
      alert(error?.response?.data?.message || '牛台帳への移行に失敗しました');
    }
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>子牛台帳</Typography>
          <Typography color="text.secondary">表示：{filteredRows.length}件 / 全{rows.length}件</Typography>
        </Stack>
        <Button component={RouterLink} to="/calves/new" variant="contained">新規登録</Button>
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip label={`離乳前 ${summary.nursing}頭`} color="warning" variant="outlined" />
        <Chip label={`離乳済み ${summary.weaned}頭`} color="success" variant="outlined" />
        <Chip label={`繁殖候補 ${summary.retained}頭`} color="primary" variant="outlined" />
      </Stack>

      {message && <Alert severity="success">{message}</Alert>}

      <Card>
        <CardContent sx={{ py: 1.5 }}>
          <Stack spacing={1}>
            <TextField label="名前・耳標番号・母牛で検索" value={search} onChange={(e) => setSearch(e.target.value)} size="small" fullWidth />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField label="性別" select value={sexFilter} onChange={(e) => setSexFilter(e.target.value)} size="small" fullWidth>
                <MenuItem value="すべて">すべて</MenuItem><MenuItem value="雄">雄</MenuItem><MenuItem value="雌">雌</MenuItem><MenuItem value="去勢">去勢</MenuItem>
              </TextField>
              <TextField label="飼養区分" select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} size="small" fullWidth>
                <MenuItem value="すべて">すべて</MenuItem><MenuItem value="販売予定">販売予定</MenuItem><MenuItem value="育成中">育成中</MenuItem><MenuItem value="繁殖候補として留保">繁殖候補として留保</MenuItem><MenuItem value="牛台帳へ移行済み">牛台帳へ移行済み</MenuItem><MenuItem value="死亡・その他">死亡・その他</MenuItem>
              </TextField>
              <TextField label="哺育方法" select value={feedingFilter} onChange={(e) => setFeedingFilter(e.target.value)} size="small" fullWidth>
                <MenuItem value="すべて">すべて</MenuItem><MenuItem value="人工哺育">人工哺育</MenuItem><MenuItem value="母乳哺育">母乳哺育</MenuItem><MenuItem value="混合哺育">混合哺育</MenuItem>
              </TextField>
              <TextField label="離乳状態" select value={weaningFilter} onChange={(e) => setWeaningFilter(e.target.value)} size="small" fullWidth>
                <MenuItem value="すべて">すべて</MenuItem><MenuItem value="離乳前">離乳前</MenuItem><MenuItem value="離乳済み">離乳済み</MenuItem>
              </TextField>
              <Button variant="outlined" onClick={clearFilters}>クリア</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {filteredRows.map((row) => {
        const status = row.managementStatus || '育成中';
        const feedingMethod = row.feedingMethod || '人工哺育';
        const weaningStatus = row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前');
        const canPromote = row.sex === '雌' && status === '繁殖候補として留保';
        return (
          <Card key={row.id}>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                  <Typography variant="h6" fontWeight={800}>{row.name}</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip label={row.sex || '未設定'} size="small" />
                    <Chip label={status} size="small" color={statusColor(status)} />
                    <Chip label={feedingMethod} size="small" variant="outlined" />
                    <Chip label={weaningStatus} size="small" color={weaningStatus === '離乳済み' ? 'success' : 'warning'} />
                  </Stack>
                </Stack>
                <Typography>耳標番号：{row.calfNumber || '-'}</Typography>
                <Typography color="text.secondary">個体識別番号：{row.identificationNumber || '-'}</Typography>
                <Typography color="text.secondary">生年月日：{row.birthday || '-'} / 日齢：{calcAgeDays(row.birthday) ?? '-'}日</Typography>
                <Typography color="text.secondary">母牛：{row.motherName || '-'}</Typography>
                <Typography color="text.secondary">現在体重：{row.currentWeight || '-'}kg</Typography>
                <Typography color="text.secondary">離乳予定日：{row.weaningPlannedDate || '-'} / 実際の離乳日：{row.weaningDate || '-'}</Typography>
                {feedingMethod === '人工哺育' && <Typography color="text.secondary">ミルク終了日：{row.milkEndDate || '-'}</Typography>}
                {feedingMethod === '混合哺育' && <Typography color="text.secondary">補助ミルク終了日：{row.milkEndDate || '-'}</Typography>}
                {weaningStatus === '離乳済み' && (
                  <Typography color="text.secondary">離乳時体重：{row.weaningWeight || '-'}kg / スターター：{row.weaningStarterAmount || '-'}kg</Typography>
                )}
                {row.note && <Typography color="text.secondary">備考：{row.note}</Typography>}
                <Divider />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
                  <Button component={RouterLink} to={`/calves/${row.id}`} variant="contained">子牛情報</Button>
                  <Button component={RouterLink} to={`/calves/${row.id}/edit`} variant="outlined">編集</Button>
                  {canPromote && <Button color="success" variant="contained" onClick={() => handlePromote(row)}>牛台帳へ移行</Button>}
                  {status === '牛台帳へ移行済み' && row.promotedCattleId && <Button component={RouterLink} to={`/cattle/${row.promotedCattleId}`} color="success" variant="outlined">牛情報</Button>}
                  <Button color="error" variant="text" onClick={() => handleDelete(row.id)}>削除</Button>
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
