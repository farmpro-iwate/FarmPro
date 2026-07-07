import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { deleteCalf, getCalfList } from '../services/calfApi';
import { calculateAgeDays, calculateDg, judgeDg } from '../utils/calf';

type CalfRow = {
  id: number | string;
  calfNumber: string;
  name: string;
  birthday?: string;
  sex?: string;
  motherName?: string;
  startWeight?: number | string;
  currentWeight?: number | string;
  elapsedDays?: number | string;
  milkAmount?: number | string;
  starterAmount?: number | string;
  note?: string;
};

type SortMode = 'young' | 'birthdayDesc' | 'earTag' | 'dgLow' | 'updated';
type AgeFilter = 'すべて' | '哺乳期' | '育成前期' | '育成後期' | '日齢未設定';

const ageFilterOptions: AgeFilter[] = ['すべて', '哺乳期', '育成前期', '育成後期', '日齢未設定'];

function includesText(value: unknown, keyword: string) {
  return String(value ?? '').toLowerCase().includes(keyword.toLowerCase());
}

function toNumber(value: number | string | undefined) {
  if (value === undefined || value === null || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function formatAmount(value: number | string | undefined, suffix: string) {
  const numberValue = toNumber(value);
  if (numberValue === null || numberValue <= 0) return '-';
  return `${numberValue.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
}

function getAgeDays(row: CalfRow) {
  if (row.birthday) {
    const ageDays = calculateAgeDays(row.birthday);
    if (Number.isFinite(ageDays) && ageDays >= 0) return ageDays;
  }

  const elapsedDays = toNumber(row.elapsedDays);
  if (elapsedDays !== null && elapsedDays >= 0) return elapsedDays;

  return null;
}

function getAgeGroup(ageDays: number | null): AgeFilter {
  if (ageDays === null) return '日齢未設定';
  if (ageDays <= 90) return '哺乳期';
  if (ageDays <= 180) return '育成前期';
  return '育成後期';
}

function getDg(row: CalfRow) {
  const startWeight = toNumber(row.startWeight);
  const currentWeight = toNumber(row.currentWeight);
  const elapsedDays = toNumber(row.elapsedDays) ?? getAgeDays(row);

  if (
    startWeight === null ||
    currentWeight === null ||
    elapsedDays === null ||
    startWeight <= 0 ||
    currentWeight <= 0 ||
    elapsedDays <= 0
  ) {
    return null;
  }

  const dg = calculateDg(startWeight, currentWeight, elapsedDays);
  return Number.isFinite(dg) ? dg : null;
}

function getDgColor(dg: number | null): 'default' | 'success' | 'warning' | 'error' {
  if (dg === null) return 'default';
  const judgement = judgeDg(dg);
  if (judgement === '良') return 'success';
  if (judgement === '注意') return 'warning';
  return 'error';
}

function sortRows(rows: CalfRow[], sortMode: SortMode) {
  return [...rows].sort((a, b) => {
    const ageA = getAgeDays(a);
    const ageB = getAgeDays(b);
    const dgA = getDg(a);
    const dgB = getDg(b);

    if (sortMode === 'young') {
      return (ageA ?? 999999) - (ageB ?? 999999);
    }

    if (sortMode === 'birthdayDesc') {
      return String(b.birthday || '').localeCompare(String(a.birthday || ''));
    }

    if (sortMode === 'earTag') {
      return String(a.calfNumber || '').localeCompare(String(b.calfNumber || ''), 'ja');
    }

    if (sortMode === 'dgLow') {
      return (dgA ?? 999999) - (dgB ?? 999999);
    }

    return String(b.id || '').localeCompare(String(a.id || ''), 'ja', { numeric: true });
  });
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function todayText() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function InfoBox({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        flex: '1 1 160px',
        minWidth: { xs: '100%', sm: 160 },
        p: 1.25
      }}
    >
      <Typography color="text.secondary" variant="caption">{label}</Typography>
      <Typography fontWeight={800}>{value}</Typography>
      {helper && <Typography color="text.secondary" variant="caption">{helper}</Typography>}
    </Box>
  );
}

export function CalfList() {
  const [rows, setRows] = useState<CalfRow[]>([]);
  const [search, setSearch] = useState('');
  const [sexFilter, setSexFilter] = useState('すべて');
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('すべて');
  const [sortMode, setSortMode] = useState<SortMode>('young');

  const load = async () => {
    const data = await getCalfList();
    setRows(data as CalfRow[]);
  };

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const ageGroup = getAgeGroup(getAgeDays(row));
        const dg = getDg(row);
        acc[ageGroup] += 1;
        if (dg !== null && judgeDg(dg) !== '良') acc.needCheck += 1;
        return acc;
      },
      {
        哺乳期: 0,
        育成前期: 0,
        育成後期: 0,
        日齢未設定: 0,
        needCheck: 0
      } as Record<AgeFilter | 'needCheck', number>
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim();

    const result = rows.filter((row) => {
      const keywordOk = !keyword || [
        row.calfNumber,
        row.name,
        row.birthday,
        row.sex,
        row.motherName,
        row.startWeight,
        row.currentWeight,
        row.elapsedDays,
        row.milkAmount,
        row.starterAmount,
        row.note
      ].some((value) => includesText(value, keyword));

      const sexOk = sexFilter === 'すべて' || row.sex === sexFilter;
      const rowAgeGroup = getAgeGroup(getAgeDays(row));
      const ageOk = ageFilter === 'すべて' || rowAgeGroup === ageFilter;

      return keywordOk && sexOk && ageOk;
    });

    return sortRows(result, sortMode);
  }, [rows, search, sexFilter, ageFilter, sortMode]);

  const handleDelete = async (id: CalfRow['id'], name: string) => {
    if (!window.confirm(`${name || 'この子牛'}を削除しますか？`)) return;
    await deleteCalf(id);
    await load();
  };

  const clearFilters = () => {
    setSearch('');
    setSexFilter('すべて');
    setAgeFilter('すべて');
    setSortMode('young');
  };

  const handleExportCsv = () => {
    const csvRows = [
      [
        '耳標番号',
        '名号',
        '性別',
        '母牛',
        '生年月日',
        '日齢',
        '日齢区分',
        '開始体重kg',
        '現在体重kg',
        'DGkg日',
        'DG判定',
        'ミルク量L',
        'スターターkg',
        '備考'
      ],
      ...filteredRows.map((row) => {
        const ageDays = getAgeDays(row);
        const ageGroup = getAgeGroup(ageDays);
        const dg = getDg(row);
        return [
          row.calfNumber || '',
          row.name || '',
          row.sex || '',
          row.motherName || '',
          row.birthday || '',
          ageDays ?? '',
          ageGroup,
          toNumber(row.startWeight) ?? '',
          toNumber(row.currentWeight) ?? '',
          dg === null ? '' : dg.toFixed(2),
          dg === null ? '' : judgeDg(dg),
          toNumber(row.milkAmount) ?? '',
          toNumber(row.starterAmount) ?? '',
          row.note || ''
        ];
      })
    ];

    downloadCsv(`calf-ledger-${todayText()}.csv`, csvRows);
  };

  return (
    <Stack spacing={2}>
      <Stack
        alignItems={{ xs: 'stretch', sm: 'center' }}
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        spacing={1.5}
      >
        <Box>
          <Typography fontWeight={900} variant="h5">子牛台帳</Typography>
          <Typography color="text.secondary">
            耳標番号を中心に、母牛・日齢・体重・給与量を一覧で確認できます。
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button component={RouterLink} to="/calves/new" variant="contained">新規登録</Button>
          <Button onClick={handleExportCsv} variant="outlined">CSV出力</Button>
          <Button onClick={() => window.print()} variant="outlined">印刷</Button>
        </Stack>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip label={`全 ${rows.length}件`} size="small" />
              <Chip label={`哺乳期 ${summary.哺乳期}件`} size="small" variant="outlined" />
              <Chip label={`育成前期 ${summary.育成前期}件`} size="small" variant="outlined" />
              <Chip label={`育成後期 ${summary.育成後期}件`} size="small" variant="outlined" />
              <Chip color={summary.needCheck > 0 ? 'warning' : 'success'} label={`DG要確認 ${summary.needCheck}件`} size="small" variant="outlined" />
            </Stack>

            <Stack
              alignItems={{ xs: 'stretch', md: 'center' }}
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.5}
            >
              <TextField
                fullWidth
                label="検索"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="耳標番号、名号、母牛名、備考で検索"
                size="small"
                value={search}
              />
              <TextField
                label="性別"
                onChange={(e) => setSexFilter(e.target.value)}
                select
                size="small"
                sx={{ minWidth: { xs: '100%', md: 150 } }}
                value={sexFilter}
              >
                <MenuItem value="すべて">すべて</MenuItem>
                <MenuItem value="雄">雄</MenuItem>
                <MenuItem value="雌">雌</MenuItem>
                <MenuItem value="去勢">去勢</MenuItem>
              </TextField>
              <TextField
                label="日齢区分"
                onChange={(e) => setAgeFilter(e.target.value as AgeFilter)}
                select
                size="small"
                sx={{ minWidth: { xs: '100%', md: 150 } }}
                value={ageFilter}
              >
                {ageFilterOptions.map((item) => (
                  <MenuItem key={item} value={item}>{item}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="並び替え"
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                select
                size="small"
                sx={{ minWidth: { xs: '100%', md: 190 } }}
                value={sortMode}
              >
                <MenuItem value="young">日齢が若い順</MenuItem>
                <MenuItem value="birthdayDesc">生年月日が新しい順</MenuItem>
                <MenuItem value="earTag">耳標番号順</MenuItem>
                <MenuItem value="dgLow">DGが低い順</MenuItem>
                <MenuItem value="updated">登録が新しい順</MenuItem>
              </TextField>
              <Button onClick={clearFilters} variant="outlined">クリア</Button>
            </Stack>

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip label={`表示 ${filteredRows.length}件`} size="small" />
              {search && <Chip label={`検索: ${search}`} size="small" variant="outlined" />}
              {sexFilter !== 'すべて' && <Chip label={`性別: ${sexFilter}`} size="small" variant="outlined" />}
              {ageFilter !== 'すべて' && <Chip label={`日齢区分: ${ageFilter}`} size="small" variant="outlined" />}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Stack spacing={1.5}>
        {filteredRows.map((row) => {
          const ageDays = getAgeDays(row);
          const ageGroup = getAgeGroup(ageDays);
          const dg = getDg(row);
          const dgJudgement = dg === null ? '未計算' : judgeDg(dg);

          return (
            <Card key={row.id} variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Stack spacing={1.5}>
                  <Stack
                    alignItems={{ xs: 'stretch', md: 'center' }}
                    direction={{ xs: 'column', md: 'row' }}
                    justifyContent="space-between"
                    spacing={1.5}
                  >
                    <Stack
                      alignItems={{ xs: 'stretch', sm: 'center' }}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1.5}
                      sx={{ minWidth: 0 }}
                    >
                      <Box
                        sx={{
                          bgcolor: 'grey.50',
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 2,
                          minWidth: { xs: '100%', sm: 180 },
                          p: 1.5,
                          textAlign: 'center'
                        }}
                      >
                        <Typography color="text.secondary" variant="caption">耳標番号</Typography>
                        <Typography fontWeight={900} sx={{ letterSpacing: 0.5 }} variant="h6">
                          {row.calfNumber || '-'}
                        </Typography>
                      </Box>

                      <Box sx={{ minWidth: 0 }}>
                        <Stack alignItems="center" direction="row" spacing={1} useFlexGap flexWrap="wrap">
                          <Typography fontWeight={900} variant="h6">{row.name || '名号未設定'}</Typography>
                          <Chip label={row.sex || '性別未設定'} size="small" variant={row.sex ? 'filled' : 'outlined'} />
                          <Chip label={ageGroup} size="small" variant="outlined" />
                        </Stack>
                        <Typography color="text.secondary">母牛：{row.motherName || '-'}</Typography>
                      </Box>
                    </Stack>

                    <Chip
                      color={getDgColor(dg)}
                      label={dg === null ? 'DG未計算' : `DG ${dg.toFixed(2)}kg/日・${dgJudgement}`}
                      sx={{ alignSelf: { xs: 'flex-start', md: 'center' }, fontWeight: 700 }}
                      variant={dg === null ? 'outlined' : 'filled'}
                    />
                  </Stack>

                  <Divider />

                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    <InfoBox
                      label="生年月日"
                      value={row.birthday || '-'}
                      helper={ageDays === null ? '日齢 -' : `日齢 ${ageDays}日`}
                    />
                    <InfoBox label="開始体重" value={formatAmount(row.startWeight, 'kg')} />
                    <InfoBox label="現在体重" value={formatAmount(row.currentWeight, 'kg')} />
                    <InfoBox label="ミルク量" value={formatAmount(row.milkAmount, 'L')} />
                    <InfoBox label="スターター" value={formatAmount(row.starterAmount, 'kg')} />
                  </Stack>

                  {row.note && (
                    <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 1.25 }}>
                      <Typography color="text.secondary" variant="caption">備考</Typography>
                      <Typography>{row.note}</Typography>
                    </Box>
                  )}

                  <Divider />

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
                    <Button component={RouterLink} to={`/calves/${row.id}`} variant="contained">子牛カルテ</Button>
                    <Button component={RouterLink} to={`/calves/${row.id}/edit`} variant="outlined">編集</Button>
                    <Button color="error" onClick={() => handleDelete(row.id, row.name)} variant="outlined">削除</Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      {filteredRows.length === 0 && (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1}>
              <Typography fontWeight={800}>該当する子牛がありません。</Typography>
              <Typography color="text.secondary">
                検索条件を変えるか、クリアして全件を表示してください。
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
