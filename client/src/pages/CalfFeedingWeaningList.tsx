import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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

function calfDisplayName(row: Calf) {
  if (!row.name || row.name === '耳標未装着' || row.name.startsWith('TEMP-')) return '子牛（耳標未装着）';
  return row.name;
}

function calfNumberLabel(row: Calf) {
  if (row.calfNumber?.startsWith('TEMP-')) return formatTemporaryCalfNumber(row.calfNumber, row.birthday);
  return row.calfNumber || '-';
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
    () => rows.filter((row) => !['販売済み', '牛台帳へ移行済み', '死亡・その他'].includes(String(row.managementStatus || ''))),
    [rows],
  );

  return (
    <Stack spacing={1.5}>
      <Stack spacing={0.25}>
        <Typography variant="h5" fontWeight={800}>哺育・離乳管理</Typography>
        <Typography color="text.secondary">人工哺育・自然哺育・混合哺育と、離乳の状態を確認する画面です。</Typography>
      </Stack>

      <Alert severity="info">
        人工哺育ではミルク哺育からの離乳、自然哺育では母牛からの離乳を管理します。現在は既存の子牛データを参照表示しています。
      </Alert>

      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && activeRows.length === 0 && <Alert severity="success">管理中の子牛はありません。</Alert>}

      {!loading && !error && activeRows.length > 0 && (
        <Card sx={{ overflowX: 'auto' }}>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>子牛</TableCell>
                  <TableCell>哺育方法</TableCell>
                  <TableCell>離乳状態</TableCell>
                  <TableCell>離乳予定日</TableCell>
                  <TableCell>実際の離乳日</TableCell>
                  <TableCell>ミルク終了</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeRows.map((row) => {
                  const feedingMethod = row.feedingMethod || '人工哺育';
                  const weaningStatus = row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前');
                  return (
                    <TableRow key={row.id} hover>
                      <TableCell>
                        <Typography fontWeight={800}>{calfDisplayName(row)}</Typography>
                        <Typography variant="body2" color="text.secondary">耳標 {calfNumberLabel(row)}</Typography>
                      </TableCell>
                      <TableCell>{feedingMethod}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={weaningStatus}
                          color={weaningStatus === '離乳済み' ? 'success' : 'warning'}
                        />
                      </TableCell>
                      <TableCell>{row.weaningPlannedDate || '-'}</TableCell>
                      <TableCell>{row.weaningDate || '-'}</TableCell>
                      <TableCell>
                        {feedingMethod === '母乳哺育' ? '-' : row.milkEndDate || '-'}
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
