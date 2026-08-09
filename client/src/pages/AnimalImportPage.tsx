import { ChangeEvent, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Divider,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createWorker } from 'tesseract.js';
import { CsvPreviewTable } from '../components/CsvPreviewTable';
import { ImportFieldMapping } from '../components/ImportFieldMapping';
import { parseCsv } from '../utils/csv';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Preview = { fileName: string; headers: string[]; rows: string[][] };
type DocumentPreview = { fileName: string; fileType: string; size: number; objectUrl: string; isImage: boolean };
type OffspringCandidate = { parity: string; name: string; birthday: string; sire: string };
type CattleImportCandidate = {
  identificationNumber: string;
  registrationNumber: string;
  name: string;
  birthday: string;
  sire: string;
  dam: string;
  maternalSire: string;
  maternalGrandSire: string;
  offspring: OffspringCandidate[];
};

const emptyCandidate: CattleImportCandidate = {
  identificationNumber: '', registrationNumber: '', name: '', birthday: '', sire: '', dam: '', maternalSire: '', maternalGrandSire: '', offspring: [],
};

function parseExcel(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('Excelファイルにシートがありません。');
  const sheet = workbook.Sheets[firstSheetName];
  const values = XLSX.utils.sheet_to_json<(string | number | boolean)[]>(sheet, { header: 1, raw: false, defval: '' });
  const normalized = values.map((row) => row.map((cell) => String(cell).trim())).filter((row) => row.some((cell) => cell !== ''));
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

function normalizeEraDate(raw: string) {
  const normalized = raw.trim().replace(/令和/g, 'R').replace(/平成/g, 'H').replace(/昭和/g, 'S').replace(/[年.\/]/g, '-').replace(/月/g, '-').replace(/日/g, '').replace(/--+/g, '-');
  const eraMatch = normalized.match(/^([RHS])\s*(\d{1,2})-(\d{1,2})-(\d{1,2})$/i);
  if (eraMatch) {
    const era = eraMatch[1].toUpperCase();
    const year = Number(eraMatch[2]);
    const month = Number(eraMatch[3]);
    const day = Number(eraMatch[4]);
    const baseYear = era === 'R' ? 2018 : era === 'H' ? 1988 : 1925;
    return `${baseYear + year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const westernMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (westernMatch) return `${westernMatch[1]}-${String(Number(westernMatch[2])).padStart(2, '0')}-${String(Number(westernMatch[3])).padStart(2, '0')}`;
  return raw.trim();
}

function looksLikeDate(v: string) {
  return /^(?:[RHS]\s*)?\d{1,4}[.年\/-]\d{1,2}(?:[.月\/-]\d{1,2}日?)?$/i.test(v.trim());
}
function tokenizeLine(line: string) {
  return line.replace(/[｜|]/g, ' ').replace(/[：:]/g, ' ').split(/\s+/).map((v) => v.trim()).filter(Boolean);
}

function parseOcrCandidate(text: string): CattleImportCandidate {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const identificationNumber = text.match(/\b\d{4}[-－]\d{4}[-－]\d\b/)?.[0]?.replace(/－/g, '-') || '';
  const registrationNumber = text.match(/\b\d{3}[-－]\d{7}\b/)?.[0]?.replace(/－/g, '-') || '';
  let name = '', birthday = '', sire = '', dam = '', maternalSire = '', maternalGrandSire = '';
  if (identificationNumber) {
    const detailLine = lines.find((line) => line.replace(/－/g, '-').includes(identificationNumber));
    if (detailLine) {
      const tokens = tokenizeLine(detailLine).map((token) => token.replace(/－/g, '-'));
      const idIndex = tokens.findIndex((token) => token === identificationNumber);
      if (idIndex >= 0) {
        let cursor = idIndex + 1;
        if (tokens[cursor] === registrationNumber) cursor += 1;
        name = tokens[cursor] || '';
        cursor += 1;
        if (looksLikeDate(tokens[cursor] || '')) { birthday = normalizeEraDate(tokens[cursor]); cursor += 1; }
        sire = tokens[cursor] || '';
        dam = tokens[cursor + 1] || '';
        maternalSire = tokens[cursor + 2] || '';
        maternalGrandSire = tokens[cursor + 3] || '';
      }
    }
  }
  const offspring: OffspringCandidate[] = [];
  for (const line of lines) {
    const tokens = tokenizeLine(line);
    if (!/^\d{1,2}$/.test(tokens[0] || '')) continue;
    const dateIndex = tokens.findIndex((token, index) => index > 0 && looksLikeDate(token));
    if (dateIndex < 2) continue;
    const parity = tokens[0];
    if (offspring.some((row) => row.parity === parity)) continue;
    const rowName = tokens[1] || '';
    const rowBirthday = normalizeEraDate(tokens[dateIndex]);
    const rowSire = tokens[dateIndex + 1] || '';
    if (rowBirthday && rowName && rowName !== name) offspring.push({ parity, name: rowName, birthday: rowBirthday, sire: rowSire });
  }
  return { identificationNumber, registrationNumber, name, birthday, sire, dam, maternalSire, maternalGrandSire, offspring };
}

async function imageFileToCanvas(file: File) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = imageUrl; await image.decode();
    const maxWidth = 2400; const scale = Math.min(1, maxWidth / image.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('画像を処理できませんでした。');
    context.drawImage(image, 0, 0, canvas.width, canvas.height); return canvas;
  } finally { URL.revokeObjectURL(imageUrl); }
}

async function pdfFileToCanvas(file: File) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d'); if (!context) throw new Error('PDFを画像へ変換できませんでした。');
  await page.render({ canvasContext: context, viewport }).promise; return canvas;
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

  useEffect(() => () => { if (documentPreview?.objectUrl) URL.revokeObjectURL(documentPreview.objectUrl); }, [documentPreview]);
  const resetDocumentPreview = () => {
    setDocumentPreview((current) => { if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl); return null; });
    setDocumentFile(null); setOcrText(''); setCandidate(null); setOcrProgress(0); setOcrStatus('');
  };
  const handleDocumentFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    resetDocumentPreview(); setPreview(null); setError('');
    const lowerName = file.name.toLowerCase();
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(lowerName);
    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
    if (!isImage && !isPdf) { setError('スマホ画像またはPDFファイルを選んでください。'); return; }
    const objectUrl = URL.createObjectURL(file); setDocumentFile(file);
    setDocumentPreview({ fileName: file.name, fileType: isPdf ? 'PDF' : '画像', size: file.size, objectUrl, isImage });
  };
  const handleReadDocument = async () => {
    if (!documentFile || !documentPreview) return;
    setError(''); setCandidate(null); setOcrText(''); setOcrProgress(0); setOcrStatus('帳票を画像へ変換しています…'); setOcrRunning(true);
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
    try {
      const canvas = documentPreview.isImage ? await imageFileToCanvas(documentFile) : await pdfFileToCanvas(documentFile);
      setOcrStatus('日本語OCRを準備しています…');
      worker = await createWorker('jpn', undefined, { logger: (message) => {
        if (typeof message.progress === 'number') setOcrProgress(Math.round(message.progress * 100));
        if (message.status) setOcrStatus(`読み取り中：${message.status}`);
      }});
      const result = await worker.recognize(canvas);
      const text = String(result?.data?.text || '').trim();
      if (!text) throw new Error('文字を読み取れませんでした。画像のピント・明るさ・帳票全体が写っているか確認してください。');
      setOcrText(text); setCandidate(parseOcrCandidate(text)); setOcrProgress(100); setOcrStatus('読み取り候補を作成しました。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '帳票を読み取れませんでした。'); setOcrStatus('');
    } finally {
      if (worker) await worker.terminate().catch(() => undefined); setOcrRunning(false);
    }
  };
  const updateCandidate = (key: keyof Omit<CattleImportCandidate, 'offspring'>, v: string) => setCandidate((current) => ({ ...(current || emptyCandidate), [key]: v }));
  const handleTableFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    resetDocumentPreview(); setPreview(null); setError(''); setLoading(true);
    try {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.csv')) { const parsed = parseCsv(await file.text()); setPreview({ fileName: file.name, ...parsed }); return; }
      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) { const parsed = parseExcel(await file.arrayBuffer()); setPreview({ fileName: file.name, ...parsed }); return; }
      throw new Error('CSVまたはExcelファイルを選んでください。');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'ファイルを読み取れませんでした。'); }
    finally { setLoading(false); }
  };

  return <Stack spacing={2}>
    <Typography variant="h5" fontWeight={800}>牛情報取り込み</Typography>
    <Alert severity="info">画像・PDF・CSV・Excelから牛情報を取り込みます。正式データへ保存する前に、必ず読み取り結果を確認します。</Alert>
    <Card><CardContent><Stack spacing={2}>
      <Typography variant="h6" fontWeight={800}>スマホ画像・PDFから取り込む</Typography>
      <Typography color="text.secondary">牛の通信簿、成績表、JA・市場などの類似帳票を選択します。帳票名ではなく、個体情報・血統・産歴・子牛・販売成績などの項目として読み取ります。</Typography>
      <Button component="label" variant="contained" size="large" disabled={ocrRunning}>画像・PDFを選ぶ<input hidden type="file" accept="image/*,.pdf,application/pdf" onChange={handleDocumentFile}/></Button>
      {documentPreview && <Card variant="outlined"><CardContent><Stack spacing={1.5}>
        <Typography fontWeight={900}>選択した帳票</Typography><Typography>ファイル：{documentPreview.fileName}</Typography>
        <Typography color="text.secondary">種類：{documentPreview.fileType}　サイズ：{formatFileSize(documentPreview.size)}</Typography>
        {documentPreview.isImage && <img src={documentPreview.objectUrl} alt="選択した牛情報帳票" style={{ width:'100%', maxHeight:520, objectFit:'contain', borderRadius:8 }}/>} 
        {!documentPreview.isImage && <Alert severity="info">PDFは1ページ目を画像化して読み取ります。複数ページ対応は後続工程で追加します。</Alert>}
        <Alert severity="warning">読み取り結果は候補です。確認しても、この段階ではまだ正式データへ保存しません。</Alert>
        <Button variant="contained" onClick={handleReadDocument} disabled={ocrRunning}>{ocrRunning ? '読み取り中…' : 'この帳票を読み取る'}</Button>
        {ocrRunning && <Stack spacing={0.5}><LinearProgress variant={ocrProgress > 0 ? 'determinate':'indeterminate'} value={ocrProgress}/><Typography variant="body2" color="text.secondary">{ocrStatus}{ocrProgress > 0 ? ` ${ocrProgress}%`:''}</Typography></Stack>}
        <Button variant="outlined" onClick={resetDocumentPreview} disabled={ocrRunning}>選び直す</Button>
      </Stack></CardContent></Card>}
      {candidate && <Card variant="outlined"><CardContent><Stack spacing={2}>
        <Typography variant="h6" fontWeight={900}>読み取り候補</Typography>
        <Alert severity="info">OCRの候補をFarmPro標準項目へ当てはめています。誤読した欄はここで修正できます。まだ保存されません。</Alert>
        <TextField label="個体識別番号" value={candidate.identificationNumber} onChange={(e)=>updateCandidate('identificationNumber',e.target.value)} fullWidth/>
        <TextField label="登録番号" value={candidate.registrationNumber} onChange={(e)=>updateCandidate('registrationNumber',e.target.value)} fullWidth/>
        <TextField label="名号" value={candidate.name} onChange={(e)=>updateCandidate('name',e.target.value)} fullWidth/>
        <TextField label="生年月日" type="date" InputLabelProps={{shrink:true}} value={candidate.birthday} onChange={(e)=>updateCandidate('birthday',e.target.value)} fullWidth/>
        <TextField label="父牛" value={candidate.sire} onChange={(e)=>updateCandidate('sire',e.target.value)} fullWidth/>
        <TextField label="母牛" value={candidate.dam} onChange={(e)=>updateCandidate('dam',e.target.value)} fullWidth/>
        <TextField label="母の父" value={candidate.maternalSire} onChange={(e)=>updateCandidate('maternalSire',e.target.value)} fullWidth/>
        <TextField label="祖母の父" value={candidate.maternalGrandSire} onChange={(e)=>updateCandidate('maternalGrandSire',e.target.value)} fullWidth/>
        <Divider/><Typography fontWeight={900}>産歴・子牛候補：{candidate.offspring.length}件</Typography>
        {candidate.offspring.length === 0 ? <Alert severity="warning">産歴の表はまだ自動で判定できませんでした。次工程で表の読み取り精度を調整します。</Alert> : <Stack spacing={1}>{candidate.offspring.map((row,index)=><Card key={`${row.parity}-${index}`} variant="outlined"><CardContent><Typography fontWeight={800}>{row.parity}産　{row.name || '名号未判定'}</Typography><Typography color="text.secondary">生年月日：{row.birthday || '-'}　父牛：{row.sire || '-'}</Typography></CardContent></Card>)}</Stack>}
        <Divider/><Typography fontWeight={900}>OCR原文（確認用）</Typography><TextField value={ocrText} multiline minRows={8} fullWidth InputProps={{readOnly:true}}/>
        <Alert severity="warning">「一括登録」はまだ接続していません。次工程で、重複確認と登録前確認を追加してから正式保存できるようにします。</Alert>
      </Stack></CardContent></Card>}
      <Divider/><Typography variant="h6" fontWeight={800}>CSV・Excelから取り込む</Typography>
      <Typography color="text.secondary">一覧データがある場合はこちらを使います。1行目の項目名を使って取り込み項目を対応付けます。</Typography>
      <Button component="label" variant="outlined" size="large" disabled={loading || ocrRunning}>{loading ? '読み込み中…':'CSV・Excelを選ぶ'}<input hidden type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleTableFile}/></Button>
      {error && <Alert severity="warning">{error}</Alert>}
    </Stack></CardContent></Card>
    {preview && <><ImportFieldMapping headers={preview.headers}/><CsvPreviewTable fileName={preview.fileName} headers={preview.headers} rows={preview.rows} onReset={()=>setPreview(null)}/></>}
  </Stack>;
}
