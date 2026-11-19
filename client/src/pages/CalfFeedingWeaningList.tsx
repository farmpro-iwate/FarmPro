import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { getCalfList } from '../services/calfApi';
import type { Calf } from '../types/calf';
import { formatTemporaryCalfNumber } from '../utils/temporaryCalfNumber';
import { isAnimalDeceased } from '../utils/animalLifecycle';

function calfDisplayName(row: Calf) {
  if (!row.name || row.name === '耳標未装着' || row.name.startsWith('TEMP-')) {
    const calfNumber = String(row.calfNumber || '').trim();
    return calfNumber && !calfNumber.startsWith('TEMP-') ? '子牛（名号未登録）' : '子牛（耳標未装着）';
  }
  return row.name;
}

function calfNumberLabel(row: Calf) {
  if (row.calfNumber?.startsWith('TEMP-')) return formatTemporaryCalfNumber(row.calfNumber, row.birthday);
  return row.calfNumber || '-';
}

function feedingMethodLabel(method?: string) {
  if (method === '人工哺育') return '人工哺育（ミルク哺育）';
  if (method === '母乳哺育') return '自然哺育（母牛から哺乳）';
  if (method === '混合哺育') return '混合哺育';
  return '人工哺育（ミルク哺育）';
}

export function CalfFeedingWeaningList() {
  const [rows, setRows] = useState<Calf[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getCalfList()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '子牛の哺育・離乳情報を取得できませんでした。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeRows = useMemo(
    () => rows.filter((row) => !isAnimalDeceased(row) && !['販売済み', '牛台帳へ移行済み'].includes(String(row.managementStatus || ''))),
    [rows],
  );

  const cellSx = {
    px: { xs: 1, sm: 1.5 },
    py: 1.1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as const;

  return (
    <Stack spacing={1.5}>
      <Stack spacing={0.25}>
        <Typography variant="h5" fontWeight={800}>哺育・離乳管理</Typography>
        <Typography color="text.secondary">人工哺育・自然哺育・混合哺育と、離乳の状態を管理します。</Typography>
      </Stack>

      <Alert severity="info">
        哺育方法・母牛からの分離日・ミルク終了日・離乳日を確認できます。
      </Alert>

      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && activeRows.length === 0 && <Alert severity="success">管理中の子牛はありません。</Alert>}

      {!loading && !error && activeRows.length > 0 && (
        <Card sx={{ width: '100%', overflow: 'hidden' }}>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <Table size="small" sx={{ width: '100%', tableLayout: 'fixed' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...cellSx, width: '38%' }}>子牛・哺育履歴</TableCell>
                  <TableCell sx={{ ...cellSx, width: '22%' }}>哺育方法</TableCell>
                  <TableCell sx={{ ...cellSx, width: '16%' }}>離乳状態</TableCell>
                  <TableCell sx={{ ...cellSx, width: '16%' }}>実際の離乳日</TableCell>
                  <TableCell align="right" sx={{ ...cellSx, width: '8%' }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeRows.map((row) => {
                  const feedingMethod = row.feedingMethod || '人工哺育';
                  const weaningStatus = row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前');
                  const isWeaned = weaningStatus === '離乳済み';
                  return (
                    <TableRow key={row.id} hover>
                      <TableCell sx={{ ...cellSx, whiteSpace: 'normal' }}>
                        <Typography fontWeight={800} noWrap>{calfDisplayName(row)}</Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>耳標 {calfNumberLabel(row)}</Typography>
                        {row.motherSeparationDate && <Typography variant="caption" display="block" color="text.secondary" sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                          母牛から分離：{row.motherSeparationDate}
                        </Typography>}
                        {row.milkEndDate && <Typography variant="caption" display="block" color="text.secondary" sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                          ミルク終了：{row.milkEndDate}
                        </Typography>}
                      </TableCell>
                      <TableCell sx={cellSx}>{feedingMethodLabel(feedingMethod)}</TableCell>
                      <TableCell sx={cellSx}>
                        <Chip
                          size="small"
                          label={weaningStatus}
                          color={isWeaned ? 'success' : 'warning'}
                        />
                      </TableCell>
                      <TableCell sx={cellSx}>{row.weaningDate || '-'}</TableCell>
                      <TableCell align="right" sx={cellSx}>
                        <Button
                          component={RouterLink}
                          to={`/calf-feeding-weaning/${row.id}/edit`}
                          variant={isWeaned ? 'outlined' : 'contained'}
                          size="small"
                          sx={{ minWidth: 0, px: 1.25, whiteSpace: 'nowrap' }}
                        >
                          {isWeaned ? '確認・修正' : '入力'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
