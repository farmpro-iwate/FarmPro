import { ChangeEvent, useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import * as XLSX from 'xlsx';
import { CsvPreviewTable } from '../components/CsvPreviewTable';
import { ImportFieldMapping } from '../components/ImportFieldMapping';
import { readCattleDocumentWithAi, type CattleImportCandidate } from '../services/cattleDocumentReader';
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
  if (!firstSheetName) throw new Error('Excelファイルにシートがありません。');
  const sheet = workbook.Sheets[firstSheetName];
  const values = XLSX.utils.sheet_to_json<(string | number | boolean)[]>(sheet, { header: 1, raw: false, defval: '' });
  const normalized = values
    .map((row) => row.map((cell) => String(cell).trim()))
    .filter((row) => row.some((cell) => cell !== ''));
  if (normalized.length === 0) throw new Error('Excelファイルにデータがありません。');
  const [headers, ...rows] = normalized;
  if (headers.every((header) => header === '')) throw new Error('Excelファイルの1行目に項目名がありません。');
  return { headers, rows };
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function errorText(caught: unknown) {
  return caught instanceof Error ? caught.message : 'ファイルを読み取れませんでした。';
}

export function AnimalImportPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [candidate, setCandidate] = useState<CattleImportCandidate | null>(null);
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [aiModel, setAiModel] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);

  useEffect(() => () => {
    if (documentPreview?.objectUrl) URL.revokeObjectURL(documentPreview.objectUrl);
  }, [documentPreview]);

  const resetDocument = () => {
    setDocumentPreview((current) => {
      if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl);
      return null;
    });
    setDocumentFile(null);
    setCandidate(null);
    setAiNotes([]);
    setAiModel('');
  };

  const handleDocumentFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    resetDocument();
    setPreview(null);
    setError('');

    const lowerName = file.name.toLowerCase();
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(lowerName);
    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
    if (!isImage && !isPdf) {
      setError('画像またはPDFファイルを選んでください。');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setDocumentFile(file);
    setDocumentPreview({
      fileName: file.name,
      fileType: isPdf ? 'PDF' : '画像',
      size: file.size,
      objectUrl,
      isImage,
    });
  };

  const handleReadDocument = async () => {
    if (!documentFile) return;
    setError('');
    setCandidate(null);
    setAiNotes([]);
    setAiModel('');
    setAiRunning(true);
    try {
      const result = await readCattleDocumentWithAi(documentFile);
      setCandidate(result.candidate);
      setAiNotes(result.notes);
      setAiModel(result.model || '');
    } catch (caught) {
      setError(`AI画像解析で失敗しました：${errorText(caught)}`);
    } finally {
      setAiRunning(false);
    }
  };

  const handleTableFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    resetDocument();
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
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>牛情報の取り込み</Typography>
      <Alert severity="info">画像・PDF・CSV・Excelから牛情報を確認できます。AIは登録候補を作るだけで、この段階では正式データを保存しません。</Alert>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <Typography variant="h6" fontWeight={800}>画像・PDFから取り込む</Typography>
              <Chip size="small" label="OpenAI解析" color="primary" />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button component="label" variant="contained" size="large" disabled={aiRunning} fullWidth>
                画像・PDFを選ぶ
                <input hidden type="file" accept="image/*,.pdf,application/pdf" onChange={handleDocumentFile} />
              </Button>
              <Button component="label" variant="outlined" size="large" disabled={aiRunning} fullWidth>
                カメラで撮影
                <input hidden type="file" accept="image/*" capture="environment" onChange={handleDocumentFile} />
              </Button>
            </Stack>

            {documentPreview && (
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1.5}>
                    <Typography fontWeight={800}>選択した帳票</Typography>
                    <Typography>{documentPreview.fileName}</Typography>
                    <Typography color="text.secondary">{documentPreview.fileType} / {formatFileSize(documentPreview.size)}</Typography>
                    {documentPreview.isImage && (
                      <img src={documentPreview.objectUrl} alt="選択した牛情報帳票" style={{ width: '100%', maxHeight: 520, objectFit: 'contain', borderRadius: 8 }} />
                    )}
                    {!documentPreview.isImage && <Alert severity="info">PDF全体をAIへ送り、項目の意味と表の関係を解析します。</Alert>}
                    <Button variant="contained" onClick={handleReadDocument} disabled={aiRunning}>
                      {aiRunning ? 'AI解析中…' : 'AIで読み取る'}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            )}

            {candidate && (
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1}>
                    <Typography variant="h6" fontWeight={800}>AI読み取り候補</Typography>
                    {aiModel && <Typography color="text.secondary">モデル：{aiModel}</Typography>}
                    <Typography>個体識別番号：{candidate.identificationNumber || '-'}</Typography>
                    <Typography>名号：{candidate.name || '-'}</Typography>
                    <Typography>生年月日：{candidate.birthday || '-'}</Typography>
                    <Typography>父牛：{candidate.sire || '-'}</Typography>
                    <Typography>母牛：{candidate.dam || '-'}</Typography>
                    <Typography>母の父：{candidate.maternalSire || '-'}</Typography>
                    <Typography>祖母の父：{candidate.maternalGrandSire || '-'}</Typography>
                    <Typography>産歴候補：{candidate.offspring.length}件</Typography>
                    {aiNotes.length > 0 && <Alert severity="warning">要確認：{aiNotes.join(' / ')}</Alert>}
                    <Alert severity="info">ここではまだ正式登録しません。次工程で重複確認・修正・登録確認を戻します。</Alert>
                  </Stack>
                </CardContent>
              </Card>
            )}
          </Stack>
        </CardContent>
      </Card>

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
