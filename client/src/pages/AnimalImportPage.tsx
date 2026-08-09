import { ChangeEvent, useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import * as XLSX from 'xlsx';
import { CsvPreviewTable } from '../components/CsvPreviewTable';
import { ImportFieldMapping } from '../components/ImportFieldMapping';
import { parseCsv } from '../utils/csv';

type Preview = {
  fileName: string;
  headers: string[];
  rows: string[][];
};

type DocumentPreview = {
  fileName: string;
  fileType: string;
  size: number;
  objectUrl: string;
  isImage: boolean;
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

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AnimalImportPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (documentPreview?.objectUrl) URL.revokeObjectURL(documentPreview.objectUrl);
    };
  }, [documentPreview]);

  const resetDocumentPreview = () => {
    setDocumentPreview((current) => {
      if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl);
      return null;
    });
  };

  const handleDocumentFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    resetDocumentPreview();
    setPreview(null);
    setError('');

    const lowerName = file.name.toLowerCase();
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(lowerName);
    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');

    if (!isImage && !isPdf) {
      setError('スマホ画像またはPDFファイルを選んでください。');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setDocumentPreview({
      fileName: file.name,
      fileType: isPdf ? 'PDF' : '画像',
      size: file.size,
      objectUrl,
      isImage,
    });
  };

  const handleTableFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    resetDocumentPreview();
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
        牛情報取り込み
      </Typography>

      <Alert severity="info">
        画像・PDF・CSV・Excelから牛情報を取り込みます。正式データへ保存する前に、必ず読み取り結果を確認します。
      </Alert>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>
              スマホ画像・PDFから取り込む
            </Typography>
            <Typography color="text.secondary">
              牛の通信簿、成績表、JA・市場などの類似帳票を選択します。帳票名ではなく、個体情報・血統・産歴・子牛・販売成績などの項目として読み取る設計です。
            </Typography>

            <Button component="label" variant="contained" size="large">
              画像・PDFを選ぶ
              <input
                hidden
                type="file"
                accept="image/*,.pdf,application/pdf"
                onChange={handleDocumentFile}
              />
            </Button>

            {documentPreview && (
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1.5}>
                    <Typography fontWeight={900}>選択した帳票</Typography>
                    <Typography>ファイル：{documentPreview.fileName}</Typography>
                    <Typography color="text.secondary">
                      種類：{documentPreview.fileType}　サイズ：{formatFileSize(documentPreview.size)}
                    </Typography>
                    {documentPreview.isImage && (
                      <img
                        src={documentPreview.objectUrl}
                        alt="選択した牛情報帳票"
                        style={{ width: '100%', maxHeight: 520, objectFit: 'contain', borderRadius: 8 }}
                      />
                    )}
                    {!documentPreview.isImage && (
                      <Alert severity="info">
                        PDFを受け付けました。次工程でこの帳票を読み取り、FarmPro標準項目へ変換します。
                      </Alert>
                    )}
                    <Alert severity="warning">
                      現段階ではまだ正式データへ保存しません。次工程で「読み取り候補 → 確認 → 一括登録」を接続します。
                    </Alert>
                    <Button variant="outlined" onClick={resetDocumentPreview}>
                      選び直す
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            )}

            <Divider />

            <Typography variant="h6" fontWeight={800}>
              CSV・Excelから取り込む
            </Typography>
            <Typography color="text.secondary">
              一覧データがある場合はこちらを使います。1行目の項目名を使って取り込み項目を対応付けます。
            </Typography>

            <Button
              component="label"
              variant="outlined"
              size="large"
              disabled={loading}
            >
              {loading ? '読み込み中…' : 'CSV・Excelを選ぶ'}
              <input
                hidden
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleTableFile}
              />
            </Button>

            {error && <Alert severity="warning">{error}</Alert>}
          </Stack>
        </CardContent>
      </Card>

      {preview && (
        <>
          <ImportFieldMapping headers={preview.headers} />
          <CsvPreviewTable
            fileName={preview.fileName}
            headers={preview.headers}
            rows={preview.rows}
            onReset={() => setPreview(null)}
          />
        </>
      )}
    </Stack>
  );
}
