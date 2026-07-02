import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { deleteCalf, getCalfList } from '../services/calfApi';

type CalfRow = {
  id: string;
  calfNumber: string;
  name: string;
  birthday?: string;
  sex?: string;
  motherName?: string;
  birthWeight?: number | string;
  currentWeight?: number | string;
  note?: string;
};

function includesText(value: unknown, keyword: string) {
  return String(value ?? '').toLowerCase().includes(keyword.toLowerCase());
}

function calcAgeDays(birthday?: string) {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  return Math.floor((today.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
}

function calcDg(birthday?: string, birthWeight?: number | string, currentWeight?: number | string) {
  const days = calcAgeDays(birthday);
  const bw = Number(birthWeight);
  const cw = Number(currentWeight);
  if (!days || days <= 0 || Number.isNaN(bw) || Number.isNaN(cw)) return null;
  return ((cw - bw) / days).toFixed(2);
}

export function CalfList() {
  const [rows, setRows] = useState<CalfRow[]>([]);
  const [search, setSearch] = useState('');
  const [sexFilter, setSexFilter] = useState('すべて');

  const load = async () => {
    const data = await getCalfList();
    setRows(data as CalfRow[]);
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const keywordOk = !search || [
        row.calfNumber,
        row.name,
        row.birthday,
        row.sex,
        row.motherName,
        row.birthWeight,
        row.currentWeight,
        row.note
      ].some((value) => includesText(value, search));

      const sexOk = sexFilter === 'すべて' || row.sex === sexFilter;

      return keywordOk && sexOk;
    });
  }, [rows, search, sexFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await deleteCalf(id);
    await load();
  };

  const clearFilters = () => {
    setSearch('');
    setSexFilter('すべて');
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={800}>子牛管理</Typography>
        <Button component={RouterLink} to="/calves/new" variant="contained">新規登録</Button>
      </Stack>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography fontWeight={700}>検索・絞り込み</Typography>
            <TextField
              label="検索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              fullWidth
              placeholder="子牛番号、名号、母牛名などで検索"
            />
            <TextField
              label="性別"
              select
              value={sexFilter}
              onChange={(e) => setSexFilter(e.target.value)}
              fullWidth
            >
              <MenuItem value="すべて">すべて</MenuItem>
              <MenuItem value="雄">雄</MenuItem>
              <MenuItem value="雌">雌</MenuItem>
              <MenuItem value="去勢">去勢</MenuItem>
            </TextField>
            <Button variant="outlined" onClick={clearFilters}>クリア</Button>
            <Typography color="text.secondary">表示件数：{filteredRows.length}件 / 全{rows.length}件</Typography>
          </Stack>
        </CardContent>
      </Card>

      {filteredRows.map((row) => {
        const ageDays = calcAgeDays(row.birthday);
        const dg = calcDg(row.birthday, row.birthWeight, row.currentWeight);

        return (
          <Card key={row.id}>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6" fontWeight={800}>{row.name}</Typography>
                  <Chip label={row.sex || '未設定'} size="small" />
                </Stack>

                <Typography>子牛番号：{row.calfNumber || '-'}</Typography>
                <Typography color="text.secondary">生年月日：{row.birthday || '-'} / 日齢：{ageDays ?? '-'}日</Typography>
                <Typography color="text.secondary">母牛：{row.motherName || '-'}</Typography>
                <Typography color="text.secondary">
                  出生体重：{row.birthWeight || '-'}kg / 現在体重：{row.currentWeight || '-'}kg / DG：{dg ?? '-'}kg/日
                </Typography>

                {row.note && <Typography color="text.secondary">備考：{row.note}</Typography>}

                <Divider />

                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button component={RouterLink} to={`/calves/${row.id}`} variant="contained">子牛カルテ</Button>
                  <Button component={RouterLink} to={`/calves/${row.id}/edit`} variant="outlined">編集</Button>
                  <Button color="error" variant="outlined" onClick={() => handleDelete(row.id)}>削除</Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        );
      })}

      {filteredRows.length === 0 && (
        <Card>
          <CardContent>
            <Typography color="text.secondary">該当する子牛がありません。</Typography>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
