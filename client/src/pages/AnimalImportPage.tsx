import { ChangeEvent, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { CsvPreviewTable } from '../components/CsvPreviewTable';
import { parseCsv } from '../utils/csv';

type Preview = {
  fileName: string;
  headers: string[];
  rows: string[][];
};

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
      if (!file.name.toLowerCase().endsWith('.csv')) {
        throw new Error('今回はCSVファイルを選んでください。Excel読取は次の工程で追加します。');
      }

      const parsed = parseCsv(await file.text());
      setPreview({ fileName: file.name, ...parsed });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'CSVファイルを読み取れませんでした。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>牛情報の取り込み</Typography>
      <Alert severity="info">
        この画面では、登録前にファイルの内容を確認します。既存データは変更されません。
      </Alert>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>CSVファイルを選ぶ</Typography>
            <Button component="label" variant="contained" size="large" disabled={loading}>
              {loading ? '読み込み中…' : 'CSVファイルを選ぶ'}
              <input hidden type="file" accept=".csv,text/csv" onChange={handleFile} />
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
