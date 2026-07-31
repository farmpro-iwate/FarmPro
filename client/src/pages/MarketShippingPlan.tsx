import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, CardContent, Chip, Divider, Stack, TextField, Typography } from '@mui/material';
import { getCalfList } from '../services/calfApi';
import type { Calf } from '../types/calf';
import { formatSex } from '../utils/sex';
import { formatTemporaryCalfNumber } from '../utils/temporaryCalfNumber';

type SelectionStatus = '未選択' | '出荷候補' | '見送り';

function startOfDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calcAgeDays(birthday?: string, targetDate?: string) {
  if (!birthday || !targetDate) return null;
  const birth = startOfDay(birthday);
  const target = startOfDay(targetDate);
  if (!birth || !target) return null;
  return Math.floor((target.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
}

function todayText() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayNumber(row: Calf) {
  return formatTemporaryCalfNumber(row.calfNumber, row.birthday);
}

function displayName(row: Calf) {
  if (!row.name || row.name === '耳標未装着' || row.name.startsWith('TEMP-')) return '子牛（耳標未装着）';
  return row.name;
}

function selectionColor(status: SelectionStatus) {
  if (status === '出荷候補') return 'success';
  if (status === '見送り') return 'default';
  return 'warning';
}

export function MarketShippingPlan() {
  const [calves, setCalves] = useState<Calf[]>([]);
  const [marketName, setMarketName] = useState('');
  const [marketDate, setMarketDate] = useState('');
  const [selections, setSelections] = useState<Record<string, SelectionStatus>>({});

  useEffect(() => {
    getCalfList().then(setCalves);
  }, []);

  const rows = useMemo(() => {
    return calves
      .filter((row) => row.managementStatus !== '牛台帳へ移行済み' && row.managementStatus !== '死亡・その他')
      .map((row) => ({
        row,
        currentAge: calcAgeDays(row.birthday, todayText()),
        marketAge: calcAgeDays(row.birthday, marketDate),
        selection: selections[String(row.id)] || '未選択' as SelectionStatus,
      }))
      .sort((a, b) => (b.marketAge ?? -1) - (a.marketAge ?? -1));
  }, [calves, marketDate, selections]);

  const summary = useMemo(() => ({
    all: rows.length,
    candidate: rows.filter((item) => item.selection === '出荷候補').length,
    skipped: rows.filter((item) => item.selection === '見送り').length,
    undecided: rows.filter((item) => item.selection === '未選択').length,
  }), [rows]);

  function setSelection(id: string | number, status: SelectionStatus) {
    setSelections((current) => ({ ...current, [String(id)]: status }));
  }

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h5" fontWeight={800}>市場出荷予定</Typography>
        <Typography color="text.secondary">
          市場開催日を入力すると、子牛ごとの市場当日の日齢を自動表示します。
        </Typography>
      </Stack>

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              label="市場名"
              placeholder="例：○○家畜市場"
              value={marketName}
              onChange={(event) => setMarketName(event.target.value)}
              fullWidth
            />
            <TextField
              label="市場開催日"
              type="date"
              value={marketDate}
              onChange={(event) => setMarketDate(event.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>
        </CardContent>
      </Card>

      {!marketDate && <Alert severity="info">市場開催日を入力してください。</Alert>}

      {marketDate && (
        <>
          <Alert severity="success">
            {marketName || '市場名未入力'}　{marketDate}　対象 {summary.all}頭
          </Alert>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={`出荷候補 ${summary.candidate}頭`} color="success" />
            <Chip label={`見送り ${summary.skipped}頭`} />
            <Chip label={`未選択 ${summary.undecided}頭`} color="warning" variant="outlined" />
          </Stack>
        </>
      )}

      {marketDate && rows.map(({ row, currentAge, marketAge, selection }) => (
        <Card key={row.id} sx={{ border: 2, borderColor: selection === '出荷候補' ? 'success.main' : 'divider' }}>
          <CardContent>
            <Stack spacing={1}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                <Stack spacing={0.25}>
                  <Typography variant="h6" fontWeight={800}>{displayNumber(row)}　{displayName(row)}</Typography>
                  <Typography color="text.secondary">母牛：{row.motherName || '-'}</Typography>
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip size="small" label={formatSex(row.sex)} />
                  <Chip size="small" label={row.managementStatus || '育成中'} variant="outlined" />
                  <Chip size="small" label={selection} color={selectionColor(selection)} />
                </Stack>
              </Stack>
              <Divider />
              <Typography>生年月日：{row.birthday || '-'}</Typography>
              <Typography>現在の日齢：{currentAge === null ? '-' : `${currentAge}日`}</Typography>
              <Typography variant="h6" fontWeight={900} color="primary">
                市場当日の日齢：{marketAge === null ? '-' : `${marketAge}日`}
              </Typography>
              <Typography color="text.secondary">現在体重：{row.currentWeight || '-'}kg</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} pt={0.5}>
                <Button
                  variant={selection === '出荷候補' ? 'contained' : 'outlined'}
                  color="success"
                  fullWidth
                  onClick={() => setSelection(row.id, '出荷候補')}
                >
                  出荷候補にする
                </Button>
                <Button
                  variant={selection === '見送り' ? 'contained' : 'outlined'}
                  color="inherit"
                  fullWidth
                  onClick={() => setSelection(row.id, '見送り')}
                >
                  見送り
                </Button>
                <Button
                  variant="text"
                  fullWidth
                  disabled={selection === '未選択'}
                  onClick={() => setSelection(row.id, '未選択')}
                >
                  選択を戻す
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ))}

      {marketDate && rows.length === 0 && <Alert severity="info">表示できる子牛がいません。</Alert>}

      {marketDate && (
        <Alert severity="info">
          現段階では候補選択の画面確認用です。画面を閉じると選択はリセットされ、出荷・販売記録にはまだ保存されません。
        </Alert>
      )}
    </Stack>
  );
}

export default MarketShippingPlan;
