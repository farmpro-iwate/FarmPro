import { ChangeEvent, useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, LinearProgress, Stack, TextField, Typography } from '@mui/material';
import * as XLSX from 'xlsx';
import { CsvPreviewTable } from '../components/CsvPreviewTable';
import { ImportFieldMapping } from '../components/ImportFieldMapping';
import { CattleImportCandidate, getCattleDocumentReader } from '../services/cattleDocumentReader';
import { parseCsv } from '../utils/csv';

type Preview = {
  fileName: string;
  headers: string[];
  rows: string[][];
};

type DocumentPreview = {
  fileName: string;
  fileType: '画像' | 'PDF';
  objectUrl: string;
  isImage: boolean;
};

function parseExcel(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) throw new Error('Excelファイルにシートがありません。');

  const sheet = workbook.Sheets[firstSheetName];
  const values = XLSX.utils.sheet_to_json<(string | number | boolean)[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });

  const normalized = values
    .map((row) => row.map((cell) => String(cell).trim()))
    .filter((row) => row.some((cell) => cell !== ''));

  if (normalized.length === 0) throw new Error('Excelファイルにデータがありません。');

  const [headers, ...rows] = normalized;
  if (headers.every((header) => header === '')) throw new Error('Excelファイルの1行目に項目名がありません。');

  return { headers, rows };
}

export function AnimalImportPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [candidate, setCandidate] = useState<CattleImportCandidate | null>(null);
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [readingDocument, setReadingDocument] = useState(false);
  const [readStatus, setReadStatus] = useState('');
  const [readProgress, setReadProgress] = useState(0);

  useEffect(() => () => {
    if (documentPreview?.objectUrl) URL.revokeObjectURL(documentPreview.objectUrl);
  }, [documentPreview]);

  const clearDocument = () => {
    setDocumentPreview((current) => {
      if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl);
      return null;
    });
    setDocumentFile(null);
    setCandidate(null);
    setRawText('');
    setReadStatus('');
    setReadProgress(0);
  };

  const handleDocumentFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    clearDocument();
    setPreview(null);
    setError('');

    const lowerName = file.name.toLowerCase();
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(lowerName);
    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');

    if (!isImage && !isPdf) {
      setError('画像またはPDFファイルを選んでください。');
      return;
    }

    setDocumentFile(file);
    setDocumentPreview({
      fileName: file.name,
      fileType: isPdf ? 'PDF' : '画像',
      objectUrl: URL.createObjectURL(file),
      isImage,
    });
  };

  const handleReadDocument = async () => {
    if (!documentFile) return;

    setError('');
    setCandidate(null);
    setRawText('');
    setReadProgress(0);
    setReadStatus('読み取りを準備しています…');
    setReadingDocument(true);

    try {
      const reader = getCattleDocumentReader();
      const result = await reader.read(documentFile, {
        onProgress: ({ status, progress }) => {
          setReadStatus(status);
          if (typeof progress === 'number') setReadProgress(progress);
        },
      });
      setCandidate(result.candidate);
      setRawText(result.rawText);
      setReadProgress(100);
      setReadStatus('読み取り候補を作成しました。内容を確認してください。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '画像・PDFを読み取れませんでした。');
      setReadStatus('');
    } finally {
      setReadingDocument(false);
    }
  };

  const handleTableFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    clearDocument();
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
      setError(caught instanceof Error ? caught.message : 'ファイルを読み取れませんでした。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>牛情報の取り込み</Typography>

      <Alert severity="info">
        画像・PDF・CSV・Excelから牛情報を確認できます。正式データへ保存する前に、必ず読み取り結果を確認します。
      </Alert>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>画像・PDFから取り込む</Typography>
            <Typography color="text.secondary">
              牛の通信簿や成績表などを、端末内で文字読み取りします。この段階では既存データを変更しません。
            </Typography>
            <Button component="label" variant="contained" size="large" disabled={readingDocument}>
              画像・PDFを選ぶ
              <input hidden type="file" accept="image/*,.pdf,application/pdf" onChange={handleDocumentFile} />
            </Button>

            {documentPreview && (
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1.5}>
                    <Typography fontWeight={800}>選択したファイル</Typography>
                    <Typography>{documentPreview.fileName}（{documentPreview.fileType}）</Typography>
                    {documentPreview.isImage && (
                      <img
                        src={documentPreview.objectUrl}
                        alt="選択した牛情報帳票"
                        style={{ width: '100%', maxHeight: 480, objectFit: 'contain', borderRadius: 8 }}
                      />
                    )}
                    <Button variant="contained" onClick={handleReadDocument} disabled={readingDocument}>
                      {readingDocument ? '読み取り中…' : '内容を読み取る'}
                    </Button>
                    {readStatus && <Typography>{readStatus}</Typography>}
                    {(readingDocument || readProgress > 0) && (
                      <LinearProgress variant="determinate" value={readProgress} />
                    )}
                  </Stack>
                </CardContent>
              </Card>
            )}
          </Stack>
        </CardContent>
      </Card>

      {candidate && (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6" fontWeight={800}>読み取り候補</Typography>
              <Alert severity="warning">読み取り結果は候補です。正式登録はまだ行いません。</Alert>
              <TextField label="個体識別番号" value={candidate.identificationNumber} InputProps={{ readOnly: true }} />
              <TextField label="登録番号" value={candidate.registrationNumber} InputProps={{ readOnly: true }} />
              <TextField label="名号" value={candidate.name} InputProps={{ readOnly: true }} />
              <TextField label="生年月日" value={candidate.birthday} InputProps={{ readOnly: true }} />
              <TextField label="父牛" value={candidate.sire} InputProps={{ readOnly: true }} />
              <TextField label="母牛" value={candidate.dam} InputProps={{ readOnly: true }} />
              <TextField label="母の父" value={candidate.maternalSire} InputProps={{ readOnly: true }} />
              <TextField label="祖母の父" value={candidate.maternalGrandSire} InputProps={{ readOnly: true }} />
              {candidate.offspring.length > 0 && (
                <Typography>産歴候補：{candidate.offspring.length}件</Typography>
              )}
              <TextField label="読み取り文字（確認用）" value={rawText} multiline minRows={4} InputProps={{ readOnly: true }} />
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>CSV・Excelファイルを選ぶ</Typography>
            <Button component="label" variant="contained" size="large" disabled={loading}>
              {loading ? '読み込み中…' : 'CSV・Excelファイルを選ぶ'}
              <input
                hidden
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleTableFile}
              />
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="warning">{error}</Alert>}

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
