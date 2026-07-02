import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { deleteCattle, getCattleList } from '../services/api';

type CattleRow = {
  id: string;
  earTag: string;
  name: string;
  birthday?: string;
  sire?: string;
  dam?: string;
  blvStatus?: string;
  note?: string;
};

function includesText(value: unknown, keyword: string) {
  return String(value ?? '').toLowerCase().includes(keyword.toLowerCase());
}

export function CattleList() {
  const [rows, setRows] = useState<CattleRow[]>([]);
  const [search, setSearch] = useState('');
  const [blvFilter, setBlvFilter] = useState('すべて');

  const load = async () => {
    const data = await getCattleList();
    setRows(data as CattleRow[]);
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const keywordOk = !search || [
        row.earTag,
        row.name,
        row.birthday,
        row.sire,
        row.dam,
        row.blvStatus,
        row.note
      ].some((value) => includesText(value, search));

      const blvOk = blvFilter === 'すべて' || row.blvStatus === blvFilter;

      return keywordOk && blvOk;
    });
  }, [rows, search, blvFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await deleteCattle(id);
    await load();
  };

  const clearFilters = () => {
    setSearch('');
    setBlvFilter('すべて');
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" fontWeight={800}>牛台帳</Typography>
        <Button component={RouterLink} to="/cattle/new" variant="contained">新規登録</Button>
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
              placeholder="個体番号、名号、父牛、母牛などで検索"
            />
            <TextField
              label="BLV状態"
              select
              value={blvFilter}
              onChange={(e) => setBlvFilter(e.target.value)}
              fullWidth
            >
              <MenuItem value="すべて">すべて</MenuItem>
              <MenuItem value="未検査">未検査</MenuItem>
              <MenuItem value="陰性">陰性</MenuItem>
              <MenuItem value="陽性">陽性</MenuItem>
            </TextField>
            <Button variant="outlined" onClick={clearFilters}>クリア</Button>
            <Typography color="text.secondary">表示件数：{filteredRows.length}件 / 全{rows.length}件</Typography>
          </Stack>
        </CardContent>
      </Card>

      {filteredRows.map((row) => (
        <Card key={row.id}>
          <CardContent>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h6" fontWeight={800}>{row.name}</Typography>
                <Chip label={row.blvStatus || '未検査'} size="small" />
              </Stack>

              <Typography>個体番号：{row.earTag || '-'}</Typography>
              <Typography color="text.secondary">生年月日：{row.birthday || '-'}</Typography>
              <Typography color="text.secondary">父牛：{row.sire || '-'} / 母牛：{row.dam || '-'}</Typography>

              {row.note && (
                <Typography color="text.secondary">備考：{row.note}</Typography>
              )}

              <Divider />

              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button component={RouterLink} to={`/cattle/${row.id}`} variant="contained">個体カルテ</Button>
                <Button component={RouterLink} to={`/cattle/${row.id}/edit`} variant="outlined">編集</Button>
                <Button color="error" variant="outlined" onClick={() => handleDelete(row.id)}>削除</Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ))}

      {filteredRows.length === 0 && (
        <Card>
          <CardContent>
            <Typography color="text.secondary">該当する牛がありません。</Typography>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
