import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Button, Card, CardContent, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { getPrintData, PrintKind, printConfigs } from '../services/printApi';

type RowData = Record<string, unknown>;

function isPrintKind(value: string | undefined): value is PrintKind {
  return value === 'cattle' ||
    value === 'calves' ||
    value === 'breedings' ||
    value === 'vaccines' ||
    value === 'blv' ||
    value === 'schedules' ||
    value === 'treatments';
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

export function PrintPage() {
  const { kind } = useParams();
  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(true);

  const safeKind: PrintKind = isPrintKind(kind) ? kind : 'cattle';
  const config = printConfigs[safeKind];

  useEffect(() => {
    setLoading(true);
    getPrintData(safeKind)
      .then((data) => setRows(data as RowData[]))
      .finally(() => setLoading(false));
  }, [safeKind]);

  const printedAt = useMemo(() => {
    return new Date().toLocaleString('ja-JP');
  }, []);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} className="no-print">
        <Button variant="contained" onClick={() => window.print()}>印刷する</Button>
        <Button component={RouterLink} to="/print" variant="outlined">印刷メニューへ戻る</Button>
      </Stack>

      <Card className="print-card">
        <CardContent>
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="h5" fontWeight={800}>{config.title}</Typography>
              <Typography color="text.secondary">繁殖Farm Pro</Typography>
              <Typography variant="caption" color="text.secondary">印刷日時：{printedAt}</Typography>
              <Typography variant="caption" color="text.secondary">件数：{rows.length}件</Typography>
            </Stack>

            {loading ? (
              <Typography>読み込み中...</Typography>
            ) : (
              <Table size="small" className="print-table">
                <TableHead>
                  <TableRow>
                    {config.columns.map((column) => (
                      <TableCell key={column.key}>{column.label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={index}>
                      {config.columns.map((column) => (
                        <TableCell key={column.key}>{displayValue(row[column.key])}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
