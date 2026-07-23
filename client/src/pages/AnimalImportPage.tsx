import { ChangeEvent, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import * as XLSX from 'xlsx';
import { CsvPreviewTable } from '../components/CsvPreviewTable';
import { parseCsv } from '../utils/csv';

type Preview = {
  fileName: string;
  headers: string[];
  rows: string[][];
};

function parseExcel(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error('Excelファイルにシートがありません。');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const values = XLSX.utils.sheet_to_json<(string | number | boolean)[]>(
    sheet,
    {
      header: 1,
      raw: false,
      defval: '',
    },
  );

  const normalized = values
    .map((row) => row.map((cell) => String(cell).trim()))
    .filter((row) => row.some((cell) => cell !== ''));

  if (normalized.length === 0) {
    throw new Error('Excelファイルにデータがありません。');
  }

  const [headers, ...rows] = normalized;

  if (headers.every((header) => header === '')) {
    throw new Error('Excelファイルの1行目に項目名がありません。');
  }

  return { headers, rows };
}

export function AnimalImportPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setPreview(null);
    setError('');
    setLoading(true);

    try {
      const lowerName = file.name.toLowerCase();

      if (lowerName.endsWith('.csv')) {
        const parsed = parseCsv(await file.text());
        setPreview({ fileName: file.name, ...parsed });
        return;
      }

      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        const parsed = parseExcel(await file.arrayBuffer());
        setPreview({ fileName: file.name, ...parsed });
        return;
      }

      throw new Error('CSVまたはExcelファイルを選んでください。');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'ファイルを読み取れませんでした。',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        牛情報の取り込み
      </Typography>

      <Alert severity="info">
        この画面では、登録前にファイルの内容を確認します。既存データは変更されません。
      </Alert>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>
              CSV・Excelファイルを選ぶ
            </Typography>

            <Button
              component="label"
              variant="contained"
              size="large"
              disabled={loading}
            >
              {loading ? '読み込み中…' : 'CSV・Excelファイルを選ぶ'}
              <input
                hidden
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleFile}
              />
            </Button>

            {error && <Alert severity="warning">{error}</Alert>}
          </Stack>
        </CardContent>
      </Card>

      {preview && (
        <CsvPreviewTable
          fileName={preview.fileName}
          headers={preview.headers}
          rows={preview.rows}
          onReset={() => setPreview(null)}
        />
      )}
    </Stack>
  );
}
