import { Alert, Button, Card, CardContent, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

type Props = {
  fileName: string;
  headers: string[];
  rows: string[][];
  onReset: () => void;
};

const MAX_PREVIEW_ROWS = 20;

export function CsvPreviewTable({ fileName, headers, rows, onReset }: Props) {
  const visibleRows = rows.slice(0, MAX_PREVIEW_ROWS);

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
            <Stack spacing={0.25}>
              <Typography variant="h6" fontWeight={800}>読み取り内容</Typography>
              <Typography color="text.secondary">{fileName}</Typography>
              <Typography color="text.secondary">{headers.length}列・{rows.length}行</Typography>
            </Stack>
            <Button variant="outlined" onClick={onReset}>選び直す</Button>
          </Stack>

          <Alert severity="warning">まだ牛台帳には登録されていません。</Alert>

          <TableContainer sx={{ maxHeight: 460, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 800 }}>行</TableCell>
                  {headers.map((header, index) => (
                    <TableCell key={`${header}-${index}`} sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                      {header || `項目${index + 1}`}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleRows.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    <TableCell>{rowIndex + 1}</TableCell>
                    {headers.map((_, columnIndex) => (
                      <TableCell key={columnIndex} sx={{ whiteSpace: 'nowrap' }}>
                        {row[columnIndex] || '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {rows.length > MAX_PREVIEW_ROWS && (
            <Typography color="text.secondary">
              最初の{MAX_PREVIEW_ROWS}行を表示しています。残り{rows.length - MAX_PREVIEW_ROWS}行も保持されています。
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
