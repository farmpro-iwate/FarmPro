import { ChangeEvent, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import * as XLSX from 'xlsx';
import { CsvPreviewTable } from '../components/CsvPreviewTable';
import { ImportFieldMapping } from '../components/ImportFieldMapping';
import {
  CattleImportCandidate,
  emptyCattleImportCandidate,
  getCattleDocumentReader,
} from '../services/cattleDocumentReader';
import { parseCsv } from '../utils/csv';

type Preview = { fileName: string; headers: string[]; rows: string[][] };
type DocumentPreview = { fileName: string; fileType: string; size: number; objectUrl: string; isImage: boolean };
type ReadSource = 'pdf-text' | 'local-ocr' | 'ai' | '';
type CandidateWithSourceReference = CattleImportCandidate & { sourceReferenceNumber?: string };

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
  if (caught instanceof Error) return caught.message;
  if (typeof caught === 'string') return caught;
  try { return JSON.stringify(caught); } catch { return String(caught); }
}

function sourceLabel(source: ReadSource) {
  if (source === 'pdf-text') return 'PDF文字データ';
  if (source === 'local-ocr') return '端末内OCR';
  if (source === 'ai') return 'AI画像解析';
  return '';
}

export function AnimalImportPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [candidate, setCandidate] = useState<CattleImportCandidate | null>(null);
  const [sourceReferenceNumber, setSourceReferenceNumber] = useState('');
  const [readSource, setReadSource] = useState<ReadSource>('');
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [aiModel, setAiModel] = useState('');

  useEffect(() => () => {
    if (documentPreview?.objectUrl) URL.revokeObjectURL(documentPreview.objectUrl);
  }, [documentPreview]);

  const resetDocumentPreview = () => {
    setDocumentPreview((current) => {
      if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl);
      return null;
    });
    setDocumentFile(null);
    setOcrText('');
    setCandidate(null);
    setSourceReferenceNumber('');
    setOcrProgress(0);
    setOcrStatus('');
    setReadSource('');
    setAiNotes([]);
    setAiModel('');
  };

  const handleDocumentFile = (event: ChangeEvent<HTMLInputElement>) => {
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
    setDocumentFile(file);
    setDocumentPreview({ fileName: file.name, fileType: isPdf ? 'PDF' : '画像', size: file.size, objectUrl, isImage });
  };

  const handleReadDocument = async () => {
    if (!documentFile || !documentPreview) return;
    setError('');
    setCandidate(null);
    setSourceReferenceNumber('');
    setOcrText('');
    setReadSource('');
    setAiNotes([]);
    setAiModel('');
    setOcrProgress(0);
    setOcrStatus('AI画像解析を準備しています…');
    setOcrRunning(true);
    try {
      const reader = getCattleDocumentReader('ai');
      const result = await reader.read(documentFile, {
        onProgress: ({ status, progress }) => {
          setOcrStatus(status);
          if (typeof progress === 'number') setOcrProgress(progress);
        },
      });
      const resultCandidate = result.candidate as CandidateWithSourceReference;
      setCandidate(result.candidate);
      setSourceReferenceNumber(resultCandidate.sourceReferenceNumber || '');
      setOcrText(result.rawText);
      setReadSource(result.source);
      setAiNotes(result.notes || []);
      setAiModel(result.model || '');
      setOcrProgress(100);
      setOcrStatus('AI画像解析から読み取り候補を作成しました。');
    } catch (caught) {
      setError(`AI画像解析で失敗しました：${errorText(caught) || '詳細不明'}`);
      setOcrStatus('');
    } finally {
      setOcrRunning(false);
    }
  };

  const updateCandidate = (key: keyof Omit<CattleImportCandidate, 'offspring'>, value: string) => {
    setCandidate((current) => ({ ...(current || emptyCattleImportCandidate), [key]: value }));
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
      setError(errorText(caught) || 'ファイルを読み取れませんでした。');
    } finally {
      setLoading(false);
    }
  };

  return <Stack spacing={2}>
    <Typography variant="h5" fontWeight={800}>牛情報取り込み</Typography>
    <Alert severity="info">画像・PDF・CSV・Excelから牛情報を取り込みます。正式データへ保存する前に、必ず読み取り結果を確認します。</Alert>
    <Card><CardContent><Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
        <Typography variant="h6" fontWeight={800}>スマホ画像・PDFから取り込む</Typography>
        <Chip size="small" label="読み取り：AI画像解析" color="primary" />
      </Stack>
      <Typography color="text.secondary">牛の通信簿、成績表、JA・市場などの類似帳票をAIが項目の意味と表構造を見て、FarmPro標準項目の候補へ整理します。</Typography>
      <Alert severity="info">AIは候補を作るだけです。判読できない項目は推測せず空欄または要確認として返し、この段階では正式データへ保存しません。</Alert>
      <Button component="label" variant="contained" size="large" disabled={ocrRunning}>画像・PDFを選ぶ<input hidden type="file" accept="image/*,.pdf,application/pdf" onChange={handleDocumentFile}/></Button>
      {documentPreview && <Card variant="outlined"><CardContent><Stack spacing={1.5}>
        <Typography fontWeight={900}>選択した帳票</Typography>
        <Typography>ファイル：{documentPreview.fileName}</Typography>
        <Typography color="text.secondary">種類：{documentPreview.fileType}　サイズ：{formatFileSize(documentPreview.size)}</Typography>
        {documentPreview.isImage && <img src={documentPreview.objectUrl} alt="選択した牛情報帳票" style={{ width:'100%', maxHeight:520, objectFit:'contain', borderRadius:8 }}/>} 
        {!documentPreview.isImage && <Alert severity="info">PDF全体をAIへ渡し、文字だけでなく表の配置や項目関係も含めて解析します。</Alert>}
        <Alert severity="warning">読み取り結果は候補です。この段階では正式データへ保存しません。</Alert>
        <Button variant="contained" onClick={handleReadDocument} disabled={ocrRunning}>{ocrRunning ? 'AIで読み取り中…' : 'AIでこの帳票を読み取る'}</Button>
        {ocrRunning && <Stack spacing={0.5}><LinearProgress variant={ocrProgress > 0 ? 'determinate':'indeterminate'} value={ocrProgress}/><Typography variant="body2" color="text.secondary">{ocrStatus}{ocrProgress > 0 ? ` ${ocrProgress}%`:''}</Typography></Stack>}
        <Button variant="outlined" onClick={resetDocumentPreview} disabled={ocrRunning}>選び直す</Button>
      </Stack></CardContent></Card>}
      {candidate && <Card variant="outlined"><CardContent><Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <Typography variant="h6" fontWeight={900}>読み取り候補</Typography>
          {readSource && <Chip size="small" label={`読取元：${sourceLabel(readSource)}`} />}
          {aiModel && <Chip size="small" variant="outlined" label={`モデル：${aiModel}`} />}
        </Stack>
        <Alert severity="info">AIが読み取った内容をFarmPro標準項目へ当てはめています。誤読した欄はここで修正できます。まだ保存されません。</Alert>
        {aiNotes.length > 0 && <Alert severity="warning"><Typography fontWeight={800}>AIの要確認事項</Typography>{aiNotes.map((note, index) => <Typography key={`${index}-${note}`} variant="body2">・{note}</Typography>)}</Alert>}
        <TextField label="個体識別番号（公的10桁）" value={candidate.identificationNumber} onChange={(e)=>updateCandidate('identificationNumber',e.target.value)} fullWidth helperText="公的な10桁の個体識別番号だと確認できる場合だけ使用します。" />
        <TextField label="帳票上の管理番号" value={sourceReferenceNumber} onChange={(e)=>setSourceReferenceNumber(e.target.value)} fullWidth helperText="個体識別明細番号・母牛No.・管理番号など、元帳票固有の参照番号です。正式な個体識別番号とは分けて扱います。" />
        <TextField label="登録番号" value={candidate.registrationNumber} onChange={(e)=>updateCandidate('registrationNumber',e.target.value)} fullWidth/>
        <TextField label="名号" value={candidate.name} onChange={(e)=>updateCandidate('name',e.target.value)} fullWidth/>
        <TextField label="生年月日" type="date" InputLabelProps={{shrink:true}} value={candidate.birthday} onChange={(e)=>updateCandidate('birthday',e.target.value)} fullWidth/>
        <TextField label="父牛" value={candidate.sire} onChange={(e)=>updateCandidate('sire',e.target.value)} fullWidth/>
        <TextField label="母牛" value={candidate.dam} onChange={(e)=>updateCandidate('dam',e.target.value)} fullWidth/>
        <TextField label="母の父" value={candidate.maternalSire} onChange={(e)=>updateCandidate('maternalSire',e.target.value)} fullWidth/>
        <TextField label="祖母の父" value={candidate.maternalGrandSire} onChange={(e)=>updateCandidate('maternalGrandSire',e.target.value)} fullWidth/>
        <Divider/><Typography fontWeight={900}>産歴・子牛候補：{candidate.offspring.length}件</Typography>
        {candidate.offspring.length === 0 ? <Alert severity="warning">産歴・子牛情報は候補を作れませんでした。元帳票を確認してください。</Alert> : <Stack spacing={1}>{candidate.offspring.map((row,index)=><Card key={`${row.parity}-${index}`} variant="outlined"><CardContent><Typography fontWeight={800}>{row.parity}産　{row.name || '名号未判定'}</Typography><Typography color="text.secondary">生年月日：{row.birthday || '-'}　父牛：{row.sire || '-'}</Typography></CardContent></Card>)}</Stack>}
        <Divider/><Typography fontWeight={900}>AI解析結果（確認用）</Typography><TextField value={ocrText} multiline minRows={8} fullWidth InputProps={{readOnly:true}}/>
        <Alert severity="warning">「一括登録」はまだ接続していません。AI結果の精度確認後、重複確認と登録前確認を追加します。</Alert>
      </Stack></CardContent></Card>}
      <Divider/><Typography variant="h6" fontWeight={800}>CSV・Excelから取り込む</Typography>
      <Typography color="text.secondary">一覧データがある場合はこちらを使います。1行目の項目名を使って取り込み項目を対応付けます。</Typography>
      <Button component="label" variant="outlined" size="large" disabled={loading || ocrRunning}>{loading ? '読み込み中…':'CSV・Excelを選ぶ'}<input hidden type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleTableFile}/></Button>
      {error && <Alert severity="warning">{error}</Alert>}
    </Stack></CardContent></Card>
    {preview && <><ImportFieldMapping headers={preview.headers}/><CsvPreviewTable fileName={preview.fileName} headers={preview.headers} rows={preview.rows} onReset={()=>setPreview(null)}/></>}
  </Stack>;
}
