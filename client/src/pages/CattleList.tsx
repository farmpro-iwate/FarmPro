import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { deleteCattle, getCattleList } from '../services/api';
import { getBreedingList } from '../services/breedingApi';
import { formatSex } from '../utils/sex';

type CattleRow = {
  id: number;
  earTag: string;
  identificationNumber?: string;
  name: string;
  birthday?: string;
  sex?: '雌' | '雄' | '去勢';
  sire?: string;
  dam?: string;
  stage?: '育成牛' | '繁殖牛';
  note?: string;
};

type AnyRow = Record<string, any>;

type AttentionItem = {
  label: '妊娠鑑定' | '再鑑定' | '分娩予定' | '増し飼い検討';
  date: string;
  urgent: boolean;
};

function includesText(value: unknown, keyword: string) {
  return String(value ?? '').toLowerCase().includes(keyword.toLowerCase());
}

function dateOnly(value: unknown) {
  return value ? String(value).slice(0, 10) : '';
}

function daysUntil(dateString?: string) {
  if (!dateString) return null;
  const target = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / 86400000);
}

function sameCow(row: AnyRow, cattle: CattleRow) {
  return String(row.cowEarTag || '') === String(cattle.earTag || '') ||
    (row.cowName && cattle.name && String(row.cowName) === String(cattle.name));
}

function attentionItemsFor(cattle: CattleRow, breedings: AnyRow[]): AttentionItem[] {
  const items: AttentionItem[] = [];

  breedings.filter((row) => sameCow(row, cattle)).forEach((row) => {
    const pregnancyResult = String(row.pregnancyResult || '未鑑定');
    const breedingStatus = String(row.breedingStatus || '');
    const isCalved = breedingStatus === '分娩済み';
    const isPregnant = ['受胎', '妊娠'].includes(pregnancyResult);
    const needsRecheck = pregnancyResult === '再鑑定予定';
    const hasPregnancyCheck = Boolean(dateOnly(row.pregnancyCheckDate || row.pregnancyDiagnosisDate));

    if (isCalved) return;

    if (!isPregnant && !needsRecheck && !hasPregnancyCheck) {
      const date = dateOnly(row.pregnancyCheckExpectedDate);
      const days = daysUntil(date);
      if (date && days !== null && days <= 14) {
        items.push({ label: '妊娠鑑定', date, urgent: days <= 3 });
      }
    }

    if (needsRecheck) {
      const date = dateOnly(row.recheckExpectedDate);
      const days = daysUntil(date);
      if (date && days !== null && days <= 14) {
        items.push({ label: '再鑑定', date, urgent: days <= 3 });
      }
    }

    if (isPregnant) {
      const date = dateOnly(row.expectedCalvingDate);
      const days = daysUntil(date);
      if (date && days !== null && days <= 60) {
        items.push({ label: '分娩予定', date, urgent: days <= 14 });
        items.push({ label: '増し飼い検討', date, urgent: days <= 14 });
      }
    }
  });

  const unique = new Map<string, AttentionItem>();
  items.forEach((item) => unique.set(`${item.label}-${item.date}`, item));
  return Array.from(unique.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function CattleList() {
  const [rows, setRows] = useState<CattleRow[]>([]);
  const [breedings, setBreedings] = useState<AnyRow[]>([]);
  const [search, setSearch] = useState('');
  const [attentionFilter, setAttentionFilter] = useState('すべて');

  const load = async () => {
    const [cattleData, breedingData] = await Promise.all([
      getCattleList(),
      getBreedingList().catch(() => []),
    ]);
    setRows(cattleData as CattleRow[]);
    setBreedings(breedingData as AnyRow[]);
  };

  useEffect(() => {
    load();
  }, []);

  const attentionMap = useMemo(() => {
    const map = new Map<number, AttentionItem[]>();
    rows.forEach((row) => map.set(row.id, attentionItemsFor(row, breedings)));
    return map;
  }, [rows, breedings]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const keywordOk = !search || [
        row.earTag,
        row.identificationNumber,
        row.name,
        row.birthday,
        row.sex,
        row.sire,
        row.dam,
        row.stage,
        row.note,
      ].some((value) => includesText(value, search));

      const hasAttention = (attentionMap.get(row.id) || []).length > 0;
      const attentionOk = attentionFilter === 'すべて' || hasAttention;

      return keywordOk && attentionOk;
    });
  }, [rows, search, attentionFilter, attentionMap]);

  const handleDelete = async (id: number) => {
    if (!confirm('削除しますか？')) return;
    await deleteCattle(id);
    await load();
  };

  const clearFilters = () => {
    setSearch('');
    setAttentionFilter('すべて');
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>繁殖牛台帳</Typography>
          <Typography color="text.secondary">表示：{filteredRows.length}件 / 全{rows.length}件</Typography>
        </Stack>
        <Button component={RouterLink} to="/cattle/new" variant="contained" sx={{ width: { xs: '100%', sm: 'auto' } }}>新規登録</Button>
      </Stack>

      {filteredRows.map((row) => {
        const attentionItems = attentionMap.get(row.id) || [];
        return (
          <Card key={row.id}>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6" fontWeight={800}>{row.name}</Typography>
                  <Chip label={row.stage || '繁殖牛'} size="small" color={row.stage === '育成牛' ? 'info' : 'success'} />
                </Stack>

                {attentionItems.length > 0 && (
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {attentionItems.map((item) => (
                      <Chip
                        key={`${item.label}-${item.date}`}
                        label={`${item.label} ${item.date}`}
                        size="small"
                        color={item.urgent ? 'warning' : 'info'}
                      />
                    ))}
                  </Stack>
                )}

                <Typography>耳標番号：{row.earTag || '-'}</Typography>
                <Typography color="text.secondary">個体識別番号：{row.identificationNumber || '-'}</Typography>
                <Typography color="text.secondary">生年月日：{row.birthday || '-'}</Typography>
                <Typography color="text.secondary">性別：{formatSex(row.sex)}</Typography>
                <Typography color="text.secondary">父牛：{row.sire || '-'} / 母牛：{row.dam || '-'}</Typography>

                {row.note && (
                  <Typography color="text.secondary">備考：{row.note}</Typography>
                )}

                <Divider />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap">
                  <Button component={RouterLink} to={`/cattle/${row.id}`} variant="contained" fullWidth>個体カルテ</Button>
                  <Button component={RouterLink} to={`/cattle/${row.id}/edit`} variant="outlined" fullWidth>編集</Button>
                  <Button color="error" variant="outlined" onClick={() => handleDelete(row.id)} fullWidth>削除</Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        );
      })}

      {filteredRows.length === 0 && (
        <Card>
          <CardContent>
            <Typography color="text.secondary">該当する牛がありません。</Typography>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent sx={{ py: 1.5 }}>
          <Stack spacing={1}>
            <Typography fontWeight={700} color="text.secondary">検索・絞り込み</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <TextField
                label="検索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                fullWidth
                size="small"
                placeholder="耳標番号、個体識別番号、名号など"
              />
              <TextField
                label="要対応"
                select
                value={attentionFilter}
                onChange={(e) => setAttentionFilter(e.target.value)}
                fullWidth
                size="small"
                sx={{ maxWidth: { sm: 180 } }}
              >
                <MenuItem value="すべて">すべて</MenuItem>
                <MenuItem value="要対応のみ">要対応のみ</MenuItem>
              </TextField>
              <Button variant="outlined" onClick={clearFilters} size="small">
                クリア
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}